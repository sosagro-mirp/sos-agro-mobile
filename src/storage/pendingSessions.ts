import { eq } from 'drizzle-orm';
import { db } from './db/db';
import { pendingSessions } from './db/schema';

export type PendingSessionStatus = 'pending' | 'resolved' | 'failed';

export interface PendingSessionEntry {
  localSessionId: string;
  campaignId: string;
  farmerId?: string;
  userId?: string;
  realSessionId?: string;
  status: PendingSessionStatus;
  createdAt: Date;
  resolvedAt?: Date;
}

function mapRow(row: typeof pendingSessions.$inferSelect): PendingSessionEntry {
  return {
    localSessionId: row.localSessionId,
    campaignId: row.campaignId,
    farmerId: row.farmerId ?? undefined,
    userId: row.userId ?? undefined,
    realSessionId: row.realSessionId ?? undefined,
    status: row.status as PendingSessionStatus,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt ?? undefined,
  };
}

export const pendingSessionStorage = {
  async create(params: {
    localSessionId: string;
    campaignId: string;
    farmerId?: string;
    userId?: string;
  }): Promise<void> {
    await db.insert(pendingSessions).values({
      localSessionId: params.localSessionId,
      campaignId: params.campaignId,
      farmerId: params.farmerId ?? null,
      userId: params.userId ?? null,
      realSessionId: null,
      status: 'pending',
      createdAt: new Date(),
      resolvedAt: null,
    });
  },

  async resolve(localSessionId: string, realSessionId: string): Promise<void> {
    await db
      .update(pendingSessions)
      .set({ realSessionId, status: 'resolved', resolvedAt: new Date() })
      .where(eq(pendingSessions.localSessionId, localSessionId));
  },

  async markFailed(localSessionId: string): Promise<void> {
    await db
      .update(pendingSessions)
      .set({ status: 'failed' })
      .where(eq(pendingSessions.localSessionId, localSessionId));
  },

  async listPending(): Promise<PendingSessionEntry[]> {
    const rows = await db
      .select()
      .from(pendingSessions)
      .where(eq(pendingSessions.status, 'pending'))
      .all();
    return rows.map(mapRow);
  },

  async getByLocal(localSessionId: string): Promise<PendingSessionEntry | null> {
    const row = await db
      .select()
      .from(pendingSessions)
      .where(eq(pendingSessions.localSessionId, localSessionId))
      .get();
    return row ? mapRow(row) : null;
  },

  async getByReal(realSessionId: string): Promise<PendingSessionEntry | null> {
    const row = await db
      .select()
      .from(pendingSessions)
      .where(eq(pendingSessions.realSessionId, realSessionId))
      .get();
    return row ? mapRow(row) : null;
  },
};
