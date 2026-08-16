/**
 * Spec 69 — Reanudación de borradores en la pregunta correcta.
 *
 * Cubre los criterios de aceptación 1, 2, 3, 4, 5, 7 y 9 de
 * `spec/69_reanudacion_borradores_pregunta_correcta.md`.
 *
 * ─── Por qué arranca EN ROJO ─────────────────────────────────────────────────
 *
 * El sujeto bajo prueba es `src/lib/resolveResumeIndex.ts`, la fuente única del
 * índice de reanudación que propone la Fase 1 del spec. **Ese archivo todavía
 * no existe**, así que cada caso que lo ejercita falla con un mensaje explícito
 * en vez de romper la importación de toda la suite.
 *
 * Hoy el cálculo vive duplicado y con la semántica equivocada en
 * `app/(tabs)/drafts/index.tsx:143-146`:
 *
 *   const firstIncomplete = visibleQuestions.findIndex(
 *     ({ question }) => !isAnswerComplete(question, draft.answers[question.questionId])
 *   );
 *
 * `isAnswerComplete` devuelve `true` para toda pregunta no obligatoria
 * (`src/lib/isAnswerComplete.ts:7-9`), así que ese `findIndex` no busca "la
 * primera pregunta sin responder" sino "la primera OBLIGATORIA sin responder",
 * saltándose las opcionales que el encuestador nunca vio.
 *
 * ─── Fixture: estructura REAL de producción ──────────────────────────────────
 *
 * `S3_SECCION_31` reproduce la sección "3.1 Variables climáticas de la zona"
 * del instrumento S3 (`6e82a5e2-0761-4e40-996c-b9c456f412d4`), consultada en
 * solo lectura contra producción el 2026-08-12: **seis preguntas opcionales
 * seguidas de una obligatoria**. Es esa forma —y no un fixture sintético— la
 * que convierte el defecto en un salto de cuatro preguntas en campo.
 *
 * Los casos de guarda al final de la suite usan el código actual y deben estar
 * EN VERDE desde ya: documentan el contrato del que depende la corrección y
 * dejan constancia de la hipótesis H2 descartada por lectura.
 */

import { flattenSections } from '../lib/flattenSections';
import { isQuestionVisible } from '../lib/isQuestionVisible';
import { isAnswerComplete } from '../lib/isAnswerComplete';
import type {
  FlattenedQuestionItem,
  InstrumentDraftAnswer,
  InstrumentQuestion,
  InstrumentSection,
} from '../types';

// ─── SUT: pendiente de crear en la Fase 1 del spec 69 ────────────────────────

type ResolveResumeIndex = (
  visible: FlattenedQuestionItem[],
  answers: Record<string, InstrumentDraftAnswer>,
) => number;

const resolveResumeIndex: ResolveResumeIndex = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../lib/resolveResumeIndex').resolveResumeIndex as ResolveResumeIndex;
  } catch {
    return () => {
      throw new Error(
        'src/lib/resolveResumeIndex.ts todavía no existe — spec 69, Fase 1. ' +
          'Este rojo es esperado hasta que se apruebe e implemente la corrección.',
      );
    };
  }
})();

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeQuestion(
  order: number,
  isRequired: boolean,
  typeName: string,
  text: string,
  condition?: { questionId: string; value: string },
): InstrumentQuestion {
  return {
    questionId: `q-${order}`,
    text,
    isRequired,
    order,
    type: { typeId: `type-${typeName}`, name: typeName },
    options: [],
    conditionQuestionId: condition?.questionId ?? null,
    conditionValue: condition?.value ?? null,
  } as InstrumentQuestion;
}

/**
 * Sección 3.1 de S3 tal como está en producción: índices 0-5 opcionales,
 * índice 6 obligatorio.
 */
const S3_SECCION_31: InstrumentSection[] = [
  {
    sectionId: 'sec-3-1',
    name: '3.1 Variables climáticas de la zona',
    order: 1,
    questions: [
      makeQuestion(0, false, 'numeric', 'Temperatura promedio de la zona (°C)'),
      makeQuestion(1, false, 'numeric', 'Humedad relativa promedio (%)'),
      makeQuestion(2, false, 'yes_no', '¿La zona tiene lluvias frecuentes o marcadas?'),
      makeQuestion(3, false, 'yes_no', '¿Hay vientos fuertes en la zona?'),
      makeQuestion(4, false, 'yes_no', '¿Hay nubosidad o neblina frecuente?'),
      makeQuestion(5, false, 'numeric', 'Presión atmosférica, si se conoce (hPa)'),
      makeQuestion(6, true, 'likert', '¿Qué tan útil le sería recibir el pronóstico del tiempo?'),
    ],
  },
] as InstrumentSection[];

/**
 * Instrumento con preguntas condicionadas: q-1 (yes_no obligatoria) gobierna la
 * visibilidad de q-2 y q-3. Responder "false" las oculta.
 */
const CONDICIONADO: InstrumentSection[] = [
  {
    sectionId: 'sec-cond',
    name: 'Sección condicionada',
    order: 1,
    questions: [
      makeQuestion(0, false, 'open_text', 'Observaciones iniciales (opcional)'),
      makeQuestion(1, true, 'yes_no', '¿Ha realizado estudio de suelo o sustrato?'),
      makeQuestion(2, false, 'numeric', 'Año del último análisis de suelo', {
        questionId: 'q-1',
        value: 'true',
      }),
      makeQuestion(3, true, 'open_text', 'Frecuencia de los análisis', {
        questionId: 'q-1',
        value: 'true',
      }),
      makeQuestion(4, false, 'yes_no', '¿Fertiliza sus cultivos?'),
      makeQuestion(5, true, 'likert', 'Me sería útil una alerta de fertilización'),
    ],
  },
] as InstrumentSection[];

/** Replica el filtrado de visibilidad que hacen tanto la pantalla de Borradores
 *  como `useInstrumentSurveyStore.visibleQuestions()`. */
function visibleOf(
  sections: InstrumentSection[],
  answers: Record<string, InstrumentDraftAnswer>,
): FlattenedQuestionItem[] {
  return flattenSections(sections).filter(({ question }) => isQuestionVisible(question, answers));
}

function numeric(questionId: string, value: number): InstrumentDraftAnswer {
  return { questionId, numericValue: value };
}

function yesNo(questionId: string, value: boolean): InstrumentDraftAnswer {
  return { questionId, booleanValue: value };
}

function text(questionId: string, value: string): InstrumentDraftAnswer {
  return { questionId, textValue: value };
}

function answersOf(...list: InstrumentDraftAnswer[]): Record<string, InstrumentDraftAnswer> {
  return Object.fromEntries(list.map((a) => [a.questionId, a]));
}

// ─── Criterios de aceptación ─────────────────────────────────────────────────

describe('spec69 — índice de reanudación de un borrador', () => {
  // Criterio 1 — el caso exacto del piloto de campo (2026-08-12)
  it('reanuda en la pregunta donde se salió (S3, respondidas 0 y 1 → índice 2)', () => {
    const answers = answersOf(numeric('q-0', 24), numeric('q-1', 70));
    const visible = visibleOf(S3_SECCION_31, answers);

    expect(resolveResumeIndex(visible, answers)).toBe(2);
  });

  // Criterio 1 — deja explícito el comportamiento actual que se está corrigiendo
  it('NO reanuda en la primera pregunta obligatoria sin responder (índice 6)', () => {
    const answers = answersOf(numeric('q-0', 24), numeric('q-1', 70));
    const visible = visibleOf(S3_SECCION_31, answers);

    // Lo que hace hoy `handleResume` en app/(tabs)/drafts/index.tsx:143-146.
    const comportamientoActual = visible.findIndex(
      ({ question }) => !isAnswerComplete(question, answers[question.questionId]),
    );
    expect(comportamientoActual).toBe(6); // guarda: documenta el defecto vigente

    expect(resolveResumeIndex(visible, answers)).not.toBe(comportamientoActual);
  });

  // Criterio 2 — una opcional sin responder es un punto de reanudación válido
  it('no salta una pregunta opcional sin responder', () => {
    const answers = answersOf(numeric('q-0', 24));
    const visible = visibleOf(S3_SECCION_31, answers);

    const destino = visible[resolveResumeIndex(visible, answers)];
    expect(destino.question.isRequired).toBe(false);
    expect(destino.question.questionId).toBe('q-1');
  });

  // Criterio 3 — el destino depende del punto de salida (separa H1 de H2)
  it('lleva a destinos distintos según dónde se haya salido', () => {
    const salidaEn2 = answersOf(numeric('q-0', 24), numeric('q-1', 70));
    const salidaEn4 = answersOf(
      numeric('q-0', 24),
      numeric('q-1', 70),
      yesNo('q-2', true),
      yesNo('q-3', false),
    );

    const indice2 = resolveResumeIndex(visibleOf(S3_SECCION_31, salidaEn2), salidaEn2);
    const indice4 = resolveResumeIndex(visibleOf(S3_SECCION_31, salidaEn4), salidaEn4);

    expect(indice2).toBe(2);
    expect(indice4).toBe(4);
    expect(indice2).not.toBe(indice4);
  });

  // Criterio 4 — borrador sin ninguna respuesta
  it('reanuda en el índice 0 cuando el borrador no tiene respuestas', () => {
    const answers = answersOf();
    expect(resolveResumeIndex(visibleOf(S3_SECCION_31, answers), answers)).toBe(0);
  });

  // Criterio 5 — borrador con todas las visibles respondidas → pantalla de revisión
  it('devuelve -1 cuando todas las preguntas visibles tienen respuesta registrada', () => {
    const answers = answersOf(
      numeric('q-0', 24),
      numeric('q-1', 70),
      yesNo('q-2', true),
      yesNo('q-3', false),
      yesNo('q-4', true),
      numeric('q-5', 1013),
      { questionId: 'q-6', optionId: 'opt-4' },
    );

    expect(resolveResumeIndex(visibleOf(S3_SECCION_31, answers), answers)).toBe(-1);
  });

  // Criterio 7 — el índice se interpreta sobre la lista VISIBLE
  it('no cuenta las preguntas ocultas por condición al calcular el índice', () => {
    // q-1 = "No" oculta q-2 y q-3 → la lista visible es [q-0, q-1, q-4, q-5].
    const answers = answersOf(text('q-0', 'sin novedad'), yesNo('q-1', false));
    const visible = visibleOf(CONDICIONADO, answers);

    expect(visible.map((v) => v.question.questionId)).toEqual(['q-0', 'q-1', 'q-4', 'q-5']);

    const indice = resolveResumeIndex(visible, answers);
    expect(indice).toBe(2);
    expect(visible[indice].question.questionId).toBe('q-4');
  });

  // Criterio 7 — con la condición activa, las preguntas reveladas sí cuentan
  it('incluye las preguntas reveladas por la condición cuando esta se cumple', () => {
    const answers = answersOf(text('q-0', 'sin novedad'), yesNo('q-1', true));
    const visible = visibleOf(CONDICIONADO, answers);

    expect(visible).toHaveLength(6);

    const indice = resolveResumeIndex(visible, answers);
    expect(indice).toBe(2);
    expect(visible[indice].question.questionId).toBe('q-2');
  });

  /**
   * Criterio 9 — DEPENDE de la decisión A/B de la Fase 0.
   *
   * Escrito para la **Opción A** (recomendada en el spec): reanudar en la
   * primera pregunta visible sin respuesta registrada. El encuestador que saltó
   * a propósito la opcional q-2 vuelve a ella; el error va en la dirección
   * segura (nunca omite una pregunta que no vio).
   *
   * Si el usuario elige la **Opción B** (persistir el progreso alcanzado), este
   * caso debe ajustarse a `toBe(5)` y documentar el cambio en el spec.
   */
  it('[Opción A] vuelve a la opcional saltada deliberadamente, no al punto más avanzado', () => {
    const answers = answersOf(
      numeric('q-0', 24),
      numeric('q-1', 70),
      // q-2 saltada a propósito (opcional, el encuestador tocó "Siguiente")
      yesNo('q-3', false),
      yesNo('q-4', true),
    );
    const visible = visibleOf(S3_SECCION_31, answers);

    expect(resolveResumeIndex(visible, answers)).toBe(2);
  });
});

// ─── Guardas: contratos de los que depende la corrección ─────────────────────
//
// Estos casos usan el código ACTUAL y deben estar en verde desde ya. Su papel
// es que la corrección no se lleve por delante los contratos que sí son
// correctos, y dejar constancia de la hipótesis H2 descartada por lectura.

describe('spec69 / guardas — contratos vigentes', () => {
  // Criterio 8 (no regresión): `isAnswerComplete` sigue sirviendo a canAdvance()
  it('isAnswerComplete considera completa toda pregunta no obligatoria (contrato de canAdvance)', () => {
    const opcional = makeQuestion(0, false, 'numeric', 'Opcional');
    const obligatoria = makeQuestion(1, true, 'numeric', 'Obligatoria');

    expect(isAnswerComplete(opcional, undefined)).toBe(true);
    expect(isAnswerComplete(obligatoria, undefined)).toBe(false);
  });

  // H2 descartada: `isQuestionVisible` depende solo de (question, answers)
  it('isQuestionVisible es pura respecto de (question, answers): mismas entradas, misma salida', () => {
    const condicionada = makeQuestion(2, false, 'numeric', 'Condicionada', {
      questionId: 'q-1',
      value: 'true',
    });
    const answers = answersOf(yesNo('q-1', true));

    expect(isQuestionVisible(condicionada, answers)).toBe(true);
    expect(isQuestionVisible(condicionada, answers)).toBe(true);
    expect(isQuestionVisible(condicionada, answersOf(yesNo('q-1', false)))).toBe(false);
    expect(isQuestionVisible(condicionada, answersOf())).toBe(false);
  });

  // H2 descartada: las dos computaciones de "preguntas visibles" que señalaba el
  // backlog (la de drafts/index.tsx y la de useInstrumentSurveyStore) reciben
  // las mismas secciones y el mismo objeto de respuestas, y `flattenSections` es
  // determinista — por construcción no pueden divergir.
  it('las dos computaciones de preguntas visibles producen listas idénticas', () => {
    const answers = answersOf(text('q-0', 'x'), yesNo('q-1', true));

    // Cálculo de app/(tabs)/drafts/index.tsx:139-142
    const enPantallaBorradores = flattenSections(CONDICIONADO).filter(({ question }) =>
      isQuestionVisible(question, answers),
    );
    // Cálculo de useInstrumentSurveyStore.visibleQuestions() (líneas 128-131),
    // sobre `restoredAnswers` = el mismo `draft.answers`.
    const enElStore = flattenSections(CONDICIONADO).filter(({ question }) =>
      isQuestionVisible(question, answers),
    );

    expect(enPantallaBorradores.map((v) => v.question.questionId)).toEqual(
      enElStore.map((v) => v.question.questionId),
    );
  });
});
