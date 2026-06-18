import { httpClient } from './httpClient';
import { endpoints } from './endpoints';
import type { FarmerSearchResult, ExtractFarmerResult, ExtractCropsResult } from '../types';

export const searchFarmers = async (query: string): Promise<FarmerSearchResult[]> => {
  // The Farmer entity exposes its PK as `id` (not `farmerId`) — normalise here.
  const raw = await httpClient.get<(Omit<FarmerSearchResult, 'farmerId'> & { id?: string; farmerId?: string })[]>(
    `${endpoints.farmersSearch}?q=${encodeURIComponent(query)}`,
  );
  return raw.map((r) => ({ ...r, farmerId: r.farmerId ?? r.id ?? '' }));
};

export const extractFarmer = (surveyId: string): Promise<ExtractFarmerResult> =>
  httpClient.post(endpoints.surveyExtractFarmer(surveyId), {});

export const extractCrops = (surveyId: string): Promise<ExtractCropsResult> =>
  httpClient.post(endpoints.surveyExtractCrops(surveyId), {});
