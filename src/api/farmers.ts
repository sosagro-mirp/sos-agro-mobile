import { httpClient } from './httpClient';
import { endpoints } from './endpoints';
import type { FarmerSearchResult, ExtractFarmerResult, ExtractCropsResult } from '../types';

export const searchFarmers = (query: string): Promise<FarmerSearchResult[]> =>
  httpClient.get(`${endpoints.farmersSearch}?q=${encodeURIComponent(query)}`);

export const extractFarmer = (surveyId: string): Promise<ExtractFarmerResult> =>
  httpClient.post(endpoints.surveyExtractFarmer(surveyId), {});

export const extractCrops = (surveyId: string): Promise<ExtractCropsResult> =>
  httpClient.post(endpoints.surveyExtractCrops(surveyId), {});
