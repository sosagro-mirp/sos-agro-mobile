import { extractFarmerLocally, type LocalFarmerDraft } from './extractFarmerLocally';
import { extractCropsOffline } from './extractCropsOffline';
import { cacheFarmerIdentity } from './cacheFarmerIdentity';
import { applyPendingConsentToFarmer } from './applyPendingConsentToFarmer';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { sessionCropsStorage } from '../storage/sessionCropsStorage';
import { coverageCacheStorage } from '../storage/coverageCache';
import type { CropSummary } from '../types';

// Spec 103 (DM7) — cierre del Registro (S_REG) sin conexión, extraído del
// orquestador de campaña para compartirlo con «Productores → Nuevo». El flujo
// de campaña conserva su comportamiento: con `campaignId` y `sessionId` aplica
// el consentimiento y los cultivos de la sesión.

export type RegistrationCompletionOutcome =
  | { kind: 'resolved'; farmerId: string; farmerName: string; isProvisional: boolean; crops: CropSummary[]; draft: LocalFarmerDraft }
  | {
      kind: 'collision';
      documentId: string;
      submittedName: string;
      existingFarmerName: string;
      localDraft: LocalFarmerDraft;
    }
  | { kind: 'pending' };

/** Confirma la identidad provisional de una colisión resuelta como «registrar aparte». */
export async function confirmLocalFarmer(
  draft: LocalFarmerDraft,
  registroSurveyId: string,
  opts: { campaignId?: string; sessionId?: string } = {},
): Promise<{ farmerId: string; farmerName: string; isProvisional: boolean; crops: CropSummary[] }> {
  await cacheFarmerIdentity({
    farmerId: draft.farmerId,
    name: draft.name,
    documentId: draft.documentId,
    phone: draft.phone,
    farmName: draft.farmName,
  });
  // Spec 96 — el borrador guarda su id provisional para enviarlo como `clientFarmerId`.
  if (draft.isProvisional) {
    await surveyDraftStore.setFarmerId(registroSurveyId, draft.farmerId);
    await coverageCacheStorage.addProvisional({
      farmerId: draft.farmerId,
      name: draft.name,
      documentId: draft.documentId,
    });
  }
  const crops = await extractCropsOffline(registroSurveyId, opts.campaignId);
  if (opts.sessionId) {
    await applyPendingConsentToFarmer(opts.sessionId, draft.farmerId);
    if (crops.length > 0) await sessionCropsStorage.save(opts.sessionId, crops);
  }
  return { farmerId: draft.farmerId, farmerName: draft.name, isProvisional: draft.isProvisional, crops };
}

export async function completeRegistrationOffline(params: {
  registroSurveyId: string;
  campaignId?: string;
  sessionId?: string;
}): Promise<RegistrationCompletionOutcome> {
  const draft = await extractFarmerLocally(params.registroSurveyId);
  if (!draft) return { kind: 'pending' };

  if (draft.collision) {
    return {
      kind: 'collision',
      documentId: draft.collision.documentId,
      submittedName: draft.collision.submittedName,
      existingFarmerName: draft.collision.existingName,
      localDraft: draft,
    };
  }

  const resolved = await confirmLocalFarmer(draft, params.registroSurveyId, params);
  return { kind: 'resolved', draft, ...resolved };
}
