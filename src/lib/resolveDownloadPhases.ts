import type { DownloadProgress } from "../store/useCachedCampaignsStore";

/**
 * Deriva las tres filas del panel de descarga (spec 74, Fase 3) a partir del
 * `DownloadProgress` de una sola fase que expone el store — este solo sabe
 * "en qué fase estoy y cuánto llevo", no el estado de las tres a la vez.
 * Función pura para poder probarla sin renderizar (mismo patrón que
 * `resolveTabBarStyle`).
 */

export type DownloadPhaseKind = DownloadProgress["phase"];
export type DownloadPhaseStatus = "done" | "current" | "pending";

export interface DownloadPhaseRow {
  kind: DownloadPhaseKind;
  label: string;
  status: DownloadPhaseStatus;
  done: number;
  total: number;
  percent: number;
  /** Nombre del ítem en curso — solo se llena en la fase `current`. */
  currentName: string | null;
}

const PHASE_ORDER: DownloadPhaseKind[] = ["campaigns", "instruments", "farmers"];

const PHASE_LABELS: Record<DownloadPhaseKind, string> = {
  campaigns: "Campañas",
  instruments: "Instrumentos",
  farmers: "Encuestados",
};

export function resolveDownloadPhases(progress: DownloadProgress | null): DownloadPhaseRow[] {
  if (!progress) return [];

  const currentIndex = PHASE_ORDER.indexOf(progress.phase);

  return PHASE_ORDER.map((kind, index) => {
    const label = PHASE_LABELS[kind];

    if (index < currentIndex) {
      return { kind, label, status: "done", done: 1, total: 1, percent: 100, currentName: null };
    }

    if (index === currentIndex) {
      const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
      return {
        kind,
        label,
        status: "current",
        done: progress.done,
        total: progress.total,
        percent,
        currentName: progress.currentName,
      };
    }

    return { kind, label, status: "pending", done: 0, total: 0, percent: 0, currentName: null };
  });
}
