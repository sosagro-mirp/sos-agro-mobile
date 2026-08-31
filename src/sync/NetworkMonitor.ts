import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { SyncQueueService } from './SyncQueueService';
import { pingApi } from '../api/health';
import { logger } from '../lib/logger';

class NetworkMonitorClass {
  private unsubscribe: (() => void) | null = null;
  private previouslyReachable: boolean | null = null;

  start(): void {
    if (this.unsubscribe) return;

    this.unsubscribe = NetInfo.addEventListener(this.handleStateChange);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private handleStateChange = (state: NetInfoState): void => {
    const isReachable = NetworkMonitorClass.isReachable(state);
    const willTrigger = isReachable && this.previouslyReachable === false;

    // Observabilidad permanente (spec 52, criterio 8): registrar cada
    // transición de conectividad con el estado crudo de NetInfo, el
    // isReachable calculado y si disparó sincronización. Es lo que permite
    // diagnosticar el próximo caso de este tipo sin instrumentar de nuevo.
    logger.info(
      `[NetworkMonitor] connectivity transition isConnected=${state.isConnected} isInternetReachable=${state.isInternetReachable} type=${state.type} previouslyReachable=${this.previouslyReachable} isReachable=${isReachable} willTrigger=${willTrigger}`,
    );

    useSyncStatusStore.getState().setOnline(isReachable);

    // Trigger sync only when transitioning from offline → online
    if (willTrigger) {
      SyncQueueService.resetNetworkFailures();
      SyncQueueService.processAll().catch((err) =>
        logger.error('[NetworkMonitor] processAll failed', err),
      );
    }

    this.previouslyReachable = isReachable;
  };

  async checkAndSync(): Promise<void> {
    const state = await NetInfo.fetch();
    const isReachable = NetworkMonitorClass.isReachable(state);
    useSyncStatusStore.getState().setOnline(isReachable);

    if (isReachable) {
      SyncQueueService.resetNetworkFailures();
      await SyncQueueService.processAll();
    }
  }

  // isInternetReachable starts out (and can transiently go back to) null
  // while NetInfo's own reachability probe is inconclusive — treating that
  // as offline caused false "sin conexión" banners on devices with a
  // perfectly working connection. Only an explicit `false` counts as
  // offline; `null` is treated as reachable.
  private static isReachable(state: NetInfoState): boolean {
    return state.isConnected === true && state.isInternetReachable !== false;
  }

  /**
   * Spec 81, Fase 4 — sondeo **bajo demanda** (nunca en bucle) que distingue
   * "sin conexión" de "servidor inalcanzable". Se llama tras un `NetworkError`
   * con NetInfo declarando conectividad: el criterio de `isReachable()` de
   * arriba (deliberadamente laxo, ver comentario) puede decir "hay red" con
   * un portal cautivo, DNS caído o el backend caído — casos donde
   * `httpClient` sí ve un `NetworkError` real. `GET /api/health` es el único
   * dato que lo confirma.
   *
   * No toca `previouslyReachable` ni dispara `processAll()`: eso sigue
   * siendo responsabilidad exclusiva de `handleStateChange()` ante una
   * transición real de NetInfo.
   */
  async probeReachability(): Promise<void> {
    const state = await NetInfo.fetch();
    if (!NetworkMonitorClass.isReachable(state)) {
      // NetInfo ya dice que no hay red — no hace falta el health-check, y
      // publicar 'offline' aquí es consistente con `setOnline()`.
      useSyncStatusStore.getState().setOnline(false);
      return;
    }

    const ok = await pingApi();
    const next = ok ? 'online' : 'server_unreachable';

    logger.info(
      `[NetworkMonitor] probeReachability isConnected=${state.isConnected} isInternetReachable=${state.isInternetReachable} pingApi=${ok} → reachability=${next}`,
    );

    useSyncStatusStore.getState().setReachability(next);
  }
}

export const NetworkMonitor = new NetworkMonitorClass();
