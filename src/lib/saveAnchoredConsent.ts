import type { ConsentFormValues } from '../components/campaign/ConsentForm';
import type { ConsentDocument } from '../api/consents';
import { consentRecordStore } from '../storage/consentRecordStore';
import { farmerCacheStorage } from '../storage/farmerCache';
import { syncQueueStorage } from '../storage/syncQueue';
import { generateLocalId } from './generateLocalId';
import { chooseConsentAnchor, resolveConsentAnchor } from './consentAnchor';
import { logger } from './logger';

// Spec 103 (DM9) — constancia sin sesión de campaña: se guarda y se encola
// siempre (también con red) anclada a `farmerId` o `surveyId`; la cola la
// difiere mientras el ancla no exista en el backend. Nunca bloquea el flujo.

export async function saveAnchoredConsent(params: {
  values: ConsentFormValues;
  document: ConsentDocument;
  /** Productor de la ficha (real o provisional). */
  farmerId?: string | null;
  /** Id local del S_REG de un productor nuevo. */
  registrationSurveyId?: string | null;
  acceptedAt?: Date;
}): Promise<void> {
  const acceptedAt = params.acceptedAt ?? new Date();
  const anchor = resolveConsentAnchor(
    chooseConsentAnchor({ farmerId: params.farmerId, registrationSurveyId: params.registrationSurveyId }),
  );
  const localId = generateLocalId('consent');
  await consentRecordStore.save({
    id: localId,
    ...anchor,
    consentDocumentId: params.document.consentDocumentId,
    respondentName: params.values.respondentName || undefined,
    acceptedDataProcessing: params.values.acceptedDataProcessing,
    acceptedPhoto: params.values.acceptedPhoto,
    acceptedAudio: params.values.acceptedAudio,
    acceptedVideo: params.values.acceptedVideo,
    acceptedFollowUpContact: params.values.acceptedFollowUpContact,
    acceptedAt,
    status: 'pending',
    createdAt: acceptedAt,
  });
  await syncQueueStorage.enqueue({
    id: generateLocalId('consent'),
    surveyId: localId,
    itemType: 'consent',
  });

  const farmerId = params.farmerId;
  if (farmerId) {
    // Vigencia offline: la ficha deja de mostrar el aviso. Best-effort.
    farmerCacheStorage.recordConsent(farmerId, params.document.version, acceptedAt).catch((err) => {
      logger.warn(`[consent] failed to record consent on farmerCache: ${String(err)}`);
    });
  }
}
