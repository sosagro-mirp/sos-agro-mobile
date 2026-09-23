/**
 * Spec 92 — Encuestas realizadas: el encuestador ve en la app las encuestas
 * que aplicó y sus respuestas.
 *
 * Cubre la parte de lógica pura de los criterios 8, 10 y 11 de
 * `spec/92_encuestas_realizadas_mobile.md` (decisiones D6 y D7 incluidas).
 * La pestaña, el modo local ante fallas, el filtro por encuestador y
 * «Cambio de app» (criterios 7, 9 y 12) se verifican en la ronda manual
 * `docs/testing/test-092-encuestas-realizadas.md`; `listFinished` se prueba
 * aparte en `surveyDraftStore.test.ts` (Fase 3b).
 *
 * Escrito en rojo antes de crear `src/lib/mergeCompletedSurveys.ts`,
 * `src/lib/buildReadOnlyAnswers.ts` y `src/lib/groupRemoteResponses.ts`: hoy
 * falla entero porque esos módulos todavía no existen.
 */

import {
  mergeCompletedSurveys,
  type LocalFinishedSurvey,
} from '../lib/mergeCompletedSurveys';
import { buildReadOnlyAnswers } from '../lib/buildReadOnlyAnswers';
import { groupRemoteResponses } from '../lib/groupRemoteResponses';
import type {
  InstrumentDraftAnswer,
  InstrumentQuestion,
  InstrumentResponse,
  MySurveyItem,
  RemoteSurveyResponseRow,
} from '../types';

// ─── fixtures ────────────────────────────────────────────────────────────────

const local = (
  over: Partial<LocalFinishedSurvey> & Pick<LocalFinishedSurvey, 'surveyId'>,
): LocalFinishedSurvey => ({
  backendSurveyId: null,
  status: 'completed',
  syncFailed: false,
  instrumentName: 'Bloque 1',
  farmerName: 'Ana Pérez',
  farmerDocumentId: '1001',
  createdAt: '2026-09-20T10:00:00.000Z',
  responseCount: 5,
  ...over,
});

const remote = (
  over: Partial<MySurveyItem> & Pick<MySurveyItem, 'surveyId'>,
): MySurveyItem => ({
  clientSurveyId: null,
  instrumentName: 'Bloque 1',
  campaignName: null,
  farmer: { farmerId: 'farmer-1', name: 'Ana Pérez' },
  responseCount: 5,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:05:00.000Z',
  ...over,
});

const keyOf = (i: { backendSurveyId: string | null; localSurveyId: string | null }) =>
  i.backendSurveyId ?? i.localSurveyId;

const question = (
  over: Partial<InstrumentQuestion> & Pick<InstrumentQuestion, 'questionId'>,
): InstrumentQuestion => ({
  text: `Pregunta ${over.questionId}`,
  isRequired: false,
  order: 1,
  type: { typeId: 't', name: 'open_text' },
  options: [],
  ...over,
});

const instrument: InstrumentResponse = {
  instrumentId: 'inst-1',
  name: 'Bloque 1',
  version: 1,
  publishDate: '2026-09-01',
  isActive: true,
  sections: [
    {
      sectionId: 's1',
      name: 'Datos generales',
      order: 1,
      questions: [
        question({ questionId: 'q-text', order: 1, text: '¿Nombre de la finca?' }),
        question({
          questionId: 'q-yesno',
          order: 2,
          text: '¿Tiene riego?',
          type: { typeId: 't', name: 'yes_no' },
        }),
        question({
          questionId: 'q-cond',
          order: 3,
          text: '¿Qué tipo de riego?',
          conditionQuestionId: 'q-yesno',
          conditionValue: 'true',
        }),
        question({
          questionId: 'q-unanswered',
          order: 4,
          text: 'Observaciones',
        }),
      ],
    },
    {
      sectionId: 's2',
      name: 'Cultivos',
      order: 2,
      questions: [
        question({
          questionId: 'q-single',
          order: 1,
          text: 'Cultivo principal',
          type: { typeId: 't', name: 'single_choice' },
          options: [
            { optionId: 'o-cafe', text: 'Café', value: 'cafe' },
            { optionId: 'o-otro', text: 'Otro', value: 'otro', isOther: true },
          ],
        }),
        question({
          questionId: 'q-multi',
          order: 2,
          text: 'Dispositivos',
          type: { typeId: 't', name: 'multiple_choice' },
          options: [
            { optionId: 'o-cel', text: 'Celular', value: 'cel' },
            { optionId: 'o-pc', text: 'Computador', value: 'pc' },
            { optionId: 'o-tab', text: 'Tableta', value: 'tab' },
          ],
        }),
        question({
          questionId: 'q-multi-other',
          order: 3,
          text: 'Canales de venta',
          type: { typeId: 't', name: 'multiple_choice' },
          options: [
            { optionId: 'o-coop', text: 'Cooperativa', value: 'coop' },
            { optionId: 'o-motro', text: 'Otro', value: 'otro', isOther: true },
          ],
        }),
        question({
          questionId: 'q-unit',
          order: 4,
          text: 'Área sembrada',
          type: { typeId: 't', name: 'numeric_with_unit' },
          options: [{ optionId: 'o-ha', text: 'ha', value: 'ha' }],
        }),
        question({
          questionId: 'q-photo',
          order: 5,
          text: 'Foto del cultivo',
          type: { typeId: 't', name: 'image' },
        }),
        question({
          questionId: 'q-audio',
          order: 6,
          text: 'Descripción en voz',
          type: { typeId: 't', name: 'voice_recording' },
        }),
      ],
    },
  ],
};

const answers: Record<string, InstrumentDraftAnswer> = {
  'q-text': { questionId: 'q-text', textValue: 'La Esperanza' },
  'q-yesno': { questionId: 'q-yesno', booleanValue: false },
  // q-cond no aplica (riego = No) aunque haya quedado una respuesta vieja
  'q-cond': { questionId: 'q-cond', textValue: 'Goteo' },
  'q-single': { questionId: 'q-single', optionId: 'o-otro', otherText: 'Aguacate' },
  'q-multi': { questionId: 'q-multi', optionIds: ['o-cel', 'o-tab'] },
  'q-multi-other': {
    questionId: 'q-multi-other',
    optionIds: ['o-coop', 'o-motro'],
    otherText: 'Feria local',
  },
  'q-unit': { questionId: 'q-unit', numericValue: 2.5, optionId: 'o-ha' },
  'q-photo': {
    questionId: 'q-photo',
    mediaLocalPath: 'file:///media/images/a.jpg',
    mimeType: 'image/jpeg',
  },
};

let rowSeq = 0;
const row = (
  over: Partial<RemoteSurveyResponseRow> &
    Pick<RemoteSurveyResponseRow, 'questionId' | 'questionType'>,
): RemoteSurveyResponseRow => ({
  responseId: `r-${over.questionId}-${rowSeq++}`,
  questionText: `Pregunta ${over.questionId}`,
  sectionId: 'sec-1',
  sectionTitle: 'Datos generales',
  sectionOrder: 1,
  textValue: null,
  numericValue: null,
  booleanValue: null,
  optionText: null,
  hasAttachment: false,
  ...over,
});

const findRow = (
  sections: ReturnType<typeof buildReadOnlyAnswers>,
  questionId: string,
) => sections.flatMap((s) => s.rows).find((r) => r.questionId === questionId);

// ─── Criterio 8 — combinación de fuentes ─────────────────────────────────────

describe('mergeCompletedSurveys — fuentes y deduplicación', () => {
  it('en modo local (remote = null) muestra solo lo local con su estado de envío', () => {
    const items = mergeCompletedSurveys({
      local: [
        local({ surveyId: 'local_a', status: 'completed' }),
        local({ surveyId: 'local_b', status: 'synced', backendSurveyId: 'srv-b' }),
      ],
      remote: null,
    });
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.localSurveyId === 'local_a')!.sendStatus).toBe('pending');
    expect(items.find((i) => i.localSurveyId === 'local_b')!.sendStatus).toBe('sent');
  });

  it('marca «failed» una local cuya entrada de cola quedó en failed_validation', () => {
    const items = mergeCompletedSurveys({
      local: [local({ surveyId: 'local_err', status: 'completed', syncFailed: true })],
      remote: [],
    });
    expect(items[0].sendStatus).toBe('failed');
  });

  it('en modo remoto suma las del servidor y las locales aún no enviadas', () => {
    const items = mergeCompletedSurveys({
      local: [local({ surveyId: 'local_pending', status: 'completed' })],
      remote: [remote({ surveyId: 'srv-1' }), remote({ surveyId: 'srv-2' })],
    });
    expect(items.map(keyOf).sort()).toEqual(['local_pending', 'srv-1', 'srv-2'].sort());
    expect(items.find((i) => i.localSurveyId === 'local_pending')!.sendStatus).toBe(
      'pending',
    );
  });

  it('no duplica una encuesta que está local y en el servidor (por backendSurveyId)', () => {
    const items = mergeCompletedSurveys({
      local: [local({ surveyId: 'local_x', status: 'synced', backendSurveyId: 'srv-x' })],
      remote: [remote({ surveyId: 'srv-x' })],
    });
    expect(items).toHaveLength(1);
    expect(items[0].backendSurveyId).toBe('srv-x');
    // conserva el id local para poder abrir el detalle sin conexión
    expect(items[0].localSurveyId).toBe('local_x');
    expect(items[0].sendStatus).toBe('sent');
  });

  it('no duplica por clientSurveyId y respeta que la local aún no terminó de enviarse', () => {
    const items = mergeCompletedSurveys({
      local: [local({ surveyId: 'local_survey_y', status: 'completed' })],
      remote: [remote({ surveyId: 'srv-y', clientSurveyId: 'local_survey_y' })],
    });
    expect(items).toHaveLength(1);
    expect(items[0].backendSurveyId).toBe('srv-y');
    expect(items[0].localSurveyId).toBe('local_survey_y');
    expect(items[0].sendStatus).toBe('pending');
  });

  it('en modo remoto, una local ya enviada que no está en las páginas cargadas no agrega fila', () => {
    // El servidor es la autoridad: aparecerá cuando se cargue su página.
    const items = mergeCompletedSurveys({
      local: [local({ surveyId: 'local_old', status: 'synced', backendSurveyId: 'srv-old' })],
      remote: [remote({ surveyId: 'srv-new' })],
    });
    expect(items.map((i) => i.backendSurveyId)).toEqual(['srv-new']);
  });

  it('deduplica sobre el acumulado de páginas cuando una página se corrió (D7)', () => {
    // Llegó una encuesta nueva entre la página 1 y la 2: srv-2 se repite.
    const page1 = [remote({ surveyId: 'srv-1' }), remote({ surveyId: 'srv-2' })];
    const page2 = [remote({ surveyId: 'srv-2' }), remote({ surveyId: 'srv-3' })];
    const items = mergeCompletedSurveys({ local: [], remote: [...page1, ...page2] });
    expect(items.map(keyOf).sort()).toEqual(['srv-1', 'srv-2', 'srv-3']);
  });

  it('usa el nombre del productor del servidor y deja null si no se conoce', () => {
    const items = mergeCompletedSurveys({
      local: [local({ surveyId: 'l-nofarmer', farmerName: null })],
      remote: [remote({ surveyId: 's-farmer', farmer: { farmerId: 'f', name: 'Luis' } })],
    });
    expect(items.find((i) => i.backendSurveyId === 's-farmer')!.farmerName).toBe('Luis');
    expect(items.find((i) => i.localSurveyId === 'l-nofarmer')!.farmerName).toBeNull();
  });

  it('deja instrumentName en null si el instrumento salió de la caché', () => {
    const items = mergeCompletedSurveys({
      local: [local({ surveyId: 'l-noinst', instrumentName: null })],
      remote: null,
    });
    expect(items[0].instrumentName).toBeNull();
  });
});

describe('mergeCompletedSurveys — fecha y orden (D6)', () => {
  it('si la encuesta está en el dispositivo, usa la fecha local de aplicación', () => {
    const items = mergeCompletedSurveys({
      local: [
        local({
          surveyId: 'local_z',
          status: 'synced',
          backendSurveyId: 'srv-z',
          createdAt: '2026-09-18T09:00:00.000Z', // aplicada sin conexión
        }),
      ],
      remote: [remote({ surveyId: 'srv-z', createdAt: '2026-09-21T15:00:00.000Z' })], // sincronizada
    });
    expect(items[0].date).toBe('2026-09-18T09:00:00.000Z');
    expect(items[0].dateSource).toBe('local');
  });

  it('una encuesta que viene solo del servidor usa la fecha de recepción', () => {
    const items = mergeCompletedSurveys({
      local: [],
      remote: [remote({ surveyId: 'srv-web', createdAt: '2026-09-21T15:00:00.000Z' })],
    });
    expect(items[0].date).toBe('2026-09-21T15:00:00.000Z');
    expect(items[0].dateSource).toBe('server');
  });

  it('ordena de la más reciente a la más antigua según la fecha mostrada', () => {
    const items = mergeCompletedSurveys({
      local: [
        local({ surveyId: 'l1', createdAt: '2026-09-22T08:00:00.000Z' }),
        local({
          surveyId: 'l-old',
          status: 'synced',
          backendSurveyId: 's-late-sync',
          createdAt: '2026-09-19T08:00:00.000Z',
        }),
      ],
      remote: [
        remote({ surveyId: 's1', createdAt: '2026-09-21T08:00:00.000Z' }),
        remote({ surveyId: 's2', createdAt: '2026-09-23T08:00:00.000Z' }),
        // sincronizada el 24, pero aplicada el 19 → va al final
        remote({ surveyId: 's-late-sync', createdAt: '2026-09-24T08:00:00.000Z' }),
      ],
    });
    expect(items.map(keyOf)).toEqual(['s2', 'l1', 's1', 's-late-sync']);
  });
});

describe('mergeCompletedSurveys — búsqueda', () => {
  const localItems = [
    local({ surveyId: 'l-ana', farmerName: 'Ana Pérez', farmerDocumentId: '1001' }),
    local({ surveyId: 'l-luis', farmerName: 'Luis Gómez', farmerDocumentId: '2002' }),
  ];

  it('filtra las locales por nombre, sin distinguir mayúsculas ni tildes', () => {
    const items = mergeCompletedSurveys({ local: localItems, remote: null, search: 'perez' });
    expect(items.map((i) => i.localSurveyId)).toEqual(['l-ana']);
  });

  it('filtra las locales por documento', () => {
    const items = mergeCompletedSurveys({ local: localItems, remote: null, search: '2002' });
    expect(items.map((i) => i.localSurveyId)).toEqual(['l-luis']);
  });

  it('una búsqueda vacía o de espacios no filtra', () => {
    const items = mergeCompletedSurveys({ local: localItems, remote: null, search: '  ' });
    expect(items).toHaveLength(2);
  });
});

// ─── Criterio 10 — detalle desde datos locales ───────────────────────────────

describe('buildReadOnlyAnswers', () => {
  const sections = buildReadOnlyAnswers(instrument, answers);

  it('agrupa por sección en el orden del instrumento', () => {
    expect(sections.map((s) => s.title)).toEqual(['Datos generales', 'Cultivos']);
  });

  it('usa el texto de la pregunta', () => {
    expect(findRow(sections, 'q-text')!.questionText).toBe('¿Nombre de la finca?');
    expect(findRow(sections, 'q-text')!.display).toBe('La Esperanza');
  });

  it('muestra Sí/No en preguntas yes_no', () => {
    expect(findRow(sections, 'q-yesno')!.display).toBe('No');
  });

  it('oculta las preguntas que no aplicaron por su condición', () => {
    expect(findRow(sections, 'q-cond')).toBeUndefined();
  });

  it('marca como «Sin respuesta» una pregunta visible que no se respondió', () => {
    expect(findRow(sections, 'q-unanswered')!.display).toBe('Sin respuesta');
  });

  it('muestra «Otro: …» con el texto escrito', () => {
    expect(findRow(sections, 'q-single')!.display).toBe('Otro: Aguacate');
  });

  it('muestra la selección múltiple en una sola fila con los textos de las opciones', () => {
    const rows = sections.flatMap((s) => s.rows).filter((r) => r.questionId === 'q-multi');
    expect(rows).toHaveLength(1);
    expect(rows[0].display).toBe('Celular, Tableta');
  });

  it('muestra «Otro: …» dentro de una selección múltiple', () => {
    expect(findRow(sections, 'q-multi-other')!.display).toBe(
      'Cooperativa, Otro: Feria local',
    );
  });

  it('muestra el número con su unidad', () => {
    expect(findRow(sections, 'q-unit')!.display).toBe('2.5 ha');
  });

  it('muestra la multimedia como indicador, sin exponer la ruta del archivo', () => {
    const photo = findRow(sections, 'q-photo')!;
    expect(photo.kind).toBe('media');
    expect(photo.display).toBe('Foto capturada');
    expect(JSON.stringify(photo)).not.toContain('file://');
  });

  it('indica cuando una pregunta multimedia no tiene evidencia', () => {
    const audio = findRow(sections, 'q-audio')!;
    expect(audio.kind).toBe('media');
    expect(audio.display).toBe('Sin evidencia capturada');
  });

  it('no falla si una opción ya no existe en el instrumento', () => {
    const s = buildReadOnlyAnswers(instrument, {
      'q-single': { questionId: 'q-single', optionId: 'o-borrada' },
    });
    expect(findRow(s, 'q-single')!.display).toBe('Opción no disponible');
  });
});

// ─── Criterio 10 — detalle desde el servidor ─────────────────────────────────

describe('groupRemoteResponses', () => {
  it('agrupa por sectionId y ordena las secciones por sectionOrder', () => {
    const sections = groupRemoteResponses([
      row({ questionId: 'b', questionType: 'open_text', sectionId: 'sec-2', sectionTitle: 'Dos', sectionOrder: 2, textValue: 'y' }),
      row({ questionId: 'a', questionType: 'open_text', sectionId: 'sec-1', sectionTitle: 'Uno', sectionOrder: 1, textValue: 'x' }),
      row({ questionId: 'c', questionType: 'open_text', sectionId: 'sec-1', sectionTitle: 'Uno', sectionOrder: 1, textValue: 'z' }),
    ]);
    expect(sections.map((s) => s.title)).toEqual(['Uno', 'Dos']);
    expect(sections[0].rows.map((r) => r.questionId)).toEqual(['a', 'c']);
  });

  it('no fusiona dos secciones distintas que comparten nombre', () => {
    const sections = groupRemoteResponses([
      row({ questionId: 'a', questionType: 'open_text', sectionId: 'sec-1', sectionTitle: 'Generales', sectionOrder: 1, textValue: 'x' }),
      row({ questionId: 'b', questionType: 'open_text', sectionId: 'sec-9', sectionTitle: 'Generales', sectionOrder: 3, textValue: 'y' }),
    ]);
    expect(sections).toHaveLength(2);
  });

  it('fusiona en una fila las respuestas de selección múltiple (una fila por opción en el backend)', () => {
    const sections = groupRemoteResponses([
      row({ questionId: 'm', questionType: 'multiple_choice', optionText: 'Celular' }),
      row({ questionId: 'm', questionType: 'multiple_choice', optionText: 'Tableta' }),
    ]);
    const rows = sections.flatMap((s) => s.rows);
    expect(rows).toHaveLength(1);
    expect(rows[0].display).toBe('Celular, Tableta');
  });

  it('formatea yes_no, numéricos con unidad y opciones', () => {
    const rows = groupRemoteResponses([
      row({ questionId: 'yn', questionType: 'yes_no', booleanValue: true }),
      row({ questionId: 'u', questionType: 'numeric_with_unit', numericValue: 3, optionText: 'ha' }),
      row({ questionId: 'sc', questionType: 'single_choice', optionText: 'Café' }),
    ]).flatMap((s) => s.rows);
    expect(rows.find((r) => r.questionId === 'yn')!.display).toBe('Sí');
    expect(rows.find((r) => r.questionId === 'u')!.display).toBe('3 ha');
    expect(rows.find((r) => r.questionId === 'sc')!.display).toBe('Café');
  });

  it('muestra el texto escrito en «Otro» tal como lo guarda el servidor, sin prefijo', () => {
    // resolveOtherOptions convierte lo escrito en una opción dinámica.
    const rows = groupRemoteResponses([
      row({ questionId: 'sc', questionType: 'single_choice', optionText: 'Aguacate' }),
    ]).flatMap((s) => s.rows);
    expect(rows[0].display).toBe('Aguacate');
  });

  it('muestra la multimedia como indicador según hasAttachment', () => {
    const rows = groupRemoteResponses([
      row({ questionId: 'img', questionType: 'image', hasAttachment: true }),
      row({ questionId: 'voz', questionType: 'voice_recording', hasAttachment: false }),
      row({ questionId: 'doc', questionType: 'document', hasAttachment: true }),
      row({ questionId: 'vid', questionType: 'video', hasAttachment: true }),
    ]).flatMap((s) => s.rows);
    expect(rows.find((r) => r.questionId === 'img')!.display).toBe('Foto capturada');
    expect(rows.find((r) => r.questionId === 'voz')!.display).toBe('Sin evidencia capturada');
    expect(rows.find((r) => r.questionId === 'doc')!.display).toBe('Documento adjunto');
    expect(rows.find((r) => r.questionId === 'vid')!.display).toBe('Video grabado');
    for (const r of rows) expect(r.kind).toBe('media');
  });
});
