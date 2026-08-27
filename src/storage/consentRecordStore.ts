import { eq } from 'drizzle-orm';
import { db } from './db/db';
import { consentRecords } from './db/schema';

export interface ConsentRecordDraft {
  id: string;
  sessionId: string;
  consentDocumentId: string;
  respondentName?: string;
  acceptedDataProcessing: boolean;
  acceptedPhoto: boolean;
  acceptedAudio: boolean;
  acceptedVideo: boolean;
  acceptedFollowUpContact: boolean;
  acceptedAt: Date;
  status: 'pending' | 'synced' | 'failed';
  createdAt: Date;
}

function mapRow(row: typeof consentRecords.$inferSelect): ConsentRecordDraft {
  return {
    id: row.id,
    sessionId: row.sessionId,
    consentDocumentId: row.consentDocumentId,
    respondentName: row.respondentName ?? undefined,
    acceptedDataProcessing: row.acceptedDataProcessing,
    acceptedPhoto: row.acceptedPhoto,
    acceptedAudio: row.acceptedAudio,
    acceptedVideo: row.acceptedVideo,
    acceptedFollowUpContact: row.acceptedFollowUpContact,
    acceptedAt: row.acceptedAt,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export const consentRecordStore = {
  async save(draft: ConsentRecordDraft): Promise<void> {
    await db.insert(consentRecords).values(draft);
  },

  async get(id: string): Promise<ConsentRecordDraft | null> {
    const row = await db.select().from(consentRecords).where(eq(consentRecords.id, id)).get();
    return row ? mapRow(row) : null;
  },

  async markSynced(id: string): Promise<void> {
    await db.update(consentRecords).set({ status: 'synced' }).where(eq(consentRecords.id, id));
  },

  async markFailed(id: string): Promise<void> {
    await db.update(consentRecords).set({ status: 'failed' }).where(eq(consentRecords.id, id));
  },

  /** Remapea el sessionId provisional al real — ver SyncQueueService.resolveLocalSessions. */
  async remapSession(localSessionId: string, realSessionId: string): Promise<void> {
    await db
      .update(consentRecords)
      .set({ sessionId: realSessionId })
      .where(eq(consentRecords.sessionId, localSessionId));
  },
};
