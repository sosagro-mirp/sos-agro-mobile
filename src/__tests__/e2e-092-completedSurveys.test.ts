/**
 * Spec 92 — Encuestas realizadas: el encuestador ve en la app las encuestas
 * que aplicó y sus respuestas.
 *
 * Cubre la parte de lógica pura de los criterios de aceptación 8, 10 y 11 de
 * `spec/92_encuestas_realizadas_mobile.md` (Fase 3a). La lista y el detalle
 * en pantalla (Fase 4, bloqueada por el spec 86) y `listFinished` (Fase 3b,
 * también bloqueada) se prueban por separado cuando se implementen.
 *
 * Escrito en rojo antes de crear `mergeCompletedSurveys.ts`,
 * `buildReadOnlyAnswers.ts` y `groupRemoteResponses.ts`: hoy falla entero
 * porque esos módulos todavía no existen.
 */

import { mergeCompletedSurveys, type LocalFinishedSurvey } from "../lib/mergeCompletedSurveys";
import { buildReadOnlyAnswers } from "../lib/buildReadOnlyAnswers";
import { groupRemoteResponses } from "../lib/groupRemoteResponses";
import type {
  InstrumentDraftAnswer,
  InstrumentSection,
  MySurveyItem,
  RemoteSurveyResponseRow,
} from "../types";

// ─── Criterio 8: combinación remoto + local, sin duplicados, orden y badge ───

describe("mergeCompletedSurveys", () => {
  const remoteItem = (overrides: Partial<MySurveyItem> = {}): MySurveyItem => ({
    surveyId: "survey-remote-1",
    clientSurveyId: null,
    instrumentName: "Caracterización de café",
    campaignName: "Campaña Huila 2026",
    farmer: { farmerId: "farmer-1", name: "Ana Pérez" },
    responseCount: 5,
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  });

  const localItem = (overrides: Partial<LocalFinishedSurvey> = {}): LocalFinishedSurvey => ({
    clientSurveyId: "local_survey_1",
    backendSurveyId: null,
    status: "completed",
    syncFailed: false,
    farmerName: "Ana Pérez",
    farmerDocumentId: "3525017",
    instrumentName: "Caracterización de café",
    responseCount: 5,
    createdAt: "2026-09-22T08:00:00.000Z",
    ...overrides,
  });

  it("agrega el servidor y la local no enviada, sin duplicar, y ordena por fecha desc", () => {
    const remote = [remoteItem({ surveyId: "survey-a", createdAt: "2026-09-18T00:00:00.000Z" })];
    const local = [localItem({ clientSurveyId: "local_survey_2", backendSurveyId: null, createdAt: "2026-09-22T00:00:00.000Z" })];

    const result = mergeCompletedSurveys(remote, local);

    expect(result).toHaveLength(2);
    expect(result[0].clientSurveyId).toBe("local_survey_2");
    expect(result[0].submissionStatus).toBe("pending");
    expect(result[1].surveyId).toBe("survey-a");
    expect(result[1].submissionStatus).toBe("sent");
  });

  it("no duplica al acumular varias páginas del servidor", () => {
    const page1 = [remoteItem({ surveyId: "survey-a" })];
    const page2 = [remoteItem({ surveyId: "survey-a" }), remoteItem({ surveyId: "survey-b" })];
    const accumulated = [...page1, ...page2];

    const result = mergeCompletedSurveys(accumulated, []);

    expect(result.map((item) => item.surveyId).sort()).toEqual(["survey-a", "survey-b"]);
  });

  it("dedupe por clientSurveyId: una local completed que ya está en el servidor se muestra una sola vez, como pendiente", () => {
    const remote = [remoteItem({ surveyId: "survey-a", clientSurveyId: "local_survey_1" })];
    const local = [localItem({ clientSurveyId: "local_survey_1" })];

    const result = mergeCompletedSurveys(remote, local);

    expect(result).toHaveLength(1);
    expect(result[0].submissionStatus).toBe("pending");
    expect(result[0].dateSource).toBe("local");
    expect(result[0].date).toBe(local[0].createdAt);
  });

  it("dedupe por backendSurveyId cuando la local no trae clientSurveyId igual al del servidor", () => {
    const remote = [remoteItem({ surveyId: "survey-a", clientSurveyId: "otro_id_local" })];
    const local = [localItem({ clientSurveyId: "local_survey_1", backendSurveyId: "survey-a" })];

    const result = mergeCompletedSurveys(remote, local);

    expect(result).toHaveLength(1);
    expect(result[0].clientSurveyId).toBe("local_survey_1");
  });

  it("una local synced no agrega fila propia; solo aporta fecha y clientSurveyId a la fila del servidor", () => {
    const remote = [remoteItem({ surveyId: "survey-a", clientSurveyId: "local_survey_1", createdAt: "2026-09-20T00:00:00.000Z" })];
    const local = [localItem({ clientSurveyId: "local_survey_1", status: "synced", createdAt: "2026-09-19T00:00:00.000Z" })];

    const result = mergeCompletedSurveys(remote, local);

    expect(result).toHaveLength(1);
    expect(result[0].dateSource).toBe("local");
    expect(result[0].date).toBe("2026-09-19T00:00:00.000Z");
    expect(result[0].clientSurveyId).toBe("local_survey_1");
    expect(result[0].submissionStatus).toBe("sent");
  });

  it("una local synced sin fila del servidor en el acumulado no se agrega (el servidor es la autoridad)", () => {
    const local = [localItem({ status: "synced" })];

    const result = mergeCompletedSurveys([], local);

    expect(result).toHaveLength(0);
  });

  it("insignia de error de envío cuando syncFailed es true", () => {
    const local = [localItem({ syncFailed: true })];

    const result = mergeCompletedSurveys([], local);

    expect(result[0].submissionStatus).toBe("failed");
  });

  it("search filtra locales y remotas por nombre o documento, sin distinguir mayúsculas ni tildes", () => {
    const remote = [remoteItem({ surveyId: "survey-a", farmer: { farmerId: "f1", name: "José Andrés" } })];
    const local = [localItem({ clientSurveyId: "local_survey_2", farmerName: "María López", farmerDocumentId: "9999999" })];

    expect(mergeCompletedSurveys(remote, local, "jose andres")).toHaveLength(1);
    expect(mergeCompletedSurveys(remote, local, "MARIA")).toHaveLength(1);
    expect(mergeCompletedSurveys(remote, local, "9999999")).toHaveLength(1);
    expect(mergeCompletedSurveys(remote, local, "nadie")).toHaveLength(0);
  });
});

// ─── Criterio 10 (detalle local): buildReadOnlyAnswers ───────────────────────

describe("buildReadOnlyAnswers", () => {
  const sections: InstrumentSection[] = [
    {
      sectionId: "sec-2",
      name: "Producción",
      order: 2,
      questions: [
        {
          questionId: "q-multi",
          text: "¿Qué cultivos maneja?",
          isRequired: false,
          order: 1,
          type: { typeId: "t-multi", name: "multiple_choice" },
          options: [
            { optionId: "opt-cafe", text: "Café", value: "cafe" },
            { optionId: "opt-otro", text: "Otro", value: "otro", isOther: true },
          ],
        },
        {
          questionId: "q-media",
          text: "Foto del lote",
          isRequired: false,
          order: 2,
          type: { typeId: "t-image", name: "image" },
          options: [],
        },
      ],
    },
    {
      sectionId: "sec-1",
      name: "Identificación",
      order: 1,
      questions: [
        {
          questionId: "q-text",
          text: "Nombre del productor",
          isRequired: true,
          order: 1,
          type: { typeId: "t-text", name: "open_text" },
          options: [],
        },
        {
          questionId: "q-single-stale",
          text: "¿Tipo de finca?",
          isRequired: false,
          order: 2,
          type: { typeId: "t-single", name: "single_choice" },
          options: [{ optionId: "opt-vigente", text: "Vigente", value: "vigente" }],
        },
        {
          questionId: "q-condicional",
          text: "¿Cuál certificación?",
          isRequired: false,
          order: 3,
          type: { typeId: "t-text", name: "open_text" },
          options: [],
          conditionQuestionId: "q-single-stale",
          conditionValue: "opt-inexistente",
        },
      ],
    },
  ];

  it("agrupa por sección en el orden del instrumento, no en el orden de las preguntas", () => {
    const result = buildReadOnlyAnswers(sections, {});
    expect(result.map((section) => section.sectionId)).toEqual(["sec-1", "sec-2"]);
  });

  it("oculta las preguntas que no aplicaron", () => {
    const result = buildReadOnlyAnswers(sections, {});
    const seccion1 = result.find((section) => section.sectionId === "sec-1")!;
    expect(seccion1.rows.map((row) => row.questionId)).not.toContain("q-condicional");
  });

  it('una pregunta visible sin respuesta muestra "Sin respuesta"', () => {
    const result = buildReadOnlyAnswers(sections, {});
    const seccion1 = result.find((section) => section.sectionId === "sec-1")!;
    const fila = seccion1.rows.find((row) => row.questionId === "q-text")!;
    expect(fila.displayValue).toBe("Sin respuesta");
  });

  it('una opción que ya no existe en el instrumento muestra "Opción no disponible"', () => {
    const answers: Record<string, InstrumentDraftAnswer> = {
      "q-single-stale": { questionId: "q-single-stale", optionId: "opt-borrada" },
    };
    const result = buildReadOnlyAnswers(sections, answers);
    const seccion1 = result.find((section) => section.sectionId === "sec-1")!;
    const fila = seccion1.rows.find((row) => row.questionId === "q-single-stale")!;
    expect(fila.displayValue).toBe("Opción no disponible");
  });

  it('la selección múltiple ocupa una sola fila e incluye "Otro: …" con el texto escrito', () => {
    const answers: Record<string, InstrumentDraftAnswer> = {
      "q-multi": {
        questionId: "q-multi",
        optionIds: ["opt-cafe", "opt-otro"],
        otherText: "Cacao",
      },
    };
    const result = buildReadOnlyAnswers(sections, answers);
    const seccion2 = result.find((section) => section.sectionId === "sec-2")!;
    const filas = seccion2.rows.filter((row) => row.questionId === "q-multi");
    expect(filas).toHaveLength(1);
    expect(filas[0].displayValue).toBe("Café, Otro: Cacao");
  });

  it('la multimedia se muestra como indicador, sin abrir el archivo', () => {
    const conFoto = buildReadOnlyAnswers(sections, {
      "q-media": { questionId: "q-media", mediaLocalPath: "file:///foto.jpg" },
    });
    const sinFoto = buildReadOnlyAnswers(sections, {});

    const filaConFoto = conFoto.find((s) => s.sectionId === "sec-2")!.rows.find((r) => r.questionId === "q-media")!;
    const filaSinFoto = sinFoto.find((s) => s.sectionId === "sec-2")!.rows.find((r) => r.questionId === "q-media")!;

    expect(filaConFoto.displayValue).toBe("Foto capturada");
    expect(filaSinFoto.displayValue).toBe("Sin evidencia capturada");
    expect(filaConFoto.displayValue).not.toMatch(/file:|http/);
  });

  // Criterio 11 (contrato para la pantalla de detalle, Fase 4): sin
  // secciones ni respuestas locales, la función no falla — devuelve una
  // lista vacía en vez de lanzar, para que la pantalla pueda decidir mostrar
  // "El detalle de esta encuesta no está disponible sin conexión" cuando
  // tampoco haya datos remotos.
  it("no falla sin instrumento en caché: devuelve una lista vacía", () => {
    expect(buildReadOnlyAnswers([], {})).toEqual([]);
  });
});

// ─── Criterio 10 (detalle remoto): groupRemoteResponses ──────────────────────

describe("groupRemoteResponses", () => {
  const row = (overrides: Partial<RemoteSurveyResponseRow> = {}): RemoteSurveyResponseRow => ({
    responseId: "resp-1",
    questionId: "q-1",
    questionText: "¿Qué cultivos maneja?",
    questionType: "multiple_choice",
    sectionId: "sec-1",
    sectionTitle: "Producción",
    sectionOrder: 1,
    textValue: null,
    numericValue: null,
    booleanValue: null,
    optionText: null,
    hasAttachment: false,
    ...overrides,
  });

  it("agrupa por sectionId, ordenado por sectionOrder", () => {
    const rows = [
      row({ questionId: "q-2", sectionId: "sec-2", sectionOrder: 2, sectionTitle: "Identificación" }),
      row({ questionId: "q-1", sectionId: "sec-1", sectionOrder: 1 }),
    ];
    const result = groupRemoteResponses(rows);
    expect(result.map((s) => s.sectionId)).toEqual(["sec-1", "sec-2"]);
  });

  it("fusiona las filas de selección múltiple por questionId en una sola fila", () => {
    const rows = [
      row({ responseId: "r1", optionText: "Café" }),
      row({ responseId: "r2", optionText: "Cacao" }),
    ];
    const result = groupRemoteResponses(rows);
    expect(result[0].rows).toHaveLength(1);
    expect(result[0].rows[0].displayValue).toBe("Café, Cacao");
  });

  it('la opción "Otro" aparece con el texto escrito, sin el prefijo "Otro:"', () => {
    const rows = [row({ questionType: "single_choice", optionText: "Permacultura" })];
    const result = groupRemoteResponses(rows);
    expect(result[0].rows[0].displayValue).toBe("Permacultura");
    expect(result[0].rows[0].displayValue).not.toMatch(/^Otro:/);
  });

  it("la multimedia se muestra como indicador, sin abrir el archivo", () => {
    const conEvidencia = groupRemoteResponses([
      row({ questionType: "voice_recording", hasAttachment: true }),
    ]);
    const sinEvidencia = groupRemoteResponses([
      row({ questionType: "voice_recording", hasAttachment: false }),
    ]);

    expect(conEvidencia[0].rows[0].displayValue).toBe("Audio grabado");
    expect(sinEvidencia[0].rows[0].displayValue).toBe("Sin evidencia capturada");
  });

  it('una pregunta sin ninguna respuesta muestra "Sin respuesta"', () => {
    const result = groupRemoteResponses([row({ questionType: "open_text" })]);
    expect(result[0].rows[0].displayValue).toBe("Sin respuesta");
  });
});

// ─── Fase 4 — modo local y búsqueda con el servidor como filtro ──────────────

describe("mergeCompletedSurveys — opciones de la lista (Fase 4)", () => {
  const syncedLocal: LocalFinishedSurvey = {
    clientSurveyId: "local_synced",
    backendSurveyId: "srv-synced",
    status: "synced",
    syncFailed: false,
    farmerName: "Luis Gómez",
    farmerDocumentId: "2002",
    instrumentName: "Bloque 1",
    responseCount: 3,
    createdAt: "2026-09-19T08:00:00.000Z",
  };

  it("modo local: una local synced sí aporta fila propia, marcada como enviada", () => {
    const result = mergeCompletedSurveys([], [syncedLocal], undefined, { includeSyncedLocals: true });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      clientSurveyId: "local_synced",
      surveyId: "srv-synced",
      submissionStatus: "sent",
      dateSource: "local",
    });
  });

  it("modo remoto (por defecto): la misma local synced no agrega fila", () => {
    expect(mergeCompletedSurveys([], [syncedLocal])).toHaveLength(0);
  });

  it("remoteFiltered: no descarta una fila del servidor que coincidió por documento", () => {
    const remote: MySurveyItem[] = [
      {
        surveyId: "srv-doc",
        clientSurveyId: null,
        instrumentName: "Bloque 1",
        campaignName: null,
        farmer: { farmerId: "f-9", name: "Marta Ruiz" },
        responseCount: 2,
        createdAt: "2026-09-21T08:00:00.000Z",
        updatedAt: "2026-09-21T08:00:00.000Z",
      },
    ];

    // Buscar por documento: el servidor la devolvió, pero el nombre no contiene "9999".
    expect(mergeCompletedSurveys(remote, [], "9999")).toHaveLength(0);
    expect(mergeCompletedSurveys(remote, [], "9999", { remoteFiltered: true })).toHaveLength(1);
  });

  it("remoteFiltered: las locales sin fila del servidor sí se filtran por la búsqueda", () => {
    const pending: LocalFinishedSurvey = { ...syncedLocal, clientSurveyId: "local_p", status: "completed", backendSurveyId: null };

    expect(mergeCompletedSurveys([], [pending], "perez", { remoteFiltered: true })).toHaveLength(0);
    expect(mergeCompletedSurveys([], [pending], "gomez", { remoteFiltered: true })).toHaveLength(1);
  });
});

// ─── TC-092-04 (hallazgos de la ronda manual) ────────────────────────────────

describe("detalle — «Otro» ya sincronizado y número con unidad (TC-092-04)", () => {
  const mkQuestion = (over: Partial<InstrumentSection["questions"][number]>): InstrumentSection["questions"][number] => ({
    questionId: "q",
    text: "Pregunta",
    isRequired: false,
    order: 1,
    type: { typeId: "t", name: "open_text" },
    options: [],
    ...over,
  });
  const section = (questions: InstrumentSection["questions"]): InstrumentSection[] => [
    { sectionId: "s1", name: "Finca", order: 1, questions },
  ];

  it("una opción que ya no está en el instrumento, con el texto guardado, se muestra como «Otro: …»", () => {
    const sections = section([
      mkQuestion({
        questionId: "q-crop",
        type: { typeId: "t", name: "single_choice" },
        options: [{ optionId: "o-cafe", text: "Café" }, { optionId: "o-otro", text: "Otro", isOther: true }] as never,
      }),
    ]);
    // El servidor creó una opción nueva ("o-nueva") al sincronizar; no está en la caché.
    const result = buildReadOnlyAnswers(sections, { "q-crop": { questionId: "q-crop", optionId: "o-nueva", otherText: "Aguacate" } });
    expect(result[0].rows[0].displayValue).toBe("Otro: Aguacate");
  });

  it("sin texto guardado sigue mostrando «Opción no disponible»", () => {
    const sections = section([
      mkQuestion({ questionId: "q-crop", type: { typeId: "t", name: "single_choice" }, options: [{ optionId: "o-cafe", text: "Café" }] as never }),
    ]);
    const result = buildReadOnlyAnswers(sections, { "q-crop": { questionId: "q-crop", optionId: "o-nueva" } });
    expect(result[0].rows[0].displayValue).toBe("Opción no disponible");
  });

  it("selección múltiple: la opción conocida y el «Otro» resuelto van en una sola fila", () => {
    const sections = section([
      mkQuestion({
        questionId: "q-market",
        type: { typeId: "t", name: "multiple_choice" },
        options: [{ optionId: "o-coop", text: "Cooperativa" }, { optionId: "o-otro", text: "Otro", isOther: true }] as never,
      }),
    ]);
    const result = buildReadOnlyAnswers(sections, {
      "q-market": { questionId: "q-market", optionIds: ["o-coop", "o-nueva"], otherText: "Feria local" },
    });
    expect(result[0].rows[0].displayValue).toBe("Cooperativa, Otro: Feria local");
  });

  it("numeric_with_unit muestra el valor con su unidad", () => {
    const sections = section([
      mkQuestion({
        questionId: "q-area",
        type: { typeId: "t", name: "numeric_with_unit" },
        options: [{ optionId: "u-ha", text: "Hectáreas" }, { optionId: "u-m2", text: "Metros cuadrados" }] as never,
      }),
    ]);
    const result = buildReadOnlyAnswers(sections, { "q-area": { questionId: "q-area", numericValue: 2.5, optionId: "u-ha" } });
    expect(result[0].rows[0].displayValue).toBe("2.5 Hectáreas");
  });

  it("groupRemoteResponses: numeric_with_unit del servidor muestra valor y unidad", () => {
    const rows: RemoteSurveyResponseRow[] = [
      {
        responseId: "r1",
        questionId: "q-area",
        questionText: "¿Cuál es el área sembrada?",
        questionType: "numeric_with_unit",
        sectionId: "s1",
        sectionTitle: "Finca",
        sectionOrder: 1,
        textValue: null,
        numericValue: 2.5,
        booleanValue: null,
        optionText: "Hectáreas",
        hasAttachment: false,
      },
    ];
    expect(groupRemoteResponses(rows)[0].rows[0].displayValue).toBe("2.5 Hectáreas");
  });
});

describe("buildReadOnlyAnswers — varias opciones desconocidas en una selección múltiple", () => {
  it("el texto de «Otro» se asigna a una sola opción; la otra desconocida no lo hereda", () => {
    const sections: InstrumentSection[] = [
      {
        sectionId: "s1",
        name: "Finca",
        order: 1,
        questions: [
          {
            questionId: "q-market",
            text: "¿Dónde comercializa?",
            isRequired: false,
            order: 1,
            type: { typeId: "t", name: "multiple_choice" },
            options: [{ optionId: "o-coop", text: "Cooperativa" }, { optionId: "o-otro", text: "Otro", isOther: true }] as never,
          },
        ],
      },
    ];
    const result = buildReadOnlyAnswers(sections, {
      "q-market": { questionId: "q-market", optionIds: ["o-coop", "o-archivada", "o-nueva"], otherText: "Feria local" },
    });
    expect(result[0].rows[0].displayValue).toBe("Cooperativa, Otro: Feria local, Opción no disponible");
  });
});

// ─── Spec 89 — «Otros» guarda su texto en la respuesta (textValue) ───────────

describe("groupRemoteResponses con el formato del spec 89", () => {
  const row = (over: Partial<RemoteSurveyResponseRow>): RemoteSurveyResponseRow => ({
    responseId: "r",
    questionId: "q-crop",
    questionText: "¿Qué cultivo principal tiene?",
    questionType: "single_choice",
    sectionId: "s1",
    sectionTitle: "Finca",
    sectionOrder: 1,
    textValue: null,
    numericValue: null,
    booleanValue: null,
    optionText: null,
    hasAttachment: false,
    ...over,
  });

  it("la fila de «Otros» muestra el texto escrito (textValue), no el nombre de la opción", () => {
    const sections = groupRemoteResponses([row({ optionText: "Otro", textValue: "Aguacate" })]);
    expect(sections[0].rows[0].displayValue).toBe("Aguacate");
  });

  it("selección múltiple: la opción normal y el texto de «Otros» van en una sola fila", () => {
    const sections = groupRemoteResponses([
      row({ responseId: "r1", questionId: "q-m", questionType: "multiple_choice", optionText: "Cooperativa" }),
      row({ responseId: "r2", questionId: "q-m", questionType: "multiple_choice", optionText: "Otro", textValue: "Feria local" }),
    ]);
    expect(sections[0].rows[0].displayValue).toBe("Cooperativa, Feria local");
  });

  it("«Otros» sin texto conserva el nombre de la opción", () => {
    const sections = groupRemoteResponses([row({ optionText: "Otro", textValue: "   " })]);
    expect(sections[0].rows[0].displayValue).toBe("Otro");
  });
});
