import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { NetworkMonitor } from './NetworkMonitor';

const TASK_NAME = 'sosagro-background-sync';
const INTERVAL_SECONDS = 15 * 60; // 15 minutes

// Task definition must be at module level, before any TaskManager registration.
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await NetworkMonitor.checkAndSync();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const BackgroundSync = {
  async register(): Promise<void> {
    const status = await BackgroundFetch.getStatusAsync();

    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      // Background fetch not available on this device/OS configuration.
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) return;

    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      minimumInterval: INTERVAL_SECONDS,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  },

  async unregister(): Promise<void> {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
    }
  },
};
