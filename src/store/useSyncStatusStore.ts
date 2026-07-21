import { create } from 'zustand';
import { syncQueueStorage } from '../storage/syncQueue';
import { mediaUploadQueueStorage } from '../storage/mediaUploadQueueStorage';

interface SyncStatusState {
  isOnline: boolean;
  pendingCount: number;
  pendingMediaCount: number;
  failedMediaCount: number;
  lastSyncAt: Date | null;
  currentlySyncingId: string | null;
  uploadingMediaId: string | null;

  setOnline: (online: boolean) => void;
  refreshPendingCount: () => Promise<void>;
  refreshPendingMediaCount: () => Promise<void>;
  refreshFailedMediaCount: () => Promise<void>;
  setSyncingId: (id: string | null) => void;
  setUploadingMediaId: (id: string | null) => void;
  markSyncCompleted: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  pendingMediaCount: 0,
  failedMediaCount: 0,
  lastSyncAt: null,
  currentlySyncingId: null,
  uploadingMediaId: null,

  setOnline(online) {
    set({ isOnline: online });
  },

  async refreshPendingCount() {
    const count = await syncQueueStorage.countPending();
    set({ pendingCount: count });
  },

  async refreshPendingMediaCount() {
    const count = await mediaUploadQueueStorage.countPending();
    set({ pendingMediaCount: count });
  },

  async refreshFailedMediaCount() {
    const count = await mediaUploadQueueStorage.countFailed();
    set({ failedMediaCount: count });
  },

  setSyncingId(id) {
    set({ currentlySyncingId: id });
  },

  setUploadingMediaId(id) {
    set({ uploadingMediaId: id });
  },

  markSyncCompleted() {
    set({ currentlySyncingId: null, uploadingMediaId: null, lastSyncAt: new Date() });
  },
}));
