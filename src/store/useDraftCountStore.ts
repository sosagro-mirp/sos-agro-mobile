import { create } from 'zustand';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { secureStorage } from '../storage/secureStorage';

interface DraftCountState {
  /** Borradores del encuestador activo (más los anteriores sin dueño). */
  count: number;
  /** Spec 86 (CA-18) — borradores de otros encuestadores en esta tablet. */
  othersCount: number;
  refresh: () => Promise<void>;
}

// Spec 74, Fase 3 (deuda #2, diferida) — fuente reactiva del conteo de
// borradores que `drafts/index.tsx` antes solo consultaba on-demand vía
// `useFocusEffect`, sin que ninguna otra pantalla (el tab bar) pudiera
// enterarse. Se retoma acá, en la Fase 7, cuando `drafts/index.tsx` ya
// llama `refresh()` en cada punto en que su lista cambia (carga, borrado
// individual, "Limpiar todo").
//
// Spec 86: en una tablet compartida cada encuestador ve solo sus borradores.
// El filtro es de comodidad, no de aislamiento (la base es común).
export const useDraftCountStore = create<DraftCountState>((set) => ({
  count: 0,
  othersCount: 0,

  async refresh() {
    const activeUserId = (await secureStorage.getActiveUserId().catch(() => null)) ?? null;
    if (!activeUserId) {
      const all = await surveyDraftStore.listDrafts();
      set({ count: all.length, othersCount: 0 });
      return;
    }
    const [mine, others] = await Promise.all([
      surveyDraftStore.listDrafts(activeUserId),
      surveyDraftStore.countDraftsOfOthers(activeUserId),
    ]);
    set({ count: mine.length, othersCount: others });
  },
}));
