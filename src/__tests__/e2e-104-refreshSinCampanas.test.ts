/**
 * Spec 104 — Retiro de campañas (H8), etapa A: «Actualizar» sin campañas.
 * Cubre C11 de `spec/104_retiro_de_campanas.md`.
 *
 * ARRANCA EN ROJO. Hoy `refresh()` empieza con `fetchActiveCampaigns()` y
 * `fetchCampaignRender()`, y si cualquiera de las dos falla se cae toda la
 * descarga (foto de cobertura incluida).
 *
 * ── Contrato tras el spec 104 ────────────────────────────────────────────────
 *   refresh():
 *     - NO llama a `fetchActiveCampaigns` ni a `fetchCampaignRender`;
 *     - descarga la foto (`fetchCoverageSnapshot`) y los instrumentos de la
 *       unión de `memberIds` de sus columnas, más S_REG/S1/S2;
 *     - reemplaza la foto al final (`coverageCacheStorage.replaceAll`);
 *     - NO vacía la caché de campañas (`campaignCacheStorage.clear`): los
 *       borradores heredados la siguen leyendo hasta la etapa C.
 *
 * Mocks con el mismo arnés que `e2e-103-coverageSnapshotDownload.test.ts`.
 */

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
  farmerCacheStorage: { upsert: jest.fn(), recordConsent: jest.fn().mockResolvedValue(1), get: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../storage/consentDocumentCache', () => ({ consentDocumentCacheStorage: { save: jest.fn() } }));
jest.mock('../api/campaigns', () => ({ fetchActiveCampaigns: jest.fn(), fetchCampaignRender: jest.fn() }));
jest.mock('../api/instruments', () => ({
  fetchInstrumentRender: jest.fn(),
  fetchInstrumentByCode: jest.fn().mockRejectedValue(new Error('not configured')),
}));
jest.mock('../api/consents', () => ({ fetchActiveConsentDocument: jest.fn() }));
jest.mock('../api/farmers', () => ({ listAllFarmers: jest.fn().mockResolvedValue([]) }));
jest.mock('../api/coverage', () => ({ fetchCoverageSnapshot: jest.fn() }));
jest.mock('../storage/coverageCache', () => ({
  coverageCacheStorage: {
    replaceAll: jest.fn().mockResolvedValue(undefined),
    getSnapshotMeta: jest.fn().mockResolvedValue(null),
    list: jest.fn().mockResolvedValue([]),
    getDetail: jest.fn().mockResolvedValue(null),
    addProvisional: jest.fn().mockResolvedValue(undefined),
    remapFarmer: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../store/useCachedInstrumentsStore', () => ({
  useCachedInstrumentsStore: { getState: () => ({ loadFromCache: jest.fn() }) },
}));

import { campaignCacheStorage } from '../storage/campaignCache';
import { fetchActiveCampaigns, fetchCampaignRender } from '../api/campaigns';
import { fetchInstrumentRender } from '../api/instruments';
import { fetchActiveConsentDocument } from '../api/consents';
import { fetchCoverageSnapshot } from '../api/coverage';
import { coverageCacheStorage } from '../storage/coverageCache';
import { useCachedCampaignsStore } from '../store/useCachedCampaignsStore';

const snapshot = {
  computedAt: '2026-11-20T15:00:00.000Z',
  instruments: [
    { instrumentId: 'i-prod', name: 'Productor', code: 'C_PROD', scopeLevel: 'farmer', cropIds: [], coverageGroup: 'g', memberIds: ['i-prod', 'i-prod-v2'] },
    { instrumentId: 'i-farm', name: 'Finca', code: null, scopeLevel: 'farm', cropIds: [], coverageGroup: null, memberIds: ['i-farm'] },
  ],
  farmers: [],
};

const downloaded = () => (fetchInstrumentRender as jest.Mock).mock.calls.map((c) => c[0] as string).sort();

beforeEach(() => {
  jest.clearAllMocks();
  (fetchInstrumentRender as jest.Mock).mockImplementation(async (id: string) => ({ instrumentId: id }));
  (fetchActiveConsentDocument as jest.Mock).mockResolvedValue({ consentDocumentId: 'doc-1', version: '1.1' });
  (fetchCoverageSnapshot as jest.Mock).mockResolvedValue(snapshot);
  useCachedCampaignsStore.setState({ error: null });
});

describe('Spec 104 — C11: refresh() no depende de campañas', () => {
  it('no llama a campaigns/active ni a render', async () => {
    (fetchActiveCampaigns as jest.Mock).mockResolvedValue([{ campaignId: 'c1', name: 'Campaña' }]);
    (fetchCampaignRender as jest.Mock).mockResolvedValue({ campaignId: 'c1', steps: [] });

    await useCachedCampaignsStore.getState().refresh();

    expect(fetchActiveCampaigns).not.toHaveBeenCalled();
    expect(fetchCampaignRender).not.toHaveBeenCalled();
  });

  it('con campaigns/active caído (410) la descarga termina y guarda la foto', async () => {
    (fetchActiveCampaigns as jest.Mock).mockRejectedValue(Object.assign(new Error('Gone'), { status: 410 }));
    (fetchCampaignRender as jest.Mock).mockRejectedValue(Object.assign(new Error('Gone'), { status: 410 }));

    await useCachedCampaignsStore.getState().refresh();

    expect(useCachedCampaignsStore.getState().error).toBeNull();
    expect(coverageCacheStorage.replaceAll).toHaveBeenCalledTimes(1);
    expect((coverageCacheStorage.replaceAll as jest.Mock).mock.calls[0][0]).toEqual(snapshot);
  });

  it('descarga los instrumentos de la unión de memberIds de la foto', async () => {
    await useCachedCampaignsStore.getState().refresh();

    expect(downloaded()).toEqual(expect.arrayContaining(['i-farm', 'i-prod', 'i-prod-v2']));
  });

  it('no vacía la caché de campañas: los borradores heredados la siguen usando', async () => {
    await useCachedCampaignsStore.getState().refresh();

    expect(campaignCacheStorage.clear).not.toHaveBeenCalled();
  });
});
