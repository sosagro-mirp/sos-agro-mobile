/**
 * Spec 86 — la opción "Otros" guarda el texto personalizado en la propia
 * respuesta (fila de la opción isOther, campo textValue). La app ya no crea
 * opciones nuevas en el instrumento durante la sincronización.
 *
 * ESTAS PRUEBAS NACEN EN ROJO: hoy buildResponsesPayload descarta otherText
 * (lo resolvía resolveOtherOptions creando una opción vía
 * POST /api/questions/:id/options) y endpoints.questionOptions sigue existiendo.
 */

import * as fs from 'fs';
import * as path from 'path';
import { endpoints } from '../api/endpoints';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import type {
  FlattenedQuestionItem,
  InstrumentDraftAnswer,
  InstrumentQuestion,
} from '../types';

// ─── fixtures ────────────────────────────────────────────────────────────────

function makeQuestion(
  questionId: string,
  typeName: 'multiple_choice' | 'single_choice',
): InstrumentQuestion {
  return {
    questionId,
    text: `Pregunta ${questionId}`,
    isRequired: true,
    order: 1,
    type: { typeId: `t-${typeName}`, name: typeName },
    options: [
      { optionId: `${questionId}-a`, text: 'Café', value: 1 },
      { optionId: `${questionId}-b`, text: 'Cacao', value: 2 },
      { optionId: `${questionId}-other`, text: 'Otros', value: 99, isOther: true },
    ],
    conditionQuestionId: null,
    conditionValue: null,
  };
}

const qMulti = makeQuestion('qm', 'multiple_choice');
const qSingle = makeQuestion('qs', 'single_choice');

const flattened: FlattenedQuestionItem[] = [
  { sectionId: 's1', sectionName: 'S1', sectionOrder: 1, question: qMulti },
  { sectionId: 's1', sectionName: 'S1', sectionOrder: 1, question: qSingle },
];

// ─── criterio 15: payload ────────────────────────────────────────────────────

describe('spec-086 · buildResponsesPayload con "Otros"', () => {
  it('TC-086-M1 · multiple_choice: la fila isOther lleva el texto recortado y las demás no', () => {
    const answers: Record<string, InstrumentDraftAnswer> = {
      qm: { questionId: 'qm', optionIds: ['qm-a', 'qm-other'], otherText: '  Arroz  ' },
    };

    const payload = buildResponsesPayload('survey-1', flattened, answers);

    expect(payload).toHaveLength(2);
    expect(payload).toEqual(
      expect.arrayContaining([
        { surveyId: 'survey-1', questionId: 'qm', optionId: 'qm-a' },
        { surveyId: 'survey-1', questionId: 'qm', optionId: 'qm-other', textValue: 'Arroz' },
      ]),
    );
    const cafeRow = payload.find((p) => p.optionId === 'qm-a');
    expect(cafeRow).not.toHaveProperty('textValue');
    expect(cafeRow).not.toHaveProperty('otherText');
  });

  it('TC-086-M2 · single_choice: conserva el optionId de Otros y lleva el texto, sin otherText', () => {
    const answers: Record<string, InstrumentDraftAnswer> = {
      qs: { questionId: 'qs', optionId: 'qs-other', otherText: 'Aljibe' },
    };

    const payload = buildResponsesPayload('survey-1', flattened, answers);

    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      surveyId: 'survey-1',
      questionId: 'qs',
      optionId: 'qs-other',
      textValue: 'Aljibe',
    });
    expect(payload[0]).not.toHaveProperty('otherText');
  });

  it('TC-086-M3 · no envía textValue si Otros no está seleccionado aunque quede texto residual', () => {
    const answers: Record<string, InstrumentDraftAnswer> = {
      qm: { questionId: 'qm', optionIds: ['qm-b'], otherText: 'residuo' },
    };

    expect(buildResponsesPayload('survey-1', flattened, answers)).toEqual([
      { surveyId: 'survey-1', questionId: 'qm', optionId: 'qm-b' },
    ]);
  });

  it('TC-086-M4 · un borrador ya resuelto por una versión vieja (id dinámico, sin texto) se envía tal cual', () => {
    // El backend normaliza este id a la opción "Otros" (spec 86, criterio 10).
    const answers: Record<string, InstrumentDraftAnswer> = {
      qm: { questionId: 'qm', optionIds: ['qm-a', 'legacy-dynamic-id'] },
    };

    expect(buildResponsesPayload('survey-1', flattened, answers)).toEqual([
      { surveyId: 'survey-1', questionId: 'qm', optionId: 'qm-a' },
      { surveyId: 'survey-1', questionId: 'qm', optionId: 'legacy-dynamic-id' },
    ]);
  });
});

// ─── criterio 15: la app ya no crea opciones ─────────────────────────────────

describe('spec-086 · la app no expone la creación de opciones', () => {
  it('TC-086-M5 · endpoints no incluye questionOptions', () => {
    expect(endpoints).not.toHaveProperty('questionOptions');
  });

  it('TC-086-M6 · resolveOtherOptions ya no existe y SyncQueueService no lo usa', () => {
    const libFile = path.resolve(__dirname, '../lib/resolveOtherOptions.ts');
    const syncFile = path.resolve(__dirname, '../sync/SyncQueueService.ts');

    expect(fs.existsSync(libFile)).toBe(false);
    const syncSource = fs.readFileSync(syncFile, 'utf8');
    expect(syncSource).not.toMatch(/resolveOtherOptions|createQuestionOption/);
  });
});
