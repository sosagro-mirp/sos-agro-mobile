import { consentRecordStore } from '../storage/consentRecordStore';
import { consentDocumentCacheStorage } from '../storage/consentDocumentCache';
import { farmerCacheStorage } from '../storage/farmerCache';
import { logger } from './logger';

/**
 * Hallazgo TC-078-013 (spec 78) — el consentimiento se puede registrar desde
 * el aviso persistente antes de que exista un `farmerId` (nuevo encuestado,
 * todavía llenando S1): en ese momento `useSubmitConsent` no tiene a quién
 * asociar `consentVersion`/`consentedAt` en `farmerCache`, así que
 * `hasValidConsent()` offline nunca lo ve, aunque la constancia sí exista.
 *
 * Llamar justo después de resolver un `farmerId` (local u online) para esta
 * sesión — aplica retroactivamente el consentimiento ya dado, si lo hay.
 * Best-effort: nunca debe interrumpir el flujo de la encuesta.
 */
export async function applyPendingConsentToFarmer(sessionId: string, farmerId: string): Promise<void> {
  try {
    const record = await consentRecordStore.getBySessionId(sessionId);
    if (!record || !record.acceptedDataProcessing) return;

    const activeDocument = await consentDocumentCacheStorage.get();
    if (!activeDocument || activeDocument.consentDocumentId !== record.consentDocumentId) {
      logger.warn(
        `[consent] pending record for session ${sessionId} references a document not in cache — skipping farmerCache carry-over`,
      );
      return;
    }

    const affected = await farmerCacheStorage.recordConsent(farmerId, activeDocument.version, record.acceptedAt);
    if (affected === 0) {
      logger.warn(`[consent] recordConsent affected 0 rows for farmerId=${farmerId} (applyPendingConsentToFarmer)`);
    }
  } catch (err) {
    logger.warn(`[consent] applyPendingConsentToFarmer failed for session ${sessionId}: ${String(err)}`);
  }
}
