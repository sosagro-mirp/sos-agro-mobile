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

    useSyncStatusStore.getState().setOnline(isReachable);

    // Trigger sync only when transitioning from offline → online
    if (isReachable && this.previouslyReachable === false) {
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
