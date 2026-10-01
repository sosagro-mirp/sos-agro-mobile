import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMySurveys } from "../api/surveys";
import { useSyncStatusStore } from "../store/useSyncStatusStore";
import { secureStorage } from "../storage/secureStorage";
import { surveyDraftStore } from "../storage/surveyDraftStore";
import { mergeCompletedSurveys, type CompletedSurveyListItem, type LocalFinishedSurvey } from "../lib/mergeCompletedSurveys";
import type { MySurveyItem } from "../types";

export const COMPLETED_PAGE_SIZE = 20;

export type CompletedListMode = "remote" | "local";

interface State {
  mode: CompletedListMode;
  remote: MySurveyItem[];
  local: LocalFinishedSurvey[];
  page: number;
  total: number;
  /** Hay un aviso «Sin conexión…» con acción «Reintentar». */
  degraded: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
}

const INITIAL: State = {
  mode: "local",
  remote: [],
  local: [],
  page: 0,
  total: 0,
  degraded: false,
  isLoading: true,
  isRefreshing: false,
  isLoadingMore: false,
};

/**
 * Lista «Encuestas realizadas» (spec 92, Alcance 4).
 *
 * - Modo remoto: páginas de `GET /api/surveys/mine` + las locales que aún no
 *   están en el servidor, combinadas con `mergeCompletedSurveys` sobre el
 *   acumulado (D7).
 * - Modo local: sin conexión, con la sesión por renovar (`authBlocked` apaga
 *   `isOnline`) o si la petición falla (red, servidor, 401, 5xx). Un 401 nunca
 *   cierra la sesión: aquí solo se cae al modo local.
 * - Si se pierde la conexión con la lista ya cargada (fallo de `loadMore`),
 *   los ítems remotos visibles se conservan hasta la siguiente recarga.
 */
export function useCompletedSurveys(search: string) {
  const isOnline = useSyncStatusStore((s) => s.isOnline);
  const [state, setState] = useState<State>(INITIAL);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const requestSeq = useRef(0);
  const searchRef = useRef(search);
  searchRef.current = search;
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback(async (opts: { refresh?: boolean } = {}) => {
    const seq = ++requestSeq.current;
    setState((prev) => ({
      ...prev,
      isLoading: !opts.refresh,
      isRefreshing: Boolean(opts.refresh),
      isLoadingMore: false,
    }));

    let local: LocalFinishedSurvey[] = [];
    try {
      const userId = await secureStorage.getActiveUserId();
      local = userId ? await surveyDraftStore.listFinished(userId) : [];
    } catch {
      local = [];
    }
    if (seq !== requestSeq.current) return;

    const toLocalMode = (): State => ({
      ...INITIAL,
      local,
      degraded: true,
      isLoading: false,
    });

    if (!isOnlineRef.current) {
      setState(toLocalMode());
      return;
    }

    try {
      const result = await getMySurveys({
        page: 1,
        limit: COMPLETED_PAGE_SIZE,
        search: searchRef.current.trim() || undefined,
      });
      if (seq !== requestSeq.current) return;
      setState({
        mode: "remote",
        remote: result.items,
        local,
        page: result.page,
        total: result.total,
        degraded: false,
        isLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
      });
    } catch {
      if (seq !== requestSeq.current) return;
      setState(toLocalMode());
    }
  }, []);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (
      current.mode !== "remote" ||
      current.degraded ||
      current.isLoading ||
      current.isRefreshing ||
      current.isLoadingMore ||
      current.page * COMPLETED_PAGE_SIZE >= current.total
    ) {
      return;
    }
    const seq = requestSeq.current;
    setState((prev) => ({ ...prev, isLoadingMore: true }));
    try {
      const result = await getMySurveys({
        page: current.page + 1,
        limit: COMPLETED_PAGE_SIZE,
        search: searchRef.current.trim() || undefined,
      });
      if (seq !== requestSeq.current) return;
      setState((prev) => ({
        ...prev,
        remote: [...prev.remote, ...result.items],
        page: result.page,
        total: result.total,
        isLoadingMore: false,
      }));
    } catch {
      if (seq !== requestSeq.current) return;
      // Se conservan los ítems remotos ya visibles hasta la siguiente recarga.
      setState((prev) => ({ ...prev, degraded: true, isLoadingMore: false }));
    }
  }, []);

  // La búsqueda reinicia la lista; `reload` lee el texto vigente por ref.
  useEffect(() => {
    void reload();
  }, [search, reload]);

  const items: CompletedSurveyListItem[] = useMemo(
    () =>
      state.mode === "remote"
        ? mergeCompletedSurveys(state.remote, state.local, search, { remoteFiltered: true })
        : mergeCompletedSurveys([], state.local, search, { includeSyncedLocals: true }),
    [state.mode, state.remote, state.local, search],
  );

  return {
    items,
    mode: state.mode,
    degraded: state.degraded,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    isLoadingMore: state.isLoadingMore,
    reload,
    refresh: useCallback(() => reload({ refresh: true }), [reload]),
    loadMore,
  };
}
