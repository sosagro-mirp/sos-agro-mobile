import { and, asc, eq } from 'drizzle-orm';
import { db } from './db/db';
import { mediaUploadQueue } from './db/schema';

export type MediaUploadStatus = 'pending' | 'in_flight' | 'uploaded' | 'failed';

export interface MediaUploadQueueEntry {
  id: string;
  surveyId: string;
  questionId: string;
  attachmentId: string | null;
  localPath: string;
  mimeType: string;
  fileSizeBytes: number | null;
  originalFilename: string | null;
  status: MediaUploadStatus;
  attempts: number;
  errorDetail: string | null;
  createdAt: Date;
}

export interface EnqueueMediaParams {
  id: string;
  surveyId: string;
  questionId: string;
  localPath: string;
  mimeType: string;
  fileSizeBytes?: number;
  originalFilename?: string;
}

export const mediaUploadQueueStorage = {
  async enqueue(params: EnqueueMediaParams): Promise<void> {
    await db
      .insert(mediaUploadQueue)
      .values({
        id: params.id,
        surveyId: params.surveyId,
        questionId: params.questionId,
        attachmentId: null,
        localPath: params.localPath,
        mimeType: params.mimeType,
        fileSizeBytes: params.fileSizeBytes ?? null,
        originalFilename: params.originalFilename ?? null,
        status: 'pending',
        attempts: 0,
        errorDetail: null,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  },

  async dequeueNextPending(surveyId: string): Promise<MediaUploadQueueEntry | null> {
    const row = await db
      .select()
      .from(mediaUploadQueue)
      .where(
        and(
          eq(mediaUploadQueue.surveyId, surveyId),
          eq(mediaUploadQueue.status, 'pending'),
        ),
      )
      .orderBy(asc(mediaUploadQueue.createdAt))
      .limit(1)
      .get();
    return row ? mapRow(row) : null;
  },

  async markInFlight(id: string): Promise<void> {
    await db
      .update(mediaUploadQueue)
      .set({ status: 'in_flight' })
      .where(eq(mediaUploadQueue.id, id));
  },

  async markUploaded(id: string, attachmentId: string): Promise<void> {
    await db
      .update(mediaUploadQueue)
      .set({ status: 'uploaded', attachmentId })
      .where(eq(mediaUploadQueue.id, id));
  },

  async markFailed(id: string, errorDetail: string): Promise<void> {
    const row = await db
      .select({ attempts: mediaUploadQueue.attempts })
      .from(mediaUploadQueue)
      .where(eq(mediaUploadQueue.id, id))
      .get();

    await db
      .update(mediaUploadQueue)
      .set({ status: 'failed', errorDetail, attempts: (row?.attempts ?? 0) + 1 })
      .where(eq(mediaUploadQueue.id, id));
  },

  async incrementAttempts(id: string): Promise<void> {
    const row = await db
      .select({ attempts: mediaUploadQueue.attempts })
      .from(mediaUploadQueue)
      .where(eq(mediaUploadQueue.id, id))
      .get();

    if (!row) return;

    await db
      .update(mediaUploadQueue)
      .set({ attempts: row.attempts + 1, status: 'pending' })
      .where(eq(mediaUploadQueue.id, id));
  },

  async getPendingCountForSurvey(surveyId: string): Promise<number> {
    const rows = await db
      .select({ id: mediaUploadQueue.id })
      .from(mediaUploadQueue)
      .where(
        and(
          eq(mediaUploadQueue.surveyId, surveyId),
          eq(mediaUploadQueue.status, 'pending'),
        ),
      )
      .all();
    return rows.length;
  },

  async getUploadedAttachmentId(
    surveyId: string,
    questionId: string,
  ): Promise<string | null> {
    const row = await db
      .select({ attachmentId: mediaUploadQueue.attachmentId })
      .from(mediaUploadQueue)
      .where(
        and(
          eq(mediaUploadQueue.surveyId, surveyId),
          eq(mediaUploadQueue.questionId, questionId),
          eq(mediaUploadQueue.status, 'uploaded'),
        ),
      )
      .get();
    return row?.attachmentId ?? null;
  },

  async isQueued(surveyId: string, questionId: string): Promise<boolean> {
    const row = await db
      .select({ id: mediaUploadQueue.id })
      .from(mediaUploadQueue)
      .where(
        and(
          eq(mediaUploadQueue.surveyId, surveyId),
          eq(mediaUploadQueue.questionId, questionId),
        ),
      )
      .get();
    return !!row;
  },

  async countPendingTotal(): Promise<number> {
    const rows = await db
      .select({ id: mediaUploadQueue.id })
      .from(mediaUploadQueue)
      .where(eq(mediaUploadQueue.status, 'pending'))
      .all();
    return rows.length;
  },

  async resetInFlightToRetry(): Promise<void> {
    await db
      .update(mediaUploadQueue)
      .set({ status: 'pending' })
      .where(eq(mediaUploadQueue.status, 'in_flight'));
  },
};

function mapRow(row: typeof mediaUploadQueue.$inferSelect): MediaUploadQueueEntry {
  return {
    id: row.id,
    surveyId: row.surveyId,
    questionId: row.questionId,
    attachmentId: row.attachmentId ?? null,
    localPath: row.localPath,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes ?? null,
    originalFilename: row.originalFilename ?? null,
    status: row.status as MediaUploadStatus,
    attempts: row.attempts,
    errorDetail: row.errorDetail ?? null,
    createdAt: row.createdAt,
  };
}
