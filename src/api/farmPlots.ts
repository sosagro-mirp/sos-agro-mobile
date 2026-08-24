import { httpClient } from './httpClient';
import { endpoints } from './endpoints';

export interface PolygonPoint {
  lat: number;
  lng: number;
  altitude: number | null;
  accuracy: number | null;
  capturedAt: string;
}

export interface PolygonPayload {
  points: PolygonPoint[];
  closedAt: string;
}

export interface CreateFarmPlotPayload {
  farmId: string;
  name: string;
  description?: string;
  area?: number;
  capturedOffline?: boolean;
  polygon: PolygonPayload;
}

export interface FarmPlotResponse {
  farmPlotId: string;
  farmId: string;
  name: string;
  description?: string;
  area?: number;
  polygon: PolygonPayload;
  capturedOffline: boolean;
  createdAt: string;
  updatedAt: string;
}

export const createFarmPlot = (payload: CreateFarmPlotPayload): Promise<{ farmPlotId: string }> =>
  httpClient.post(endpoints.farmPlotsCreate, payload);

export const getFarmPlotsByFarm = (farmId: string): Promise<FarmPlotResponse[]> =>
  httpClient.get(endpoints.farmPlotsByFarm(farmId));
