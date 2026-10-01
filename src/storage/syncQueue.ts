import { eq, and, asc, isNull, or, notInArray } from 'drizzle-orm';
import { db } from './db/db';
import { syncQueue } from './db/schema';
import { secureStorage } from './secureStorage';

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
  // Spec 86 — dueño del ítem; `undefined` = sin dueño (anterior a m0013).
  ownerUserId?: string;
  // Spec 86 — solo en memoria (nunca se persiste): token del dueño con el que
  // la sync debe enviar este ítem. Lo adjunta `SyncQueueService.processEntry`.
  authToken?: string;
}

export interface EnqueueParams {
  id: string;
  surveyId: string;
  campaignSessionId?: string;
  stepOrder?: number;
  payloadPath?: string;
  itemType?: ItemType;
  instrumentId?: string;
  // Spec 86 — por defecto el usuario activo al momento de encolar.
  ownerUserId?: string;
}

export const syncQueueStorage = {
  async enqueue(params: EnqueueParams): Promise<void> {
    const ownerUserId = params.ownerUserId ?? (await secureStorage.getActiveUserId()) ?? null;
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
      ownerUserId,
    });
  },

  // Spec 88 — `excludeIds` evita que una misma corrida de `processAll()` vuelva
  // a servir una entrada que ya atendió. Sin eso hay bloqueo en vivo: una
  // entrada que `resolveCampaignSession()` aplaza vuelve a `pending` de
  // inmediato (spec 81) y el bucle la recibe otra vez, sin esperar por red,
  // girando para siempre y congelando el hilo de JS. Cada entrada recibe un
  // intento por corrida; si necesita otro, lo tendrá en la siguiente.
  // Spec 86 — `ownerUserId` undefined = sin filtro; `null` = solo registros sin
  // dueño; string = solo los de ese dueño.
  async dequeueNextPending(
    excludeIds: string[] = [],
    ownerUserId?: string | null,
  ): Promise<SyncQueueEntry | null> {
    const ownerFilter =
      ownerUserId === undefined
        ? undefined
        : ownerUserId === null
          ? isNull(syncQueue.ownerUserId)
          : eq(syncQueue.ownerUserId, ownerUserId);
    const excludeFilter = excludeIds.length > 0 ? notInArray(syncQueue.id, excludeIds) : undefined;

    const row = await db
      .select()
      .from(syncQueue)
      .where(and(eq(syncQueue.status, 'pending'), ownerFilter, excludeFilter))
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

  /** Spec 86 — dueños distintos con ítems pendientes (`null` = sin dueño). */
  async listPendingOwners(): Promise<(string | null)[]> {
    const rows = await db
      .select({ owner: syncQueue.ownerUserId })
      .from(syncQueue)
      .where(eq(syncQueue.status, 'pending'))
      .all();
    return [...new Set(rows.map((r) => r.owner ?? null))];
  },

  // Spec 86 — con `ownerUserId`, solo los del encuestador activo más los sin dueño.
  async countPending(ownerUserId?: string): Promise<number> {
    const rows = await db
      .select({ id: syncQueue.id })
      .from(syncQueue)
      .where(
        ownerUserId === undefined
          ? eq(syncQueue.status, 'pending')
          : and(
              eq(syncQueue.status, 'pending'),
              or(eq(syncQueue.ownerUserId, ownerUserId), isNull(syncQueue.ownerUserId)),
            ),
      )
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
  // Spec 91 — corrección de auditoría (docs/reports/auditorias/45-…):
  // `excludeSurveyIds` deja fuera las entradas que un `processSurveyNow()`
  // interactivo todavía tiene genuinamente en vuelo en esta misma sesión
  // (más allá del tope de espera del orquestador, que no cancela la
  // promesa). Sin esto, el `finally` de `processAll()` podía resetear a
  // `pending` una entrada que otra corrida seguía enviando, y el siguiente
  // `processAll()` la reenviaba — doble POST con el mismo `clientSurveyId`.
  async resetInFlightToRetry(excludeSurveyIds: string[] = []): Promise<void> {
    const condicion =
      excludeSurveyIds.length > 0
        ? and(eq(syncQueue.status, 'in_flight'), notInArray(syncQueue.surveyId, excludeSurveyIds))
        : eq(syncQueue.status, 'in_flight');

    await db.update(syncQueue).set({ status: 'pending' }).where(condicion);
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

  // Spec 91 — corrección de auditoría (docs/reports/auditorias/45-…):
  // reclama la entrada pendiente de forma atómica (leer + `UPDATE … WHERE
  // status = 'pending'` re-verificando la condición) en vez del
  // `getPendingBySurveyId()` + `processEntry()` que usaba antes
  // `processSurveyNow()`. Ese camino anterior tenía una ventana entre leer
  // y procesar donde un `processAll()` de fondo podía tomar la misma
  // entrada — el propio bug que corrigió `resetInFlightToRetryBySurveyId()`
  // condicional, pero que seguía abierto en `getPendingBySurveyId()`.
  // Devuelve `null` si no había ninguna entrada `pending` o si otra llamada
  // se la ganó entre la lectura y la escritura.
  async claimPendingBySurveyId(surveyId: string): Promise<SyncQueueEntry | null> {
    const row = await db
      .select()
      .from(syncQueue)
      .where(and(eq(syncQueue.surveyId, surveyId), eq(syncQueue.status, 'pending')))
      .get();
    if (!row) return null;

    const result = await db
      .update(syncQueue)
      .set({ status: 'in_flight', lastAttemptAt: new Date() })
      .where(and(eq(syncQueue.id, row.id), eq(syncQueue.status, 'pending')));

    if ((result.changes ?? 0) === 0) return null; // alguien más la reclamó primero

    return mapRow({ ...row, status: 'in_flight' });
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
    ownerUserId: row.ownerUserId ?? undefined,
  };
}
