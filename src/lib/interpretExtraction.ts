import type { CropSummary, SurveyExtractionView } from '../types';

// Spec 96 (D-96-1, D-96-2) — traduce la vista de `GET /surveys/:id/extraction`
// en la decisión que toma el cliente. Función pura: sin red ni estado.

export const EXTRACTION_BLOCKED_MESSAGE =
  'No pudimos identificar al agricultor con la información registrada. ' +
  'Revisa el nombre y el documento e inténtalo de nuevo.';

export type ExtractionOutcome =
  | {
      kind: 'resolved';
      farmerId: string;
      farmerName: string;
      farmId: string | null;
      farmName: string | null;
      clientFarmerId: string | null;
      crops: CropSummary[];
    }
  | { kind: 'collision'; documentId: string; submittedName: string; existingFarmerName: string }
  | { kind: 'retry_alias' }
  | { kind: 'blocked'; message: string };

export function interpretExtraction(view: SurveyExtractionView | null): ExtractionOutcome {
  const status = view?.status ?? null;

  if (!view || status === null || status === 'error') return { kind: 'retry_alias' };

  if (status === 'collision') {
    if (!view.collision) return { kind: 'retry_alias' };
    return {
      kind: 'collision',
      documentId: view.collision.documentId,
      submittedName: view.collision.submittedName,
      existingFarmerName: view.collision.existingFarmer?.name ?? '',
    };
  }

  if (status === 'done' || status === 'backfilled' || status === 'not_applicable') {
    if (view.farmerId) {
      return {
        kind: 'resolved',
        farmerId: view.farmerId,
        farmerName: view.farmerName ?? '',
        farmId: view.farm?.farmId ?? null,
        farmName: view.farm?.name ?? null,
        clientFarmerId: view.clientFarmerId ?? null,
        crops: view.crops ?? [],
      };
    }
    // `done` sin productor es un estado incoherente: se pide una lectura por el alias.
    if (status !== 'not_applicable') return { kind: 'retry_alias' };
  }

  // no_identity, pending_alias, awaiting_review, o not_applicable sin productor.
  return { kind: 'blocked', message: EXTRACTION_BLOCKED_MESSAGE };
}
