import { extractCrops, extractFarmer, type ExtractFarmerResolution } from '../api/farmers';
import { extractCropsOffline } from './extractCropsOffline';
import { extractFarmerLocally, type LocalFarmerDraft } from './extractFarmerLocally';
import type { ExtractCropsResult, ExtractFarmerResult } from '../types';

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

/**
 * Extracción del Registro en línea: productor y luego cultivos, sobre la
 * misma encuesta — a diferencia del flujo legado (S1 luego S2, dos
 * encuestas distintas). Ver `SyncQueueService.maybeExtractFarmerAndCrops`
 * para el mismo orden aplicado en la cola de sincronización.
 */
export async function extractRegistrationOnline(
  surveyId: string,
  resolution?: ExtractFarmerResolution,
): Promise<{ farmer: ExtractFarmerResult; crops: ExtractCropsResult }> {
  const farmer = await extractFarmer(surveyId, resolution ? { resolution } : undefined);
  const crops = await extractCrops(surveyId);
  return { farmer, crops };
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
