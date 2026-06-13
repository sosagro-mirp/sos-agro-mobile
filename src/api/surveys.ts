import { httpClient } from "./httpClient";
import { endpoints } from "./endpoints";
import type { SurveyResponse } from "../types";

export interface CreateSurveyPayload {
  instrumentIds: string[];
  farmerId?: string;
  actorTypeId?: string;
  departmentId?: string;
  townId?: string;
  vereda?: string;
  cropId?: string;
  campaignSessionId?: string;
  stepOrder?: number;
}

export const createSurvey = (payload: CreateSurveyPayload) =>
  httpClient.post<SurveyResponse>(endpoints.surveys, payload);

export const markSurveyAsSynced = (surveyId: string) =>
  httpClient.patch<void>(endpoints.surveySync(surveyId));
