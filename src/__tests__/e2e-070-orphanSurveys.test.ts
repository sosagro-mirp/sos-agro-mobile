/**
 * Spec 70 — Encuestas huérfanas vacías por creación anticipada del registro.
 *
 * ESTAS PRUEBAS NACEN EN ROJO. Describen el comportamiento objetivo del spec,
 * no el actual. Se ponen en verde con la implementación de las fases 1 a 3.
 *
 * Cubren dos de los tres vectores de la causa raíz (el tercero, la inyección
 * S1/S2 del orchestrator, vive en una pantalla y se cubre manualmente en
 * `docs/testing/test-070-encuestas-huerfanas.md`, TC-070-01/03):
 *
 *   Vector 1 — `beginSurvey()` (Fases 1 y 2): iniciar un instrumento nunca
 *   crea la fila en el backend, y dos disparos concurrentes producen un solo
 *   borrador.
 *
 *   Vector 2 — `SyncQueueService.processEntry()` (Fase 3): una entrada cuyo
 *   payload resulta vacío NO se materializa en el backend.
 *
 * Nota sobre `beginSurvey`: el módulo `../lib/beginSurvey` todavía no existe
 * (lo crea la Fase 1). Se carga con `require()` dentro de un helper a
 * propósito: así el archivo falla como TEST en rojo en vez de romper
 * `pnpm typecheck` para todo el repositorio por un módulo inexistente.
 * Al implementar la Fase 1, sustituir el helper por un import normal.
 */

// ─── Mock declarations (hoisted before imports) ───────────────────────────────

jest.mock('../storage/syncQueue', () => ({
  syncQueueStorage: {
    dequeueNextPending: jest.fn(),
    markInFlight: jest.fn(),
    markSynced: jest.fn(),
    markFailedValidation: jest.fn(),
    incrementAttempts: jest.fn(),
    getPendingBySurveyId: jest.fn(),
    getActiveBySurveyId: jest.fn(),
    resetInFlightToRetry: jest.fn(),
  },
}));

jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: {
    createDraft: jest.fn(),
    loadDraft: jest.fn(),
    markSynced: jest.fn(),
    setBackendSurveyId: jest.fn(),
    getBackendSurveyId: jest.fn(),
  },
}));

jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: { get: jest.fn() },
}));

jest.mock('../api/responses', () => ({
  submitResponsesBatch: jest.fn(),
}));

jest.mock('../api/surveys', () => ({
  markSurveyAsSynced: jest.fn(),
  createSurvey: jest.fn(),
}));

jest.mock('../api/campaignSessions', () => ({
  markSessionAsSynced: jest.fn(),
  createCampaignSession: jest.fn(),
}));

jest.mock('../api/farmers', () => ({
  extractFarmer: jest.fn(),
  extractCrops: jest.fn(),
}));

jest.mock('../storage/sessionCropsStorage', () => ({
  sessionCropsStorage: {
    save: jest.fn(),
    get: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../storage/db/db', () => ({
  db: {
    update: jest.fn(() => ({
      set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
    })),
  },
}));

jest.mock('../store/useSyncStatusStore', () => ({
  useSyncStatusStore: { getState: jest.fn() },
}));

jest.mock('../lib/flattenSections', () => ({ flattenSections: jest.fn() }));

jest.mock('../lib/buildResponsesPayload', () => ({
  buildResponsesPayload: jest.fn(),
}));

jest.mock('../storage/pendingSessions', () => ({
  pendingSessionStorage: {
    listPending: jest.fn().mockResolvedValue([]),
    resolve: jest.fn(),
    markFailed: jest.fn(),
  },
}));

jest.mock('../storage/farmerCache', () => ({
  farmerCacheStorage: {
    listRecent: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../lib/cacheFarmerIdentity', () => ({
  cacheFarmerIdentity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../storage/changeRequestStorage', () => ({
  changeRequestStorage: {
    listPendingSync: jest.fn().mockResolvedValue([]),
    markSynced: jest.fn().mockResolvedValue(undefined),
    markResolved: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../api/changeRequests', () => ({
  postChangeRequest: jest.fn().mockResolvedValue(undefined),
  fetchMyResolved: jest.fn().mockResolvedValue([]),
}));

jest.mock('../store/useChangeRequestStore', () => ({
  useChangeRequestStore: {
    getState: jest.fn().mockReturnValue({
      loadAll: jest.fn().mockResolvedValue(undefined),
      setHasNewResolved: jest.fn(),
    }),
  },
}));

jest.mock('../store/useCampaignSessionStore', () => ({
  useCampaignSessionStore: {
    getState: jest.fn().mockReturnValue({
      localSessionId: null,
      localFarmerId: null,
      resolveSession: jest.fn(),
      resolveFarmer: jest.fn(),
    }),
  },
}));

jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));

jest.mock('../sync/MediaUploadService', () => ({
  MediaUploadService: { processPendingForSurvey: jest.fn().mockResolvedValue({}) },
}));

// ─── Import SUT and mocked modules ───────────────────────────────────────────

import { SyncQueueService } from '../sync/SyncQueueService';
import { syncQueueStorage } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { submitResponsesBatch } from '../api/responses';
import { createSurvey, markSurveyAsSynced } from '../api/surveys';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { flattenSections } from '../lib/flattenSections';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import { isLocalId } from '../lib/isLocalId';

// ─── Typed mock aliases ───────────────────────────────────────────────────────

const mockDequeueNextPending = syncQueueStorage.dequeueNextPending as jest.Mock;
const mockMarkInFlight = syncQueueStorage.markInFlight as jest.Mock;
const mockMarkSynced = syncQueueStorage.markSynced as jest.Mock;
const mockMarkFailedValidation = syncQueueStorage.markFailedValidation as jest.Mock;
const mockIncrementAttempts = syncQueueStorage.incrementAttempts as jest.Mock;

const mockCreateDraft = surveyDraftStore.createDraft as jest.Mock;
const mockLoadDraft = surveyDraftStore.loadDraft as jest.Mock;
const mockMarkSyncedDraft = surveyDraftStore.markSynced as jest.Mock;
const mockSetBackendSurveyId = surveyDraftStore.setBackendSurveyId as jest.Mock;
const mockGetBackendSurveyId = surveyDraftStore.getBackendSurveyId as jest.Mock;

const mockInstrumentCacheGet = instrumentCacheStorage.get as jest.Mock;
const mockSubmitResponsesBatch = submitResponsesBatch as jest.Mock;
const mockCreateSurvey = createSurvey as jest.Mock;
const mockMarkSurveyAsSynced = markSurveyAsSynced as jest.Mock;
const mockFlattenSections = flattenSections as jest.Mock;
const mockBuildResponsesPayload = buildResponsesPayload as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface BeginSurveyParams {
  instrumentId: string;
  campaignSessionId?: string;
  farmerId?: string;
  stepOrder?: number;
}

/**
 * Carga diferida de `../lib/beginSurvey` (Fase 1 del spec 70). Ver la nota de
 * la cabecera: se usa `require()` para que la ausencia del módulo se manifieste
 * como fallo de prueba y no como error de compilación de todo el repositorio.
 */
function beginSurvey(params: BeginSurveyParams): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../lib/beginSurvey') as {
    beginSurvey: (p: BeginSurveyParams) => Promise<string>;
  };
  return mod.beginSurvey(params);
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-070',
    surveyId: 'local_survey_11111111-1111-4111-8111-111111111111',
    campaignSessionId: 'session-070',
    stepOrder: 1,
    attempts: 0,
    status: 'pending' as const,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    surveyId: 'local_survey_11111111-1111-4111-8111-111111111111',
    instrumentId: 'inst-070',
    campaignSessionId: 'session-070',
    answers: {},
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeInstrument(overrides: Record<string, unknown> = {}) {
  return {
    instrumentId: 'inst-070',
    sections: [{ sectionId: 's1', name: 'Sección 1', order: 1, questions: [] }],
    ...overrides,
  };
}

// ─── Test isolation ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  SyncQueueService.resetNetworkFailures();

  (useSyncStatusStore.getState as jest.Mock).mockReturnValue({
    setSyncingId: jest.fn(),
    markSyncCompleted: jest.fn(),
    refreshPendingCount: jest.fn().mockResolvedValue(undefined),
  });

  mockDequeueNextPending.mockResolvedValue(null);
  mockMarkInFlight.mockResolvedValue(undefined);
  mockMarkSynced.mockResolvedValue(undefined);
  mockMarkFailedValidation.mockResolvedValue(undefined);
  mockIncrementAttempts.mockResolvedValue(undefined);

  mockCreateDraft.mockResolvedValue(undefined);
  mockLoadDraft.mockResolvedValue(null);
  mockMarkSyncedDraft.mockResolvedValue(undefined);
  mockSetBackendSurveyId.mockResolvedValue(undefined);
  mockGetBackendSurveyId.mockResolvedValue(null);

  mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
  mockSubmitResponsesBatch.mockResolvedValue(undefined);
  mockMarkSurveyAsSynced.mockResolvedValue(undefined);
  mockCreateSurvey.mockResolvedValue({ surveyId: 'real-survey-070' });
  mockFlattenSections.mockReturnValue([]);
  mockBuildResponsesPayload.mockReturnValue([]);
});

// ─── Vector 1 — beginSurvey: creación diferida e idempotente ──────────────────

describe('spec-070 — beginSurvey: el registro no se crea antes de la primera respuesta', () => {
  it('TC-070-A · nunca llama a POST /api/surveys al iniciar el instrumento, aunque haya conexión', async () => {
    const surveyId = await beginSurvey({
      instrumentId: 'inst-070',
      campaignSessionId: 'session-070',
      stepOrder: 1,
    });

    expect(mockCreateSurvey).not.toHaveBeenCalled();
    expect(isLocalId(surveyId)).toBe(true);
  });

  it('TC-070-B · crea exactamente un borrador local por inicio de instrumento', async () => {
    await beginSurvey({
      instrumentId: 'inst-070',
      campaignSessionId: 'session-070',
      stepOrder: 1,
    });

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockCreateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentId: 'inst-070',
        campaignSessionId: 'session-070',
      }),
    );
  });

  it('TC-070-C · dos disparos concurrentes (doble toque en «Comenzar») producen un solo borrador', async () => {
    // Reproduce el patrón observado en producción: dos registros con `createdAt`
    // a 5 ms y 81 ms de distancia, imposible para un reingreso humano.
    const params = {
      instrumentId: 'inst-070',
      campaignSessionId: 'session-070',
      stepOrder: 1,
    };

    const [first, second] = await Promise.all([
      beginSurvey(params),
      beginSurvey(params),
    ]);

    expect(first).toBe(second);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockCreateSurvey).not.toHaveBeenCalled();
  });

  it('TC-070-D · dos pasos distintos de la misma sesión sí producen borradores distintos', async () => {
    const a = await beginSurvey({
      instrumentId: 'inst-070',
      campaignSessionId: 'session-070',
      stepOrder: 1,
    });
    const b = await beginSurvey({
      instrumentId: 'inst-071',
      campaignSessionId: 'session-070',
      stepOrder: 2,
    });

    expect(a).not.toBe(b);
    expect(mockCreateDraft).toHaveBeenCalledTimes(2);
  });
});

// ─── Vector 2 — SyncQueueService: no materializar sin respuestas ──────────────

describe('spec-070 — SyncQueueService: una encuesta sin respuestas no llega al backend', () => {
  it('TC-070-E · payload vacío ⇒ no se llama a POST /api/surveys (no se materializa)', async () => {
    mockDequeueNextPending.mockResolvedValueOnce(makeEntry()).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft({ answers: {} }));
    mockBuildResponsesPayload.mockReturnValue([]);

    await SyncQueueService.processAll();

    // Hoy `processEntry` materializa ANTES de construir el payload
    // (SyncQueueService.ts:233-247), así que esta expectativa falla en rojo:
    // la fila vacía queda creada en el backend para siempre.
    expect(mockCreateSurvey).not.toHaveBeenCalled();
    expect(mockSubmitResponsesBatch).not.toHaveBeenCalled();
    expect(mockSetBackendSurveyId).not.toHaveBeenCalled();
  });

  it('TC-070-F · payload vacío ⇒ tampoco se marca sincronizada en el backend', async () => {
    mockDequeueNextPending.mockResolvedValueOnce(makeEntry()).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft({ answers: {} }));
    mockBuildResponsesPayload.mockReturnValue([]);

    await SyncQueueService.processAll();

    expect(mockMarkSurveyAsSynced).not.toHaveBeenCalled();
    // La entrada sí se cierra localmente: no debe quedar reintentándose para
    // siempre una encuesta que nunca tuvo contenido.
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-070');
  });

  it('TC-070-G · payload con respuestas ⇒ sí materializa, envía y marca sincronizada (regresión)', async () => {
    mockDequeueNextPending.mockResolvedValueOnce(makeEntry()).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(
      makeDraft({ answers: { q1: { questionId: 'q1', textValue: 'sí' } } }),
    );
    mockFlattenSections.mockReturnValue([{ question: { questionId: 'q1' } }]);
    mockBuildResponsesPayload.mockReturnValue([
      { surveyId: 'real-survey-070', questionId: 'q1', textValue: 'sí' },
    ]);

    await SyncQueueService.processAll();

    expect(mockCreateSurvey).toHaveBeenCalledTimes(1);
    expect(mockSubmitResponsesBatch).toHaveBeenCalledTimes(1);
    expect(mockMarkSurveyAsSynced).toHaveBeenCalledWith('real-survey-070');
    expect(mockSetBackendSurveyId).toHaveBeenCalledWith(
      'local_survey_11111111-1111-4111-8111-111111111111',
      'real-survey-070',
    );
  });

  it('TC-070-H · una encuesta ya materializada en un intento previo no se materializa dos veces', async () => {
    mockDequeueNextPending.mockResolvedValueOnce(makeEntry({ attempts: 1 })).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(
      makeDraft({ answers: { q1: { questionId: 'q1', textValue: 'sí' } } }),
    );
    mockGetBackendSurveyId.mockResolvedValue('real-survey-070');
    mockFlattenSections.mockReturnValue([{ question: { questionId: 'q1' } }]);
    mockBuildResponsesPayload.mockReturnValue([
      { surveyId: 'real-survey-070', questionId: 'q1', textValue: 'sí' },
    ]);

    await SyncQueueService.processAll();

    expect(mockCreateSurvey).not.toHaveBeenCalled();
    expect(mockSubmitResponsesBatch).toHaveBeenCalledTimes(1);
  });
});
