// Spec 104 (etapa A, DH8-4) — los borradores de campaña iniciados antes del retiro
// se dejan terminar. Si la sesión tiene productor, se reanudan por el flujo
// anclado (ficha del productor); si no, por el orquestador heredado (hasta la etapa C).
import { isAnchorComplete, type ApplyContext } from './surveyAnchor';

export type LegacyDraftResume =
  | {
      kind: 'anchored';
      instrumentId: string;
      surveyId: string;
      context: ApplyContext;
      /** Se conserva: la ingesta heredada sigue recibiéndolo hasta la etapa C. */
      campaignSessionId: string;
      returnTo: string;
    }
  | { kind: 'orchestrator'; campaignSessionId: string };

export function resolveLegacyDraftResume(
  draft: {
    surveyId: string;
    instrumentId: string;
    campaignSessionId?: string | null;
    farmerId?: string | null;
    farmId?: string | null;
    farmCropId?: string | null;
  },
  session?: { farmerId?: string | null } | null,
): LegacyDraftResume | null {
  if (!draft.campaignSessionId) return null;
  const farmerId = draft.farmerId || session?.farmerId;
  if (!farmerId) return { kind: 'orchestrator', campaignSessionId: draft.campaignSessionId };

  const context: ApplyContext = { farmerId };
  if (draft.farmId && isAnchorComplete({ farmId: draft.farmId, farmCropId: draft.farmCropId })) {
    context.farmId = draft.farmId;
    if (draft.farmCropId) context.farmCropId = draft.farmCropId;
  }
  return {
    kind: 'anchored',
    instrumentId: draft.instrumentId,
    surveyId: draft.surveyId,
    context,
    campaignSessionId: draft.campaignSessionId,
    returnTo: `/productores/${farmerId}`,
  };
}
