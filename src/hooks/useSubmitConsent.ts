import { useState } from "react";
import type { ConsentFormValues } from "../components/campaign/ConsentForm";
import type { ConsentDocument } from "../api/consents";
import { submitConsent } from "../api/consents";
import { consentRecordStore } from "../storage/consentRecordStore";
import { farmerCacheStorage } from "../storage/farmerCache";
import { generateLocalId } from "../lib/generateLocalId";
import { isLocalId } from "../lib/isLocalId";
import { syncQueueStorage } from "../storage/syncQueue";
import { buildConsentSyncPayload } from "../sync/consentSync";
import { logger } from "../lib/logger";
import { useSyncStatusStore } from "../store/useSyncStatusStore";

interface UseSubmitConsentOptions {
  sessionId: string;
  farmerId?: string;
  document: ConsentDocument | null;
}

/**
 * Cambio de alcance (2026-08-28, spec 78, Fase 14) — lógica online/offline de
 * envío del consentimiento, extraída de `app/campaign/[id]/consent.tsx` para
 * que la comparta también `ConsentModal` (Fase 15), sin duplicar las
 * correcciones M1/M2/M5/M6 de la auditoría de Fase 9. Ninguna de las dos
 * ramas cambió de comportamiento — solo se movió el código tal cual estaba.
 */
export function useSubmitConsent({ sessionId, farmerId, document }: UseSubmitConsentOptions) {
  const { isOnline } = useSyncStatusStore();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(values: ConsentFormValues): Promise<boolean> {
    if (!document) return false;
    setSubmitting(true);
    setError(null);
    const acceptedAt = new Date();

    // Hallazgo M1 (auditoría) — la rama a tomar no depende solo de `isOnline`
    // en el momento de aceptar: si la sesión se creó offline (`sessionId`
    // todavía provisional), el backend rechazaría el UUID inválido con 400
    // aunque haya vuelto la señal justo antes de este envío. Solo se toma la
    // rama online cuando el `sessionId` ya es real, sin importar el estado de
    // red actual — la resincronización de una sesión offline con red real la
    // resuelve `SyncQueueService`, no este hook.
    const useOnlinePath = isOnline && !isLocalId(sessionId);

    try {
      if (useOnlinePath) {
        const response = await submitConsent({
          sessionId,
          consentDocumentId: document.consentDocumentId,
          respondentName: values.respondentName || undefined,
          acceptedDataProcessing: values.acceptedDataProcessing,
          acceptedPhoto: values.acceptedPhoto,
          acceptedAudio: values.acceptedAudio,
          acceptedVideo: values.acceptedVideo,
          acceptedFollowUpContact: values.acceptedFollowUpContact,
          acceptedAt: acceptedAt.toISOString(),
        });
        // Hallazgo M6 — sin esto, un consentimiento otorgado con red no deja
        // ningún rastro local: no aparece en la pestaña de sincronización ni
        // sirve de referencia si la app se reabre offline más tarde. Se marca
        // 'synced' directamente porque el backend ya lo confirmó.
        await consentRecordStore
          .save({
            id: response.consentRecordId,
            sessionId,
            consentDocumentId: document.consentDocumentId,
            respondentName: values.respondentName || undefined,
            acceptedDataProcessing: values.acceptedDataProcessing,
            acceptedPhoto: values.acceptedPhoto,
            acceptedAudio: values.acceptedAudio,
            acceptedVideo: values.acceptedVideo,
            acceptedFollowUpContact: values.acceptedFollowUpContact,
            acceptedAt,
            status: "synced",
            createdAt: acceptedAt,
          })
          .catch((err) => {
            logger.warn(`[consent] failed to save local record for online consent: ${String(err)}`);
          });
      } else {
        const localId = generateLocalId("consent");
        // Hallazgo M2 — reconstruir el payload a mano (en vez de reusar
        // buildConsentSyncPayload) fue lo que dejó esa función como código
        // muerto solo cubierto por su propio test; aquí es donde debía
        // llamarse.
        const payload = buildConsentSyncPayload({
          localId,
          sessionId,
          consentDocumentId: document.consentDocumentId,
          respondentName: values.respondentName || undefined,
          acceptedDataProcessing: values.acceptedDataProcessing,
          acceptedPhoto: values.acceptedPhoto,
          acceptedAudio: values.acceptedAudio,
          acceptedVideo: values.acceptedVideo,
          acceptedFollowUpContact: values.acceptedFollowUpContact,
          acceptedAt,
        });
        await consentRecordStore.save({
          id: localId,
          sessionId: payload.sessionId,
          consentDocumentId: payload.consentDocumentId,
          respondentName: payload.respondentName,
          acceptedDataProcessing: payload.acceptedDataProcessing,
          acceptedPhoto: payload.acceptedPhoto,
          acceptedAudio: payload.acceptedAudio,
          acceptedVideo: payload.acceptedVideo,
          acceptedFollowUpContact: payload.acceptedFollowUpContact,
          acceptedAt,
          status: "pending",
          createdAt: acceptedAt,
        });
        // Encolada antes que la primera respuesta de S1/S2: dequeueNextPending
        // es FIFO por createdAt, así que basta con crearla primero (ver
        // orderConsentBeforeSurveys para el criterio que esto satisface).
        await syncQueueStorage.enqueue({
          id: generateLocalId("consent"),
          surveyId: localId,
          campaignSessionId: sessionId,
          itemType: "consent",
        });
      }

      // Vigencia offline futura: si el encuestado ya tiene entrada en caché,
      // se anota la versión aceptada para que hasValidConsent() la reconozca
      // sin red en el próximo encuentro. Best-effort: nunca bloquea el flujo.
      if (farmerId) {
        farmerCacheStorage.recordConsent(farmerId, document.version, acceptedAt).then(
          (affected) => {
            if (affected === 0) {
              // M5 — esperado para un encuestado nuevo cuya identidad todavía
              // no está cacheada en este dispositivo; si el agricultor era
              // conocido, esto sí indica una fila perdida.
              logger.warn(`[consent] recordConsent affected 0 rows for farmerId=${farmerId}`);
            }
          },
          (err) => {
            logger.warn(`[consent] failed to record consent on farmerCache: ${String(err)}`);
          },
        );
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el consentimiento");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, error, submit };
}
