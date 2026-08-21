/**
 * Unit tests for farmerCacheStorage — focused on the fix for TC-003
 * (spec-47, Fase 8): `crops` must round-trip through `farmer_cache` so
 * that the fully-offline "buscar agricultor existente" flow can offer
 * instruments conditioned to crop without a prior online search.
 *
 * The Drizzle `db` is mocked; SQL filtering itself is not under test here
 * (delegated to SQLite/Drizzle) — only this module's own serialization
 * and mapping logic.
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

jest.mock('../storage/db/db', () => ({
  db: {
    insert: jest.fn(() => mockChain),
    select: jest.fn(() => mockChain),
    delete: jest.fn(() => Promise.resolve({ changes: 0 })),
  },
}));

import { farmerCacheStorage } from '../storage/farmerCache';

describe('farmerCacheStorage', () => {
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
  });

  describe('upsert', () => {
    it('serializes crops as JSON in both the insert values and the conflict update set', async () => {
      await farmerCacheStorage.upsert({
        farmerId: 'f1',
        name: 'Santiago',
        farmName: 'Finca El Cafetal',
        crops: [{ cropId: 'c1', name: 'Café' }],
        cachedAt: new Date(),
      });

      const insertedValues = mockChain.values.mock.calls[0][0];
      expect(insertedValues.crops).toBe(JSON.stringify([{ cropId: 'c1', name: 'Café' }]));

      const updateArgs = mockChain.onConflictDoUpdate.mock.calls[0][0];
      expect(updateArgs.set.crops).toBe(JSON.stringify([{ cropId: 'c1', name: 'Café' }]));
    });

    it('stores an empty JSON array when no crops are provided (no cultivo registrado)', async () => {
      await farmerCacheStorage.upsert({
        farmerId: 'f2',
        name: 'Agricultor sin cultivo',
        cachedAt: new Date(),
      });

      const insertedValues = mockChain.values.mock.calls[0][0];
      expect(insertedValues.crops).toBe('[]');
    });
  });

  describe('reading cached entries (search / get / getByDocumentId / listRecent)', () => {
    const row = {
      farmerId: 'f1',
      name: 'Santiago',
      documentId: '123',
      phone: null,
      farmName: 'Finca El Cafetal',
      crops: JSON.stringify([{ cropId: 'c1', name: 'Café' }]),
      cachedAt: new Date(),
    };

    it('search() parses crops back into an array', async () => {
      mockChain.all.mockResolvedValue([row]);
      const results = await farmerCacheStorage.search('Santiago');
      expect(results[0].crops).toEqual([{ cropId: 'c1', name: 'Café' }]);
    });

    it('get() parses crops back into an array', async () => {
      mockChain.get.mockResolvedValue(row);
      const result = await farmerCacheStorage.get('f1');
      expect(result?.crops).toEqual([{ cropId: 'c1', name: 'Café' }]);
    });

    it('listRecent() parses crops back into an array', async () => {
      mockChain.all.mockResolvedValue([row]);
      const results = await farmerCacheStorage.listRecent();
      expect(results[0].crops).toEqual([{ cropId: 'c1', name: 'Café' }]);
    });

    it('returns an empty array when the stored crops column is null (legacy rows pre-fix)', async () => {
      mockChain.get.mockResolvedValue({ ...row, crops: null });
      const result = await farmerCacheStorage.get('f1');
      expect(result?.crops).toEqual([]);
    });

    it('returns an empty array instead of throwing when the stored crops JSON is malformed', async () => {
      mockChain.get.mockResolvedValue({ ...row, crops: 'not-json' });
      const result = await farmerCacheStorage.get('f1');
      expect(result?.crops).toEqual([]);
    });
  });
});
