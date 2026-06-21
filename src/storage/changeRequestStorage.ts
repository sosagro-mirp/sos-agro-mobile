import { eq } from 'drizzle-orm';
import { db } from './db/db';
import { changeRequests } from './db/schema';

export interface ChangeRequestEntry {
  id: string;
  description: string;
  farmerId?: string;
  status: 'pending_sync' | 'open' | 'resolved';
  resolvedAt?: Date;
  createdAt: Date;
  syncedAt?: Date;
}

function mapRow(row: typeof changeRequests.$inferSelect): ChangeRequestEntry {
  return {
    id: row.id,
    description: row.description,
    farmerId: row.farmerId ?? undefined,
    status: row.status,
    resolvedAt: row.resolvedAt ?? undefined,
    createdAt: row.createdAt,
    syncedAt: row.syncedAt ?? undefined,
  };
}

export const changeRequestStorage = {
  async create(entry: Omit<ChangeRequestEntry, 'status' | 'syncedAt' | 'resolvedAt'>): Promise<void> {
    await db.insert(changeRequests).values({
      id: entry.id,
      description: entry.description,
      farmerId: entry.farmerId ?? null,
      status: 'pending_sync',
      resolvedAt: null,
      createdAt: entry.createdAt,
      syncedAt: null,
    });
  },

  async listPendingSync(): Promise<ChangeRequestEntry[]> {
    const rows = await db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.status, 'pending_sync'))
      .all();
    return rows.map(mapRow);
  },

  async markSynced(id: string): Promise<void> {
    await db
      .update(changeRequests)
      .set({ status: 'open', syncedAt: new Date() })
      .where(eq(changeRequests.id, id));
  },

  async markResolved(id: string, resolvedAt: Date): Promise<void> {
    await db
      .update(changeRequests)
      .set({ status: 'resolved', resolvedAt })
      .where(eq(changeRequests.id, id));
  },

  async listAll(): Promise<ChangeRequestEntry[]> {
    const rows = await db.select().from(changeRequests).all();
    return rows.map(mapRow);
  },
};
