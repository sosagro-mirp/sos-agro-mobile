import { httpClient, type RequestOptions } from "./httpClient";
import { endpoints } from "./endpoints";
import type { MySurveysPage, RemoteSurveyResponseRow, SurveyResponse, SurveyResponsesBody } from "../types";

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
  // Spec 70, Fase 9 — id local del borrador (`local_survey_<uuid>`,
  // generateLocalId.ts). Reenviarlo en un reintento hace que el backend
  // devuelva la encuesta ya creada en vez de duplicarla.
  clientSurveyId?: string;
}

export const createSurvey = (payload: CreateSurveyPayload, opts?: RequestOptions) =>
  httpClient.post<SurveyResponse>(endpoints.surveys, payload, ...(opts ? [opts] : []));

export const markSurveyAsSynced = (surveyId: string, opts?: RequestOptions) =>
  httpClient.patch<void>(endpoints.surveySync(surveyId), ...(opts ? [undefined, opts] as const : []));

// Spec 70, Fase 4 — el endpoint solo descarta el duplicado; el reemplazo se
// inicia por separado con `beginSurvey()`, igual que cualquier otro inicio
// de instrumento (evita dejar una fila de reemplazo vacía si el encuestador
// abandona después de sobrescribir).
export interface OverwriteSurveyPayload {
  surveyId: string;
  sessionId: string;
}

export interface OverwriteSurveyResponse {
  discardedSurveyId: string;
}

export const overwriteSurvey = (payload: OverwriteSurveyPayload) =>
  httpClient.post<OverwriteSurveyResponse>(endpoints.surveyOverwrite, payload);

export interface SkipStepPayload {
  sessionId: string;
  instrumentId: string;
  stepOrder: number;
}

export interface SkipStepResponse {
  surveyId: string;
}

export const skipStepApi = (payload: SkipStepPayload, opts?: RequestOptions) =>
  httpClient.post<SkipStepResponse>(endpoints.surveySkipStep, payload, ...(opts ? [opts] : []));

// Spec 92 — historial de encuestas realizadas por el encuestador.
export interface GetMySurveysParams {
  page?: number;
  limit?: number;
  search?: string;
}

export const getMySurveys = (params: GetMySurveysParams = {}) => {
  const query = new URLSearchParams();
  if (params.page != null) query.set("page", String(params.page));
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  const queryString = query.toString();
  return httpClient.get<MySurveysPage>(
    queryString ? `${endpoints.surveysMine}?${queryString}` : endpoints.surveysMine,
  );
};

// El backend responde `{ surveyId, instrumentName, syncedAt, responses }`, no un
// arreglo; el hallazgo salió de la ronda manual TC-092-04.
export const getSurveyResponses = async (surveyId: string): Promise<RemoteSurveyResponseRow[]> => {
  const body = await httpClient.get<SurveyResponsesBody>(endpoints.surveyResponses(surveyId));
  return body.responses ?? [];
};
