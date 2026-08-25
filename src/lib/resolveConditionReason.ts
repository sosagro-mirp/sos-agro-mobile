import type { InstrumentDraftAnswer, InstrumentQuestion } from "../types";

/**
 * Razón de visibilidad de una pregunta condicional, en texto legible para el
 * panel de contexto del encuestado en tablet — spec 74, Fase 10. Función
 * pura: solo lee `conditionQuestionId`/`conditionValue` (mismo contrato que
 * `isQuestionVisible.ts`) y el texto de la pregunta disparadora.
 *
 * Devuelve `null` si la pregunta no es condicional.
 */
export function resolveConditionReason(
  question: InstrumentQuestion,
  allQuestions: InstrumentQuestion[],
  _answers: Record<string, InstrumentDraftAnswer>,
): string | null {
  if (!question.conditionQuestionId || question.conditionValue == null) {
    return null;
  }

  const trigger = allQuestions.find((q) => q.questionId === question.conditionQuestionId);
  if (!trigger) return null;

  const valueLabel = resolveValueLabel(trigger, question.conditionValue);

  return `Apareció porque respondiste "${valueLabel}" en "${trigger.text}"`;
}

function resolveValueLabel(trigger: InstrumentQuestion, conditionValue: string): string {
  if (trigger.type.name === "yes_no") {
    return conditionValue === "true" ? "Sí" : "No";
  }

  // single_choice (y variantes con opciones): conditionValue es el optionId.
  const option = trigger.options.find((o) => o.optionId === conditionValue);
  if (option) return option.text;

  return conditionValue;
}
