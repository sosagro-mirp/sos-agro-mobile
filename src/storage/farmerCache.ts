import { desc, eq, like, or } from 'drizzle-orm';
import { db } from './db/db';
import { farmerCache } from './db/schema';
import type { CropSummary } from '../types';
import { isLocalId } from '../lib/isLocalId';

export interface FarmerCacheEntry {
  farmerId: string;
  name: string;
  documentId?: string;
  phone?: string;
  farmName?: string;
  crops?: CropSummary[];
  cachedAt: Date;
  /** Spec 78 — última versión de consentimiento aceptada conocida localmente. */
  consentVersion?: string;
  consentedAt?: Date;
}

function mapRow(row: typeof farmerCache.$inferSelect): FarmerCacheEntry {
  let crops: CropSummary[] = [];
  if (row.crops) {
    try {
      crops = JSON.parse(row.crops);
    } catch {
      crops = [];
    }
  }
  return {
    farmerId: row.farmerId,
    name: row.name,
    documentId: row.documentId ?? undefined,
    phone: row.phone ?? undefined,
    farmName: row.farmName ?? undefined,
    crops,
    cachedAt: row.cachedAt,
    consentVersion: row.consentVersion ?? undefined,
    consentedAt: row.consentedAt ?? undefined,
  };
}

export const farmerCacheStorage = {
  async upsert(entry: FarmerCacheEntry): Promise<void> {
    const crops = JSON.stringify(entry.crops ?? []);
    await db
      .insert(farmerCache)
      .values({
        farmerId: entry.farmerId,
        name: entry.name,
        documentId: entry.documentId ?? null,
        phone: entry.phone ?? null,
        farmName: entry.farmName ?? null,
        crops,
        cachedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: farmerCache.farmerId,
        set: {
          name: entry.name,
          documentId: entry.documentId ?? null,
          phone: entry.phone ?? null,
          farmName: entry.farmName ?? null,
          crops,
          cachedAt: new Date(),
        },
      });
  },

  async search(query: string): Promise<FarmerCacheEntry[]> {
    if (query.trim().length < 2) return [];

    const pattern = `%${query.trim()}%`;
    const rows = await db
      .select()
      .from(farmerCache)
      .where(
        or(
          like(farmerCache.name, pattern),
          like(farmerCache.documentId, pattern),
        )
      )
      .orderBy(desc(farmerCache.cachedAt))
      .limit(10)
      .all();

    return rows.map(mapRow);
  },

  async get(farmerId: string): Promise<FarmerCacheEntry | null> {
    const row = await db
      .select()
      .from(farmerCache)
      .where(eq(farmerCache.farmerId, farmerId))
      .get();
    return row ? mapRow(row) : null;
  },

  // Deliberately not `cachedAt DESC` alone: nothing guarantees the real
  // (non-provisional) entry is the most recent one — a later
  // cacheFarmerIdentity() call on the provisional would refresh its
  // cachedAt too. Tie-break by ID nature first, recency only among equals.
  async getByDocumentId(documentId: string): Promise<FarmerCacheEntry | null> {
    const rows = await db
      .select()
      .from(farmerCache)
      .where(eq(farmerCache.documentId, documentId))
      .orderBy(desc(farmerCache.cachedAt))
      .all();

    if (rows.length === 0) return null;
    const real = rows.find((row) => !isLocalId(row.farmerId));
    return mapRow(real ?? rows[0]);
  },

  async listRecent(limit = 20): Promise<FarmerCacheEntry[]> {
    const rows = await db
      .select()
      .from(farmerCache)
      .orderBy(desc(farmerCache.cachedAt))
      .limit(limit)
      .all();
    return rows.map(mapRow);
  },

  async clearAll(): Promise<number> {
    const result = await db.delete(farmerCache);
    return result.changes ?? 0;
  },

  /**
   * Invalidates a single cached entry. Used when the backend confirms a
   * farmerId no longer exists (404), so a deleted farmer from a prior test
   * round doesn't keep getting offered from the offline search.
   */
  async remove(farmerId: string): Promise<void> {
    await db.delete(farmerCache).where(eq(farmerCache.farmerId, farmerId));
  },

  /**
   * Spec 78 — registra localmente que este agricultor aceptó el
   * consentimiento, para que `hasValidConsent()` pueda decidir sin red en su
   * próximo encuentro. No toca el resto de la identidad cacheada.
   */
  async recordConsent(farmerId: string, version: string, consentedAt: Date): Promise<void> {
    await db
      .update(farmerCache)
      .set({ consentVersion: version, consentedAt })
      .where(eq(farmerCache.farmerId, farmerId));
  },
};
