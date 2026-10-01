import type {
  CreateResponsePayload,
  FlattenedQuestionItem,
  InstrumentDraftAnswer,
  InstrumentQuestion,
} from "../types";
import { isQuestionVisible } from "./isQuestionVisible";
import { isAnswerConsistent } from "./isAnswerConsistent";
import { logger } from "./logger";

// Spec 86 — texto de "Otros" que viaja en la fila de la opción isOther, solo si
// esa opción está seleccionada y el texto recortado no queda vacío.
function getOtherTextValue(
  question: InstrumentQuestion,
  answer: InstrumentDraftAnswer,
  optionId: string | undefined,
): string | undefined {
  if (optionId === undefined) return undefined;
  const otherOption = question.options.find((o) => o.isOther);
  if (!otherOption || otherOption.optionId !== optionId) return undefined;
  const trimmed = answer.otherText?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildResponsesPayload(
  surveyId: string,
  flattenedQuestions: FlattenedQuestionItem[],
  answers: Record<string, InstrumentDraftAnswer>,
  attachmentIds: Record<string, string> = {},
): CreateResponsePayload[] {
  const payload: CreateResponsePayload[] = [];

  flattenedQuestions
    .filter(({ question }) => isQuestionVisible(question, answers))
    .forEach(({ question }) => {
      const answer = answers[question.questionId];

      if (!answer) return;

      // Spec 87 (D4, CA-13): un numeric_with_unit a medias tumba el lote completo
      // (400 del backend dentro de una transacción → `failed_validation`). Es
      // preferible perder UNA respuesta que la encuesta entera. Con la
      // validación de "Siguiente" no debería llegar ninguna; puede venir de un
      // borrador guardado antes del arreglo.
      if (!isAnswerConsistent(question, answer)) {
        logger.warn(
          `[Payload] omitted incomplete numeric_with_unit answer — questionId: ${question.questionId}, surveyId: ${surveyId}`,
        );
        return;
      }

      if (question.type.name === "multiple_choice") {
        const selectedOptionIds = answer.optionIds ?? [];
        selectedOptionIds.forEach((optionId) => {
          const otherTextValue = getOtherTextValue(question, answer, optionId);
          payload.push({
            surveyId,
            questionId: question.questionId,
            optionId,
            ...(otherTextValue ? { textValue: otherTextValue } : {}),
          });
        });
        return;
      }

      const otherTextValue =
        question.type.name === "single_choice"
          ? getOtherTextValue(question, answer, answer.optionId)
          : undefined;
      const trimmedText = otherTextValue ?? answer.textValue?.trim();
      const attachmentId = attachmentIds[question.questionId];

      // Se construye campo a campo: `otherText` nunca viaja en el payload (spec 86).
      const item: CreateResponsePayload = {
        surveyId,
        questionId: answer.questionId,
        ...(answer.optionId !== undefined && { optionId: answer.optionId }),
        ...(trimmedText ? { textValue: trimmedText } : {}),
        ...(answer.numericValue !== undefined && { numericValue: answer.numericValue }),
        ...(answer.booleanValue !== undefined && { booleanValue: answer.booleanValue }),
        ...(attachmentId ? { attachmentId } : {}),
      };

      // Skip multimedia responses whose upload hasn't completed yet
      if (answer.mediaLocalPath && !attachmentId) return;

      const hasValue =
        "optionId" in item ||
        "textValue" in item ||
        "numericValue" in item ||
        "booleanValue" in item ||
        "attachmentId" in item;

      if (hasValue) payload.push(item);
    });

  return payload;
}
