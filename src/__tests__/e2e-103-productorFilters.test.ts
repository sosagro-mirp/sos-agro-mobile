/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6).
 * Búsqueda y filtros de la lista «Productores» sin conexión. Cubre el
 * criterio C2 de `spec/103_encuestador_movil_por_productor.md`. Replica los
 * filtros del spec 101 (`frontend/lib/farmers/coverageFilters.ts`) sobre las
 * filas de la caché de cobertura; sin el filtro de diferencias abiertas (la
 * foto no las trae).
 *
 * ARRANCA EN ROJO: `src/lib/productorFilters.ts` todavía no existe (Fase 2).
 *
 * ── Contrato de `src/lib/productorFilters.ts` ──────────────────────────────
 *
 *   // Fila de `coverageCacheStorage.list()` (ver e2e-103-coverageSnapshotDownload),
 *   // ya con la superposición local aplicada a `summary` y `statusByInstrument`.
 *   interface CoverageListRow {
 *     farmerId: string; name: string; documentId: string | null;
 *     departmentId: string | null; townId: string | null;   // de la finca principal
 *     cropIds: string[]; farmsCount: number; hasPendingConsent: boolean;
 *     summary: { applicable; applied; partial; pending; notApplicable; instrumentsWithoutScope };
 *     statusByInstrument: Record<string, 'aplicado' | 'parcial' | 'falta'>; // sin no_aplica
 *     warnings: ('sin_finca' | 'sin_cultivo' | 'encuestas_sin_ubicar')[];
 *     isProvisional: boolean;
 *   }
 *
 *   interface ProductorFilters {
 *     search?: string;                // nombre y documento; sin tildes ni mayúsculas
 *     departmentIds?: string[];
 *     townIds?: string[];
 *     cropIds?: string[];             // alguno de los cultivos
 *     missingInstrumentId?: string | null; // «le falta X»: falta o parcial
 *     status?: 'completo' | 'con_pendientes' | 'sin_finca' | null;
 *   }
 *
 *   export function applyProductorFilters(rows: CoverageListRow[], filters: ProductorFilters): CoverageListRow[];
 *     AND entre filtros; conserva el orden; no muta. Un instrumento ausente
 *     de `statusByInstrument` es no_aplica y no cuenta como «le falta».
 *     'completo' = sin pendientes y sin aviso `sin_finca`.
 *
 *   export function summarizeProductorCoverage(row: CoverageListRow):
 *     { applied: number; applicable: number; pending: number; label: string };
 *     pending = pending + partial; label = «{applied} de {applicable}».
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

type Status = 'aplicado' | 'parcial' | 'falta';

interface Row {
  farmerId: string;
  name: string;
  documentId: string | null;
  departmentId: string | null;
  townId: string | null;
  cropIds: string[];
  farmsCount: number;
  hasPendingConsent: boolean;
  summary: { applicable: number; applied: number; partial: number; pending: number; notApplicable: number; instrumentsWithoutScope: number };
  statusByInstrument: Record<string, Status>;
  warnings: string[];
  isProvisional: boolean;
}

interface Filters {
  search?: string;
  departmentIds?: string[];
  townIds?: string[];
  cropIds?: string[];
  missingInstrumentId?: string | null;
  status?: 'completo' | 'con_pendientes' | 'sin_finca' | null;
}

const MODULE = '../lib/productorFilters';
const apply = () => loadExport<(rows: Row[], f: Filters) => Row[]>(MODULE, 'applyProductorFilters');

function row(partial: Partial<Row> & { farmerId: string }): Row {
  return {
    name: 'Sin nombre',
    documentId: null,
    departmentId: null,
    townId: null,
    cropIds: [],
    farmsCount: 1,
    hasPendingConsent: false,
    summary: { applicable: 2, applied: 2, partial: 0, pending: 0, notApplicable: 0, instrumentsWithoutScope: 0 },
    statusByInstrument: { 'i-prod': 'aplicado', 'i-finca': 'aplicado' },
    warnings: [],
    isProvisional: false,
    ...partial,
  };
}

const ROWS: Row[] = [
  row({
    farmerId: 'f-1',
    name: 'José Ñáñez',
    documentId: '1012345678',
    departmentId: 'd-cauca',
    townId: 't-popayan',
    cropIds: ['c-cafe'],
    statusByInstrument: { 'i-prod': 'aplicado', 'i-finca': 'falta' },
    summary: { applicable: 2, applied: 1, partial: 0, pending: 1, notApplicable: 0, instrumentsWithoutScope: 0 },
  }),
  row({
    farmerId: 'f-2',
    name: 'María López',
    documentId: '2099',
    departmentId: 'd-huila',
    townId: 't-pitalito',
    cropIds: ['c-cacao', 'c-cafe'],
  }),
  row({
    farmerId: 'f-3',
    name: 'Ana Ruiz',
    documentId: null,
    departmentId: 'd-cauca',
    townId: 't-cajibio',
    cropIds: ['c-cannabis'],
    statusByInstrument: { 'i-prod': 'parcial' },
    summary: { applicable: 1, applied: 0, partial: 1, pending: 0, notApplicable: 1, instrumentsWithoutScope: 0 },
  }),
  row({
    farmerId: 'local_farmer_x',
    name: 'Pedro Nuevo',
    documentId: '3030',
    farmsCount: 0,
    statusByInstrument: { 'i-prod': 'falta' },
    summary: { applicable: 1, applied: 0, partial: 0, pending: 1, notApplicable: 0, instrumentsWithoutScope: 0 },
    warnings: ['sin_finca'],
    isProvisional: true,
  }),
];

const ids = (rows: Row[]) => rows.map((r) => r.farmerId);

describe('applyProductorFilters — C2: búsqueda sin conexión', () => {
  it('busca por nombre sin importar tildes ni mayúsculas', () => {
    expect(ids(apply()(ROWS, { search: 'jose nanez' }))).toEqual(['f-1']);
    expect(ids(apply()(ROWS, { search: 'MARÍA' }))).toEqual(['f-2']);
  });

  it('busca por documento, también parcial', () => {
    expect(ids(apply()(ROWS, { search: '1012345678' }))).toEqual(['f-1']);
    expect(ids(apply()(ROWS, { search: '3030' }))).toEqual(['local_farmer_x']);
  });

  it('una búsqueda vacía o en blanco no filtra', () => {
    expect(ids(apply()(ROWS, { search: '   ' }))).toEqual(ids(ROWS));
    expect(ids(apply()(ROWS, {}))).toEqual(ids(ROWS));
  });
});

describe('applyProductorFilters — C2: filtros del spec 101', () => {
  it('departamento y municipio (de la finca principal)', () => {
    expect(ids(apply()(ROWS, { departmentIds: ['d-cauca'] }))).toEqual(['f-1', 'f-3']);
    expect(ids(apply()(ROWS, { townIds: ['t-pitalito', 't-cajibio'] }))).toEqual(['f-2', 'f-3']);
  });

  it('cultivo: basta con uno de los elegidos', () => {
    expect(ids(apply()(ROWS, { cropIds: ['c-cafe'] }))).toEqual(['f-1', 'f-2']);
    expect(ids(apply()(ROWS, { cropIds: ['c-cannabis', 'c-cacao'] }))).toEqual(['f-2', 'f-3']);
  });

  it('«le falta X»: falta o parcial; no_aplica (ausente) no cuenta', () => {
    expect(ids(apply()(ROWS, { missingInstrumentId: 'i-finca' }))).toEqual(['f-1']);
    expect(ids(apply()(ROWS, { missingInstrumentId: 'i-prod' }))).toEqual(['f-3', 'local_farmer_x']);
  });

  it('estado: completo, con pendientes y sin finca', () => {
    expect(ids(apply()(ROWS, { status: 'completo' }))).toEqual(['f-2']);
    expect(ids(apply()(ROWS, { status: 'con_pendientes' }))).toEqual(['f-1', 'f-3', 'local_farmer_x']);
    expect(ids(apply()(ROWS, { status: 'sin_finca' }))).toEqual(['local_farmer_x']);
  });

  it('combina filtros con AND', () => {
    expect(ids(apply()(ROWS, { departmentIds: ['d-cauca'], cropIds: ['c-cafe'], status: 'con_pendientes' }))).toEqual(['f-1']);
    expect(ids(apply()(ROWS, { search: 'ana', departmentIds: ['d-huila'] }))).toEqual([]);
  });

  it('no muta las filas y conserva el orden', () => {
    const copy = JSON.parse(JSON.stringify(ROWS));
    const out = apply()(ROWS, { cropIds: ['c-cafe', 'c-cannabis'] });

    expect(ids(out)).toEqual(['f-1', 'f-2', 'f-3']);
    expect(ROWS).toEqual(copy);
  });
});

describe('summarizeProductorCoverage — C1/C2: aplicados sobre aplicables y pendientes', () => {
  it('suma parciales a los pendientes y arma la etiqueta', () => {
    const summarize = loadExport<(r: Row) => { applied: number; applicable: number; pending: number; label: string }>(
      MODULE,
      'summarizeProductorCoverage',
    );

    expect(summarize(ROWS[0])).toEqual({ applied: 1, applicable: 2, pending: 1, label: '1 de 2' });
    expect(summarize(ROWS[2])).toEqual({ applied: 0, applicable: 1, pending: 1, label: '0 de 1' });
  });
});
