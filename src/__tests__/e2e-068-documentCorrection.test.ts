/**
 * Spec 68, Fase 8 — "Corregir el documento" surte efecto (criterio 9).
 *
 * Cubre la secuencia que ningún test recorría y que la ronda manual del
 * 2026-08-24 encontró rota (`TC-068-02`):
 *
 *   completed.tsx → reset() → orquestador → colisión → corregir documento
 *
 * Los dos defectos que verifica:
 *
 *  A) **Navegación.** `completed.tsx` llama a `reset()` antes de navegar al
 *     orquestador, así que para cuando aparece el aviso el store de la encuesta
 *     ya no tiene `instrumentId`. El guard de `app/instrument/[id]/question/
 *     [index].tsx` compara ese valor con el `id` de la ruta y, al no coincidir,
 *     expulsaba a la pestaña de campañas perdiendo la entrevista. El handler
 *     tiene que rehidratar el store desde el borrador antes de navegar.
 *
 *  B) **Propagación.** Para ese punto S1a ya está sincronizada, y
 *     `ResponsesService.createMany()` ignora por diseño un batch cuya encuesta
 *     ya tiene respuestas: reenviarla no lleva la corrección a ningún lado. El
 *     documento corregido tiene que viajar como `correctedDocumentId` en el
 *     siguiente `extractFarmer()`.
 */

jest.mock('../api/httpClient', () => {
  class ServerError extends Error {
    status: number;
    body?: unknown;
    constructor(status: number, message: string, body?: unknown) {
      super(message);
      this.name = 'ServerError';
      this.status = status;
      this.body = body;
    }
  }
  class NetworkError extends Error {
    constructor(message = 'Sin conexión a internet') {
      super(message);
      this.name = 'NetworkError';
    }
  }
  return {
    ServerError,
    NetworkError,
    httpClient: { get: jest.fn(), post: jest.fn() },
  };
});

jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: {
    loadDraft: jest.fn(),
    saveAnswer: jest.fn(),
    saveMultipleAnswers: jest.fn(),
    markCompleted: jest.fn(),
  },
}));

jest.mock('../storage/syncQueue', () => ({
  syncQueueStorage: { enqueue: jest.fn() },
}));

jest.mock('../sync/SyncQueueService', () => ({
  SyncQueueService: { processAll: jest.fn() },
}));

import { extractFarmer } from '../api/farmers';
import { httpClient } from '../api/httpClient';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { useInstrumentSurveyStore } from '../store/useInstrumentSurveyStore';
import type { InstrumentSection } from '../types';

const mockPost = httpClient.post as jest.Mock;

const S1A_INSTRUMENT_ID = 'instrumento-s1a-0068';
const S1_SURVEY_ID = 'local_survey_0068';
const Q_NOMBRE = 'q-nombre-0068';
const Q_DOCUMENTO = 'q-documento-0068';

const DOCUMENTO_MAL_DIGITADO = '9068000010';
const DOCUMENTO_CORREGIDO = '9068000011';
const NOMBRE_DIGITADO = 'Karol Vanessa Quintero Marin';

/** S1a-like: nombre + documento, ambos con systemField. */
const SECCIONES: InstrumentSection[] = [
  {
    sectionId: 'sec-0068',
    name: 'Identificación',
    order: 1,
    questions: [
      {
        questionId: Q_NOMBRE,
        text: 'Nombre completo',
        order: 1,
        isRequired: true,
        systemField: 'farmer.name',
        type: 'open_text',
        options: [],
      },
      {
        questionId: Q_DOCUMENTO,
        text: 'Documento de identidad',
        order: 2,
        isRequired: true,
        systemField: 'farmer.documentId',
        type: 'open_text',
        options: [],
      },
    ],
  },
] as unknown as InstrumentSection[];

const RESPUESTAS_DIGITADAS = {
  [Q_NOMBRE]: { questionId: Q_NOMBRE, textValue: NOMBRE_DIGITADO },
  [Q_DOCUMENTO]: { questionId: Q_DOCUMENTO, textValue: DOCUMENTO_MAL_DIGITADO },
};

beforeEach(() => {
  jest.clearAllMocks();
  useCampaignSessionStore.getState().reset();
  useInstrumentSurveyStore.getState().reset();
});

// ─── Defecto A: la rehidratación es lo que evita la expulsión ────────────────

describe('spec68 Fase 8 — rehidratación del store de S1a', () => {
  it('tras el reset() de completed.tsx el guard de la pantalla de pregunta no reconocería el instrumento', () => {
    useInstrumentSurveyStore.getState().initializeSurvey({
      surveyId: S1_SURVEY_ID,
      instrumentId: S1A_INSTRUMENT_ID,
      instrumentName: 'S1a Identificación',
      sections: SECCIONES,
    });

    // Lo que hace `completed.tsx:28` antes de navegar al orquestador.
    useInstrumentSurveyStore.getState().reset();

    // Esta es exactamente la comparación del guard: null !== id → replace a
    // la pestaña de campañas, que es el fallo reportado en TC-068-02.
    expect(useInstrumentSurveyStore.getState().instrumentId).not.toBe(
      S1A_INSTRUMENT_ID,
    );
  });

  it('rehidratar desde el borrador devuelve el instrumento y las respuestas ya digitadas', () => {
    useInstrumentSurveyStore.getState().initializeSurvey({
      surveyId: S1_SURVEY_ID,
      instrumentId: S1A_INSTRUMENT_ID,
      instrumentName: 'S1a Identificación',
      sections: SECCIONES,
    });
    useInstrumentSurveyStore.getState().reset();

    // Lo que hace `handleCorrectDocument()` antes del push, con el borrador
    // que sigue en SQLite.
    useInstrumentSurveyStore.getState().initializeSurvey({
      surveyId: S1_SURVEY_ID,
      instrumentId: S1A_INSTRUMENT_ID,
      instrumentName: 'S1a Identificación',
      sections: SECCIONES,
      restoredAnswers: RESPUESTAS_DIGITADAS,
    });

    const state = useInstrumentSurveyStore.getState();
    expect(state.instrumentId).toBe(S1A_INSTRUMENT_ID);
    expect(state.answers[Q_DOCUMENTO]?.textValue).toBe(DOCUMENTO_MAL_DIGITADO);
    // Criterio 9: la entrevista no se pierde.
    expect(state.answers[Q_NOMBRE]?.textValue).toBe(NOMBRE_DIGITADO);
  });

  it('la pregunta del documento se localiza por systemField, no por índice fijo', () => {
    useInstrumentSurveyStore.getState().initializeSurvey({
      surveyId: S1_SURVEY_ID,
      instrumentId: S1A_INSTRUMENT_ID,
      instrumentName: 'S1a Identificación',
      sections: SECCIONES,
      restoredAnswers: RESPUESTAS_DIGITADAS,
    });

    const index = useInstrumentSurveyStore
      .getState()
      .visibleQuestions()
      .findIndex(({ question }) => question.systemField === 'farmer.documentId');

    expect(index).toBeGreaterThanOrEqual(0);
  });
});

// ─── El modo corrección vive en el store de sesión ───────────────────────────

describe('spec68 Fase 8 — modo corrección en la sesión de campaña', () => {
  it('se activa apuntando a la pregunta del documento de S1a', () => {
    useCampaignSessionStore
      .getState()
      .startDocumentCorrection(S1A_INSTRUMENT_ID, Q_DOCUMENTO);

    expect(useCampaignSessionStore.getState().documentCorrection).toEqual({
      instrumentId: S1A_INSTRUMENT_ID,
      questionId: Q_DOCUMENTO,
    });
  });

  it('al confirmar, cierra el modo y deja el documento pendiente de enviar', () => {
    const store = useCampaignSessionStore.getState();
    store.startDocumentCorrection(S1A_INSTRUMENT_ID, Q_DOCUMENTO);
    store.applyDocumentCorrection(DOCUMENTO_CORREGIDO);

    const state = useCampaignSessionStore.getState();
    // El modo se cierra: la pantalla de pregunta vuelve a su flujo normal.
    expect(state.documentCorrection).toBeNull();
    expect(state.pendingCorrectedDocumentId).toBe(DOCUMENTO_CORREGIDO);
  });

  it('el documento pendiente se limpia una vez enviado', () => {
    const store = useCampaignSessionStore.getState();
    store.applyDocumentCorrection(DOCUMENTO_CORREGIDO);
    store.clearPendingCorrectedDocumentId();

    expect(
      useCampaignSessionStore.getState().pendingCorrectedDocumentId,
    ).toBeNull();
  });

  it('abandonar la sesión no deja el modo corrección colgado', () => {
    const store = useCampaignSessionStore.getState();
    store.startDocumentCorrection(S1A_INSTRUMENT_ID, Q_DOCUMENTO);
    store.reset();

    expect(useCampaignSessionStore.getState().documentCorrection).toBeNull();
    expect(
      useCampaignSessionStore.getState().pendingCorrectedDocumentId,
    ).toBeNull();
  });
});

// ─── Defecto B: la corrección tiene que viajar al backend ────────────────────

describe('spec68 Fase 8 — el documento corregido llega al backend', () => {
  it('viaja como correctedDocumentId en el cuerpo de extract-farmer', async () => {
    mockPost.mockResolvedValue({
      farmer: {
        id: 'f-0068',
        name: NOMBRE_DIGITADO,
        documentId: DOCUMENTO_CORREGIDO,
      },
      existed: false,
    });

    await extractFarmer('survey-0068', {
      correctedDocumentId: DOCUMENTO_CORREGIDO,
    });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining('survey-0068'),
      expect.objectContaining({ correctedDocumentId: DOCUMENTO_CORREGIDO }),
    );
  });

  it('sin corrección no ensucia el cuerpo con el campo', async () => {
    mockPost.mockResolvedValue({
      farmer: { id: 'f-0068', name: NOMBRE_DIGITADO, documentId: DOCUMENTO_MAL_DIGITADO },
      existed: false,
    });

    await extractFarmer('survey-0068');

    const body = mockPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.correctedDocumentId).toBeUndefined();
  });

  it('puede combinarse con una resolución explícita sin pisarla', async () => {
    mockPost.mockResolvedValue({
      farmer: { id: 'f-0068', name: NOMBRE_DIGITADO, documentId: DOCUMENTO_CORREGIDO },
      existed: false,
    });

    await extractFarmer('survey-0068', {
      resolution: 'separate_person',
      correctedDocumentId: DOCUMENTO_CORREGIDO,
    });

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining('survey-0068'),
      expect.objectContaining({
        resolution: 'separate_person',
        correctedDocumentId: DOCUMENTO_CORREGIDO,
      }),
    );
  });
});
