import { httpClient, type RequestOptions } from "./httpClient";
import { endpoints } from "./endpoints";
import type {
  CampaignSessionResponse,
  CreateCampaignSessionPayload,
  NextStepResponse,
} from "../types";

export const createCampaignSession = (payload: CreateCampaignSessionPayload, opts?: RequestOptions) =>
  httpClient.post<CampaignSessionResponse>(endpoints.campaignSessions, payload, ...(opts ? [opts] : []));

export const getNextStep = (sessionId: string) =>
  httpClient.get<NextStepResponse>(endpoints.campaignSessionNextStep(sessionId));

export const markSessionAsSynced = (sessionId: string, opts?: RequestOptions) =>
  httpClient.patch<void>(endpoints.campaignSessionSync(sessionId), ...(opts ? [undefined, opts] as const : []));
