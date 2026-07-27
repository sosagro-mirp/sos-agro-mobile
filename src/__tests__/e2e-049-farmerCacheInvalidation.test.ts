/**
 * Spec 49 — Bug C: invalidación de la caché local de agricultores.
 *
 * Cubre los criterios de aceptación 13 y 14 de
 * `spec/49_correccion_identidad_offline_agricultor_cultivos.md`.
 *
 * ARRANCA EN ROJO: `farmerCacheStorage.remove()` todavía no existe (Fase 3).
 * Hoy el único borrado disponible es `clearAll()`, que vacía la caché completa
 * y no sirve para invalidar una sola entrada obsoleta.
 *
 * Contexto del bug: `farmer_cache` es una caché persistente en SQLite que nunca
 * se invalida. Si un agricultor se borra en el backend (limpieza de datos de una
 * ronda de pruebas), el dispositivo sigue ofreciéndolo en la búsqueda offline y
 * reenvía su farmerId a `POST /api/campaign-sessions`, que responde 500 por
 * violación de la FK `campaign_sessions.farmer_id → farmers(id)`
 * (Sentry NODE-NESTJS-3).
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

/** Cadena propia para `db.delete(...).where(...)`, que el mock de la suite existente no cubre. */
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

const FARMER_ID_BORRADO = 'b7e2d4a1-0000-4000-8000-0000000000ff';
const FARMER_ID_VIGENTE = 'c1a9f8b3-0000-4000-8000-000000000011';

beforeEach(() => {
  jest.clearAllMocks();
  mockChain.values.mockReturnValue(mockChain);
  mockChain.onConflictDoUpdate.mockResolvedValue(undefined);
  mockChain.from.mockReturnValue(mockChain);
  mockChain.where.mockReturnValue(mockChain);
  mockChain.orderBy.mockReturnValue(mockChain);
  mockChain.limit.mockReturnValue(mockChain);
  mockChain.all.mockResolvedValue([]);
  mockChain.get.mockResolvedValue(undefined);
  mockDeleteChain.where.mockResolvedValue({ changes: 1 });
});

describe('spec49 / Bug C — farmerCacheStorage.remove', () => {
  // Criterio 14
  it('borra la entrada de la caché filtrando por farmerId', async () => {
    await farmerCacheStorage.remove(FARMER_ID_BORRADO);

    expect(mockDbDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteChain.where).toHaveBeenCalledTimes(1);
  });

  // Criterio 14 — invalidación quirúrgica: el resto de la caché es el trabajo
  // de campo ya descargado y no puede perderse por un agricultor obsoleto.
  it('no vacía la caché completa: aplica un filtro, a diferencia de clearAll', async () => {
    await farmerCacheStorage.remove(FARMER_ID_BORRADO);
    const conFiltro = mockDeleteChain.where.mock.calls.length;

    jest.clearAllMocks();
    mockDeleteChain.where.mockResolvedValue({ changes: 0 });
    // `clearAll` borra sin filtro; el mock de `db.delete` devuelve la cadena y
    // `clearAll` la consume directamente como promesa.
    await farmerCacheStorage.clearAll();

    expect(conFiltro).toBe(1);
    expect(mockDeleteChain.where).not.toHaveBeenCalled();
  });

  it('resuelve sin error cuando el farmerId no está en la caché', async () => {
    mockDeleteChain.where.mockResolvedValue({ changes: 0 });

    await expect(farmerCacheStorage.remove(FARMER_ID_VIGENTE)).resolves.not.toThrow();
  });

  it('es idempotente: invalidar dos veces el mismo farmerId no falla', async () => {
    await farmerCacheStorage.remove(FARMER_ID_BORRADO);
    mockDeleteChain.where.mockResolvedValue({ changes: 0 });

    await expect(farmerCacheStorage.remove(FARMER_ID_BORRADO)).resolves.not.toThrow();
    expect(mockDbDelete).toHaveBeenCalledTimes(2);
  });
});
