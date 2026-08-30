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
  /**
   * Derivado de `reachability`. **Corrección de bug real** encontrado en la
   * ronda manual del spec 81 (TC-081-003, 2026-08-29): originalmente era
   * `reachability === 'online'`, lo que apagaba `isOnline` también en
   * `server_unreachable`. Como `PreSurveyForm`, el orquestador y otros
   * consumidores usan `isOnline` para decidir si **intentan** la red, eso
   * creaba un punto muerto real: en cuanto una petición fallida ponía
   * `reachability` en `server_unreachable`, `isOnline` pasaba a `false` y
   * todo el código volvía a la rama "offline puro" — sin volver a intentar la
   * red nunca más, sin ofrecer "Reintentar búsqueda", indistinguible de una
   * radio realmente apagada. `isOnline` ahora es `true` en `'online'` **y**
   * en `'server_unreachable'` (hay radio en ambos casos — es justo la
   * distinción que la Fase 4 quiso introducir); solo es `false` en
   * `'offline'` real. `reachability` sigue siendo la fuente de verdad para el
   * *texto* mostrado (`OfflineBanner`, etc.).
   */
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
    set({ reachability, isOnline: reachability !== 'offline' });
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
