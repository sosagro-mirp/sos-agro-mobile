import { eq, and, asc } from 'drizzle-orm';
import { db } from './db/db';
import { syncQueue } from './db/schema';

export type SyncStatus = 'pending' | 'in_flight' | 'failed_validation';

export interface SyncQueueEntry {
  id: string;
  surveyId: string;
  campaignSessionId?: string;
  stepOrder?: number;
  attempts: number;
  status: SyncStatus;
  lastAttemptAt?: Date;
  payloadPath?: string;
  errorDetail?: string;
  createdAt: Date;
}

export interface EnqueueParams {
  id: string;
  surveyId: string;
  campaignSessionId?: string;
  stepOrder?: number;
  payloadPath?: string;
}

export const syncQueueStorage = {
  async enqueue(params: EnqueueParams): Promise<void> {
    await db.insert(syncQueue).values({
      id: params.id,
      surveyId: params.surveyId,
      campaignSessionId: params.campaignSessionId ?? null,
      stepOrder: params.stepOrder ?? null,
      attempts: 0,
      status: 'pending',
      lastAttemptAt: null,
      payloadPath: params.payloadPath ?? null,
      errorDetail: null,
      createdAt: new Date(),
    });
  },

  async dequeueNextPending(): Promise<SyncQueueEntry | null> {
    const row = await db
      .select()
      .from(syncQueue)
      .where(eq(syncQueue.status, 'pending'))
      .orderBy(asc(syncQueue.createdAt))
      .limit(1)
      .get();

    return row ? mapRow(row) : null;
  },

  async markInFlight(id: string): Promise<void> {
    await db
      .update(syncQueue)
      .set({ status: 'in_flight', lastAttemptAt: new Date() })
      .where(eq(syncQueue.id, id));
  },

  async markSynced(id: string): Promise<void> {
    await db.delete(syncQueue).where(eq(syncQueue.id, id));
  },

  async markFailedValidation(id: string, errorDetail: string): Promise<void> {
    await db
      .update(syncQueue)
      .set({ status: 'failed_validation', errorDetail, lastAttemptAt: new Date() })
      .where(eq(syncQueue.id, id));
  },

  async incrementAttempts(id: string): Promise<void> {
    const row = await db
      .select({ attempts: syncQueue.attempts })
      .from(syncQueue)
      .where(eq(syncQueue.id, id))
      .get();

    if (!row) return;

    await db
      .update(syncQueue)
      .set({
        attempts: row.attempts + 1,
        status: 'pending',
        lastAttemptAt: new Date(),
      })
      .where(eq(syncQueue.id, id));
  },

  async countPending(): Promise<number> {
    const rows = await db
      .select({ id: syncQueue.id })
      .from(syncQueue)
      .where(eq(syncQueue.status, 'pending'))
      .all();
    return rows.length;
  },

  async listFailed(): Promise<SyncQueueEntry[]> {
    const rows = await db
      .select()
      .from(syncQueue)
      .where(eq(syncQueue.status, 'failed_validation'))
      .all();
    return rows.map(mapRow);
  },

  async listAll(): Promise<SyncQueueEntry[]> {
    const rows = await db
      .select()
      .from(syncQueue)
      .orderBy(asc(syncQueue.createdAt))
      .all();
    return rows.map(mapRow);
  },

  async resetToRetry(id: string): Promise<void> {
    await db
      .update(syncQueue)
      .set({ status: 'pending', errorDetail: null })
      .where(and(eq(syncQueue.id, id), eq(syncQueue.status, 'failed_validation')));
  },

  // Resets any entries stuck in `in_flight` from a previous crashed session.
  async resetInFlightToRetry(): Promise<void> {
    await db
      .update(syncQueue)
      .set({ status: 'pending' })
      .where(eq(syncQueue.status, 'in_flight'));
  },

  async clearFailed(): Promise<number> {
    const result = await db
      .delete(syncQueue)
      .where(eq(syncQueue.status, 'failed_validation'));
    return result.changes ?? 0;
  },

  async deleteBySurveyId(surveyId: string): Promise<void> {
    await db.delete(syncQueue).where(eq(syncQueue.surveyId, surveyId));
  },

  async getPendingBySurveyId(surveyId: string): Promise<SyncQueueEntry | null> {
    const row = await db
      .select()
      .from(syncQueue)
      .where(and(eq(syncQueue.surveyId, surveyId), eq(syncQueue.status, 'pending')))
      .get();
    return row ? mapRow(row) : null;
  },

  async getActiveBySurveyId(surveyId: string): Promise<SyncQueueEntry | null> {
    const rows = await db
      .select()
      .from(syncQueue)
      .where(eq(syncQueue.surveyId, surveyId))
      .all();
    const active = rows.find((r) => r.status === 'pending' || r.status === 'in_flight');
    return active ? mapRow(active) : null;
  },
};

function mapRow(row: typeof syncQueue.$inferSelect): SyncQueueEntry {
  return {
    id: row.id,
    surveyId: row.surveyId,
    campaignSessionId: row.campaignSessionId ?? undefined,
    stepOrder: row.stepOrder ?? undefined,
    attempts: row.attempts,
    status: row.status as SyncStatus,
    lastAttemptAt: row.lastAttemptAt ?? undefined,
    payloadPath: row.payloadPath ?? undefined,
    errorDetail: row.errorDetail ?? undefined,
    createdAt: row.createdAt,
  };
}
