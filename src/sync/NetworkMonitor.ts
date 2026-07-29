import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { SyncQueueService } from './SyncQueueService';
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

    // TEMPORAL — spec 52 Fase 0: capturar la secuencia cruda de NetInfo
    // durante la reconexión para decidir entre H1, H3 y H4. Retirar al
    // cerrar la Fase 0 (se reemplaza por el logging permanente de la Fase 2).
    logger.info(
      `[NetworkMonitor][diag-052] isConnected=${state.isConnected} isInternetReachable=${state.isInternetReachable} type=${state.type} previouslyReachable=${this.previouslyReachable} isReachable=${isReachable} willTrigger=${willTrigger}`,
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
}

export const NetworkMonitor = new NetworkMonitorClass();
