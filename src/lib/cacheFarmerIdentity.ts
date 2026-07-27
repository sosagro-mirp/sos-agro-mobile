import { farmerCacheStorage } from '../storage/farmerCache';
import { logger } from './logger';
import type { CropSummary } from '../types';

export interface FarmerIdentity {
  farmerId: string;
  name: string;
  documentId?: string | null;
  phone?: string | null;
  farmName?: string | null;
  crops?: CropSummary[];
}

/**
 * Single point of persistence for a resolved farmer identity into
 * `farmerCacheStorage`. Must be called whenever a farmer is identified,
 * whether online (via `extractFarmer()`) or offline (via
 * `extractFarmerLocally()`), so that `documentId → farmerId` stays available
 * locally for offline duplicate detection.
 *
 * A caching failure must never interrupt the survey flow — the pollster is in
 * the field and losing the session is worse than losing the cache entry.
 */
export async function cacheFarmerIdentity(identity: FarmerIdentity): Promise<void> {
  if (!identity.farmerId) return;

  try {
    await farmerCacheStorage.upsert({
      farmerId: identity.farmerId,
      name: identity.name,
      documentId: identity.documentId ?? undefined,
      phone: identity.phone ?? undefined,
      farmName: identity.farmName ?? undefined,
      crops: identity.crops,
      cachedAt: new Date(),
    });
  } catch (err) {
    logger.warn(
      `[cacheFarmerIdentity] failed to cache farmer ${identity.farmerId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
