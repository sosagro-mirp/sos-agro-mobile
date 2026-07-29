/**
 * Spec 51 — Limpieza de la identidad provisional tras sincronizar.
 *
 * Cubre los criterios de aceptación 1-7 y 10 de
 * `spec/51_limpieza_identidad_provisional_post_sync.md`.
 *
 * ARRANCA EN ROJO. Dos defectos bajo prueba:
 *
 *  A) `SyncQueueService.maybeExtractFarmerAndCrops` (SyncQueueService.ts:322-349)
 *     remapea `surveys` al farmerId real y luego hace `upsert` de la entrada
 *     real, pero NUNCA borra la entrada provisional. Como `farmer_cache` tiene
 *     `farmerId` como PK, la entrada real se inserta AL LADO de la provisional:
 *     quedan dos filas con el mismo `documentId`.
 *
 *  B) `farmerCacheStorage.getByDocumentId()` (farmerCache.ts:90-97) consulta sin
 *     `ORDER BY` y devuelve `.get()` — la primera fila que entregue SQLite, sin
 *     orden garantizado. Si devuelve la provisional, `extractFarmerLocally`
 *     la acepta y retorna `isProvisional: false` con un farmerId LOCAL, lo que
 *     reintroduce el Bug B del spec 49 en el ciclo offline → sync → offline.
 *
 * Esta suite prueba el módulo de almacenamiento y el desempate; el ciclo
 * completo de campo (criterios 8 y 9) se valida en `docs/testing/24-test-spec51.md`.
 */

// ─── Mock declarations (hoisted before imports) ───────────────────────────────

const mockChain: {
  values: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  all: jest.Mock;
  get: jest.Mock;
} = {
  values: jest.fn(),
  onConflictDoUpdate: jest.fn(),
  from: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  all: jest.fn(),
  get: jest.fn(),
};

const mockDeleteChain: { where: jest.Mock } = { where: jest.fn() };

jest.mock('../storage/db/db', () => ({
  db: {
    insert: jest.fn(() => mockChain),
    select: jest.fn(() => mockChain),
    delete: jest.fn(() => mockDeleteChain),
  },
}));

import { farmerCacheStorage } from '../storage/farmerCache';
import { db } from '../storage/db/db';

const mockDbDelete = db.delete as unknown as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DOCUMENTO = '9105558899';

/** Identidad provisional generada offline por `extractFarmerLocally`. */
const FILA_PROVISIONAL = {
  farmerId: 'local_farmer_1753600000000_abc123',
  name: 'Mateo Provisional TEST',
  documentId: DOCUMENTO,
  phone: null,
  farmName: null,
  crops: null,
  // Más RECIENTE que la real a propósito: el desempate no puede basarse en
  // `cachedAt DESC`, porque nada garantiza que la real sea siempre la última.
  cachedAt: new Date('2026-07-28T12:00:00Z'),
};

/** Identidad real, resuelta contra el backend al sincronizar. */
const FILA_REAL = {
  farmerId: 'd4f1c8a2-0000-4000-8000-000000000042',
  name: 'Mateo Quintero',
  documentId: DOCUMENTO,
  phone: '3001112233',
  farmName: 'Finca La Esperanza',
  crops: JSON.stringify([{ cropId: 'crop-1', name: 'Café' }]),
  cachedAt: new Date('2026-07-28T11:00:00Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockChain.values.mockReturnValue(mockChain);
  mockChain.onConflictDoUpdate.mockResolvedValue(undefined);
  mockChain.from.mockReturnValue(mockChain);
  mockChain.where.mockReturnValue(mockChain);
  mockChain.orderBy.mockReturnValue(mockChain);
  mockChain.limit.mockReturnValue(mockChain);
  mockChain.all.mockReturnValue([]);
  mockChain.get.mockReturnValue(undefined);
  mockDeleteChain.where.mockResolvedValue(undefined);
});

// ─── Criterios 5-7: desempate determinista en getByDocumentId ────────────────

describe('getByDocumentId — desempate entre entrada provisional y real', () => {
  it('criterio 5: devuelve la entrada REAL cuando conviven ambas (real primero en la lista)', async () => {
    mockChain.all.mockReturnValue([FILA_REAL, FILA_PROVISIONAL]);
    mockChain.get.mockReturnValue(FILA_REAL);

    const entrada = await farmerCacheStorage.getByDocumentId(DOCUMENTO);

    expect(entrada).not.toBeNull();
    expect(entrada?.farmerId).toBe(FILA_REAL.farmerId);
  });

  it('criterio 5: devuelve la entrada REAL aunque la provisional sea más reciente', async () => {
    // Éste es el caso que un `ORDER BY cachedAt DESC` resolvería MAL: la
    // provisional tiene cachedAt posterior. El desempate debe ser por la
    // naturaleza del ID (no local), no por antigüedad.
    mockChain.all.mockReturnValue([FILA_PROVISIONAL, FILA_REAL]);
    mockChain.get.mockReturnValue(FILA_PROVISIONAL);

    const entrada = await farmerCacheStorage.getByDocumentId(DOCUMENTO);

    expect(entrada?.farmerId).toBe(FILA_REAL.farmerId);
    expect(entrada?.farmerId.startsWith('local_')).toBe(false);
  });

  it('criterio 6: devuelve la provisional cuando es la única (flujo offline puro)', async () => {
    mockChain.all.mockReturnValue([FILA_PROVISIONAL]);
    mockChain.get.mockReturnValue(FILA_PROVISIONAL);

    const entrada = await farmerCacheStorage.getByDocumentId(DOCUMENTO);

    expect(entrada?.farmerId).toBe(FILA_PROVISIONAL.farmerId);
  });

  it('criterio 7: devuelve null cuando no hay ninguna entrada para ese documento', async () => {
    mockChain.all.mockReturnValue([]);
    mockChain.get.mockReturnValue(undefined);

    const entrada = await farmerCacheStorage.getByDocumentId('0000000000');

    expect(entrada).toBeNull();
  });

  it('lee todas las filas candidatas, no solo la primera que devuelva SQLite', async () => {
    // Guarda estructural: si la implementación sigue usando `.get()` (una sola
    // fila), no puede desempatar. Debe consultar el conjunto con `.all()`.
    mockChain.all.mockReturnValue([FILA_PROVISIONAL, FILA_REAL]);

    await farmerCacheStorage.getByDocumentId(DOCUMENTO);

    expect(mockChain.all).toHaveBeenCalled();
  });

  it('mantiene el contrato de la función: devuelve una entrada mapeada, no la fila cruda', async () => {
    mockChain.all.mockReturnValue([FILA_REAL]);
    mockChain.get.mockReturnValue(FILA_REAL);

    const entrada = await farmerCacheStorage.getByDocumentId(DOCUMENTO);

    // `crops` viaja como JSON en la fila y debe salir ya parseado.
    expect(entrada?.crops).toEqual([{ cropId: 'crop-1', name: 'Café' }]);
    expect(entrada?.documentId).toBe(DOCUMENTO);
  });
});

// ─── Criterios 1-3: borrado de la entrada provisional al resolverla ──────────

describe('remove — invalidación de la entrada provisional', () => {
  it('criterio 2: borra exactamente la entrada indicada', async () => {
    await farmerCacheStorage.remove(FILA_PROVISIONAL.farmerId);

    expect(mockDbDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteChain.where).toHaveBeenCalledTimes(1);
  });

  it('criterio 3: un fallo del borrado no debe dejar la caché en estado incoherente', async () => {
    // El contrato del spec es que `SyncQueueService` capture este error con
    // logger.warn y siga; `remove` en sí puede propagarlo.
    mockDeleteChain.where.mockRejectedValue(new Error('SQLITE_BUSY'));

    await expect(
      farmerCacheStorage.remove(FILA_PROVISIONAL.farmerId),
    ).rejects.toThrow('SQLITE_BUSY');
  });
});

// ─── Criterio 10: la entrada real conserva los datos de la finca ─────────────

describe('upsert desde la sincronización — riqueza de la entrada real', () => {
  it('criterio 10: persiste phone, farmName y crops además de la identidad', async () => {
    await farmerCacheStorage.upsert({
      farmerId: FILA_REAL.farmerId,
      name: FILA_REAL.name,
      documentId: DOCUMENTO,
      phone: '3001112233',
      farmName: 'Finca La Esperanza',
      crops: [{ cropId: 'crop-1', name: 'Café' }],
      cachedAt: new Date('2026-07-28T11:00:00Z'),
    });

    const valores = mockChain.values.mock.calls[0][0] as {
      phone: string | null;
      farmName: string | null;
      crops: string;
    };

    // Hoy `SyncQueueService.ts:345-349` llama a upsert SOLO con farmerId, name,
    // documentId y cachedAt: la entrada real nace sin finca ni cultivos, y la
    // búsqueda offline de pre-encuesta la muestra pelada. El fix es enrutar ese
    // call-site por `cacheFarmerIdentity()`.
    expect(valores.phone).toBe('3001112233');
    expect(valores.farmName).toBe('Finca La Esperanza');
    expect(JSON.parse(valores.crops)).toEqual([
      { cropId: 'crop-1', name: 'Café' },
    ]);
  });
});
