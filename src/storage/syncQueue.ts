import { eq, and, asc } from 'drizzle-orm';
import { db } from './db/db';
import { syncQueue } from './db/schema';

export type SyncStatus = 'pending' | 'in_flight' | 'failed_validation';

// Spec 70, Fase 10 — 'skip-step' reutiliza esta cola (reintentos, backoff,
// estado en vuelo) para el salto de paso hecho sin conexión, en vez de una
// cola paralela. Spec 78 — 'consent' hace lo mismo con la constancia de
// consentimiento capturada offline: `surveyId` guarda el id local de
// `consent_records`, `campaignSessionId` es el mismo id (local o real) que
// se remapea en `resolveLocalSessions()`.
export type ItemType = 'survey' | 'farm-plot' | 'skip-step' | 'consent';

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
  itemType: ItemType;
  // Solo lo usan las entradas 'skip-step' (spec 70, Fase 10): el instrumento
  // del paso que se saltó, que POST /api/surveys/skip-step exige.
  instrumentId?: string;
}

export interface EnqueueParams {
  id: string;
  surveyId: string;
  campaignSessionId?: string;
  stepOrder?: number;
  payloadPath?: string;
  itemType?: ItemType;
  instrumentId?: string;
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
      itemType: params.itemType ?? 'survey',
      instrumentId: params.instrumentId ?? null,
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

  // Spec 81, Fase 3 — variante acotada a un `surveyId`: `processSurveyNow()`
  // la llama antes de consultar `getPendingBySurveyId()` para desatascar su
  // propia entrada sin depender de un `processAll()` de fondo. Antes, una
  // entrada dejada en `in_flight` por `resolveCampaignSession()` (sesión aún
  // provisional) o por cualquier interrupción del camino interactivo solo se
  // recuperaba en el `finally` de `processAll()` — que un `processSurveyNow()`
  // aislado nunca ejecuta.
  async resetInFlightToRetryBySurveyId(surveyId: string): Promise<void> {
    await db
      .update(syncQueue)
      .set({ status: 'pending' })
      .where(and(eq(syncQueue.surveyId, surveyId), eq(syncQueue.status, 'in_flight')));
  },

  // Spec 81, Fase 3 — corrección de auditoría
  // (docs/reports/auditorias/37-…): variante acotada a un `id` de entrada
  // específico, para `resolveCampaignSession()`. Un mismo `surveyId` puede
  // tener más de una entrada en la cola (p. ej. una `survey` y una
  // `skip-step`, o dos intentos de resolución de sesión distintos) —
  // `resetInFlightToRetryBySurveyId()` habría devuelto a `pending` una
  // entrada hermana que sigue legítimamente en vuelo.
  async resetInFlightToRetryById(id: string): Promise<void> {
    await db
      .update(syncQueue)
      .set({ status: 'pending' })
      .where(and(eq(syncQueue.id, id), eq(syncQueue.status, 'in_flight')));
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

  // Spec 71 — repara una entrada cuyo `campaignSessionId` quedó apuntando a
  // un id local (`local_*`) cuya sesión ya se resolvió en el backend. Se usa
  // cuando `resolveLocalSessions()` no vuelve a ofrecer esa sesión (porque su
  // fila en `pendingSessions` ya no está `pending`) pero otra fuente local
  // (el borrador, o la propia `pendingSessions`) sí conserva el id real.
  async updateCampaignSessionId(id: string, realSessionId: string): Promise<void> {
    await db
      .update(syncQueue)
      .set({ campaignSessionId: realSessionId })
      .where(eq(syncQueue.id, id));
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
    itemType: (row.itemType ?? 'survey') as ItemType,
    instrumentId: row.instrumentId ?? undefined,
  };
}
