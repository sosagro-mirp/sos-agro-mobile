import * as SecureStore from 'expo-secure-store';
import { isNull } from 'drizzle-orm';
import { db } from './db/db';
import { syncQueue, surveys, changeRequests } from './db/schema';
import { userStorage } from './userStorage';
import { backfillOwnership } from '../lib/backfillOwnership';

// Spec 86 (D6): marca de que la asignación única de dueño ya corrió.
const DONE_KEY = 'sosagro_owner_backfill_done';

/** Asigna dueño a los registros anteriores a m0013. Idempotente; llamar tras migrar. */
export function runOwnershipBackfill(): Promise<void> {
  return backfillOwnership({
    isDone: async () => (await SecureStore.getItemAsync(DONE_KEY)) === '1',
    markDone: () => SecureStore.setItemAsync(DONE_KEY, '1'),
    getLegacyCachedUserId: async () => (await userStorage.getUser())?.userId ?? null,
    assignNullOwners: async (userId) => {
      await db.transaction(async (tx) => {
        await tx.update(syncQueue).set({ ownerUserId: userId }).where(isNull(syncQueue.ownerUserId));
        await tx.update(surveys).set({ ownerUserId: userId }).where(isNull(surveys.ownerUserId));
        await tx
          .update(changeRequests)
          .set({ ownerUserId: userId })
          .where(isNull(changeRequests.ownerUserId));
      });
    },
  });
}
