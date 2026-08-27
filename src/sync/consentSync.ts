import type { CreateConsentPayload } from '../api/consents';

/**
 * Spec 78 — lógica pura del tramo offline de la sincronización de
 * consentimiento. Separada de `SyncQueueService` para poder probarla sin
 * SQLite ni red (mismo patrón que `resolveDownloadPhases.ts`).
 */

export interface BuildConsentSyncPayloadParams {
  localId: string;
  sessionId: string;
  consentDocumentId: string;
  respondentName?: string;
  acceptedDataProcessing: boolean;
  acceptedPhoto: boolean;
  acceptedAudio: boolean;
  acceptedVideo: boolean;
  acceptedFollowUpContact: boolean;
  acceptedAt: Date;
}

/**
 * Conserva la fecha de aceptación tal como ocurrió en el dispositivo — nunca
 * la sustituye por el momento en que la cola logra sincronizar (criterio 8).
 */
export function buildConsentSyncPayload(
  params: BuildConsentSyncPayloadParams,
): CreateConsentPayload {
  return {
    sessionId: params.sessionId,
    consentDocumentId: params.consentDocumentId,
    respondentName: params.respondentName,
    acceptedDataProcessing: params.acceptedDataProcessing,
    acceptedPhoto: params.acceptedPhoto,
    acceptedAudio: params.acceptedAudio,
    acceptedVideo: params.acceptedVideo,
    acceptedFollowUpContact: params.acceptedFollowUpContact,
    acceptedAt: params.acceptedAt.toISOString(),
  };
}

interface SessionRef {
  localId: string;
  sessionId: string;
}

/**
 * El backend nunca debe recibir un `sessionId` provisional (`local_…`).
 * Lanza si todavía no existe el mapeo real — el llamador debe diferir esa
 * entrada, no enviarla a medias.
 */
export function remapConsentSessionId<T extends SessionRef>(
  entry: T,
  sessionIdMap: Record<string, string>,
): T {
  if (!entry.sessionId.startsWith('local_')) return entry;

  const realSessionId = sessionIdMap[entry.sessionId];
  if (!realSessionId) {
    throw new Error(
      `No hay sessionId real todavía para la sesión provisional ${entry.sessionId}`,
    );
  }
  return { ...entry, sessionId: realSessionId };
}

export interface QueueLikeEntry {
  id: string;
  itemType: 'survey' | 'farm-plot' | 'skip-step' | 'consent';
  campaignSessionId?: string;
  status?: string;
}

/**
 * Reordena (de forma estable) para que la constancia de consentimiento de
 * una sesión se procese antes que las encuestas de esa misma sesión —
 * criterio 8. Nunca marca una encuesta como bloqueada por el estado de su
 * constancia: una constancia rechazada con 4xx no debe impedir subir
 * respuestas ya recolectadas (criterio 9 y decisión de diseño del spec).
 *
 * Hallazgo M3 (auditoría) — la versión anterior devolvía `0` en el
 * comparador cuando `campaignSessionId` difería, una relación no transitiva
 * que `Array.prototype.sort` no garantiza resolver igual en todos los
 * motores con más de una sesión en la cola. Aquí se calcula primero un orden
 * total: las sesiones conservan su orden de primera aparición (no se
 * reordena entre sesiones distintas) y, dentro de cada sesión, consent va
 * antes que el resto.
 */
export function orderConsentBeforeSurveys<T extends QueueLikeEntry>(
  entries: T[],
): (T & { blocked: boolean })[] {
  const sessionOrder = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.campaignSessionId ?? '';
    if (!sessionOrder.has(key)) sessionOrder.set(key, sessionOrder.size);
  }

  const rank = (e: QueueLikeEntry) => (e.itemType === 'consent' ? 0 : 1);

  return entries
    .map((entry) => ({ ...entry, blocked: false }))
    .sort((a, b) => {
      const sessionA = sessionOrder.get(a.campaignSessionId ?? '') ?? 0;
      const sessionB = sessionOrder.get(b.campaignSessionId ?? '') ?? 0;
      if (sessionA !== sessionB) return sessionA - sessionB;
      return rank(a) - rank(b);
    });
}
