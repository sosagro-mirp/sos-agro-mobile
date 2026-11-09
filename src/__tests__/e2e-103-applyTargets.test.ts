/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6).
 * Acciones «Aplicar» / «Aplicar de nuevo» de la ficha offline. Cubre los
 * criterios C4 y C8 de `spec/103_encuestador_movil_por_productor.md`.
 * Equivalente móvil de `frontend/lib/pollster/applyTargets.ts` (spec 102),
 * ampliado con DM8 (sin acción para finca/cultivo de un productor sin finca o
 * provisional) y con la fecha local de la superposición (DM5, DM12).
 *
 * ARRANCA EN ROJO: `src/lib/applyTargets.ts` todavía no existe (Fase 2).
 *
 * ── Contrato de `src/lib/applyTargets.ts` ──────────────────────────────────
 *
 *   // `FarmerCoverageDetail` es el de `src/lib/coverageOverlay.ts` (ver la
 *   // cabecera de `e2e-103-coverageOverlay.test.ts`), normalmente ya pasado
 *   // por `applyLocalOverlay()`.
 *
 *   interface ApplyTarget {
 *     instrumentId: string; instrumentName: string; scopeLevel: ScopeLevel;
 *     farmId: string | null;        // null en nivel productor y en las bloqueadas
 *     farmCropId: string | null;    // solo en nivel cultivo
 *     label: string;
 *     status: 'falta' | 'parcial' | 'aplicado';
 *     localStatus: 'aplicado_local' | 'en_curso' | null;
 *     action: 'apply' | 'reapply' | 'none';
 *     blockedReason: 'sin_finca' | 'pendiente_sincronizar' | null;
 *     requiresReapplyConfirm: boolean;  // true si action === 'reapply'
 *     lastAppliedAt: string | null;     // el más reciente entre latestSurvey.createdAt
 *                                       // (servidor) y unit.localAppliedAt (local)
 *     coveredByOtherFarmer: boolean;
 *   }
 *
 *   export function listApplyTargets(detail: FarmerCoverageDetail): ApplyTarget[];
 *     - Una entrada por unidad aplicable: `falta`/`parcial` → action 'apply';
 *       `aplicado` → action 'reapply' con confirmación.
 *     - Instrumentos/unidades `no_aplica` y unidades `outOfScope` nunca tienen
 *       acción (se omiten o van con action 'none').
 *     - DM8: un instrumento de finca o cultivo de un productor provisional
 *       (`farmerId` local, `local_farmer_*`) o sin fincas (`farms` vacío)
 *       produce UNA entrada con action 'none', farmId/farmCropId null y
 *       blockedReason 'pendiente_sincronizar' (provisional) o 'sin_finca'.
 *     - Los de nivel productor de un productor provisional sí se aplican.
 *     - Orden: pendientes primero, luego aplicadas, luego bloqueadas; a igual
 *       grupo, por nombre de instrumento (`localeCompare` 'es'). No muta.
 *
 *   export function blockedNotice(reason: 'sin_finca' | 'pendiente_sincronizar'): string;
 *     'pendiente_sincronizar' incluye «se habilita al sincronizar».
 *
 *   export function reapplyConfirmationText(target: ApplyTarget): string;
 *     Nombra el instrumento y la fecha de `lastAppliedAt` en dd/mm/aaaa (UTC);
 *     si `coveredByOtherFarmer`, menciona «otro productor». Sin fecha no
 *     inventa una.
 */

function loadExport<T>(modulePath: string, name: string): T {
  let mod: Record<string, unknown>;
  try {
    mod = jest.requireActual(modulePath);
  } catch {
    throw new Error(`Spec 103 — el módulo ${modulePath} todavía no existe`);
  }
  const value = mod[name];
  if (value === undefined) {
    throw new Error(`Spec 103 — ${modulePath} todavía no exporta \`${name}\``);
  }
  return value as T;
}

type Status = 'aplicado' | 'parcial' | 'falta' | 'no_aplica';
type Level = 'farmer' | 'farm' | 'farm_crop';

interface Unit {
  unitType: Level;
  farmId?: string;
  farmCropId?: string;
  label: string;
  status: Status;
  surveyId: string | null;
  surveyCount: number;
  outOfScope?: boolean;
  coveredByOtherFarmer?: boolean;
  localStatus?: 'aplicado_local' | 'en_curso';
  localAppliedAt?: string;
}

interface Instrument {
  instrumentId: string;
  name: string;
  code: string | null;
  scopeLevel: Level;
  cropIds: string[];
  coverageGroup: string | null;
  memberIds: string[];
  status: Status;
  surveyCount: number;
  latestSurvey: { surveyId: string; createdAt: string; farmId: string | null; farmCropId: string | null; farmerId: string | null } | null;
  units: Unit[];
}

interface Detail {
  farmerId: string;
  name: string;
  farms: { farmId: string; name: string; role: string | null; isPrimary: boolean; town: null; crops: { farmCropId: string; cropId: string; name: string }[] }[];
  instruments: Instrument[];
  [key: string]: unknown;
}

interface ApplyTarget {
  instrumentId: string;
  instrumentName: string;
  scopeLevel: Level;
  farmId: string | null;
  farmCropId: string | null;
  label: string;
  status: 'falta' | 'parcial' | 'aplicado';
  localStatus: 'aplicado_local' | 'en_curso' | null;
  action: 'apply' | 'reapply' | 'none';
  blockedReason: 'sin_finca' | 'pendiente_sincronizar' | null;
  requiresReapplyConfirm: boolean;
  lastAppliedAt: string | null;
  coveredByOtherFarmer: boolean;
}

const MODULE = '../lib/applyTargets';
const listApplyTargets = () => loadExport<(d: Detail) => ApplyTarget[]>(MODULE, 'listApplyTargets');
const reapplyConfirmationText = () =>
  loadExport<(t: ApplyTarget) => string>(MODULE, 'reapplyConfirmationText');
const blockedNotice = () =>
  loadExport<(r: 'sin_finca' | 'pendiente_sincronizar') => string>(MODULE, 'blockedNotice');

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FARMER = 'aaaaaaaa-0000-4000-8000-000000000103';
const LOCAL_FARMER = 'local_farmer_9c3f1b2a-8e7d-4f2e-9a1b-2c3d4e5f6103';
const FARM_1 = 'f1f1f1f1-0000-4000-8000-000000000103';
const FARM_2 = 'f2f2f2f2-0000-4000-8000-000000000103';
const FC_CAFE = 'fc000001-0000-4000-8000-000000000103';

function instrument(partial: Partial<Instrument>): Instrument {
  return {
    instrumentId: 'i-x',
    name: 'X',
    code: null,
    scopeLevel: 'farmer',
    cropIds: [],
    coverageGroup: null,
    memberIds: [],
    status: 'falta',
    surveyCount: 0,
    latestSurvey: null,
    units: [],
    ...partial,
  };
}

const FARMS = [
  { farmId: FARM_1, name: 'La Esperanza', role: 'propietario', isPrimary: true, town: null, crops: [{ farmCropId: FC_CAFE, cropId: 'c-cafe', name: 'Café' }] },
  { farmId: FARM_2, name: 'El Recreo', role: 'arrendatario', isPrimary: false, town: null, crops: [] },
];

function detail(instruments: Instrument[], extra: Partial<Detail> = {}): Detail {
  return { farmerId: FARMER, name: 'Ana Pérez', farms: FARMS, instruments, ...extra };
}

const farmerLevel = (status: Status, extra: Partial<Instrument> = {}) =>
  instrument({
    instrumentId: 'i-prod',
    name: 'Caracterización del productor',
    scopeLevel: 'farmer',
    status,
    units: [{ unitType: 'farmer', label: 'Productor', status, surveyId: null, surveyCount: 0 }],
    ...extra,
  });

const farmLevel = (units: Unit[], extra: Partial<Instrument> = {}) =>
  instrument({ instrumentId: 'i-finca', name: 'Bienes de la finca', scopeLevel: 'farm', units, ...extra });

const cropLevel = (units: Unit[], extra: Partial<Instrument> = {}) =>
  instrument({ instrumentId: 'i-cultivo', name: 'Prácticas de cultivo', scopeLevel: 'farm_crop', units, ...extra });

const farmUnit = (farmId: string, status: Status, extra: Partial<Unit> = {}): Unit => ({
  unitType: 'farm',
  farmId,
  label: farmId === FARM_1 ? 'La Esperanza' : 'El Recreo',
  status,
  surveyId: null,
  surveyCount: 0,
  ...extra,
});

const actionable = (targets: ApplyTarget[]) => targets.filter((t) => t.action !== 'none');

// ─── C4 ──────────────────────────────────────────────────────────────────────

describe('listApplyTargets — C4: «Aplicar» por unidad pendiente', () => {
  it('cada unidad pendiente ofrece «Aplicar» con su ancla', () => {
    const targets = listApplyTargets()(
      detail([
        farmerLevel('falta'),
        farmLevel([farmUnit(FARM_1, 'falta'), farmUnit(FARM_2, 'parcial')]),
        cropLevel([{ unitType: 'farm_crop', farmId: FARM_1, farmCropId: FC_CAFE, label: 'Café — La Esperanza', status: 'falta', surveyId: null, surveyCount: 0 }]),
      ]),
    );

    expect(targets.filter((t) => t.action === 'apply')).toHaveLength(4);
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instrumentId: 'i-prod', scopeLevel: 'farmer', farmId: null, farmCropId: null, action: 'apply' }),
        expect.objectContaining({ instrumentId: 'i-finca', farmId: FARM_1, farmCropId: null, action: 'apply' }),
        expect.objectContaining({ instrumentId: 'i-finca', farmId: FARM_2, action: 'apply', status: 'parcial' }),
        expect.objectContaining({ instrumentId: 'i-cultivo', farmId: FARM_1, farmCropId: FC_CAFE, action: 'apply' }),
      ]),
    );
    expect(targets.every((t) => t.blockedReason === null)).toBe(true);
  });

  it('las unidades no_aplica y fuera de alcance no ofrecen acción', () => {
    const targets = listApplyTargets()(
      detail([
        farmLevel([farmUnit(FARM_1, 'no_aplica'), farmUnit(FARM_2, 'falta', { outOfScope: true })]),
        farmerLevel('no_aplica', { instrumentId: 'i-noaplica', name: 'No aplica' }),
      ]),
    );

    expect(actionable(targets)).toEqual([]);
  });

  it('DM8: finca y cultivo de un productor provisional no ofrecen acción y avisan «se habilita al sincronizar»', () => {
    const targets = listApplyTargets()(
      detail([farmerLevel('falta'), farmLevel([]), cropLevel([])], { farmerId: LOCAL_FARMER, farms: [] }),
    );

    const blocked = targets.filter((t) => t.instrumentId === 'i-finca' || t.instrumentId === 'i-cultivo');
    expect(blocked).toHaveLength(2);
    for (const t of blocked) {
      expect(t).toMatchObject({ action: 'none', blockedReason: 'pendiente_sincronizar', farmId: null, farmCropId: null });
    }
    expect(blockedNotice()('pendiente_sincronizar')).toMatch(/se habilita al sincronizar/i);
  });

  it('DM8: el instrumento de productor de un productor provisional sí se aplica', () => {
    const targets = listApplyTargets()(
      detail([farmerLevel('falta'), farmLevel([])], { farmerId: LOCAL_FARMER, farms: [] }),
    );

    expect(targets.find((t) => t.instrumentId === 'i-prod')).toMatchObject({ action: 'apply', blockedReason: null });
  });

  it('DM8: un productor real sin finca deja finca y cultivo sin acción, con aviso «sin_finca»', () => {
    const targets = listApplyTargets()(detail([farmLevel([]), cropLevel([])], { farms: [] }));

    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.action === 'none' && t.blockedReason === 'sin_finca')).toBe(true);
    expect(typeof blockedNotice()('sin_finca')).toBe('string');
  });

  it('ordena pendientes primero, luego aplicadas, luego bloqueadas; por nombre a igual grupo', () => {
    const targets = listApplyTargets()(
      detail([
        instrument({ instrumentId: 'i-z', name: 'Zeta', status: 'aplicado', units: [{ unitType: 'farmer', label: 'Productor', status: 'aplicado', surveyId: 's', surveyCount: 1 }] }),
        instrument({ instrumentId: 'i-b', name: 'Beta', status: 'falta', units: [{ unitType: 'farmer', label: 'Productor', status: 'falta', surveyId: null, surveyCount: 0 }] }),
        instrument({ instrumentId: 'i-a', name: 'Alfa', status: 'falta', units: [{ unitType: 'farmer', label: 'Productor', status: 'falta', surveyId: null, surveyCount: 0 }] }),
      ]),
    );

    expect(targets.map((t) => t.instrumentId)).toEqual(['i-a', 'i-b', 'i-z']);
  });

  it('no muta la ficha', () => {
    const d = detail([farmerLevel('falta'), farmLevel([farmUnit(FARM_1, 'aplicado')])]);
    const copy = JSON.parse(JSON.stringify(d));

    listApplyTargets()(d);

    expect(d).toEqual(copy);
  });
});

// ─── C8 ──────────────────────────────────────────────────────────────────────

describe('listApplyTargets / reapplyConfirmationText — C8: «Aplicar de nuevo» con confirmación', () => {
  it('una unidad aplicada ofrece «Aplicar de nuevo» con la fecha de la última encuesta del servidor', () => {
    const [target] = listApplyTargets()(
      detail([
        farmerLevel('aplicado', {
          latestSurvey: { surveyId: 's1', createdAt: '2026-10-05T15:00:00.000Z', farmId: null, farmCropId: null, farmerId: FARMER },
        }),
      ]),
    );

    expect(target).toMatchObject({ action: 'reapply', requiresReapplyConfirm: true, lastAppliedAt: '2026-10-05T15:00:00.000Z' });

    const text = reapplyConfirmationText()(target);
    expect(text).toContain('Caracterización del productor');
    expect(text).toContain('05/10/2026');
  });

  it('una unidad aplicada solo en el dispositivo usa la fecha local', () => {
    const [target] = listApplyTargets()(
      detail([
        instrument({
          instrumentId: 'i-prod',
          name: 'Caracterización del productor',
          status: 'aplicado',
          units: [{
            unitType: 'farmer',
            label: 'Productor',
            status: 'aplicado',
            surveyId: null,
            surveyCount: 1,
            localStatus: 'aplicado_local',
            localAppliedAt: '2026-11-08T09:30:00.000Z',
          }],
        }),
      ]),
    );

    expect(target).toMatchObject({ action: 'reapply', localStatus: 'aplicado_local', lastAppliedAt: '2026-11-08T09:30:00.000Z' });
    expect(reapplyConfirmationText()(target)).toContain('08/11/2026');
  });

  it('con fecha de servidor y local, toma la más reciente', () => {
    const [target] = listApplyTargets()(
      detail([
        instrument({
          instrumentId: 'i-prod',
          name: 'Caracterización del productor',
          status: 'aplicado',
          latestSurvey: { surveyId: 's1', createdAt: '2026-10-05T15:00:00.000Z', farmId: null, farmCropId: null, farmerId: FARMER },
          units: [{ unitType: 'farmer', label: 'Productor', status: 'aplicado', surveyId: 's1', surveyCount: 2, localStatus: 'aplicado_local', localAppliedAt: '2026-11-08T09:30:00.000Z' }],
        }),
      ]),
    );

    expect(target.lastAppliedAt).toBe('2026-11-08T09:30:00.000Z');
  });

  it('advierte si la cubrió otro productor (finca compartida)', () => {
    const [target] = listApplyTargets()(
      detail([farmLevel([farmUnit(FARM_1, 'aplicado', { coveredByOtherFarmer: true, surveyId: 's9', surveyCount: 1 })], { status: 'aplicado' })]),
    );

    expect(target.coveredByOtherFarmer).toBe(true);
    expect(reapplyConfirmationText()(target)).toMatch(/otro productor/i);
  });

  it('sin fecha conocida no inventa una', () => {
    const text = reapplyConfirmationText()({
      instrumentId: 'i-prod',
      instrumentName: 'Caracterización del productor',
      scopeLevel: 'farmer',
      farmId: null,
      farmCropId: null,
      label: 'Productor',
      status: 'aplicado',
      localStatus: null,
      action: 'reapply',
      blockedReason: null,
      requiresReapplyConfirm: true,
      lastAppliedAt: null,
      coveredByOtherFarmer: false,
    });

    expect(text).toContain('Caracterización del productor');
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(text).not.toMatch(/otro productor/i);
  });
});
