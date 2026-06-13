import { create } from 'zustand';
import { syncQueueStorage } from '../storage/syncQueue';

interface SyncStatusState {
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  currentlySyncingId: string | null;

  setOnline: (online: boolean) => void;
  refreshPendingCount: () => Promise<void>;
  setSyncingId: (id: string | null) => void;
  markSyncCompleted: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  lastSyncAt: null,
  currentlySyncingId: null,

  setOnline(online) {
    set({ isOnline: online });
  },

  async refreshPendingCount() {
    const count = await syncQueueStorage.countPending();
    set({ pendingCount: count });
  },

  setSyncingId(id) {
    set({ currentlySyncingId: id });
  },

  markSyncCompleted() {
    set({ currentlySyncingId: null, lastSyncAt: new Date() });
  },
}));
