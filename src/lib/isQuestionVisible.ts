import type { InstrumentDraftAnswer, InstrumentQuestion } from "../types";

export function isQuestionVisible(
  question: InstrumentQuestion,
  answers: Record<string, InstrumentDraftAnswer>,
): boolean {
  if (!question.conditionQuestionId || question.conditionValue == null) {
    return true;
  }

  const triggerAnswer = answers[question.conditionQuestionId];
  if (!triggerAnswer) return false;

  const expected = question.conditionValue;

  // yes_no: conditionValue es "true" o "false"
  if (triggerAnswer.booleanValue !== undefined) {
    return String(triggerAnswer.booleanValue) === expected;
  }

  // single_choice: conditionValue es el optionId seleccionado
  if (triggerAnswer.optionId !== undefined) {
    return triggerAnswer.optionId === expected;
  }

  return false;
}
