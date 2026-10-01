import type { InstrumentDraftAnswer, InstrumentQuestion } from "../types";
import { isAnswerComplete } from "./isAnswerComplete";

// Spec 87 (D1): "¿esta respuesta parcial es coherente?" — una pregunta distinta
// de "¿está contestada lo suficiente para una obligatoria?" (`isAnswerComplete`),
// que corta con `true` para toda pregunta opcional. Esta función NO mira
// `isRequired`: una opcional se puede dejar totalmente vacía, pero no a medias.
export function isAnswerConsistent(
  question: InstrumentQuestion,
  answer?: InstrumentDraftAnswer,
): boolean {
  if (question.type.name === "numeric_with_unit") {
    // El backend exige los dos campos juntos (`responses.service.ts`): un
    // numeric_with_unit a medias tumba el lote completo con un 400.
    const hasNumber = answer?.numericValue !== undefined;
    const hasUnit = Boolean(answer?.optionId);
    return hasNumber === hasUnit;
  }
  return true;
}

/**
 * Qué falta en una respuesta `numeric_with_unit` a medias, para avisarlo en
 * pantalla (spec 87, D2). `null` si está completa o totalmente vacía.
 */
export function missingNumericWithUnitPart(
  answer?: InstrumentDraftAnswer,
): "unit" | "number" | null {
  const hasNumber = answer?.numericValue !== undefined;
  const hasUnit = Boolean(answer?.optionId);
  if (hasNumber && !hasUnit) return "unit";
  if (hasUnit && !hasNumber) return "number";
  return null;
}

/**
 * Habilita "Siguiente", el envío y la marca de "completa": cumple la
 * obligatoriedad Y es coherente. Único punto que usan las tres pantallas.
 */
export function isAnswerAcceptable(
  question: InstrumentQuestion,
  answer?: InstrumentDraftAnswer,
): boolean {
  return isAnswerComplete(question, answer) && isAnswerConsistent(question, answer);
}
