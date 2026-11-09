import { create } from 'zustand';
import { captureError } from '../lib/sentry';
import { campaignCacheStorage } from '../storage/campaignCache';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { farmerCacheStorage } from '../storage/farmerCache';
import { consentDocumentCacheStorage } from '../storage/consentDocumentCache';
import { fetchInstrumentRender, fetchInstrumentByCode } from '../api/instruments';
import { fetchActiveConsentDocument } from '../api/consents';
import { listAllFarmers } from '../api/farmers';
import { fetchCoverageSnapshot, type CoverageSnapshot } from '../api/coverage';
import { coverageCacheStorage } from '../storage/coverageCache';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { useCachedInstrumentsStore } from './useCachedInstrumentsStore';
import type { CampaignRender } from '../types';

export interface DownloadProgress {
  phase: 'campaigns' | 'coverage' | 'instruments' | 'farmers';
  currentName: string;
  done: number;
  total: number;
}

interface CachedCampaignsState {
  campaigns: CampaignRender[];
  cachedInstrumentIds: Set<string>;
  isLoading: boolean;
  downloadProgress: DownloadProgress | null;
  // Spec 103 — fecha de la foto de cobertura («Cobertura al {fecha}»).
  snapshotComputedAt: string | null;
  error: string | null;

  loadFromCache: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Spec 103 (DM4) — solo la foto de cobertura, p. ej. tras un sync exitoso. */
  refreshCoverageSnapshot: () => Promise<void>;
  getById: (id: string) => CampaignRender | undefined;
  isCampaignFullyCached: (campaignId: string) => boolean;
}

/** Instrumentos de la foto: columnas y todas las versiones agrupadas (`memberIds`). */
function getSnapshotInstrumentIds(snapshot: CoverageSnapshot): string[] {
  return [...new Set(snapshot.instruments.flatMap((c) => [c.instrumentId, ...c.memberIds]))];
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
  snapshotComputedAt: null,
  error: null,

  async loadFromCache() {
    try {
      const [campaigns, cachedIds] = await Promise.all([
        campaignCacheStorage.list(),
        instrumentCacheStorage.listCachedIds(),
      ]);
      const meta = await coverageCacheStorage.getSnapshotMeta().catch(() => null);
      set({
        campaigns,
        cachedInstrumentIds: new Set(cachedIds),
        snapshotComputedAt: meta?.computedAt ?? null,
      });
    } catch (error) {
      captureError(error, { store: 'useCachedCampaignsStore', action: 'loadFromCache' });
      set({ error: error instanceof Error ? error.message : 'Error cargando caché' });
    }
  },

  async refresh() {
    set({ isLoading: true, error: null, downloadProgress: null });

    try {
      // Todo se descarga a memoria y la caché se reemplaza solo al final: si
      // la red o el token fallan a mitad, las campañas ya descargadas siguen
      // disponibles para trabajar sin conexión.

      // Spec 104 (etapa A) — «Actualizar» ya no descarga campañas: los
      // instrumentos salen de la foto de cobertura y de S_REG/S1/S2. La caché de
      // campañas se conserva (solo lectura) para reanudar borradores heredados.
      const instruments: Awaited<ReturnType<typeof fetchInstrumentRender>>[] = [];

      // ── Spec 103 — foto de cobertura de todos los productores ───────────────
      set({
        downloadProgress: {
          phase: 'coverage',
          currentName: 'Descargando cobertura de productores…',
          done: 0,
          total: 1,
        },
      });
      const snapshot = await fetchCoverageSnapshot();

      // Instrumentos de las columnas de la foto (incluye las versiones agrupadas).
      const extraIds = getSnapshotInstrumentIds(snapshot);
      // Un instrumento de cobertura que falla se omite: no debe impedir actualizar
      // (auditoría 79). Esa unidad queda sin «Aplicar» hasta el próximo refresh.
      const skippedCoverageInstruments: string[] = [];
      for (const instrumentId of extraIds) {
        try {
          instruments.push(await fetchInstrumentRender(instrumentId));
        } catch (err) {
          skippedCoverageInstruments.push(instrumentId);
          captureError(err, { store: 'useCachedCampaignsStore', action: 'refresh', instrumentId });
        }
      }

      // ── Phase 3: pre-cache S_REG, S1 and S2 (always refresh) ─────────────
      // Spec 84 — S_REG reemplaza a S1+S2, pero mientras no exista en el
      // backend (no promovido todavía) un 404 se ignora igual que ya se
      // ignoraba S1/S2 sin configurar: el respaldo legado sigue funcionando.
      for (const code of ['S_REG', 'S1', 'S2'] as const) {
        try {
          const meta = await fetchInstrumentByCode(code);
          instruments.push(await fetchInstrumentRender(meta.instrumentId));
        } catch {
          // Instrumento no configurado en el backend — ignorar en silencio
        }
      }

      // ── Descarga completa: recién ahora se reemplaza la caché ──────────────
      // Spec 104: la caché de instrumentos se vacía como siempre, pero se conservan
      // los de borradores pendientes (p. ej. de campañas heredadas), que ya no
      // vienen en la descarga y se quedarían sin instrumento para reanudarse.
      const downloadedIds = new Set(instruments.map((i) => i.instrumentId));
      const preserved: Awaited<ReturnType<typeof fetchInstrumentRender>>[] = [];
      try {
        const draftInstrumentIds = new Set(
          (await surveyDraftStore.listDrafts()).map((d) => d.instrumentId),
        );
        for (const id of draftInstrumentIds) {
          if (downloadedIds.has(id)) continue;
          const cached = await instrumentCacheStorage.get(id);
          if (cached) preserved.push(cached);
        }
      } catch (err) {
        captureError(err, { store: 'useCachedCampaignsStore', action: 'preserveDraftInstruments' });
      }
      await instrumentCacheStorage.clear();
      for (const instrument of [...instruments, ...preserved]) await instrumentCacheStorage.save(instrument);
      await coverageCacheStorage.replaceAll(snapshot);

      // ── Spec 78 — pre-cache the active consent document, alongside S1/S2 ──
      let activeConsentVersion: string | null = null;
      try {
        const activeDocument = await fetchActiveConsentDocument();
        await consentDocumentCacheStorage.save(activeDocument);
        activeConsentVersion = activeDocument.version;
      } catch {
        // No hay versión publicada todavía, o la ruta falló — no bloquea la
        // descarga; pre-survey.tsx exigirá el consentimiento igual (ver
        // hasValidConsent, que trata versión activa desconocida como "no vigente").
      }

      // ── Phase 4: pre-cache all farmers for offline search ────────────────
      try {
        const farmers = await listAllFarmers();
        set({
          downloadProgress: {
            phase: 'farmers',
            currentName: 'Guardando encuestados…',
            done: 0,
            total: farmers.length,
          },
        });
        for (const farmer of farmers) {
          await farmerCacheStorage.upsert({
            farmerId: farmer.farmerId,
            name: farmer.name,
            documentId: farmer.documentId ?? undefined,
            phone: farmer.phone ?? undefined,
            farmName: farmer.farm?.name ?? undefined,
            farmId: farmer.farm?.farmId ?? undefined,
            crops: farmer.farm?.crops ?? undefined,
            cachedAt: new Date(),
          });
          // Spec 103 (C11) — quien consintió en la web u otro dispositivo figura
          // vigente sin conexión: `hasPendingConsent: false` = versión activa.
          if (farmer.hasPendingConsent === false && activeConsentVersion) {
            await farmerCacheStorage.recordConsent(farmer.farmerId, activeConsentVersion, new Date());
          }
          set((s) => ({
            downloadProgress: s.downloadProgress
              ? { ...s.downloadProgress, done: s.downloadProgress.done + 1 }
              : null,
          }));
        }
      } catch {
        // Non-critical — skip silently if the endpoint fails
      }

      // ── Final state refresh ────────────────────────────────────────────────
      const finalCachedIds = await instrumentCacheStorage.listCachedIds();
      set({
        cachedInstrumentIds: new Set(finalCachedIds),
        snapshotComputedAt: snapshot.computedAt,
      });
      // Sync in-memory instrument list so getOrDownloadInstrument picks up updated definitions
      await useCachedInstrumentsStore.getState().loadFromCache();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error actualizando';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false, downloadProgress: null });
    }
  },

  async refreshCoverageSnapshot() {
    // Solo la foto y los instrumentos de sus columnas que falten. Ante un
    // fallo se conserva la foto anterior (nada se reemplaza hasta tener todo).
    const snapshot = await fetchCoverageSnapshot();
    const cached = new Set(await instrumentCacheStorage.listCachedIds());
    const missing = getSnapshotInstrumentIds(snapshot).filter((id) => !cached.has(id));
    const instruments: Awaited<ReturnType<typeof fetchInstrumentRender>>[] = [];
    for (const id of missing) {
      try {
        instruments.push(await fetchInstrumentRender(id));
      } catch (err) {
        captureError(err, { store: 'useCachedCampaignsStore', action: 'refreshCoverageSnapshot', instrumentId: id });
      }
    }
    for (const instrument of instruments) await instrumentCacheStorage.save(instrument);
    await coverageCacheStorage.replaceAll(snapshot);
    const finalCachedIds = await instrumentCacheStorage.listCachedIds();
    set({ snapshotComputedAt: snapshot.computedAt, cachedInstrumentIds: new Set(finalCachedIds) });
    await useCachedInstrumentsStore.getState().loadFromCache();
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
