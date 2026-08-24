/**
 * Unit tests for farmPlotStore (spec 29).
 *
 * Escrito retroactivamente (2026-08-21): la implementación ya existía sin
 * ninguna prueba, hallazgo M-2 de `@reviewer`
 * (docs/reports/auditorias/29-auditoria-mobile-development-lote-merges.md).
 *
 * La `db` de Drizzle se mockea con una cadena encadenable, igual que
 * `farmerCache.test.ts` — no se prueba el filtrado SQL en sí (delegado a
 * SQLite/Drizzle), solo la serialización y el mapeo de este módulo.
 */

// ─── Mock declarations (hoisted before imports) ───────────────────────────────

const mockChain: {
  values: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  set: jest.Mock;
  all: jest.Mock;
  get: jest.Mock;
} = {
  values: jest.fn(),
  onConflictDoUpdate: jest.fn(),
  from: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  set: jest.fn(),
  all: jest.fn(),
  get: jest.fn(),
};

jest.mock('../storage/db/db', () => ({
  db: {
    insert: jest.fn(() => mockChain),
    select: jest.fn(() => mockChain),
    update: jest.fn(() => mockChain),
    delete: jest.fn(() => Promise.resolve({ changes: 0 })),
  },
}));

import { farmPlotStore, type FarmPlotDraft } from '../storage/farmPlotStore';
import type { PolygonPayload } from '../api/farmPlots';

const POLYGON: PolygonPayload = {
  points: [
    { lat: 6.25184, lng: -75.56359 },
    { lat: 6.252, lng: -75.5637 },
    { lat: 6.2521, lng: -75.5634 },
  ],
};

function makeDraft(overrides: Partial<FarmPlotDraft> = {}): FarmPlotDraft {
  return {
    id: 'plot-1',
    farmId: 'farm-1',
    name: 'Lote norte',
    description: 'Zona cafetera',
    area: 2.5,
    polygon: POLYGON,
    status: 'draft',
    capturedOffline: true,
    createdAt: new Date('2026-08-12T10:00:00Z'),
    updatedAt: new Date('2026-08-12T10:00:00Z'),
    ...overrides,
  };
}

describe('farmPlotStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChain.values.mockReturnValue(mockChain);
    mockChain.onConflictDoUpdate.mockResolvedValue(undefined);
    mockChain.from.mockReturnValue(mockChain);
    mockChain.where.mockReturnValue(mockChain);
    mockChain.orderBy.mockReturnValue(mockChain);
    mockChain.set.mockReturnValue(mockChain);
    mockChain.all.mockResolvedValue([]);
    mockChain.get.mockResolvedValue(undefined);
  });

  describe('saveDraft', () => {
    it('serializa el polígono como JSON en el insert y en el conflict update', async () => {
      await farmPlotStore.saveDraft(makeDraft());

      const insertedValues = mockChain.values.mock.calls[0][0];
      expect(insertedValues.polygon).toBe(JSON.stringify(POLYGON));

      const conflictArgs = mockChain.onConflictDoUpdate.mock.calls[0][0];
      expect(conflictArgs.set.polygon).toBe(JSON.stringify(POLYGON));
    });

    it('usa upsert por id (onConflictDoUpdate target: id)', async () => {
      await farmPlotStore.saveDraft(makeDraft());

      const conflictArgs = mockChain.onConflictDoUpdate.mock.calls[0][0];
      expect(conflictArgs.target).toBeDefined();
    });

    it('convierte description/area undefined a null en el insert', async () => {
      await farmPlotStore.saveDraft(
        makeDraft({ description: undefined, area: undefined }),
      );

      const insertedValues = mockChain.values.mock.calls[0][0];
      expect(insertedValues.description).toBeNull();
      expect(insertedValues.area).toBeNull();
    });
  });

  describe('loadDraftsByFarm', () => {
    it('deserializa el polígono desde JSON y mapea todas las columnas', async () => {
      mockChain.all.mockResolvedValue([
        {
          id: 'plot-1',
          farmId: 'farm-1',
          name: 'Lote norte',
          description: 'Zona cafetera',
          area: 2.5,
          polygon: JSON.stringify(POLYGON),
          status: 'synced',
          capturedOffline: false,
          createdAt: new Date('2026-08-12T10:00:00Z'),
          updatedAt: new Date('2026-08-12T10:00:00Z'),
        },
      ]);

      const result = await farmPlotStore.loadDraftsByFarm('farm-1');

      expect(result).toHaveLength(1);
      expect(result[0].polygon).toEqual(POLYGON);
      expect(result[0].status).toBe('synced');
      expect(result[0].capturedOffline).toBe(false);
    });

    it('devuelve un array vacío si la finca no tiene lotes', async () => {
      mockChain.all.mockResolvedValue([]);

      const result = await farmPlotStore.loadDraftsByFarm('farm-sin-lotes');

      expect(result).toEqual([]);
    });
  });

  describe('loadDraft', () => {
    it('devuelve null si el lote no existe', async () => {
      mockChain.get.mockResolvedValue(undefined);

      const result = await farmPlotStore.loadDraft('inexistente');

      expect(result).toBeNull();
    });

    it('devuelve el lote mapeado, con el polígono deserializado', async () => {
      mockChain.get.mockResolvedValue({
        id: 'plot-1',
        farmId: 'farm-1',
        name: 'Lote norte',
        description: null,
        area: null,
        polygon: JSON.stringify(POLYGON),
        status: 'draft',
        capturedOffline: true,
        createdAt: new Date('2026-08-12T10:00:00Z'),
        updatedAt: new Date('2026-08-12T10:00:00Z'),
      });

      const result = await farmPlotStore.loadDraft('plot-1');

      expect(result?.polygon).toEqual(POLYGON);
      expect(result?.description).toBeUndefined();
      expect(result?.area).toBeUndefined();
    });
  });

  describe('markSynced', () => {
    it('actualiza status a synced y refresca updatedAt', async () => {
      await farmPlotStore.markSynced('plot-1');

      const setArgs = mockChain.set.mock.calls[0][0];
      expect(setArgs.status).toBe('synced');
      expect(setArgs.updatedAt).toBeInstanceOf(Date);
    });
  });
});
