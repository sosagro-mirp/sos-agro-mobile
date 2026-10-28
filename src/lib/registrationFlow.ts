import { DocumentIdCollisionError, extractFarmer, type ExtractFarmerResolution } from '../api/farmers';
import { getSurveyExtraction } from '../api/surveys';
import { cacheFarmerIdentity } from './cacheFarmerIdentity';
import { extractCropsOffline } from './extractCropsOffline';
import {
  extractFarmerLocally,
  readFarmerIdentityFromDraft,
  type LocalFarmerDraft,
} from './extractFarmerLocally';
import {
  EXTRACTION_BLOCKED_MESSAGE,
  interpretExtraction,
  type ExtractionOutcome,
} from './interpretExtraction';
import type { CropSummary, ExtractFarmerResult } from '../types';

export type RegistrationFlowKind = 'registro' | 'legacy';

/**
 * Spec 84 — decide si el encuestador ve el instrumento de Registro (un solo
 * instrumento) o el flujo legado S1/S2 (dos instrumentos), sin depender de
 * si el backend ya lo promovió:
 *
 *   - Si `S_REG` ya está en la caché del dispositivo, se usa sin más — no
 *     importa si hay conexión: ya se descargó en un refresh anterior.
 *   - Si no está en caché y hay conexión, se pregunta al backend
 *     (`registrationAvailableOnline`, resuelto por el llamador con
 *     `GET /instruments/by-code/S_REG`) antes de decidir.
 *   - Sin caché y sin conexión, no hay forma de saberlo: se cae al legado.
 */
export function chooseRegistrationFlow(params: {
  registrationCached: boolean;
  isOnline: boolean;
  registrationAvailableOnline?: boolean;
}): RegistrationFlowKind {
  if (params.registrationCached) return 'registro';
  if (params.isOnline) {
    return params.registrationAvailableOnline ? 'registro' : 'legacy';
  }
  return 'legacy';
}

export type OnlineExtractionOutcome = Exclude<ExtractionOutcome, { kind: 'retry_alias' }>;

type ResolvedOutcome = Extract<ExtractionOutcome, { kind: 'resolved' }>;

function outcomeFromAlias(result: ExtractFarmerResult): ResolvedOutcome {
  const { farmer } = result;
  return {
    kind: 'resolved',
    farmerId: farmer.farmerId,
    farmerName: farmer.name,
    farmId: result.extraction?.farmId ?? farmer.farm?.farmId ?? null,
    farmName: farmer.farm?.name ?? null,
    clientFarmerId: null,
    crops: result.crops ?? farmer.farm?.crops ?? [],
  };
}

/**
 * Spec 96 (D-96-1) — extracción en línea del Registro, S1 y S2: el backend ya
 * extrajo dentro del batch, así que la fuente es una sola
 * `GET /surveys/:id/extraction`. `extract-farmer` queda para (a) la decisión
 * del encuestador ante una colisión, (b) el documento corregido y (c) un único
 * reintento si la extracción quedó en `error` o sin estado.
 */
export async function resolveExtractionOnline(
  surveyId: string,
  opts?: { resolution?: ExtractFarmerResolution; correctedDocumentId?: string },
): Promise<OnlineExtractionOutcome> {
  const viaAlias = async (
    options?: Parameters<typeof extractFarmer>[1],
  ): Promise<OnlineExtractionOutcome> => {
    try {
      return outcomeFromAlias(await extractFarmer(surveyId, options));
    } catch (err) {
      if (err instanceof DocumentIdCollisionError) {
        return {
          kind: 'collision',
          documentId: err.documentId,
          submittedName: err.submittedName,
          existingFarmerName: err.existingFarmerName,
        };
      }
      throw err;
    }
  };

  if (opts?.correctedDocumentId) return viaAlias({ correctedDocumentId: opts.correctedDocumentId });
  if (opts?.resolution) return viaAlias({ resolution: opts.resolution });

  const outcome = interpretExtraction(await getSurveyExtraction(surveyId));
  if (outcome.kind === 'retry_alias') return viaAlias();
  return outcome;
}

/**
 * Spec 96 — cultivos de la sesión para el S2 heredado: salen de la misma vista
 * de extracción (ya no se llama a `extract-crops`).
 */
export async function resolveCropsOnline(surveyId: string): Promise<CropSummary[]> {
  const view = await getSurveyExtraction(surveyId);
  const status = view?.status ?? null;
  if (status === 'done' || status === 'backfilled' || status === 'not_applicable') {
    return view.crops ?? [];
  }
  if (status === null || status === 'error') {
    return (await extractFarmer(surveyId)).crops ?? [];
  }
  throw new Error(EXTRACTION_BLOCKED_MESSAGE);
}

/**
 * Cachea la identidad resuelta por la extracción. La vista no trae documento ni
 * teléfono (D-96-4): se toman de lo que el encuestador digitó en el borrador.
 */
export async function cacheResolvedFarmer(
  localSurveyId: string,
  outcome: ResolvedOutcome,
): Promise<void> {
  const typed = await readFarmerIdentityFromDraft(localSurveyId);
  await cacheFarmerIdentity({
    farmerId: outcome.farmerId,
    name: outcome.farmerName,
    documentId: typed?.documentId,
    phone: typed?.phone,
    farmName: outcome.farmName ?? typed?.farmName,
    farmId: outcome.farmId,
    crops: outcome.crops,
  });
}

/**
 * Extracción del Registro sin conexión: mismo orden que la versión en
 * línea, pero contra la caché local (`farmerCache`, `instrumentCache`) en
 * vez del backend. `campaignId` lo necesita `extractCropsOffline` para
 * resolver el cultivo por nombre contra `campaign.availableCrops`.
 */
export async function extractRegistrationOffline(
  surveyId: string,
  campaignId: string,
): Promise<{ farmer: LocalFarmerDraft | null; crops: Awaited<ReturnType<typeof extractCropsOffline>> }> {
  const farmer = await extractFarmerLocally(surveyId);
  const crops = await extractCropsOffline(surveyId, campaignId);
  return { farmer, crops };
}
