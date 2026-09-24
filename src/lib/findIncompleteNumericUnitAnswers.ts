import type { FlattenedQuestionItem, InstrumentDraftAnswer } from "../types";
import { isQuestionVisible } from "./isQuestionVisible";
import { isAnswerConsistent, missingNumericWithUnitPart } from "./isAnswerConsistent";

// Spec 87 (D7, opción B): `buildResponsesPayload` deja de enviar las respuestas
// `numeric_with_unit` a medias para que no tumben el lote entero. Esta función
// las localiza ANTES, para no perder el valor descartado: queda registrado y el
// encuestador o un administrador pueden reingresarlo a mano si importa.

export interface IncompleteNumericUnitAnswer {
  questionId: string;
  questionText: string;
  /** Lo que sí se había capturado (el otro campo era el que faltaba). */
  numericValue?: number;
  unitText?: string;
  missing: "unit" | "number";
}

export function findIncompleteNumericUnitAnswers(
  flattenedQuestions: FlattenedQuestionItem[],
  answers: Record<string, InstrumentDraftAnswer>,
): IncompleteNumericUnitAnswer[] {
  const found: IncompleteNumericUnitAnswer[] = [];

  for (const { question } of flattenedQuestions ?? []) {
    if (question?.type?.name !== "numeric_with_unit") continue;
    if (!isQuestionVisible(question, answers)) continue;

    const answer = answers[question.questionId];
    if (isAnswerConsistent(question, answer)) continue;

    const missing = missingNumericWithUnitPart(answer);
    if (!missing) continue;

    found.push({
      questionId: question.questionId,
      questionText: question.text,
      numericValue: answer?.numericValue,
      unitText: question.options.find((o) => o.optionId === answer?.optionId)?.text,
      missing,
    });
  }

  return found;
}

/** Texto corto para mostrar el valor descartado. */
export function describeDiscardedValue(item: IncompleteNumericUnitAnswer): string {
  if (item.missing === "unit") return `${item.numericValue} (sin unidad)`;
  return `${item.unitText ?? "unidad"} (sin valor)`;
}
