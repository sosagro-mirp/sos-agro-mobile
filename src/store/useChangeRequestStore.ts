import { create } from 'zustand';
import { changeRequestStorage, type ChangeRequestEntry } from '../storage/changeRequestStorage';

interface ChangeRequestState {
  requests: ChangeRequestEntry[];
  hasNewResolved: boolean;

  loadAll: () => Promise<void>;
  addRequest: (entry: ChangeRequestEntry) => void;
  setHasNewResolved: (value: boolean) => void;
}

export const useChangeRequestStore = create<ChangeRequestState>((set) => ({
  requests: [],
  hasNewResolved: false,

  async loadAll() {
    const requests = await changeRequestStorage.listAll();
    set({ requests });
  },

  addRequest(entry) {
    set((state) => ({ requests: [entry, ...state.requests] }));
  },

  setHasNewResolved(value) {
    set({ hasNewResolved: value });
  },
}));
