import { create } from 'zustand';
import { campaignCacheStorage } from '../storage/campaignCache';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { fetchActiveCampaigns, fetchCampaignRender } from '../api/campaigns';
import { fetchInstrumentRender } from '../api/instruments';
import type { CampaignRender } from '../types';

export interface DownloadProgress {
  phase: 'campaigns' | 'instruments';
  currentName: string;
  done: number;
  total: number;
}

interface CachedCampaignsState {
  campaigns: CampaignRender[];
  cachedInstrumentIds: Set<string>;
  isLoading: boolean;
  downloadProgress: DownloadProgress | null;
  error: string | null;

  loadFromCache: () => Promise<void>;
  refresh: () => Promise<void>;
  getById: (id: string) => CampaignRender | undefined;
  isCampaignFullyCached: (campaignId: string) => boolean;
}

function getInstrumentIds(campaign: CampaignRender): string[] {
  return [
    ...new Set(campaign.steps.map((s) => s.instrument.instrumentId)),
  ];
}

export const useCachedCampaignsStore = create<CachedCampaignsState>((set, get) => ({
  campaigns: [],
  cachedInstrumentIds: new Set(),
  isLoading: false,
  downloadProgress: null,
  error: null,

  async loadFromCache() {
    try {
      const [campaigns, cachedIds] = await Promise.all([
        campaignCacheStorage.list(),
        instrumentCacheStorage.listCachedIds(),
      ]);
      set({ campaigns, cachedInstrumentIds: new Set(cachedIds) });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error cargando caché' });
    }
  },

  async refresh() {
    set({ isLoading: true, error: null, downloadProgress: null });

    try {
      // ── Phase 1: fetch campaign list and full renders ──────────────────────
      const summaries = await fetchActiveCampaigns();

      set({
        downloadProgress: {
          phase: 'campaigns',
          currentName: 'Obteniendo campañas…',
          done: 0,
          total: summaries.length,
        },
      });

      const rendered: CampaignRender[] = [];
      for (const summary of summaries) {
        set((s) => ({
          downloadProgress: s.downloadProgress
            ? {
                ...s.downloadProgress,
                currentName: summary.name,
              }
            : null,
        }));

        const campaign = await fetchCampaignRender(summary.campaignId);
        await campaignCacheStorage.save(campaign);
        rendered.push(campaign);

        set((s) => ({
          downloadProgress: s.downloadProgress
            ? {
                ...s.downloadProgress,
                done: s.downloadProgress.done + 1,
              }
            : null,
        }));
      }

      // ── Phase 2: download instruments not yet cached ───────────────────────
      const neededIds = [
        ...new Set(rendered.flatMap(getInstrumentIds)),
      ];

      const alreadyCached = await instrumentCacheStorage.listCachedIds();
      const alreadyCachedSet = new Set(alreadyCached);
      const toDownload = neededIds.filter((id) => !alreadyCachedSet.has(id));

      set({
        downloadProgress: {
          phase: 'instruments',
          currentName: toDownload.length === 0 ? 'Instrumentos al día' : 'Descargando instrumentos…',
          done: 0,
          total: toDownload.length,
        },
      });

      for (const instrumentId of toDownload) {
        set((s) => ({
          downloadProgress: s.downloadProgress
            ? {
                ...s.downloadProgress,
                currentName: `Instrumento ${s.downloadProgress.done + 1} de ${toDownload.length}`,
              }
            : null,
        }));

        const instrument = await fetchInstrumentRender(instrumentId);
        await instrumentCacheStorage.save(instrument);

        set((s) => ({
          downloadProgress: s.downloadProgress
            ? {
                ...s.downloadProgress,
                done: s.downloadProgress.done + 1,
              }
            : null,
        }));
      }

      // ── Final state refresh ────────────────────────────────────────────────
      const finalCachedIds = await instrumentCacheStorage.listCachedIds();
      set({
        campaigns: rendered,
        cachedInstrumentIds: new Set(finalCachedIds),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error actualizando campañas';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false, downloadProgress: null });
    }
  },

  getById(id) {
    return get().campaigns.find((c) => c.campaignId === id);
  },

  isCampaignFullyCached(campaignId) {
    const campaign = get().campaigns.find((c) => c.campaignId === campaignId);
    if (!campaign) return false;
    const { cachedInstrumentIds } = get();
    return getInstrumentIds(campaign).every((id) => cachedInstrumentIds.has(id));
  },
}));
