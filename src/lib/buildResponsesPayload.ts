import type {
  CreateResponsePayload,
  FlattenedQuestionItem,
  InstrumentDraftAnswer,
} from "../types";
import { isQuestionVisible } from "./isQuestionVisible";
import { mediaUploadQueueStorage } from "../storage/mediaUploadQueueStorage";

const MEDIA_QUESTION_TYPES = new Set([
  "image",
  "voice_recording",
  "document",
  "video",
]);

export async function buildResponsesPayload(
  surveyId: string,
  flattenedQuestions: FlattenedQuestionItem[],
  answers: Record<string, InstrumentDraftAnswer>,
): Promise<CreateResponsePayload[]> {
  const payload: CreateResponsePayload[] = [];

  for (const { question } of flattenedQuestions.filter(({ question }) =>
    isQuestionVisible(question, answers),
  )) {
    const answer = answers[question.questionId];
    if (!answer) continue;

    if (MEDIA_QUESTION_TYPES.has(question.type.name)) {
      if (!answer.mediaLocalPath) continue;

      const attachmentId = await mediaUploadQueueStorage.getUploadedAttachmentId(
        surveyId,
        question.questionId,
      );

      // Skip if the upload didn't complete — avoids sending an unlinked response.
      if (!attachmentId) continue;

      payload.push({ surveyId, questionId: question.questionId, attachmentId });
      continue;
    }

    if (question.type.name === "multiple_choice") {
      const selectedOptionIds = answer.optionIds ?? [];
      selectedOptionIds.forEach((optionId) => {
        payload.push({ surveyId, questionId: question.questionId, optionId });
      });
      continue;
    }

    const trimmedText = answer.textValue?.trim();
    const item: CreateResponsePayload = {
      surveyId,
      questionId: answer.questionId,
      ...(answer.optionId !== undefined && { optionId: answer.optionId }),
      ...(trimmedText ? { textValue: trimmedText } : {}),
      ...(answer.numericValue !== undefined && { numericValue: answer.numericValue }),
      ...(answer.booleanValue !== undefined && { booleanValue: answer.booleanValue }),
    };

    const hasValue =
      "optionId" in item ||
      "textValue" in item ||
      "numericValue" in item ||
      "booleanValue" in item;

    if (hasValue) payload.push(item);
  }

  return payload;
}
