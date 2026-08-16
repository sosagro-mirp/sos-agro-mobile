import type { FlattenedQuestionItem, InstrumentDraftAnswer } from "../types";

/**
 * Spec 69 — fuente única del índice de reanudación de un borrador.
 *
 * Antes de este módulo, `app/(tabs)/drafts/index.tsx` calculaba el índice a
 * mano con `isAnswerComplete`, que trata toda pregunta opcional como
 * "completa" esté respondida o no (correcto para `canAdvance()`, que es lo
 * que esa función existe para servir — ver `isAnswerComplete.ts` — pero
 * equivocado para "¿dónde se quedó el encuestador?"). El resultado en campo:
 * un borrador que salió en una pregunta opcional reanudaba en la siguiente
 * *obligatoria*, saltándose en silencio cualquier opcional intermedia sin
 * responder. Diagnosticado y reproducido en dispositivo real contra
 * producción (Fase 0 del spec, 2026-08-16): en el instrumento S3, salir en
 * cualquier pregunta del rango 0-5 (seis opcionales seguidas) reanudaba
 * siempre en el índice 6 (la primera obligatoria), sin importar el punto de
 * salida real.
 *
 * Regla (Opción A del spec, la única implementada — ver "Diseño propuesto de
 * la corrección" para la Opción B descartada):
 *
 *   Índice de reanudación = la primera pregunta VISIBLE sin respuesta
 *   REGISTRADA (sea obligatoria u opcional). -1 si todas las visibles ya
 *   tienen respuesta.
 *
 * "Respuesta registrada" es que exista una entrada en `answers` para esa
 * pregunta — no que la entrada satisfaga `isAnswerComplete`. Es la
 * distinción entre "no la vio" y "la vio y decidió no responderla", que es
 * justo lo que antes faltaba.
 *
 * Consumida tanto por `useInstrumentSurveyStore` (fuente de la pregunta
 * activa al reanudar) como por `app/(tabs)/drafts/index.tsx` (para decidir
 * si el destino es una pregunta o la pantalla de revisión) — ninguna de las
 * dos vuelve a calcular esto por su cuenta (criterio 6 del spec).
 *
 * `visibleQuestions` debe ser la lista ya filtrada por `isQuestionVisible`
 * (preguntas ocultas por condición no ocupan índice — criterio 7).
 */
export function resolveResumeIndex(
  visibleQuestions: FlattenedQuestionItem[],
  answers: Record<string, InstrumentDraftAnswer>,
): number {
  return visibleQuestions.findIndex(
    ({ question }) => answers[question.questionId] === undefined,
  );
}
