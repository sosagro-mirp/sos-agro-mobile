import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { SyncQueueService } from './SyncQueueService';

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
    const isReachable = state.isConnected === true && state.isInternetReachable === true;

    useSyncStatusStore.getState().setOnline(isReachable);

    // Trigger sync only when transitioning from offline → online
    if (isReachable && this.previouslyReachable === false) {
      SyncQueueService.resetNetworkFailures();
      SyncQueueService.processAll().catch(console.error);
    }

    this.previouslyReachable = isReachable;
  };

  async checkAndSync(): Promise<void> {
    const state = await NetInfo.fetch();
    const isReachable = state.isConnected === true && state.isInternetReachable === true;
    useSyncStatusStore.getState().setOnline(isReachable);

    if (isReachable) {
      SyncQueueService.resetNetworkFailures();
      await SyncQueueService.processAll();
    }
  }
}

export const NetworkMonitor = new NetworkMonitorClass();
