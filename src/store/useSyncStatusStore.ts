import { create } from 'zustand';
import { syncQueueStorage } from '../storage/syncQueue';
import { mediaUploadQueueStorage } from '../storage/mediaUploadQueueStorage';

/**
 * Spec 81, Fase 4 — tercer estado de conectividad, distinto de "online" y de
 * "offline": el dispositivo tiene radio (NetInfo dice que sí) pero el
 * backend no responde (portal cautivo, DNS caído, backend caído). Antes solo
 * existían dos estados y ambos casos se pintaban como "Sin conexión",
 * llevando al encuestador a buscar señal cuando el problema era del servidor.
 */
export type Reachability = 'online' | 'offline' | 'server_unreachable';

interface SyncStatusState {
  /** Derivado de `reachability` (`=== 'online'`) — se conserva por compatibilidad con el código existente. */
  isOnline: boolean;
  reachability: Reachability;
  pendingCount: number;
  pendingMediaCount: number;
  lastSyncAt: Date | null;
  currentlySyncingId: string | null;
  uploadingMediaId: string | null;

  setOnline: (online: boolean) => void;
  setReachability: (reachability: Reachability) => void;
  refreshPendingCount: () => Promise<void>;
  refreshPendingMediaCount: () => Promise<void>;
  setSyncingId: (id: string | null) => void;
  setUploadingMediaId: (id: string | null) => void;
  markSyncCompleted: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  isOnline: true,
  reachability: 'online',
  pendingCount: 0,
  pendingMediaCount: 0,
  lastSyncAt: null,
  currentlySyncingId: null,
  uploadingMediaId: null,

  // Se mantiene por compatibilidad con los llamadores existentes
  // (NetworkMonitor.handleStateChange, checkAndSync): traduce el booleano
  // de NetInfo a los dos extremos de `reachability`. `setReachability()` es
  // la única vía para publicar `'server_unreachable'`.
  setOnline(online) {
    set({ isOnline: online, reachability: online ? 'online' : 'offline' });
  },

  setReachability(reachability) {
    set({ reachability, isOnline: reachability === 'online' });
  },

  async refreshPendingCount() {
    const count = await syncQueueStorage.countPending();
    set({ pendingCount: count });
  },

  async refreshPendingMediaCount() {
    const count = await mediaUploadQueueStorage.countPending();
    set({ pendingMediaCount: count });
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
