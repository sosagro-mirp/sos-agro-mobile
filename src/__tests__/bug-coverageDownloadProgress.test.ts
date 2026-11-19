/**
 * Bug: al descargar la cobertura de productores el progreso quedaba en 0 %
 * hasta terminar. La fase `coverage` debe avanzar con cada instrumento.
 */
import { useCachedCampaignsStore } from '../store/useCachedCampaignsStore';

jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../storage/campaignCache', () => ({
  campaignCacheStorage: { clear: jest.fn(), save: jest.fn(), list: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: {
    clear: jest.fn(),
    save: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    listCachedIds: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../storage/farmerCache', () => ({
  farmerCacheStorage: { upsert: jest.fn(), recordConsent: jest.fn(), get: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../storage/consentDocumentCache', () => ({ consentDocumentCacheStorage: { save: jest.fn() } }));
jest.mock('../storage/coverageCache', () => ({
  coverageCacheStorage: { replaceAll: jest.fn().mockResolvedValue(undefined), getSnapshotMeta: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: { listUnsyncedInstrumentIds: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../api/campaigns', () => ({ fetchActiveCampaigns: jest.fn(), fetchCampaignRender: jest.fn() }));
jest.mock('../api/instruments', () => ({
  fetchInstrumentRender: jest.fn(async (id: string) => ({ instrumentId: id })),
  fetchInstrumentByCode: jest.fn().mockRejectedValue(new Error('not configured')),
}));
jest.mock('../api/consents', () => ({ fetchActiveConsentDocument: jest.fn().mockRejectedValue(new Error('none')) }));
jest.mock('../api/farmers', () => ({ listAllFarmers: jest.fn().mockResolvedValue([]) }));
jest.mock('../api/coverage', () => ({
  fetchCoverageSnapshot: jest.fn().mockResolvedValue({
    computedAt: '2026-11-08T15:00:00.000Z',
    instruments: [
      { instrumentId: 'a', memberIds: ['a'] },
      { instrumentId: 'b', memberIds: ['b'] },
      { instrumentId: 'c', memberIds: ['c'] },
    ],
    farmers: [],
  }),
}));
jest.mock('../store/useCachedInstrumentsStore', () => ({
  useCachedInstrumentsStore: { getState: () => ({ loadFromCache: jest.fn() }) },
}));

describe('refresh() — progreso de la fase de cobertura', () => {
  it('avanza por encima de 0 % y llega al 100 % antes de pasar a encuestados', async () => {
    const seen: { done: number; total: number }[] = [];
    const unsub = useCachedCampaignsStore.subscribe((s) => {
      if (s.downloadProgress?.phase === 'coverage') {
        seen.push({ done: s.downloadProgress.done, total: s.downloadProgress.total });
      }
    });
    await useCachedCampaignsStore.getState().refresh();
    unsub();

    const percents = seen.map((p) => Math.round((p.done / p.total) * 100));
    expect(percents[0]).toBe(0);
    expect(percents.some((p) => p > 0 && p < 100)).toBe(true);
    expect(percents[percents.length - 1]).toBe(100);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
  });
});
