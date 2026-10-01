import { createQuestionOption } from "../api/questions";
import type { RequestOptions } from "../api/httpClient";
import type { FlattenedQuestionItem, InstrumentDraftAnswer } from "../types";

type AnswersMap = Record<string, InstrumentDraftAnswer>;

export async function resolveOtherOptions(
  flattenedQuestions: FlattenedQuestionItem[],
  answers: AnswersMap,
  // Spec 86 — token del dueño de la encuesta (tablet compartida).
  opts?: RequestOptions,
): Promise<AnswersMap> {
  const resolved: AnswersMap = { ...answers };

  for (const { question } of flattenedQuestions) {
    const { questionId, type, options } = question;
    const answer = resolved[questionId];
    if (!answer) continue;

    const typeName = type?.name;

    if (typeName === "single_choice") {
      const otherOption = options.find((o) => o.isOther);
      if (
        otherOption &&
        answer.optionId === otherOption.optionId &&
        answer.otherText?.trim()
      ) {
        const created = await createQuestionOption(questionId, answer.otherText.trim(), opts);
        resolved[questionId] = {
          ...answer,
          optionId: created.optionId,
          otherText: undefined,
        };
      }
    } else if (typeName === "multiple_choice") {
      const otherOption = options.find((o) => o.isOther);
      const selectedIds = answer.optionIds ?? [];
      if (
        otherOption &&
        selectedIds.includes(otherOption.optionId) &&
        answer.otherText?.trim()
      ) {
        const created = await createQuestionOption(questionId, answer.otherText.trim(), opts);
        resolved[questionId] = {
          ...answer,
          optionIds: selectedIds.map((id) =>
            id === otherOption.optionId ? created.optionId : id,
          ),
          otherText: undefined,
        };
      }
    }
  }

  return resolved;
}
