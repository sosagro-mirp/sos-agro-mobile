jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../storage/campaignCache', () => ({
  campaignCacheStorage: { clear: jest.fn(), save: jest.fn(), list: jest.fn() },
}));
jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: {
    clear: jest.fn(),
    save: jest.fn(),
    listCachedIds: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../storage/farmerCache', () => ({ farmerCacheStorage: { upsert: jest.fn() } }));
jest.mock('../storage/consentDocumentCache', () => ({
  consentDocumentCacheStorage: { save: jest.fn() },
}));
jest.mock('../api/campaigns', () => ({
  fetchActiveCampaigns: jest.fn(),
  fetchCampaignRender: jest.fn(),
}));
jest.mock('../api/instruments', () => ({
  fetchInstrumentRender: jest.fn(),
  fetchInstrumentByCode: jest.fn().mockRejectedValue(new Error('not configured')),
}));
jest.mock('../api/consents', () => ({
  fetchActiveConsentDocument: jest.fn().mockRejectedValue(new Error('none')),
}));
jest.mock('../api/farmers', () => ({ listAllFarmers: jest.fn().mockResolvedValue([]) }));
// Spec 103 — refresh() también descarga la foto de cobertura.
jest.mock('../api/coverage', () => ({
  fetchCoverageSnapshot: jest.fn().mockResolvedValue({ computedAt: '2026-11-08T15:00:00.000Z', instruments: [], farmers: [] }),
}));
jest.mock('../storage/coverageCache', () => ({
  coverageCacheStorage: { replaceAll: jest.fn(), getSnapshotMeta: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../store/useCachedInstrumentsStore', () => ({
  useCachedInstrumentsStore: { getState: () => ({ loadFromCache: jest.fn() }) },
}));

import { useCachedCampaignsStore } from '../store/useCachedCampaignsStore';
import { campaignCacheStorage } from '../storage/campaignCache';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { fetchActiveCampaigns } from '../api/campaigns';
import { fetchInstrumentRender } from '../api/instruments';
import { fetchCoverageSnapshot } from '../api/coverage';
import { coverageCacheStorage } from '../storage/coverageCache';

const campaign = {
  campaignId: 'c1',
  name: 'Campaña',
  steps: [{ instrument: { instrumentId: 'i1' } }],
};

describe('useCachedCampaignsStore.refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCachedCampaignsStore.setState({ campaigns: [campaign as never], error: null });
  });

  // Spec 104 (etapa A): refresh() ya no descarga campañas; la caché de campañas no
  // se toca, y la falla a mitad de camino ahora es la de la foto de cobertura.
  it('keeps the cache when the download fails midway', async () => {
    (fetchCoverageSnapshot as jest.Mock).mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(useCachedCampaignsStore.getState().refresh()).rejects.toThrow('Unauthorized');

    expect(campaignCacheStorage.clear).not.toHaveBeenCalled();
    expect(instrumentCacheStorage.clear).not.toHaveBeenCalled();
    expect(coverageCacheStorage.replaceAll).not.toHaveBeenCalled();
    expect(useCachedCampaignsStore.getState().campaigns).toHaveLength(1);
  });

  it('replaces the cache only after everything downloaded', async () => {
    (fetchCoverageSnapshot as jest.Mock).mockResolvedValueOnce({
      computedAt: '2026-11-08T15:00:00.000Z',
      instruments: [
        { instrumentId: 'i1', name: 'I', code: null, scopeLevel: 'farmer', cropIds: [], coverageGroup: null, memberIds: ['i1'] },
      ],
      farmers: [],
    });
    (fetchInstrumentRender as jest.Mock).mockResolvedValue({ instrumentId: 'i1' });

    await useCachedCampaignsStore.getState().refresh();

    expect(fetchActiveCampaigns).not.toHaveBeenCalled();
    expect(campaignCacheStorage.clear).not.toHaveBeenCalled();
    expect(instrumentCacheStorage.save).toHaveBeenCalledWith({ instrumentId: 'i1' });
    expect(coverageCacheStorage.replaceAll).toHaveBeenCalledTimes(1);
  });
});
