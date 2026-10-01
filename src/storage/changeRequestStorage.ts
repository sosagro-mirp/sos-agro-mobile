import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from './db/db';
import { changeRequests } from './db/schema';
import { secureStorage } from './secureStorage';

export interface ChangeRequestEntry {
  id: string;
  description: string;
  farmerId?: string;
  status: 'pending_sync' | 'open' | 'resolved';
  resolvedAt?: Date;
  createdAt: Date;
  syncedAt?: Date;
  // Spec 86 — dueño de la solicitud (userId de quien la creó).
  ownerUserId?: string;
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
    ownerUserId: row.ownerUserId ?? undefined,
  };
}

export const changeRequestStorage = {
  async create(
    entry: Omit<ChangeRequestEntry, 'status' | 'syncedAt' | 'resolvedAt'>,
  ): Promise<void> {
    const ownerUserId = entry.ownerUserId ?? (await secureStorage.getActiveUserId()) ?? null;
    await db.insert(changeRequests).values({
      ownerUserId,
      id: entry.id,
      description: entry.description,
      farmerId: entry.farmerId ?? null,
      status: 'pending_sync',
      resolvedAt: null,
      createdAt: entry.createdAt,
      syncedAt: null,
    });
  },

  // Spec 86 — `ownerUserId` undefined = sin filtro; `null` = solo sin dueño.
  async listPendingSync(ownerUserId?: string | null): Promise<ChangeRequestEntry[]> {
    const ownerFilter =
      ownerUserId === undefined
        ? undefined
        : ownerUserId === null
          ? isNull(changeRequests.ownerUserId)
          : eq(changeRequests.ownerUserId, ownerUserId);
    const rows = await db
      .select()
      .from(changeRequests)
      .where(
        ownerFilter
          ? and(eq(changeRequests.status, 'pending_sync'), ownerFilter)
          : eq(changeRequests.status, 'pending_sync'),
      )
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
    const rows = await db
      .select()
      .from(changeRequests)
      .orderBy(desc(changeRequests.createdAt))
      .all();
    return rows.map(mapRow);
  },
};
