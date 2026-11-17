import { and, eq, inArray, lt, isNull, ne, or } from 'drizzle-orm';
import { db } from './db/db';
import { surveys, responses, farmerCache, pendingSessions, instrumentCache, syncQueue } from './db/schema';
import type { InstrumentDraftAnswer, InstrumentResponse } from '../types';
import { buildLocalFinishedSurveys } from '../lib/buildLocalFinishedSurveys';
import type { LocalFinishedSurvey } from '../lib/mergeCompletedSurveys';
import type { CompletedStepLocal } from '../lib/planNextStepAfterCompletion';
import { secureStorage } from './secureStorage';

export interface SurveyDraft {
  surveyId: string;
  instrumentId: string;
  campaignSessionId?: string;
  farmerId?: string;
  // Spec 103 — anclas del flujo por productor.
  farmId?: string;
  farmCropId?: string;
  stepOrder?: number;
  // Spec 86 — dueño del borrador (userId de quien lo creó).
  ownerUserId?: string;
  answers: Record<string, InstrumentDraftAnswer>;
  updatedAt: Date;
}

// Un JSON corrupto en UNA fila no debe tumbar toda la lista local de «Realizadas».
function safeParse<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export const surveyDraftStore = {
  async createDraft(params: {
    surveyId: string;
    instrumentId: string;
    campaignSessionId?: string;
    farmerId?: string;
    farmId?: string;
    farmCropId?: string;
    stepOrder?: number;
    ownerUserId?: string;
  }): Promise<void> {
    const now = new Date();
    // Spec 86 — por defecto el usuario activo al crear el borrador.
    const ownerUserId = params.ownerUserId ?? (await secureStorage.getActiveUserId()) ?? null;
    await db.insert(surveys).values({
      ownerUserId,
      id: params.surveyId,
      instrumentId: params.instrumentId,
      campaignSessionId: params.campaignSessionId ?? null,
      // Only include farmerId when present — omitting it entirely avoids
      // referencing the column on devices where m0001 hasn't applied yet.
      ...(params.farmerId != null ? { farmerId: params.farmerId } : {}),
      ...(params.farmId != null ? { farmId: params.farmId } : {}),
      ...(params.farmCropId != null ? { farmCropId: params.farmCropId } : {}),
      // `stepOrder` has to survive in the draft until sync: with creation
      // deferred (phase 2), a draft resumed from the Drafts tab has no
      // campaign context left in memory, and materializeSurvey() would create
      // the survey with stepOrder = null. getNextStep() builds completedOrders
      // from stepOrder alone, so the campaign would re-offer an already
      // answered step. Found in the field round of 2026-08-18.
      ...(params.stepOrder != null ? { stepOrder: params.stepOrder } : {}),
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
      farmId: survey.farmId ?? undefined,
      farmCropId: survey.farmCropId ?? undefined,
      stepOrder: survey.stepOrder ?? undefined,
      ownerUserId: survey.ownerUserId ?? undefined,
      answers,
      updatedAt: survey.updatedAt,
    };
  },

  // Spec 91 — pasos ya completados de una sesión de campaña, leídos de
  // SQLite (fuente de verdad local). Usada para no confiar ciegamente en
  // getNextStep() del backend cuando el bloque recién terminado todavía no
  // le llegó: ver planNextStepAfterCompletion().
  async listCompletedStepsForSession(campaignSessionId: string): Promise<CompletedStepLocal[]> {
    const rows = await db
      .select({ stepOrder: surveys.stepOrder, instrumentId: surveys.instrumentId })
      .from(surveys)
      .where(
        and(
          eq(surveys.campaignSessionId, campaignSessionId),
          inArray(surveys.status, ['completed', 'synced']),
        ),
      )
      .all();

    return rows.map((r) => ({ stepOrder: r.stepOrder, instrumentId: r.instrumentId }));
  },

  /**
   * Spec 86 — sin argumento lista todos los borradores. Con `ownerUserId`, solo
   * los de ese encuestador más los que no tienen dueño (anteriores a m0013).
   */
  async listDrafts(ownerUserId?: string): Promise<SurveyDraft[]> {
    const rows = await db
      .select()
      .from(surveys)
      .where(
        ownerUserId === undefined
          ? eq(surveys.status, 'draft')
          : and(
              eq(surveys.status, 'draft'),
              or(eq(surveys.ownerUserId, ownerUserId), isNull(surveys.ownerUserId)),
            ),
      )
      .all();

    return Promise.all(rows.map((r) => this.loadDraft(r.id) as Promise<SurveyDraft>));
  },

  /**
   * Spec 104 — instrumentos que aún usan encuestas locales sin sincronizar
   * (borradores y completadas pendientes). Una sola columna: no carga las
   * respuestas. `refresh()` los conserva al vaciar la caché de instrumentos.
   */
  async listUnsyncedInstrumentIds(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ instrumentId: surveys.instrumentId })
      .from(surveys)
      .where(ne(surveys.status, 'synced'))
      .all();
    return rows.map((r) => r.instrumentId);
  },

  /**
   * Spec 92 (Fase 3b) — encuestas locales `completed`/`synced` del encuestador
   * para la pestaña «Realizadas». Regla de dueño «del usuario o sin dueño»
   * (spec 86); excluye las que no tienen respuestas. Hace un número fijo de
   * lecturas (6), una por tabla, sin importar cuántas encuestas haya.
   */
  async listFinished(ownerUserId: string): Promise<LocalFinishedSurvey[]> {
    const surveyRows = (
      await db.select().from(surveys).where(inArray(surveys.status, ['completed', 'synced'])).all()
    ).filter((r) => r.ownerUserId === null || r.ownerUserId === ownerUserId);
    if (surveyRows.length === 0) return [];

    const surveyIds = surveyRows.map((r) => r.id);
    const sessionIds = [...new Set(surveyRows.map((r) => r.campaignSessionId).filter((v): v is string => !!v))];
    const instrumentIds = [...new Set(surveyRows.map((r) => r.instrumentId))];

    const [responseRows, sessionRows, instrumentRows, failedRows] = await Promise.all([
      db.select().from(responses).where(inArray(responses.surveyId, surveyIds)).all(),
      sessionIds.length === 0
        ? Promise.resolve([])
        : db
            .select()
            .from(pendingSessions)
            .where(or(inArray(pendingSessions.localSessionId, sessionIds), inArray(pendingSessions.realSessionId, sessionIds)))
            .all(),
      db.select().from(instrumentCache).where(inArray(instrumentCache.id, instrumentIds)).all(),
      db
        .select()
        .from(syncQueue)
        .where(and(inArray(syncQueue.surveyId, surveyIds), eq(syncQueue.status, 'failed_validation')))
        .all(),
    ]);

    const sessionFarmerIds = new Map<string, string | null>();
    for (const s of sessionRows) {
      sessionFarmerIds.set(s.localSessionId, s.farmerId);
      if (s.realSessionId) sessionFarmerIds.set(s.realSessionId, s.farmerId);
    }

    const farmerIds = [
      ...new Set([
        ...surveyRows.map((r) => r.farmerId),
        ...sessionFarmerIds.values(),
      ].filter((v): v is string => !!v)),
    ];
    const farmerRows =
      farmerIds.length === 0
        ? []
        : await db.select().from(farmerCache).where(inArray(farmerCache.farmerId, farmerIds)).all();

    const answersBySurvey = new Map<string, Record<string, InstrumentDraftAnswer>>();
    for (const row of responseRows) {
      const answers = answersBySurvey.get(row.surveyId) ?? {};
      answers[row.questionId] = {
        questionId: row.questionId,
        optionId: row.optionId ?? undefined,
        optionIds: safeParse<string[]>(row.optionIds),
        textValue: row.textValue ?? undefined,
        numericValue: row.numericValue ?? undefined,
        booleanValue: row.booleanValue ?? undefined,
        otherText: row.otherText ?? undefined,
        mediaLocalPath: row.mediaLocalPath ?? undefined,
        mimeType: row.mimeType ?? undefined,
      };
      answersBySurvey.set(row.surveyId, answers);
    }

    return buildLocalFinishedSurveys(ownerUserId, {
      surveys: surveyRows,
      answersBySurvey,
      farmers: new Map(farmerRows.map((f) => [f.farmerId, { name: f.name, documentId: f.documentId }])),
      sessionFarmerIds,
      instruments: new Map(
        instrumentRows.flatMap((i): Array<[string, InstrumentResponse]> => {
          const parsed = safeParse<InstrumentResponse>(i.data);
          return parsed ? [[i.id, parsed]] : [];
        }),
      ),
      failedSurveyIds: new Set(failedRows.map((f) => f.surveyId)),
    });
  },

  /** Estado local de una encuesta (`null` si ya no existe, p. ej. se descartó desde Borradores). */
  async getStatus(surveyId: string): Promise<'draft' | 'completed' | 'synced' | null> {
    const row = await db
      .select({ status: surveys.status })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .get();
    return row?.status ?? null;
  },

  /** Spec 86 — dueño de una encuesta local (`null` si es anterior a m0013). */
  async getOwnerUserId(surveyId: string): Promise<string | null> {
    const row = await db
      .select({ owner: surveys.ownerUserId })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .get();
    return row?.owner ?? null;
  },

  /** Spec 86 — borradores de otros encuestadores en esta tablet (para el aviso). */
  async countDraftsOfOthers(ownerUserId: string): Promise<number> {
    const all = await db
      .select({ id: surveys.id, owner: surveys.ownerUserId })
      .from(surveys)
      .where(eq(surveys.status, 'draft'))
      .all();
    return all.filter((r) => r.owner !== null && r.owner !== ownerUserId).length;
  },

  /**
   * Spec 103 — encuestas locales con productor que la superposición de cobertura
   * debe contar. Las de otro dueño también cuentan: la tablet es compartida y la
   * foto es la misma para todos.
   * Spec 104 — también cuentan las de una sesión de campaña heredada: terminado un
   * borrador viejo, la ficha ya no ofrece «Aplicar» otra vez sin conexión.
   */
  async listForCoverage(): Promise<
    {
      localSurveyId: string;
      backendSurveyId: string | null;
      instrumentId: string;
      farmerId: string | null;
      farmId: string | null;
      farmCropId: string | null;
      status: 'draft' | 'completed' | 'synced';
      updatedAt: string;
    }[]
  > {
    const rows = await db.select().from(surveys).all();
    return rows
      .filter((r) => r.farmerId != null)
      .map((r) => ({
        localSurveyId: r.id,
        backendSurveyId: r.backendSurveyId ?? null,
        instrumentId: r.instrumentId,
        farmerId: r.farmerId ?? null,
        farmId: r.farmId ?? null,
        farmCropId: r.farmCropId ?? null,
        status: r.status,
        updatedAt: r.updatedAt.toISOString(),
      }));
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

  // `surveys.id` never changes from the local id (see schema.ts), so this is
  // the only local record of which backend survey a synced entry maps to —
  // needed to retry a media attachment after the survey itself has synced.
  async setBackendSurveyId(localSurveyId: string, backendSurveyId: string): Promise<void> {
    await db
      .update(surveys)
      .set({ backendSurveyId })
      .where(eq(surveys.id, localSurveyId));
  },

  // Spec 96 — persiste el id provisional del productor en el borrador (Registro/S1
  // capturado sin conexión) para enviarlo luego como `clientFarmerId`.
  async setFarmerId(localSurveyId: string, farmerId: string): Promise<void> {
    await db
      .update(surveys)
      .set({ farmerId })
      .where(eq(surveys.id, localSurveyId));
  },

  async getBackendSurveyId(localSurveyId: string): Promise<string | null> {
    const row = await db
      .select({ backendSurveyId: surveys.backendSurveyId })
      .from(surveys)
      .where(eq(surveys.id, localSurveyId))
      .get();
    return row?.backendSurveyId ?? null;
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
