import type { InstrumentDraftAnswer, InstrumentQuestion } from "../types";

export function isAnswerComplete(
  question: InstrumentQuestion,
  answer?: InstrumentDraftAnswer,
): boolean {
  if (!question.isRequired) {
    return true;
  }

  if (!answer) {
    return false;
  }

  switch (question.type.name) {
    case "open_text":
      return Boolean(answer.textValue?.trim());
    case "numeric":
      // GPS-backed questions (systemField farm.latitude/longitude) also go through this
      // case: GpsCoordinateInput reports numericValue with the same contract as NumericInput.
      return answer.numericValue !== undefined;
    case "yes_no":
      return answer.booleanValue !== undefined;
    case "multiple_choice": {
      const selectedIds = answer.optionIds ?? [];
      if (selectedIds.length === 0) return false;
      const otherOption = question.options.find((o) => o.isOther);
      if (otherOption && selectedIds.includes(otherOption.optionId)) {
        return Boolean(answer.otherText?.trim());
      }
      return true;
    }
    case "single_choice": {
      if (!answer.optionId) return false;
      const otherOption = question.options.find((o) => o.isOther);
      if (otherOption && answer.optionId === otherOption.optionId) {
        return Boolean(answer.otherText?.trim());
      }
      return true;
    }
    case "likert":
      return Boolean(answer.optionId);
    default:
      return Boolean(
        answer.optionId ||
        answer.textValue ||
        answer.numericValue !== undefined ||
        answer.booleanValue !== undefined,
      );
  }
}
