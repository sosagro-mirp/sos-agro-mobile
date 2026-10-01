import type { LocalFinishedSurvey } from "./mergeCompletedSurveys";
import type { MySurveyItem, MySurveysPage } from "../types";

export const COMPLETED_PAGE_SIZE = 20;

export type CompletedListMode = "remote" | "local";

export interface CompletedListData {
  mode: CompletedListMode;
  remote: MySurveyItem[];
  local: LocalFinishedSurvey[];
  page: number;
  total: number;
  /** Hay un aviso con acción «Reintentar» (modo local o fallo al paginar). */
  degraded: boolean;
}

export const EMPTY_COMPLETED_LIST: CompletedListData = {
  mode: "local",
  remote: [],
  local: [],
  page: 0,
  total: 0,
  degraded: false,
};

export interface CompletedLoaderDeps {
  isOnline: boolean;
  search: string;
  getActiveUserId: () => Promise<string | null>;
  listFinished: (ownerUserId: string) => Promise<LocalFinishedSurvey[]>;
  getMySurveys: (params: { page: number; limit: number; search?: string }) => Promise<MySurveysPage>;
}

async function readLocal(deps: CompletedLoaderDeps): Promise<LocalFinishedSurvey[]> {
  try {
    const userId = await deps.getActiveUserId();
    return userId ? await deps.listFinished(userId) : [];
  } catch {
    return [];
  }
}

const searchParam = (search: string) => search.trim() || undefined;

/**
 * Primera carga (spec 92, Alcance 4). Sin conexión —o con la sesión por renovar,
 * que apaga `isOnline`— no se intenta la red. Con conexión, cualquier fallo del
 * servidor (red, 401, 5xx) cae al modo local con aviso; un 401 nunca cierra
 * la sesión aquí.
 */
export async function loadFirstPage(deps: CompletedLoaderDeps): Promise<CompletedListData> {
  const local = await readLocal(deps);
  const asLocalMode: CompletedListData = { ...EMPTY_COMPLETED_LIST, local, degraded: true };
  if (!deps.isOnline) return asLocalMode;

  try {
    const result = await deps.getMySurveys({
      page: 1,
      limit: COMPLETED_PAGE_SIZE,
      search: searchParam(deps.search),
    });
    return { mode: "remote", remote: result.items, local, page: result.page, total: result.total, degraded: false };
  } catch {
    return asLocalMode;
  }
}

/** ¿Quedan páginas por pedir? */
export function hasMorePages(data: CompletedListData): boolean {
  return data.mode === "remote" && !data.degraded && data.page * COMPLETED_PAGE_SIZE < data.total;
}

/**
 * Página siguiente. Si falla, se conservan los ítems remotos ya visibles hasta la
 * siguiente recarga y se marca el aviso.
 */
export async function loadNextPage(deps: CompletedLoaderDeps, data: CompletedListData): Promise<CompletedListData> {
  if (!hasMorePages(data)) return data;
  try {
    const result = await deps.getMySurveys({
      page: data.page + 1,
      limit: COMPLETED_PAGE_SIZE,
      search: searchParam(deps.search),
    });
    return { ...data, remote: [...data.remote, ...result.items], page: result.page, total: result.total };
  } catch {
    return { ...data, degraded: true };
  }
}

/**
 * Recarga al volver a la pestaña. En modo remoto sano solo se relee lo local (una
 * encuesta recién aplicada aparece como «Pendiente de envío») y se conservan las
 * páginas ya cargadas y la posición de scroll; si la lista estaba en modo local,
 * degradada o vacía, se hace la carga completa.
 */
export async function refreshOnFocus(deps: CompletedLoaderDeps, data: CompletedListData): Promise<CompletedListData> {
  if (data.mode !== "remote" || data.degraded || data.remote.length === 0) return loadFirstPage(deps);
  return { ...data, local: await readLocal(deps) };
}
