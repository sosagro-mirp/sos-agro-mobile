import * as TaskManager from 'expo-task-manager';
import { NetworkMonitor } from './NetworkMonitor';

const TASK_NAME = 'sosagro-background-sync';
const INTERVAL_MINUTES = 15;

// Task definition must be at module level, before any TaskManager registration.
// expo-background-task is loaded lazily inside the callback to avoid crashing
// if the native module is not available in Expo Go.
TaskManager.defineTask(TASK_NAME, async () => {
  const { BackgroundTaskResult } = await import('expo-background-task');
  try {
    await NetworkMonitor.checkAndSync();
    return BackgroundTaskResult.Success;
  } catch {
    return BackgroundTaskResult.Failed;
  }
});

export const BackgroundSync = {
  async register(): Promise<void> {
    const { getStatusAsync, registerTaskAsync, BackgroundTaskStatus } = await import(
      'expo-background-task'
    );

    const status = await getStatusAsync();

    if (status === BackgroundTaskStatus.Restricted) {
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) return;

    await registerTaskAsync(TASK_NAME, {
      minimumInterval: INTERVAL_MINUTES,
    });
  },

  async unregister(): Promise<void> {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) {
      const { unregisterTaskAsync } = await import('expo-background-task');
      await unregisterTaskAsync(TASK_NAME);
    }
  },
};
