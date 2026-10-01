import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMySurveys } from "../api/surveys";
import { useSyncStatusStore } from "../store/useSyncStatusStore";
import { secureStorage } from "../storage/secureStorage";
import { surveyDraftStore } from "../storage/surveyDraftStore";
import { mergeCompletedSurveys, type CompletedSurveyListItem } from "../lib/mergeCompletedSurveys";
import {
  EMPTY_COMPLETED_LIST,
  loadFirstPage,
  loadNextPage,
  refreshOnFocus,
  type CompletedListData,
  type CompletedLoaderDeps,
} from "../lib/completedSurveysLoader";

export { COMPLETED_PAGE_SIZE, type CompletedListMode } from "../lib/completedSurveysLoader";

interface Flags {
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
}

/**
 * Lista «Encuestas realizadas» (spec 92, Alcance 4). Envoltorio de React sobre
 * `completedSurveysLoader` (lógica pura, con pruebas): aquí solo viven el estado,
 * el descarte de respuestas viejas (`requestSeq`) y la combinación para la UI.
 */
export function useCompletedSurveys(search: string) {
  const isOnline = useSyncStatusStore((s) => s.isOnline);
  const [data, setData] = useState<CompletedListData>(EMPTY_COMPLETED_LIST);
  const [flags, setFlags] = useState<Flags>({ isLoading: true, isRefreshing: false, isLoadingMore: false });
  const requestSeq = useRef(0);
  const loadingMore = useRef(false);
  const latest = useRef({ data, isOnline, search });
  latest.current = { data, isOnline, search };

  const deps = useCallback(
    (): CompletedLoaderDeps => ({
      isOnline: latest.current.isOnline,
      search: latest.current.search,
      getActiveUserId: () => secureStorage.getActiveUserId(),
      listFinished: (userId) => surveyDraftStore.listFinished(userId),
      getMySurveys: (params) => getMySurveys(params),
    }),
    [],
  );

  const reload = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const seq = ++requestSeq.current;
      loadingMore.current = false;
      setFlags({ isLoading: !opts.refresh, isRefreshing: Boolean(opts.refresh), isLoadingMore: false });
      const next = await loadFirstPage(deps());
      if (seq !== requestSeq.current) return;
      setData(next);
      setFlags({ isLoading: false, isRefreshing: false, isLoadingMore: false });
    },
    [deps],
  );

  /** Al reenfocar la pestaña: conserva las páginas cargadas si la lista está sana. */
  const refreshFocus = useCallback(async () => {
    const seq = ++requestSeq.current;
    const next = await refreshOnFocus(deps(), latest.current.data);
    if (seq !== requestSeq.current) return;
    setData(next);
    setFlags({ isLoading: false, isRefreshing: false, isLoadingMore: false });
  }, [deps]);

  const loadMore = useCallback(async () => {
    // `loadingMore` (ref) evita pedir dos veces la misma página si `onEndReached`
    // se dispara de nuevo antes de que React re-renderice.
    if (loadingMore.current || flags.isLoading || flags.isRefreshing) return;
    loadingMore.current = true;
    const seq = requestSeq.current;
    setFlags((prev) => ({ ...prev, isLoadingMore: true }));
    const next = await loadNextPage(deps(), latest.current.data);
    loadingMore.current = false;
    if (seq !== requestSeq.current) return;
    setData(next);
    setFlags((prev) => ({ ...prev, isLoadingMore: false }));
  }, [deps, flags.isLoading, flags.isRefreshing]);

  // La búsqueda reinicia la lista; `reload` lee el texto vigente por ref.
  useEffect(() => {
    void reload();
  }, [search, reload]);

  const items: CompletedSurveyListItem[] = useMemo(
    () =>
      data.mode === "remote"
        ? mergeCompletedSurveys(data.remote, data.local, search, { remoteFiltered: true })
        : mergeCompletedSurveys([], data.local, search, { includeSyncedLocals: true }),
    [data.mode, data.remote, data.local, search],
  );

  return {
    items,
    mode: data.mode,
    degraded: data.degraded,
    ...flags,
    reload,
    refresh: useCallback(() => reload({ refresh: true }), [reload]),
    refreshFocus,
    loadMore,
  };
}
