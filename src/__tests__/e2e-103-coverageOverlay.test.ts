/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6).
 * Superposición local de lo aplicado en el dispositivo sobre la foto de
 * cobertura del servidor (DM5). Cubre el criterio C7 de
 * `spec/103_encuestador_movil_por_productor.md`.
 *
 * ARRANCA EN ROJO: `src/lib/coverageOverlay.ts` todavía no existe (Fase 2).
 * El módulo se carga con `loadExport()` dentro de cada caso para que el
 * archivo compile y cada caso falle nombrando lo que falta.
 *
 * ── Contrato de `src/lib/coverageOverlay.ts` ───────────────────────────────
 *
 *   type CoverageStatus = 'aplicado' | 'parcial' | 'falta' | 'no_aplica';
 *   type ScopeLevel = 'farmer' | 'farm' | 'farm_crop';
 *
 *   // Ficha de un productor tal como la arma `coverageCacheStorage.getDetail()`:
 *   // la fila compacta de la foto (backend `SnapshotFarmer`) con cada
 *   // instrumento unido a su columna (`name`, `scopeLevel`, `memberIds`…).
 *   interface FarmerCoverageDetail {
 *     farmerId; name; documentId: string | null; departmentId; townId;
 *     farmsCount; cropIds: string[]; hasPendingConsent: boolean;
 *     computedAt: string;                  // de la foto
 *     summary: { applicable; applied; partial; pending; notApplicable; instrumentsWithoutScope };
 *     warnings: ('sin_finca' | 'sin_cultivo' | 'encuestas_sin_ubicar')[];
 *     farms: { farmId; name; role: string | null; isPrimary; town: { townId; name } | null;
 *              crops: { farmCropId; cropId; name }[] }[];
 *     instruments: CoverageInstrumentDetail[];
 *   }
 *   interface CoverageInstrumentDetail {
 *     instrumentId; name; code: string | null; scopeLevel: ScopeLevel; cropIds: string[];
 *     coverageGroup: string | null; memberIds: string[];
 *     status: CoverageStatus; surveyCount: number;
 *     latestSurvey: { surveyId; createdAt; farmId; farmCropId; farmerId } | null;
 *     units: CoverageUnitDetail[];
 *   }
 *   interface CoverageUnitDetail {
 *     unitType: ScopeLevel; farmId?; farmCropId?; label; status: CoverageStatus;
 *     surveyId: string | null; surveyCount: number; outOfScope?; coveredByOtherFarmer?;
 *     // Solo los pone la superposición:
 *     localStatus?: 'aplicado_local' | 'en_curso';
 *     localAppliedAt?: string;             // ISO, updatedAt de la encuesta local
 *   }
 *
 *   // Encuesta local relevante para la cobertura (la entrega
 *   // `surveyDraftStore.listForCoverage()`).
 *   interface LocalSurveyRef {
 *     localSurveyId: string; backendSurveyId: string | null; instrumentId: string;
 *     farmerId: string | null; farmId: string | null; farmCropId: string | null;
 *     status: 'draft' | 'completed' | 'synced'; updatedAt: string; // ISO
 *   }
 *
 *   export function aggregate(statuses: CoverageStatus[]): CoverageStatus;
 *     // Misma regla que el backend (`farmer-coverage-calculator.ts`).
 *
 *   export function applyLocalOverlay(
 *     detail: FarmerCoverageDetail,
 *     localSurveys: LocalSurveyRef[],
 *   ): FarmerCoverageDetail;
 *     Pura, no muta la entrada. Reglas:
 *     - Una encuesta casa con un instrumento si su `instrumentId` es el de la
 *       columna o uno de sus `memberIds`.
 *     - Nivel productor: solo las encuestas con `farmerId === detail.farmerId`.
 *       Nivel finca: la unidad con el mismo `farmId`. Nivel cultivo: la unidad
 *       con el mismo `farmCropId`. En finca y cultivo cuentan también las
 *       encuestas de OTRO productor de esa finca (finca compartida) y la unidad
 *       queda con `coveredByOtherFarmer: true`.
 *     - `completed` o `synced` → unidad `aplicado`, `localStatus:
 *       'aplicado_local'`, `localAppliedAt`, y +1 en `surveyCount` de la unidad
 *       y del instrumento. `draft` → `localStatus: 'en_curso'` sin cambiar el
 *       estado.
 *     - Sin doble conteo: una encuesta cuyo `backendSurveyId` ya aparece en la
 *       foto (`units[].surveyId` o `latestSurvey.surveyId` de cualquier
 *       instrumento del productor) se ignora.
 *     - Las unidades `no_aplica` u `outOfScope` no se tocan.
 *     - El estado del instrumento se reagrega con `aggregate()` y el resumen se
 *       recalcula (`applied`, `partial`, `pending`, `applicable` =
 *       applied+partial+pending); `notApplicable` e `instrumentsWithoutScope`
 *       se conservan.
 */

// ─── Carga perezosa ──────────────────────────────────────────────────────────

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

// ─── Tipos locales del contrato ──────────────────────────────────────────────

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
  latestSurvey: {
    surveyId: string;
    createdAt: string;
    farmId: string | null;
    farmCropId: string | null;
    farmerId: string | null;
  } | null;
  units: Unit[];
}

interface Summary {
  applicable: number;
  applied: number;
  partial: number;
  pending: number;
  notApplicable: number;
  instrumentsWithoutScope: number;
}

interface Detail {
  farmerId: string;
  name: string;
  documentId: string | null;
  departmentId: string | null;
  townId: string | null;
  farmsCount: number;
  cropIds: string[];
  hasPendingConsent: boolean;
  computedAt: string;
  summary: Summary;
  warnings: string[];
  farms: {
    farmId: string;
    name: string;
    role: string | null;
    isPrimary: boolean;
    town: { townId: string; name: string } | null;
    crops: { farmCropId: string; cropId: string; name: string }[];
  }[];
  instruments: Instrument[];
}

interface LocalSurveyRef {
  localSurveyId: string;
  backendSurveyId: string | null;
  instrumentId: string;
  farmerId: string | null;
  farmId: string | null;
  farmCropId: string | null;
  status: 'draft' | 'completed' | 'synced';
  updatedAt: string;
}

type ApplyLocalOverlay = (detail: Detail, local: LocalSurveyRef[]) => Detail;
type Aggregate = (statuses: Status[]) => Status;

const MODULE = '../lib/coverageOverlay';
const overlay = () => loadExport<ApplyLocalOverlay>(MODULE, 'applyLocalOverlay');

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FARMER_A = 'aaaaaaaa-0000-4000-8000-000000000103';
const FARMER_B = 'bbbbbbbb-0000-4000-8000-000000000103';
const FARM_1 = 'f1f1f1f1-0000-4000-8000-000000000103';
const FARM_2 = 'f2f2f2f2-0000-4000-8000-000000000103';
const FC_CAFE = 'fc000001-0000-4000-8000-000000000103';
const FC_CACAO = 'fc000002-0000-4000-8000-000000000103';

const I_FARMER = 'i-farmer';
const I_FARMER_V2 = 'i-farmer-v2'; // miembro del mismo grupo de cobertura
const I_FARM = 'i-farm';
const I_CROP = 'i-crop';

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

function farmerInstrument(status: Status = 'falta', surveyId: string | null = null): Instrument {
  return instrument({
    instrumentId: I_FARMER,
    name: 'Caracterización del productor',
    scopeLevel: 'farmer',
    coverageGroup: 'grupo-productor',
    memberIds: [I_FARMER, I_FARMER_V2],
    status,
    surveyCount: surveyId ? 1 : 0,
    latestSurvey: surveyId
      ? { surveyId, createdAt: '2026-10-01T12:00:00.000Z', farmId: null, farmCropId: null, farmerId: FARMER_A }
      : null,
    units: [
      {
        unitType: 'farmer',
        label: 'Productor',
        status,
        surveyId,
        surveyCount: surveyId ? 1 : 0,
      },
    ],
  });
}

function farmInstrument(units: Unit[]): Instrument {
  return instrument({
    instrumentId: I_FARM,
    name: 'Caracterización de la finca',
    scopeLevel: 'farm',
    memberIds: [I_FARM],
    status: 'falta',
    units,
  });
}

function cropInstrument(units: Unit[]): Instrument {
  return instrument({
    instrumentId: I_CROP,
    name: 'Prácticas del cultivo',
    scopeLevel: 'farm_crop',
    memberIds: [I_CROP],
    status: 'falta',
    units,
  });
}

function farmUnit(farmId: string, status: Status = 'falta', extra: Partial<Unit> = {}): Unit {
  return { unitType: 'farm', farmId, label: `Finca ${farmId.slice(0, 2)}`, status, surveyId: null, surveyCount: 0, ...extra };
}

function cropUnit(farmId: string, farmCropId: string, status: Status = 'falta'): Unit {
  return { unitType: 'farm_crop', farmId, farmCropId, label: `Cultivo ${farmCropId.slice(0, 8)}`, status, surveyId: null, surveyCount: 0 };
}

function summary(partial: Partial<Summary> = {}): Summary {
  return { applicable: 0, applied: 0, partial: 0, pending: 0, notApplicable: 2, instrumentsWithoutScope: 1, ...partial };
}

function detail(farmerId: string, instruments: Instrument[], extra: Partial<Detail> = {}): Detail {
  return {
    farmerId,
    name: farmerId === FARMER_A ? 'Ana Pérez' : 'Beto Gómez',
    documentId: null,
    departmentId: null,
    townId: null,
    farmsCount: 1,
    cropIds: [],
    hasPendingConsent: false,
    computedAt: '2026-11-07T10:00:00.000Z',
    summary: summary({ applicable: instruments.length, pending: instruments.length }),
    warnings: [],
    farms: [],
    instruments,
    ...extra,
  };
}

function local(partial: Partial<LocalSurveyRef>): LocalSurveyRef {
  return {
    localSurveyId: 'local_survey_1',
    backendSurveyId: null,
    instrumentId: I_FARMER,
    farmerId: FARMER_A,
    farmId: null,
    farmCropId: null,
    status: 'completed',
    updatedAt: '2026-11-08T09:30:00.000Z',
    ...partial,
  };
}

const byId = (d: Detail, id: string) => d.instruments.find((i) => i.instrumentId === id)!;

// ─── aggregate ───────────────────────────────────────────────────────────────

describe('aggregate — misma regla que el backend', () => {
  it('ignora no_aplica; todo aplicado → aplicado; todo falta → falta; mezcla → parcial', () => {
    const aggregate = loadExport<Aggregate>(MODULE, 'aggregate');
    expect(aggregate(['aplicado', 'aplicado', 'no_aplica'])).toBe('aplicado');
    expect(aggregate(['falta', 'no_aplica'])).toBe('falta');
    expect(aggregate(['aplicado', 'falta'])).toBe('parcial');
    expect(aggregate(['parcial'])).toBe('parcial');
    expect(aggregate(['no_aplica'])).toBe('no_aplica');
    expect(aggregate([])).toBe('no_aplica');
  });
});

// ─── C7: superposición ───────────────────────────────────────────────────────

describe('applyLocalOverlay — C7: lo aplicado en el dispositivo se ve al momento', () => {
  it('una encuesta de productor terminada sin conexión marca la unidad «aplicado en este dispositivo»', () => {
    const d = detail(FARMER_A, [farmerInstrument('falta')]);

    const out = overlay()(d, [local({ status: 'completed' })]);
    const inst = byId(out, I_FARMER);

    expect(inst.units[0]).toMatchObject({
      status: 'aplicado',
      localStatus: 'aplicado_local',
      localAppliedAt: '2026-11-08T09:30:00.000Z',
      surveyCount: 1,
    });
    expect(inst.status).toBe('aplicado');
    expect(inst.surveyCount).toBe(1);
  });

  it('cuenta las encuestas de cualquier miembro del grupo de cobertura (memberIds)', () => {
    const d = detail(FARMER_A, [farmerInstrument('falta')]);

    const out = overlay()(d, [local({ instrumentId: I_FARMER_V2 })]);

    expect(byId(out, I_FARMER).units[0].status).toBe('aplicado');
  });

  it('una encuesta en borrador marca la unidad «en curso» sin darla por aplicada', () => {
    const d = detail(FARMER_A, [farmerInstrument('falta')]);

    const out = overlay()(d, [local({ status: 'draft' })]);
    const unit = byId(out, I_FARMER).units[0];

    expect(unit.localStatus).toBe('en_curso');
    expect(unit.status).toBe('falta');
    expect(byId(out, I_FARMER).status).toBe('falta');
  });

  it('una encuesta de productor de OTRO productor no toca la ficha', () => {
    const d = detail(FARMER_A, [farmerInstrument('falta')]);

    const out = overlay()(d, [local({ farmerId: FARMER_B })]);

    expect(byId(out, I_FARMER).units[0].status).toBe('falta');
    expect(byId(out, I_FARMER).units[0].localStatus).toBeUndefined();
  });

  it('reagrega el estado: una de dos fincas aplicada deja el instrumento en «parcial»', () => {
    const d = detail(FARMER_A, [farmInstrument([farmUnit(FARM_1), farmUnit(FARM_2)])]);

    const out = overlay()(d, [local({ instrumentId: I_FARM, farmId: FARM_1 })]);
    const inst = byId(out, I_FARM);

    expect(inst.units.find((u) => u.farmId === FARM_1)?.status).toBe('aplicado');
    expect(inst.units.find((u) => u.farmId === FARM_2)?.status).toBe('falta');
    expect(inst.status).toBe('parcial');
  });

  it('en nivel cultivo ancla por farmCropId, no por finca', () => {
    const d = detail(FARMER_A, [
      cropInstrument([cropUnit(FARM_1, FC_CAFE), cropUnit(FARM_1, FC_CACAO)]),
    ]);

    const out = overlay()(d, [
      local({ instrumentId: I_CROP, farmId: FARM_1, farmCropId: FC_CACAO }),
    ]);
    const inst = byId(out, I_CROP);

    expect(inst.units.find((u) => u.farmCropId === FC_CACAO)?.status).toBe('aplicado');
    expect(inst.units.find((u) => u.farmCropId === FC_CAFE)?.status).toBe('falta');
    expect(inst.status).toBe('parcial');
  });

  it('recalcula el resumen aplicados / aplicables / pendientes', () => {
    const d = detail(FARMER_A, [farmerInstrument('falta'), farmInstrument([farmUnit(FARM_1)])], {
      summary: summary({ applicable: 2, applied: 0, pending: 2 }),
    });

    const out = overlay()(d, [local({})]);

    expect(out.summary).toMatchObject({
      applicable: 2,
      applied: 1,
      partial: 0,
      pending: 1,
      notApplicable: 2,
      instrumentsWithoutScope: 1,
    });
  });

  it('no toca unidades no_aplica ni fuera de alcance', () => {
    const d = detail(FARMER_A, [
      farmInstrument([
        farmUnit(FARM_1, 'no_aplica'),
        farmUnit(FARM_2, 'falta', { outOfScope: true }),
      ]),
    ]);

    const out = overlay()(d, [
      local({ instrumentId: I_FARM, farmId: FARM_1 }),
      local({ localSurveyId: 'local_survey_2', instrumentId: I_FARM, farmId: FARM_2 }),
    ]);
    const inst = byId(out, I_FARM);

    expect(inst.units[0]).toMatchObject({ status: 'no_aplica' });
    expect(inst.units[0].localStatus).toBeUndefined();
    expect(inst.units[1]).toMatchObject({ status: 'falta', outOfScope: true });
    expect(inst.units[1].localStatus).toBeUndefined();
  });

  it('es pura: no muta la ficha de entrada', () => {
    const d = detail(FARMER_A, [farmerInstrument('falta')]);
    const snapshot = JSON.parse(JSON.stringify(d));

    overlay()(d, [local({})]);

    expect(d).toEqual(snapshot);
  });
});

describe('applyLocalOverlay — C7: finca compartida', () => {
  it('una encuesta de finca hecha con el productor A se refleja en la ficha de B, marcada como de otro productor', () => {
    const fichaB = detail(FARMER_B, [farmInstrument([farmUnit(FARM_1)])]);

    const out = overlay()(fichaB, [
      local({ instrumentId: I_FARM, farmerId: FARMER_A, farmId: FARM_1 }),
    ]);
    const unit = byId(out, I_FARM).units[0];

    expect(unit.status).toBe('aplicado');
    expect(unit.localStatus).toBe('aplicado_local');
    expect(unit.coveredByOtherFarmer).toBe(true);
  });

  it('en la ficha del productor que la aplicó no se marca como de otro productor', () => {
    const fichaA = detail(FARMER_A, [farmInstrument([farmUnit(FARM_1)])]);

    const out = overlay()(fichaA, [
      local({ instrumentId: I_FARM, farmerId: FARMER_A, farmId: FARM_1 }),
    ]);

    expect(byId(out, I_FARM).units[0].coveredByOtherFarmer).toBeFalsy();
  });
});

describe('applyLocalOverlay — C7: sin doble conteo tras sincronizar y actualizar', () => {
  it('una encuesta ya incluida en la foto (unit.surveyId = backendSurveyId) no se cuenta otra vez', () => {
    const SERVER_SURVEY = 'srv-survey-103';
    const d = detail(FARMER_A, [farmerInstrument('aplicado', SERVER_SURVEY)], {
      summary: summary({ applicable: 1, applied: 1 }),
    });

    const out = overlay()(d, [local({ status: 'synced', backendSurveyId: SERVER_SURVEY })]);
    const inst = byId(out, I_FARMER);

    expect(inst.units[0].localStatus).toBeUndefined();
    expect(inst.units[0].surveyCount).toBe(1);
    expect(inst.surveyCount).toBe(1);
    expect(out.summary.applied).toBe(1);
  });

  it('también la descarta si coincide con latestSurvey del instrumento', () => {
    const SERVER_SURVEY = 'srv-survey-latest';
    const inst = farmInstrument([
      { ...farmUnit(FARM_1, 'aplicado'), surveyId: 'srv-otro', surveyCount: 2 },
    ]);
    inst.status = 'aplicado';
    inst.surveyCount = 2;
    inst.latestSurvey = {
      surveyId: SERVER_SURVEY,
      createdAt: '2026-11-07T08:00:00.000Z',
      farmId: FARM_1,
      farmCropId: null,
      farmerId: FARMER_A,
    };
    const d = detail(FARMER_A, [inst]);

    const out = overlay()(d, [
      local({ status: 'synced', backendSurveyId: SERVER_SURVEY, instrumentId: I_FARM, farmId: FARM_1 }),
    ]);

    expect(byId(out, I_FARM).units[0].surveyCount).toBe(2);
    expect(byId(out, I_FARM).surveyCount).toBe(2);
  });

  it('una encuesta sincronizada que la foto todavía no incluye sí se superpone', () => {
    const d = detail(FARMER_A, [farmerInstrument('falta')]);

    const out = overlay()(d, [local({ status: 'synced', backendSurveyId: 'srv-nueva' })]);

    expect(byId(out, I_FARMER).units[0]).toMatchObject({
      status: 'aplicado',
      localStatus: 'aplicado_local',
    });
  });
});
