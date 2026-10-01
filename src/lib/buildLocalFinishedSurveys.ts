import type { InstrumentDraftAnswer, InstrumentResponse } from "../types";
import type { LocalFinishedSurvey } from "./mergeCompletedSurveys";
import { flattenSections } from "./flattenSections";
import { isQuestionVisible } from "./isQuestionVisible";

export interface FinishedSurveyRow {
  id: string;
  instrumentId: string;
  campaignSessionId: string | null;
  farmerId: string | null;
  status: "draft" | "completed" | "synced";
  backendSurveyId: string | null;
  ownerUserId: string | null;
  createdAt: Date;
}

export interface FinishedFarmer {
  name: string;
  documentId: string | null;
}

export interface FinishedSurveyInputs {
  surveys: FinishedSurveyRow[];
  /** Respuestas por encuesta local, ya reconstruidas como `InstrumentDraftAnswer`. */
  answersBySurvey: Map<string, Record<string, InstrumentDraftAnswer>>;
  /** `farmer_cache` por farmerId. */
  farmers: Map<string, FinishedFarmer>;
  /** `pending_sessions.farmerId` por id de sesión (local o real). */
  sessionFarmerIds: Map<string, string | null>;
  /** `instrument_cache` por instrumentId, ya parseado. */
  instruments: Map<string, InstrumentResponse>;
  /** Ids de encuestas locales con una entrada `failed_validation` en la cola. */
  failedSurveyIds: Set<string>;
}

function hasValue(answer: InstrumentDraftAnswer): boolean {
  return (
    Boolean(answer.optionId) ||
    (answer.optionIds?.length ?? 0) > 0 ||
    Boolean(answer.textValue?.trim()) ||
    answer.numericValue !== undefined ||
    answer.booleanValue !== undefined ||
    Boolean(answer.mediaLocalPath)
  );
}

/**
 * Preguntas visibles con valor. Con el instrumento en caché se descartan las
 * respuestas de preguntas que la condición dejó ocultas; sin él, se cuentan
 * las respuestas que tienen valor (spec 92, Alcance punto 6).
 */
function countAnswered(
  answers: Record<string, InstrumentDraftAnswer>,
  instrument: InstrumentResponse | undefined,
): number {
  if (!instrument) return Object.values(answers).filter(hasValue).length;

  return flattenSections(instrument.sections).filter(
    ({ question }) =>
      isQuestionVisible(question, answers) &&
      answers[question.questionId] !== undefined &&
      hasValue(answers[question.questionId]!),
  ).length;
}

/**
 * Arma las encuestas locales terminadas del encuestador activo. Es pura: las
 * consultas viven en `surveyDraftStore.listFinished`, que la alimenta con un
 * número fijo de lecturas (sin el N+1 de `listDrafts`).
 *
 * - Dueño: las del usuario o las sin dueño (anteriores a m0013), igual que
 *   `listDrafts` del spec 86.
 * - Se excluyen las encuestas sin respuestas (marcadores de paso saltado).
 * - Productor: `survey.farmerId ?? pending_sessions.farmerId` → `farmer_cache`.
 */
export function buildLocalFinishedSurveys(
  ownerUserId: string,
  input: FinishedSurveyInputs,
): LocalFinishedSurvey[] {
  const result: LocalFinishedSurvey[] = [];

  for (const survey of input.surveys) {
    if (survey.status === "draft") continue;
    if (survey.ownerUserId !== null && survey.ownerUserId !== ownerUserId) continue;

    const answers = input.answersBySurvey.get(survey.id);
    if (!answers || Object.keys(answers).length === 0) continue;

    const farmerId =
      survey.farmerId ??
      (survey.campaignSessionId ? input.sessionFarmerIds.get(survey.campaignSessionId) : null) ??
      null;
    const farmer = farmerId ? input.farmers.get(farmerId) : undefined;
    const instrument = input.instruments.get(survey.instrumentId);

    result.push({
      clientSurveyId: survey.id,
      backendSurveyId: survey.backendSurveyId,
      status: survey.status,
      syncFailed: input.failedSurveyIds.has(survey.id),
      farmerName: farmer?.name ?? null,
      farmerDocumentId: farmer?.documentId ?? null,
      instrumentName: instrument?.name ?? null,
      responseCount: countAnswered(answers, instrument),
      createdAt: survey.createdAt.toISOString(),
    });
  }

  return result;
}
