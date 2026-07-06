import type {
  CreateResponsePayload,
  FlattenedQuestionItem,
  InstrumentDraftAnswer,
} from "../types";
import { isQuestionVisible } from "./isQuestionVisible";

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

      if (question.type.name === "multiple_choice") {
        const selectedOptionIds = answer.optionIds ?? [];
        selectedOptionIds.forEach((optionId) => {
          payload.push({ surveyId, questionId: question.questionId, optionId });
        });
        return;
      }

      const trimmedText = answer.textValue?.trim();
      const attachmentId = attachmentIds[question.questionId];

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
