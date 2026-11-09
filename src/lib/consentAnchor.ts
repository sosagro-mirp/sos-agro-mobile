// Spec 103 (DM9) — ancla del consentimiento sin sesión de campaña. Exactamente
// una de: sessionId | farmerId | surveyId. Nunca se envía un id local.

export type ConsentAnchor = { sessionId: string } | { farmerId: string } | { surveyId: string };

type AnchorInput = {
  sessionId?: string | null;
  farmerId?: string | null;
  surveyId?: string | null;
};

const isLocal = (id: string) => id.startsWith('local_');

export function resolveConsentAnchor(input: AnchorInput): ConsentAnchor {
  const present = (
    [
      ['sessionId', input.sessionId],
      ['farmerId', input.farmerId],
      ['surveyId', input.surveyId],
    ] as const
  ).filter(([, v]) => !!v);
  if (present.length !== 1) {
    throw new Error('El consentimiento requiere exactamente un ancla: sessionId, farmerId o surveyId');
  }
  const [key, value] = present[0];
  return { [key]: value } as ConsentAnchor;
}

export function chooseConsentAnchor(input: {
  sessionId?: string | null;
  farmerId?: string | null;
  registrationSurveyId?: string | null;
}): ConsentAnchor {
  if (input.sessionId) return { sessionId: input.sessionId };
  if (!input.farmerId) throw new Error('No hay productor al que anclar el consentimiento');
  if (!isLocal(input.farmerId)) return { farmerId: input.farmerId };
  if (!input.registrationSurveyId) {
    throw new Error('Productor nuevo sin S_REG: no hay ancla posible para el consentimiento');
  }
  return { surveyId: input.registrationSurveyId };
}

export async function resolveConsentAnchorForSync(
  record: AnchorInput,
  lookups: { backendSurveyIdOf(localSurveyId: string): Promise<string | null> },
): Promise<{ kind: 'ready'; anchor: ConsentAnchor } | { kind: 'defer'; reason: string }> {
  const anchor = resolveConsentAnchor(record);
  if ('surveyId' in anchor && isLocal(anchor.surveyId)) {
    const real = await lookups.backendSurveyIdOf(anchor.surveyId);
    if (!real) return { kind: 'defer', reason: 'La encuesta ancla aún no existe en el backend' };
    return { kind: 'ready', anchor: { surveyId: real } };
  }
  if ('farmerId' in anchor && isLocal(anchor.farmerId)) {
    return { kind: 'defer', reason: 'El productor sigue siendo provisional' };
  }
  return { kind: 'ready', anchor };
}

export interface AnchoredConsentRecord {
  consentDocumentId: string;
  respondentName?: string | null;
  acceptedDataProcessing: boolean;
  acceptedPhoto: boolean;
  acceptedAudio: boolean;
  acceptedVideo: boolean;
  acceptedFollowUpContact: boolean;
  acceptedAt: Date;
}

export type AnchoredConsentPayload = ConsentAnchor & {
  consentDocumentId: string;
  respondentName?: string;
  acceptedDataProcessing: boolean;
  acceptedPhoto: boolean;
  acceptedAudio: boolean;
  acceptedVideo: boolean;
  acceptedFollowUpContact: boolean;
  acceptedAt: string;
};

export function buildAnchoredConsentPayload(
  record: AnchoredConsentRecord,
  anchor: ConsentAnchor,
): AnchoredConsentPayload {
  return {
    ...anchor,
    consentDocumentId: record.consentDocumentId,
    ...(record.respondentName ? { respondentName: record.respondentName } : {}),
    acceptedDataProcessing: record.acceptedDataProcessing,
    acceptedPhoto: record.acceptedPhoto,
    acceptedAudio: record.acceptedAudio,
    acceptedVideo: record.acceptedVideo,
    acceptedFollowUpContact: record.acceptedFollowUpContact,
    acceptedAt: record.acceptedAt.toISOString(),
  };
}

/** Aviso NO bloqueante de la ficha. */
export function consentNoticeOffline(
  farmer: { consentVersion?: string; consentedAt?: Date } | null,
  activeVersion: string | null,
): 'none' | 'pending' | 'outdated' | 'unknown' {
  if (!farmer?.consentVersion || !farmer.consentedAt) return 'pending';
  if (!activeVersion) return 'unknown';
  return farmer.consentVersion === activeVersion ? 'none' : 'outdated';
}
