import { create } from 'zustand';
import { surveyDraftStore } from '../storage/surveyDraftStore';

interface DraftCountState {
  count: number;
  refresh: () => Promise<void>;
}

// Spec 74, Fase 3 (deuda #2, diferida) — fuente reactiva del conteo de
// borradores que `drafts/index.tsx` antes solo consultaba on-demand vía
// `useFocusEffect`, sin que ninguna otra pantalla (el tab bar) pudiera
// enterarse. Se retoma acá, en la Fase 7, cuando `drafts/index.tsx` ya
// llama `refresh()` en cada punto en que su lista cambia (carga, borrado
// individual, "Limpiar todo").
export const useDraftCountStore = create<DraftCountState>((set) => ({
  count: 0,

  async refresh() {
    const drafts = await surveyDraftStore.listDrafts();
    set({ count: drafts.length });
  },
}));
