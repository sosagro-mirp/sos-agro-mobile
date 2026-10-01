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
jest.mock('../store/useCachedInstrumentsStore', () => ({
  useCachedInstrumentsStore: { getState: () => ({ loadFromCache: jest.fn() }) },
}));

import { useCachedCampaignsStore } from '../store/useCachedCampaignsStore';
import { campaignCacheStorage } from '../storage/campaignCache';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { fetchActiveCampaigns, fetchCampaignRender } from '../api/campaigns';
import { fetchInstrumentRender } from '../api/instruments';

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

  it('keeps the cache when the download fails midway', async () => {
    (fetchActiveCampaigns as jest.Mock).mockResolvedValue([{ campaignId: 'c1', name: 'Campaña' }]);
    (fetchCampaignRender as jest.Mock).mockResolvedValue(campaign);
    (fetchInstrumentRender as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

    await expect(useCachedCampaignsStore.getState().refresh()).rejects.toThrow('Unauthorized');

    expect(campaignCacheStorage.clear).not.toHaveBeenCalled();
    expect(instrumentCacheStorage.clear).not.toHaveBeenCalled();
    expect(useCachedCampaignsStore.getState().campaigns).toHaveLength(1);
  });

  it('replaces the cache only after everything downloaded', async () => {
    (fetchActiveCampaigns as jest.Mock).mockResolvedValue([{ campaignId: 'c1', name: 'Campaña' }]);
    (fetchCampaignRender as jest.Mock).mockResolvedValue(campaign);
    (fetchInstrumentRender as jest.Mock).mockResolvedValue({ instrumentId: 'i1' });

    await useCachedCampaignsStore.getState().refresh();

    expect(campaignCacheStorage.clear).toHaveBeenCalledTimes(1);
    expect(campaignCacheStorage.save).toHaveBeenCalledWith(campaign);
    expect(instrumentCacheStorage.save).toHaveBeenCalledWith({ instrumentId: 'i1' });
  });
});
