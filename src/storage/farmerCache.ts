import { desc, eq, like, or } from 'drizzle-orm';
import { db } from './db/db';
import { farmerCache } from './db/schema';

export interface FarmerCacheEntry {
  farmerId: string;
  name: string;
  lastName?: string;
  documentId?: string;
  phone?: string;
  farmName?: string;
  cachedAt: Date;
}

function mapRow(row: typeof farmerCache.$inferSelect): FarmerCacheEntry {
  return {
    farmerId: row.farmerId,
    name: row.name,
    lastName: row.lastName ?? undefined,
    documentId: row.documentId ?? undefined,
    phone: row.phone ?? undefined,
    farmName: row.farmName ?? undefined,
    cachedAt: row.cachedAt,
  };
}

export const farmerCacheStorage = {
  async upsert(entry: FarmerCacheEntry): Promise<void> {
    await db
      .insert(farmerCache)
      .values({
        farmerId: entry.farmerId,
        name: entry.name,
        lastName: entry.lastName ?? null,
        documentId: entry.documentId ?? null,
        phone: entry.phone ?? null,
        farmName: entry.farmName ?? null,
        cachedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: farmerCache.farmerId,
        set: {
          name: entry.name,
          lastName: entry.lastName ?? null,
          documentId: entry.documentId ?? null,
          phone: entry.phone ?? null,
          farmName: entry.farmName ?? null,
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
          like(farmerCache.lastName, pattern),
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

  async getByDocumentId(documentId: string): Promise<FarmerCacheEntry | null> {
    const row = await db
      .select()
      .from(farmerCache)
      .where(eq(farmerCache.documentId, documentId))
      .get();
    return row ? mapRow(row) : null;
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
};
