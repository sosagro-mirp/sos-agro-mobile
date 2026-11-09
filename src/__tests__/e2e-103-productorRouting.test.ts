/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6).
 * Entrada por «Productores», contexto de productor por parámetros de ruta y
 * regreso a la ficha (DM11). Cubre el criterio C6 de
 * `spec/103_encuestador_movil_por_productor.md` y la parte determinística de
 * C1 (la app abre en «Productores» y «Campañas» sigue disponible). La
 * navegación real (pila de pantallas, botón atrás) se valida en la ronda
 * manual `test-103`.
 *
 * Como en `e2e-067`, no hay `@testing-library/react-native` ni
 * `react-test-renderer`: la lógica vive en funciones puras de
 * `src/lib/surveyAnchor.ts` y las pantallas solo la aplican. Lo único que se
 * toca de `app/` es la redirección de `app/index.tsx` (llamando al
 * componente) y el orden de pestañas de `app/(tabs)/_layout.tsx` (leyendo el
 * archivo).
 *
 * ARRANCA EN ROJO: `src/lib/surveyAnchor.ts` y las pantallas de
 * `app/productores/` no existen; `app/index.tsx` redirige a `/campaign` y la
 * primera pestaña es «Campañas» (Fase 5).
 *
 * ── Contrato de `src/lib/surveyAnchor.ts` (ver también e2e-103-surveyAnchorSync) ──
 *
 *   export const DEFAULT_ENTRY_ROUTE: '/productores';
 *
 *   interface ApplyContext {
 *     farmerId: string;                   // UUID o provisional `local_farmer_*`
 *     farmId?: string; farmCropId?: string;  // solo UUID, nunca ids locales
 *     scopeLevel?: 'farmer' | 'farm' | 'farm_crop';
 *   }
 *
 *   export function applyContextParams(ctx: ApplyContext): Record<string, string>;
 *     Parámetros para `router.push({ pathname: '/instrument/[id]/start', params })`
 *     con solo las claves presentes.
 *
 *   export function parseApplyContext(
 *     params: Record<string, string | string[] | undefined>,  // useLocalSearchParams()
 *   ): ApplyContext | null;
 *     null si no hay `farmerId` válido, si `farmId`/`farmCropId` no son UUID,
 *     si hay `farmCropId` sin `farmId` o si `scopeLevel` no es válido. Un
 *     parámetro repetido (array) toma el primero.
 *
 *   export function applyContextFromDraft(draft: {
 *     campaignSessionId?: string; farmerId?: string; farmId?: string; farmCropId?: string;
 *   }): ApplyContext | null;
 *     Para reanudar desde Borradores: un borrador con sesión es de campaña →
 *     null; sin sesión y con productor → su contexto.
 *
 *   export function returnPathAfterSurvey(input: {
 *     campaignId?: string | null; campaignSessionId?: string | null; farmerId?: string | null;
 *   }): string;
 *     Campaña (campaignId + sesión) → `/campaign/{campaignId}/session/{sessionId}/orchestrator`;
 *     productor → `/productores/{farmerId}`; ninguno → DEFAULT_ENTRY_ROUTE.
 */

import * as fs from 'fs';
import * as path from 'path';

jest.mock('expo-router', () => ({ Redirect: 'Redirect' }));

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

type ScopeLevel = 'farmer' | 'farm' | 'farm_crop';
interface ApplyContext { farmerId: string; farmId?: string; farmCropId?: string; scopeLevel?: ScopeLevel }
type Params = Record<string, string | string[] | undefined>;

const MODULE = '../lib/surveyAnchor';
const APP_DIR = path.resolve(__dirname, '../../app');

const FARMER = 'aaaaaaaa-0000-4000-8000-000000000103';
const LOCAL_FARMER = 'local_farmer_9c3f1b2a-8e7d-4f2e-9a1b-2c3d4e5f6103';
const FARM = 'f1f1f1f1-0000-4000-8000-000000000103';
const FARM_CROP = 'fc000001-0000-4000-8000-000000000103';
const SESSION = '33333333-3333-4333-8333-333333333103';

// ═══ Entrada (DM11) ══════════════════════════════════════════════════════════

describe('Entrada — C1/C6: la app abre en «Productores» y «Campañas» sigue', () => {
  it('DEFAULT_ENTRY_ROUTE es /productores', () => {
    expect(loadExport<string>(MODULE, 'DEFAULT_ENTRY_ROUTE')).toBe('/productores');
  });

  it('app/index.tsx redirige a /productores', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Index = require('../../app/index').default as () => { props: { href: string } };
    expect(Index().props.href).toBe('/productores');
  });

  it('«Productores» es la primera pestaña y «Campañas» sigue en la barra', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, '(tabs)/_layout.tsx'), 'utf8');
    const screens = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);

    expect(screens[0]).toBe('productores/index');
    expect(screens).toContain('campaign/index');
    expect(screens).toEqual(expect.arrayContaining(['drafts/index', 'sync/index', 'requests/index']));
  });

  it('existen las pantallas de lista, ficha y alta de productor', () => {
    for (const file of ['(tabs)/productores/index.tsx', 'productores/[farmerId].tsx', 'productores/nuevo.tsx']) {
      expect({ file, exists: fs.existsSync(path.join(APP_DIR, file)) }).toEqual({ file, exists: true });
    }
  });
});

// ═══ Contexto por parámetros ═════════════════════════════════════════════════

describe('applyContextParams / parseApplyContext — C6: el contexto viaja por la ruta', () => {
  it('ida y vuelta conserva el contexto de cultivo', () => {
    const toParams = loadExport<(c: ApplyContext) => Record<string, string>>(MODULE, 'applyContextParams');
    const parse = loadExport<(p: Params) => ApplyContext | null>(MODULE, 'parseApplyContext');
    const ctx: ApplyContext = { farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP, scopeLevel: 'farm_crop' };

    expect(parse(toParams(ctx))).toEqual(ctx);
  });

  it('solo incluye las claves presentes', () => {
    const toParams = loadExport<(c: ApplyContext) => Record<string, string>>(MODULE, 'applyContextParams');
    expect(toParams({ farmerId: FARMER, scopeLevel: 'farmer' })).toEqual({ farmerId: FARMER, scopeLevel: 'farmer' });
  });

  it('acepta un productor provisional', () => {
    const parse = loadExport<(p: Params) => ApplyContext | null>(MODULE, 'parseApplyContext');
    expect(parse({ farmerId: LOCAL_FARMER, scopeLevel: 'farmer' })).toEqual({ farmerId: LOCAL_FARMER, scopeLevel: 'farmer' });
  });

  it('rechaza contextos inválidos', () => {
    const parse = loadExport<(p: Params) => ApplyContext | null>(MODULE, 'parseApplyContext');
    expect(parse({})).toBeNull();
    expect(parse({ farmerId: 'no-es-un-id' })).toBeNull();
    expect(parse({ farmerId: FARMER, farmId: 'local_farm_1' })).toBeNull();
    expect(parse({ farmerId: FARMER, farmCropId: FARM_CROP })).toBeNull();
    expect(parse({ farmerId: FARMER, scopeLevel: 'campaign' })).toBeNull();
  });

  it('con parámetros repetidos toma el primero', () => {
    const parse = loadExport<(p: Params) => ApplyContext | null>(MODULE, 'parseApplyContext');
    expect(parse({ farmerId: [FARMER, LOCAL_FARMER] })).toEqual({ farmerId: FARMER });
  });
});

// ═══ Regreso ═════════════════════════════════════════════════════════════════

describe('returnPathAfterSurvey — C6: al terminar o salir se vuelve a la ficha', () => {
  it('una encuesta del flujo por productor vuelve a su ficha', () => {
    const back = loadExport<(i: Record<string, string | null | undefined>) => string>(MODULE, 'returnPathAfterSurvey');
    expect(back({ farmerId: FARMER })).toBe(`/productores/${FARMER}`);
    expect(back({ farmerId: LOCAL_FARMER, campaignSessionId: null })).toBe(`/productores/${LOCAL_FARMER}`);
  });

  it('una encuesta de campaña sigue volviendo a su orquestador', () => {
    const back = loadExport<(i: Record<string, string | null | undefined>) => string>(MODULE, 'returnPathAfterSurvey');
    expect(back({ campaignId: 'c1', campaignSessionId: SESSION, farmerId: FARMER })).toBe(
      `/campaign/c1/session/${SESSION}/orchestrator`,
    );
  });

  it('sin contexto vuelve a la entrada por defecto', () => {
    const back = loadExport<(i: Record<string, string | null | undefined>) => string>(MODULE, 'returnPathAfterSurvey');
    expect(back({})).toBe('/productores');
  });
});

describe('applyContextFromDraft — C6: reanudar desde Borradores conserva el regreso a la ficha', () => {
  it('un borrador sin sesión y con productor recupera su contexto con las anclas', () => {
    const fromDraft = loadExport<(d: Record<string, string | undefined>) => ApplyContext | null>(MODULE, 'applyContextFromDraft');
    expect(fromDraft({ farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP })).toEqual(
      expect.objectContaining({ farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP }),
    );
  });

  it('un borrador de campaña no tiene contexto de productor', () => {
    const fromDraft = loadExport<(d: Record<string, string | undefined>) => ApplyContext | null>(MODULE, 'applyContextFromDraft');
    expect(fromDraft({ campaignSessionId: SESSION, farmerId: FARMER })).toBeNull();
  });

  it('un borrador sin sesión ni productor no tiene contexto', () => {
    const fromDraft = loadExport<(d: Record<string, string | undefined>) => ApplyContext | null>(MODULE, 'applyContextFromDraft');
    expect(fromDraft({})).toBeNull();
  });
});
