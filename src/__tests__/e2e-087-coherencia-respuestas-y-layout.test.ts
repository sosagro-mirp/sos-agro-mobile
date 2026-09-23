/**
 * Spec 87 — Dos bugs de captura en campo.
 *
 * Cubre los criterios de aceptación de
 * `spec/87_seleccion_multiple_y_unidad_obligatoria.md` que son verificables sin
 * renderizar componentes: la coherencia número ↔ unidad (CA-6, CA-8, CA-9,
 * CA-10, CA-11, CA-13, CA-14) y el cálculo del tope de filas del bloque de
 * opciones seleccionadas (CA-2, CA-4).
 *
 * Nació en rojo al redactar el spec y pasó a verde con las Fases 2, 4, 5 y 6.
 *
 * El layout en sí NO se prueba aquí: el repo no tiene
 * `@testing-library/react-native` ni `react-test-renderer` (ver la nota de
 * `e2e-024-textOverflow.test.ts`). Por eso solo se extrae a función pura el
 * cálculo del tope; lo visual va en `docs/testing/test-087-…md`.
 */

// Archivo en memoria para probar el registro de valores descartados sin tocar el
// sistema de archivos real.
const mockFiles: Record<string, string> = {};
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-documents/',
  getInfoAsync: jest.fn(async (path: string) => ({ exists: path in mockFiles })),
  readAsStringAsync: jest.fn(async (path: string) => mockFiles[path]),
  writeAsStringAsync: jest.fn(async (path: string, content: string) => {
    mockFiles[path] = content;
  }),
  deleteAsync: jest.fn(async (path: string) => {
    delete mockFiles[path];
  }),
}));

import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import { isAnswerComplete } from '../lib/isAnswerComplete';
import { isAnswerConsistent } from '../lib/isAnswerConsistent';
import { resolveSelectedChipsMaxHeight } from '../lib/resolveSelectedChipsMaxHeight';
import {
  describeNumericUnitRecovery,
  isNumericUnitValidationError,
} from '../lib/describeFailedSyncCause';
import {
  describeDiscardedValue,
  findIncompleteNumericUnitAnswers,
} from '../lib/findIncompleteNumericUnitAnswers';
import { discardedAnswersStorage } from '../storage/discardedAnswersStorage';
import type { InstrumentDraftAnswer, InstrumentQuestion } from '../types';

function makeQuestion(
  overrides: Partial<InstrumentQuestion> & { typeName?: string } = {},
): InstrumentQuestion {
  const { typeName = 'numeric_with_unit', ...rest } = overrides;
  return {
    questionId: 'q1',
    text: '¿Cuánto tarda en llegar a la finca?',
    isRequired: false,
    order: 1,
    type: { typeId: 'tid', name: typeName },
    options: [
      { optionId: 'u-min', text: 'Minutos', value: 1, isOther: false },
      { optionId: 'u-hr', text: 'Horas', value: 2, isOther: false },
    ],
    conditionQuestionId: null,
    conditionValue: null,
    ...rest,
  };
}

const NUMBER_ONLY: InstrumentDraftAnswer = { questionId: 'q1', numericValue: 45 };
const UNIT_ONLY: InstrumentDraftAnswer = { questionId: 'q1', optionId: 'u-min' };
const COMPLETE: InstrumentDraftAnswer = { questionId: 'q1', numericValue: 45, optionId: 'u-min' };

describe('spec87 / CA-6, CA-8 — isAnswerConsistent: número y unidad van juntos', () => {
  it('número sin unidad es incoherente', () => {
    expect(isAnswerConsistent(makeQuestion(), NUMBER_ONLY)).toBe(false);
  });

  it('unidad sin número es incoherente', () => {
    expect(isAnswerConsistent(makeQuestion(), UNIT_ONLY)).toBe(false);
  });

  it('número y unidad juntos es coherente', () => {
    expect(isAnswerConsistent(makeQuestion(), COMPLETE)).toBe(true);
  });

  it('CA-10: la respuesta totalmente vacía es coherente (se puede dejar sin responder)', () => {
    expect(isAnswerConsistent(makeQuestion(), undefined)).toBe(true);
    expect(isAnswerConsistent(makeQuestion(), { questionId: 'q1' })).toBe(true);
  });

  it('un número 0 cuenta como número (no se confunde con "vacío")', () => {
    expect(isAnswerConsistent(makeQuestion(), { questionId: 'q1', numericValue: 0 })).toBe(false);
    expect(
      isAnswerConsistent(makeQuestion(), { questionId: 'q1', numericValue: 0, optionId: 'u-min' }),
    ).toBe(true);
  });

  it('la regla aplica igual si la pregunta es obligatoria', () => {
    const obligatoria = makeQuestion({ isRequired: true });
    expect(isAnswerConsistent(obligatoria, NUMBER_ONLY)).toBe(false);
    expect(isAnswerConsistent(obligatoria, COMPLETE)).toBe(true);
  });

  it('los demás tipos de pregunta no se ven afectados por ahora', () => {
    const abierta = makeQuestion({ typeName: 'open_text' });
    const numerica = makeQuestion({ typeName: 'numeric' });
    const multiple = makeQuestion({ typeName: 'multiple_choice' });

    expect(isAnswerConsistent(abierta, { questionId: 'q1', textValue: 'algo' })).toBe(true);
    expect(isAnswerConsistent(numerica, { questionId: 'q1', numericValue: 3 })).toBe(true);
    expect(isAnswerConsistent(multiple, { questionId: 'q1', optionIds: ['a'] })).toBe(true);
    expect(isAnswerConsistent(abierta, undefined)).toBe(true);
  });
});

describe('spec87 / CA-9, CA-14 — relación con isAnswerComplete', () => {
  it('CA-14 (no regresión): isAnswerComplete sigue dando true a toda pregunta opcional', () => {
    const opcional = makeQuestion({ isRequired: false });
    expect(isAnswerComplete(opcional, undefined)).toBe(true);
    expect(isAnswerComplete(opcional, NUMBER_ONLY)).toBe(true);
  });

  it('CA-6: la combinación de ambas es la que bloquea "Siguiente" en una opcional a medias', () => {
    const opcional = makeQuestion({ isRequired: false });
    const puedeAvanzar = (a?: InstrumentDraftAnswer) =>
      isAnswerComplete(opcional, a) && isAnswerConsistent(opcional, a);

    expect(puedeAvanzar(NUMBER_ONLY)).toBe(false);
    expect(puedeAvanzar(UNIT_ONLY)).toBe(false);
    // CA-9: al completar el campo que faltaba, vuelve a poder avanzar.
    expect(puedeAvanzar(COMPLETE)).toBe(true);
    // CA-10: vacía, se puede avanzar.
    expect(puedeAvanzar(undefined)).toBe(true);
  });

  it('CA-11: en una obligatoria el resultado no cambia respecto de hoy', () => {
    const obligatoria = makeQuestion({ isRequired: true });
    const puedeAvanzar = (a?: InstrumentDraftAnswer) =>
      isAnswerComplete(obligatoria, a) && isAnswerConsistent(obligatoria, a);

    expect(puedeAvanzar(undefined)).toBe(false);
    expect(puedeAvanzar(NUMBER_ONLY)).toBe(false);
    expect(puedeAvanzar(COMPLETE)).toBe(true);
  });
});

describe('spec87 / CA-13 — buildResponsesPayload no tumba el lote entero', () => {
  const flattened = (question: InstrumentQuestion) => [
    { sectionId: 's1', sectionName: 'Sección', question },
  ];

  it('omite del lote una respuesta numeric_with_unit sin unidad', () => {
    const q = makeQuestion();
    const payload = buildResponsesPayload('survey-1', flattened(q), { q1: NUMBER_ONLY });

    // El backend responde 400 a un numeric_with_unit sin optionId y la
    // transacción tumba el lote completo (responses.service.ts:217-224), así
    // que esta respuesta no debe salir.
    expect(payload).toEqual([]);
  });

  it('omite del lote una respuesta numeric_with_unit sin número', () => {
    const q = makeQuestion();
    const payload = buildResponsesPayload('survey-1', flattened(q), { q1: UNIT_ONLY });

    expect(payload).toEqual([]);
  });

  it('envía la respuesta cuando está completa', () => {
    const q = makeQuestion();
    const payload = buildResponsesPayload('survey-1', flattened(q), { q1: COMPLETE });

    expect(payload).toEqual([
      { surveyId: 'survey-1', questionId: 'q1', optionId: 'u-min', numericValue: 45 },
    ]);
  });

  it('una respuesta incompleta no arrastra al resto del lote', () => {
    const rota = makeQuestion({ questionId: 'q1' });
    const buena = makeQuestion({ questionId: 'q2', typeName: 'open_text' });
    const payload = buildResponsesPayload(
      'survey-1',
      [...flattened(rota), ...flattened(buena)],
      { q1: NUMBER_ONLY, q2: { questionId: 'q2', textValue: 'respuesta válida' } },
    );

    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ questionId: 'q2' });
  });
});

describe('spec87 / CA-2, CA-4 — tope de altura del bloque de seleccionadas', () => {
  it('el tope equivale a 2 filas de chips más su separación', () => {
    // 2 filas de 32 px con 8 px de separación entre ellas.
    expect(resolveSelectedChipsMaxHeight({ rowHeight: 32, gap: 8, maxRows: 2 })).toBe(72);
  });

  it('CA-4: con fuente grande el tope crece con la fila, no recorta filas', () => {
    const normal = resolveSelectedChipsMaxHeight({ rowHeight: 32, gap: 8, maxRows: 2 });
    const grande = resolveSelectedChipsMaxHeight({ rowHeight: 48, gap: 8, maxRows: 2 });

    expect(grande).toBeGreaterThan(normal);
    // Sigue cabiendo el mismo número de filas completas, sin cortar ninguna.
    expect(grande).toBe(104);
  });

  it('una sola fila no suma separación', () => {
    expect(resolveSelectedChipsMaxHeight({ rowHeight: 32, gap: 8, maxRows: 1 })).toBe(32);
  });

  it('nunca devuelve un valor no positivo', () => {
    expect(resolveSelectedChipsMaxHeight({ rowHeight: 0, gap: 8, maxRows: 2 })).toBeGreaterThan(0);
    expect(resolveSelectedChipsMaxHeight({ rowHeight: 32, gap: 8, maxRows: 0 })).toBeGreaterThan(0);
  });
});

describe('spec87 / CA-15 — se distinguen los envíos atascados por esta causa', () => {
  const BACKEND_ERROR = 'numeric_with_unit questions require both numericValue and optionId';

  it('reconoce el error exacto que devuelve el backend', () => {
    expect(isNumericUnitValidationError(BACKEND_ERROR)).toBe(true);
  });

  it('no confunde otros errores de validación', () => {
    expect(isNumericUnitValidationError('Unprocessable entity')).toBe(false);
    expect(isNumericUnitValidationError('Forbidden')).toBe(false);
    expect(isNumericUnitValidationError(undefined)).toBe(false);
    expect(isNumericUnitValidationError(null)).toBe(false);
  });

  it('da al encuestador un texto que dice qué hacer, y solo para esta causa', () => {
    expect(describeNumericUnitRecovery(BACKEND_ERROR)).toMatch(/Reintentar/);
    expect(describeNumericUnitRecovery('Forbidden')).toBeNull();
  });
});

describe('spec87 / D7 (opción B) — no se pierde el valor descartado', () => {
  const flattened = (...questions: InstrumentQuestion[]) =>
    questions.map((question) => ({ sectionId: 's1', sectionName: 'Sección', question }));

  beforeEach(() => {
    for (const k of Object.keys(mockFiles)) delete mockFiles[k];
  });

  it('localiza el número que se iba a descartar, con su pregunta', () => {
    const q = makeQuestion({ text: 'Tiempo hasta la finca' });
    const found = findIncompleteNumericUnitAnswers(flattened(q), { q1: NUMBER_ONLY });

    expect(found).toEqual([
      {
        questionId: 'q1',
        questionText: 'Tiempo hasta la finca',
        numericValue: 45,
        unitText: undefined,
        missing: 'unit',
      },
    ]);
    expect(describeDiscardedValue(found[0])).toBe('45 (sin unidad)');
  });

  it('localiza también la unidad suelta sin número', () => {
    const found = findIncompleteNumericUnitAnswers(flattened(makeQuestion()), { q1: UNIT_ONLY });

    expect(found[0]).toMatchObject({ missing: 'number', unitText: 'Minutos' });
    expect(describeDiscardedValue(found[0])).toBe('Minutos (sin valor)');
  });

  it('no reporta respuestas completas, vacías ni de otros tipos', () => {
    const otra = makeQuestion({ questionId: 'q2', typeName: 'open_text' });
    const found = findIncompleteNumericUnitAnswers(flattened(makeQuestion(), otra), {
      q1: COMPLETE,
      q2: { questionId: 'q2', textValue: 'hola' },
    });
    expect(found).toEqual([]);
    expect(findIncompleteNumericUnitAnswers(flattened(makeQuestion()), {})).toEqual([]);
  });

  it('guarda lo descartado y lo devuelve al listar', async () => {
    const q = makeQuestion({ text: 'Tiempo hasta la finca' });
    const items = findIncompleteNumericUnitAnswers(flattened(q), { q1: NUMBER_ONLY });

    await discardedAnswersStorage.record('local_survey_1', 'real-survey-1', items);
    const listed = await discardedAnswersStorage.list();

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      localSurveyId: 'local_survey_1',
      surveyId: 'real-survey-1',
      questionId: 'q1',
      numericValue: 45,
    });
    expect(typeof listed[0].discardedAt).toBe('string');
  });

  it('un reintento no duplica el registro de la misma encuesta y pregunta', async () => {
    const items = findIncompleteNumericUnitAnswers(flattened(makeQuestion()), { q1: NUMBER_ONLY });

    await discardedAnswersStorage.record('local_survey_1', 'real-survey-1', items);
    await discardedAnswersStorage.record('local_survey_1', 'real-survey-1', items);

    expect(await discardedAnswersStorage.list()).toHaveLength(1);
  });

  it('limpiar vacía la lista', async () => {
    const items = findIncompleteNumericUnitAnswers(flattened(makeQuestion()), { q1: NUMBER_ONLY });
    await discardedAnswersStorage.record('local_survey_1', 'real-survey-1', items);

    await discardedAnswersStorage.clear();

    expect(await discardedAnswersStorage.list()).toEqual([]);
  });

  it('un archivo corrupto no rompe: se lee como vacío', async () => {
    mockFiles['file:///mock-documents/discarded-answers.json'] = '{no-es-json';
    expect(await discardedAnswersStorage.list()).toEqual([]);
  });
});
