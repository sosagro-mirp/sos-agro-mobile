import { eq, and, asc, isNotNull } from 'drizzle-orm';
import { db } from './db/db';
import { mediaUploadQueue, responses } from './db/schema';

export type MediaUploadStatus = 'pending' | 'in_flight' | 'uploaded' | 'failed';

export interface MediaUploadEntry {
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
  async enqueueIfAbsent(params: EnqueueMediaParams): Promise<void> {
    const existing = await db
      .select({ id: mediaUploadQueue.id })
      .from(mediaUploadQueue)
      .where(
        and(
          eq(mediaUploadQueue.surveyId, params.surveyId),
          eq(mediaUploadQueue.questionId, params.questionId),
        ),
      )
      .get();

    if (existing) return;

    await db.insert(mediaUploadQueue).values({
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
    });
  },

  async dequeueNextPending(surveyId: string): Promise<MediaUploadEntry | null> {
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
      .set({
        status: 'failed',
        errorDetail,
        attempts: (row?.attempts ?? 0) + 1,
      })
      .where(eq(mediaUploadQueue.id, id));
  },

  async getUploadedForSurvey(surveyId: string): Promise<MediaUploadEntry[]> {
    const rows = await db
      .select()
      .from(mediaUploadQueue)
      .where(
        and(
          eq(mediaUploadQueue.surveyId, surveyId),
          eq(mediaUploadQueue.status, 'uploaded'),
        ),
      )
      .all();

    return rows.map(mapRow);
  },

  async countPending(): Promise<number> {
    const rows = await db
      .select({ id: mediaUploadQueue.id })
      .from(mediaUploadQueue)
      .where(eq(mediaUploadQueue.status, 'pending'))
      .all();

    return rows.length;
  },

  // Returns rows where mediaLocalPath is set in responses but no queue entry exists yet
  async findUnenqueued(surveyId: string): Promise<Array<{ questionId: string; localPath: string; mimeType: string }>> {
    const responseRows = await db
      .select({
        questionId: responses.questionId,
        mediaLocalPath: responses.mediaLocalPath,
        mimeType: responses.mimeType,
      })
      .from(responses)
      .where(
        and(
          eq(responses.surveyId, surveyId),
          isNotNull(responses.mediaLocalPath),
        ),
      )
      .all();

    const queued = await db
      .select({ questionId: mediaUploadQueue.questionId })
      .from(mediaUploadQueue)
      .where(eq(mediaUploadQueue.surveyId, surveyId))
      .all();

    const queuedSet = new Set(queued.map((r) => r.questionId));

    return responseRows
      .filter((r) => r.mediaLocalPath && !queuedSet.has(r.questionId))
      .map((r) => ({
        questionId: r.questionId,
        localPath: r.mediaLocalPath as string,
        mimeType: r.mimeType ?? 'application/octet-stream',
      }));
  },

  async resetInFlightToRetry(): Promise<void> {
    await db
      .update(mediaUploadQueue)
      .set({ status: 'pending' })
      .where(eq(mediaUploadQueue.status, 'in_flight'));
  },

  async listFailed(): Promise<MediaUploadEntry[]> {
    const rows = await db
      .select()
      .from(mediaUploadQueue)
      .where(eq(mediaUploadQueue.status, 'failed'))
      .all();

    return rows.map(mapRow);
  },

  async countFailed(): Promise<number> {
    const rows = await db
      .select({ id: mediaUploadQueue.id })
      .from(mediaUploadQueue)
      .where(eq(mediaUploadQueue.status, 'failed'))
      .all();

    return rows.length;
  },

  // Un adjunto `failed` no vuelve a intentarse solo: dequeueNextPending()
  // solo toma entradas `pending`, y el survey que lo originó puede ya estar
  // `synced` (la respuesta de texto/opción se sincroniza aunque falle su
  // adjunto). Este método lo devuelve a `pending` para un reintento manual;
  // el llamador es responsable de disparar el upload (ver
  // MediaUploadService.retryEntry).
  async resetToRetry(id: string): Promise<void> {
    await db
      .update(mediaUploadQueue)
      .set({ status: 'pending', errorDetail: null })
      .where(and(eq(mediaUploadQueue.id, id), eq(mediaUploadQueue.status, 'failed')));
  },

  async clearFailed(): Promise<number> {
    const result = await db
      .delete(mediaUploadQueue)
      .where(eq(mediaUploadQueue.status, 'failed'));
    return result.changes ?? 0;
  },
};

function mapRow(row: typeof mediaUploadQueue.$inferSelect): MediaUploadEntry {
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
