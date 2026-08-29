/**
 * Spec 78 — vigencia del consentimiento evaluada sin red, a partir de lo que
 * el dispositivo ya tiene cacheado (`farmerCache.consentVersion`) contra la
 * versión activa también cacheada (`consentDocumentCache`). Función pura:
 * la usan tanto `pre-survey.tsx` (rama offline) como el backend equivalente
 * (`ConsentRecordsService.getFarmerStatus`, online).
 */

export interface FarmerConsentCacheLike {
  consentVersion?: string | null;
  consentedAt?: Date | null;
}

export function hasValidConsent(
  farmer: FarmerConsentCacheLike,
  activeVersion: string | null,
): boolean {
  // Ante versión activa desconocida (aún no se pudo cachear el documento) se
  // exige el consentimiento en vez de asumir que el cacheado sigue vigente.
  if (!activeVersion) return false;
  if (!farmer.consentVersion) return false;
  return farmer.consentVersion === activeVersion;
}
