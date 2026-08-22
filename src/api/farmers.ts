import { httpClient, ServerError } from './httpClient';
import { endpoints } from './endpoints';
import type { FarmerSearchResult, ExtractFarmerResult, ExtractCropsResult } from '../types';

// Spec 68 — el documentId digitado en S1a ya pertenece a otro agricultor con
// un nombre que no corresponde (ver `farmers/name-matching.ts` en backend/).
// Se lanza a partir del 409 de `POST /api/surveys/:id/extract-farmer`.
export class DocumentIdCollisionError extends Error {
  readonly documentId: string;
  readonly submittedName: string;
  readonly existingFarmerId: string;
  readonly existingFarmerName: string;

  constructor(body: {
    documentId: string;
    submittedName: string;
    existingFarmer?: { farmerId?: string; id?: string; name?: string };
  }) {
    super('El documento ya está registrado a nombre de otra persona');
    this.name = 'DocumentIdCollisionError';
    this.documentId = body.documentId;
    this.submittedName = body.submittedName;
    this.existingFarmerId =
      body.existingFarmer?.farmerId ?? body.existingFarmer?.id ?? '';
    this.existingFarmerName = body.existingFarmer?.name ?? '';
  }
}

export type ExtractFarmerResolution = 'same_person' | 'separate_person';

export const listAllFarmers = async (): Promise<FarmerSearchResult[]> => {
  const raw = await httpClient.get<(Omit<FarmerSearchResult, 'farmerId'> & { id?: string; farmerId?: string })[]>(
    endpoints.farmers,
  );
  return raw.map((r) => ({ ...r, farmerId: r.farmerId ?? r.id ?? '' }));
};

export const searchFarmers = async (query: string): Promise<FarmerSearchResult[]> => {
  // The Farmer entity exposes its PK as `id` (not `farmerId`) — normalise here.
  const raw = await httpClient.get<(Omit<FarmerSearchResult, 'farmerId'> & { id?: string; farmerId?: string })[]>(
    `${endpoints.farmersSearch}?q=${encodeURIComponent(query)}`,
  );
  return raw.map((r) => ({ ...r, farmerId: r.farmerId ?? r.id ?? '' }));
};

export const extractFarmer = async (
  surveyId: string,
  options?: { resolution?: ExtractFarmerResolution },
): Promise<ExtractFarmerResult> => {
  try {
    // The Farmer entity exposes its PK as `id` (not `farmerId`) — normalise here,
    // same as searchFarmers does.
    const raw = await httpClient.post<{
      farmer: Omit<FarmerSearchResult, 'farmerId'> & { id?: string; farmerId?: string };
      existed: boolean;
    }>(
      endpoints.surveyExtractFarmer(surveyId),
      options?.resolution ? { resolution: options.resolution } : {},
    );
    return {
      farmer: { ...raw.farmer, farmerId: raw.farmer.farmerId ?? raw.farmer.id ?? '' },
      existed: raw.existed,
    };
  } catch (err) {
    // Spec 68 — nunca dejar que un 409 sin resolución se confunda con
    // cualquier otro error del servidor: el orquestador necesita
    // distinguirlo explícitamente para mostrar el modal de colisión.
    if (err instanceof ServerError && err.status === 409 && err.body) {
      throw new DocumentIdCollisionError(
        err.body as {
          documentId: string;
          submittedName: string;
          existingFarmer?: { farmerId?: string; id?: string; name?: string };
        },
      );
    }
    throw err;
  }
};

export const extractCrops = (surveyId: string): Promise<ExtractCropsResult> =>
  httpClient.post(endpoints.surveyExtractCrops(surveyId), {});
