// Spec 92 — Encuestas realizadas: tipos del historial de encuestas aplicadas
// por el encuestador (`GET /api/surveys/mine` y `GET /api/surveys/:id/responses`
// visto por un POLLSTER, que recibe la lista blanca de campos, no el shape
// completo que ven ADMIN/RESEARCHER).

export interface MySurveyFarmer {
  farmerId: string;
  name: string;
}

export interface MySurveyItem {
  surveyId: string;
  clientSurveyId: string | null;
  instrumentName: string;
  campaignName: string | null;
  farmer: MySurveyFarmer | null;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MySurveysPage {
  items: MySurveyItem[];
  total: number;
  page: number;
  limit: number;
}

export interface RemoteSurveyResponseRow {
  responseId: string;
  questionId: string;
  questionText: string;
  questionType: string;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  textValue: string | null;
  numericValue: number | null;
  booleanValue: boolean | null;
  optionText: string | null;
  hasAttachment: boolean;
}
