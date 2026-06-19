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

export const extractFarmer = async (surveyId: string): Promise<ExtractFarmerResult> => {
  // The Farmer entity exposes its PK as `id` (not `farmerId`) — normalise here,
  // same as searchFarmers does.
  const raw = await httpClient.post<{
    farmer: Omit<FarmerSearchResult, 'farmerId'> & { id?: string; farmerId?: string };
    existed: boolean;
  }>(endpoints.surveyExtractFarmer(surveyId), {});
  return {
    farmer: { ...raw.farmer, farmerId: raw.farmer.farmerId ?? raw.farmer.id ?? '' },
    existed: raw.existed,
  };
};

export const extractCrops = (surveyId: string): Promise<ExtractCropsResult> =>
  httpClient.post(endpoints.surveyExtractCrops(surveyId), {});
