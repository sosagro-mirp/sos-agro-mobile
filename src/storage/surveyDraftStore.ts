import { and, eq, lt } from 'drizzle-orm';
import { db } from './db/db';
import { surveys, responses } from './db/schema';
import type { InstrumentDraftAnswer } from '../types';

export interface SurveyDraft {
  surveyId: string;
  instrumentId: string;
  campaignSessionId?: string;
  farmerId?: string;
  answers: Record<string, InstrumentDraftAnswer>;
  updatedAt: Date;
}

export const surveyDraftStore = {
  async createDraft(params: {
    surveyId: string;
    instrumentId: string;
    campaignSessionId?: string;
    farmerId?: string;
  }): Promise<void> {
    const now = new Date();
    await db.insert(surveys).values({
      id: params.surveyId,
      instrumentId: params.instrumentId,
      campaignSessionId: params.campaignSessionId ?? null,
      // Only include farmerId when present — omitting it entirely avoids
      // referencing the column on devices where m0001 hasn't applied yet.
      ...(params.farmerId != null ? { farmerId: params.farmerId } : {}),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  },

  async saveAnswer(
    surveyId: string,
    questionId: string,
    answer: InstrumentDraftAnswer
  ): Promise<void> {
    const id = `${surveyId}:${questionId}`;

    await db
      .insert(responses)
      .values({
        id,
        surveyId,
        questionId,
        optionId: answer.optionId ?? null,
        optionIds: answer.optionIds ? JSON.stringify(answer.optionIds) : null,
        textValue: answer.textValue ?? null,
        numericValue: answer.numericValue ?? null,
        booleanValue: answer.booleanValue ?? null,
        otherText: answer.otherText ?? null,
        mediaLocalPath: answer.mediaLocalPath ?? null,
        mimeType: answer.mimeType ?? null,
      })
      .onConflictDoUpdate({
        target: responses.id,
        set: {
          optionId: answer.optionId ?? null,
          optionIds: answer.optionIds ? JSON.stringify(answer.optionIds) : null,
          textValue: answer.textValue ?? null,
          numericValue: answer.numericValue ?? null,
          booleanValue: answer.booleanValue ?? null,
          otherText: answer.otherText ?? null,
          mediaLocalPath: answer.mediaLocalPath ?? null,
          mimeType: answer.mimeType ?? null,
        },
      });

    await db
      .update(surveys)
      .set({ updatedAt: new Date() })
      .where(eq(surveys.id, surveyId));
  },

  async saveMultipleAnswers(
    surveyId: string,
    answers: Record<string, InstrumentDraftAnswer>
  ): Promise<void> {
    await db.transaction(async (tx) => {
      for (const [questionId, answer] of Object.entries(answers)) {
        const id = `${surveyId}:${questionId}`;
        await tx
          .insert(responses)
          .values({
            id,
            surveyId,
            questionId,
            optionId: answer.optionId ?? null,
            optionIds: answer.optionIds ? JSON.stringify(answer.optionIds) : null,
            textValue: answer.textValue ?? null,
            numericValue: answer.numericValue ?? null,
            booleanValue: answer.booleanValue ?? null,
            otherText: answer.otherText ?? null,
            mediaLocalPath: answer.mediaLocalPath ?? null,
            mimeType: answer.mimeType ?? null,
          })
          .onConflictDoUpdate({
            target: responses.id,
            set: {
              optionId: answer.optionId ?? null,
              optionIds: answer.optionIds ? JSON.stringify(answer.optionIds) : null,
              textValue: answer.textValue ?? null,
              numericValue: answer.numericValue ?? null,
              booleanValue: answer.booleanValue ?? null,
              otherText: answer.otherText ?? null,
              mediaLocalPath: answer.mediaLocalPath ?? null,
              mimeType: answer.mimeType ?? null,
            },
          });
      }
      await tx
        .update(surveys)
        .set({ updatedAt: new Date() })
        .where(eq(surveys.id, surveyId));
    });
  },

  async loadDraft(surveyId: string): Promise<SurveyDraft | null> {
    const survey = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .get();

    if (!survey) return null;

    const rows = await db
      .select()
      .from(responses)
      .where(eq(responses.surveyId, surveyId))
      .all();

    const answers: Record<string, InstrumentDraftAnswer> = {};
    for (const row of rows) {
      answers[row.questionId] = {
        questionId: row.questionId,
        optionId: row.optionId ?? undefined,
        optionIds: row.optionIds ? (JSON.parse(row.optionIds) as string[]) : undefined,
        textValue: row.textValue ?? undefined,
        numericValue: row.numericValue ?? undefined,
        booleanValue: row.booleanValue ?? undefined,
        otherText: row.otherText ?? undefined,
        mediaLocalPath: row.mediaLocalPath ?? undefined,
        mimeType: row.mimeType ?? undefined,
      };
    }

    return {
      surveyId: survey.id,
      instrumentId: survey.instrumentId,
      campaignSessionId: survey.campaignSessionId ?? undefined,
      farmerId: survey.farmerId ?? undefined,
      answers,
      updatedAt: survey.updatedAt,
    };
  },

  async listDrafts(): Promise<SurveyDraft[]> {
    const rows = await db
      .select()
      .from(surveys)
      .where(eq(surveys.status, 'draft'))
      .all();

    return Promise.all(rows.map((r) => this.loadDraft(r.id) as Promise<SurveyDraft>));
  },

  async markCompleted(surveyId: string): Promise<void> {
    await db
      .update(surveys)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(surveys.id, surveyId));
  },

  async markSynced(surveyId: string): Promise<void> {
    await db
      .update(surveys)
      .set({ status: 'synced', updatedAt: new Date() })
      .where(eq(surveys.id, surveyId));
  },

  async deleteDraft(surveyId: string): Promise<void> {
    // responses se borran en cascada por FK
    await db.delete(surveys).where(eq(surveys.id, surveyId));
  },

  async purgeSyncedSurveys(olderThanDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(surveys)
      .where(and(eq(surveys.status, 'synced'), lt(surveys.updatedAt, cutoff)));
    return result.changes ?? 0;
  },
};
