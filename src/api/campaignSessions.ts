import { httpClient } from "./httpClient";
import { endpoints } from "./endpoints";
import type {
  CampaignSessionResponse,
  CreateCampaignSessionPayload,
  NextStepResponse,
} from "../types";

export const createCampaignSession = (payload: CreateCampaignSessionPayload) =>
  httpClient.post<CampaignSessionResponse>(endpoints.campaignSessions, payload);

export const getNextStep = (sessionId: string) =>
  httpClient.get<NextStepResponse>(endpoints.campaignSessionNextStep(sessionId));

export const markSessionAsSynced = (sessionId: string) =>
  httpClient.patch<void>(endpoints.campaignSessionSync(sessionId));
