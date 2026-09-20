/**
 * Spec 84 — Instrumento de Registro del productor (S_REG).
 *
 * Cubre la parte verificable en unitario de los criterios 5 y 6 de
 * `spec/84_depuracion_instrumentos_y_registro_productor.md`:
 *   - resolución del código S_REG y de los alias heredados;
 *   - elección entre el flujo de Registro y el flujo S1/S2;
 *   - sincronización: un borrador de Registro extrae productor y luego
 *     cultivos sobre la misma encuesta; S1a y S1b siguen como antes.
 * Los flujos en pantalla (online, offline, consentimiento, pasos por cultivo)
 * viven en `docs/testing/test-084-depuracion-instrumentos-registro.md`.
 *
 * ARRANCA EN ROJO, a propósito:
 *   - `resolveRegistrationFlowCode` no existe en `instrumentCodeAliases` (Fase 5).
 *   - `src/lib/registrationFlow.ts` no existe (Fase 5).
 *   - `SyncQueueService` ignora borradores cuyo instrumento es `S_REG` (Fase 5).
 */

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

// Spec 86 — la sync procesa por dueño con el token guardado de cada uno: estas
// suites simulan una sesión activa con token para que `processAll()` corra.
jest.mock('../storage/secureStorage', () => ({
  secureStorage: {
    getActiveUserId: jest.fn().mockResolvedValue('user-1'),
    getTokenFor: jest.fn().mockResolvedValue('token-1'),
  },
}));

jest.mock('../storage/syncQueue', () => ({
  syncQueueStorage: {
    dequeueNextPending: jest.fn(),
    // Spec 86 — sin dueño (registros anteriores): se procesan con la sesión activa.
    listPendingOwners: jest.fn().mockResolvedValue([null]),
    markInFlight: jest.fn(),
    markSynced: jest.fn(),
    markFailedValidation: jest.fn(),
    incrementAttempts: jest.fn(),
    getPendingBySurveyId: jest.fn(),
    getActiveBySurveyId: jest.fn(),
    resetInFlightToRetry: jest.fn(),
    resetInFlightToRetryBySurveyId: jest.fn(),
  },
}));

jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: { loadDraft: jest.fn(), markSynced: jest.fn() },
}));

jest.mock('../storage/farmPlotStore', () => ({
  farmPlotStore: { loadDraft: jest.fn(), markSynced: jest.fn() },
}));

jest.mock('../api/farmPlots', () => ({ createFarmPlot: jest.fn() }));

jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: { get: jest.fn() },
}));

jest.mock('../api/responses', () => ({ submitResponsesBatch: jest.fn() }));

jest.mock('../api/surveys', () => ({
  markSurveyAsSynced: jest.fn(),
  createSurvey: jest.fn(),
  skipStepApi: jest.fn(),
}));

jest.mock('../api/campaignSessions', () => ({
  markSessionAsSynced: jest.fn(),
  createCampaignSession: jest.fn(),
}));

jest.mock('../api/farmers', () => {
  const actual = jest.requireActual('../api/farmers');
  return {
    extractFarmer: jest.fn(),
    extractCrops: jest.fn(),
    DocumentIdCollisionError: actual.DocumentIdCollisionError,
  };
});

jest.mock('../storage/sessionCropsStorage', () => ({
  sessionCropsStorage: { save: jest.fn(), get: jest.fn().mockResolvedValue([]) },
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
jest.mock('../lib/buildResponsesPayload', () => ({ buildResponsesPayload: jest.fn() }));

jest.mock('../storage/pendingSessions', () => ({
  pendingSessionStorage: {
    listPending: jest.fn().mockResolvedValue([]),
    getByLocal: jest.fn(),
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

// ─── SUT e imports ───────────────────────────────────────────────────────────

import { SyncQueueService } from '../sync/SyncQueueService';
import { syncQueueStorage } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { submitResponsesBatch } from '../api/responses';
import { markSurveyAsSynced } from '../api/surveys';
import { markSessionAsSynced } from '../api/campaignSessions';
import { extractFarmer, extractCrops, DocumentIdCollisionError } from '../api/farmers';
import { sessionCropsStorage } from '../storage/sessionCropsStorage';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { flattenSections } from '../lib/flattenSections';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';

// Fase 5 — hoy no existen y el archivo no compila.
import { resolveRegistrationFlowCode } from '../lib/instrumentCodeAliases';
import { chooseRegistrationFlow } from '../lib/registrationFlow';

const mockDequeueNextPending = syncQueueStorage.dequeueNextPending as jest.Mock;
const mockMarkSynced = syncQueueStorage.markSynced as jest.Mock;
const mockMarkFailedValidation = syncQueueStorage.markFailedValidation as jest.Mock;
const mockLoadDraft = surveyDraftStore.loadDraft as jest.Mock;
const mockInstrumentCacheGet = instrumentCacheStorage.get as jest.Mock;
const mockExtractFarmer = extractFarmer as jest.Mock;
const mockExtractCrops = extractCrops as jest.Mock;
const mockSessionCropsSave = sessionCropsStorage.save as jest.Mock;
const mockBuildResponsesPayload = buildResponsesPayload as jest.Mock;

const CAFE = { cropId: '06ef9f9c-a91f-4680-af1c-ff0d4d501234', name: 'Café' };

function makeEntry() {
  return {
    id: 'entry-1',
    surveyId: 'survey-1',
    campaignSessionId: 'session-1',
    attempts: 0,
    status: 'pending' as const,
    createdAt: new Date(),
  };
}

function makeDraft(instrumentId: string) {
  return {
    surveyId: 'survey-1',
    instrumentId,
    answers: { q1: { questionId: 'q1', textValue: 'answer' } },
    updatedAt: new Date(),
  };
}

function givenQueuedDraftOf(code: string) {
  mockDequeueNextPending.mockResolvedValueOnce(makeEntry()).mockResolvedValue(null);
  mockLoadDraft.mockResolvedValue(makeDraft(`inst-${code}`));
  mockInstrumentCacheGet.mockResolvedValue({
    instrumentId: `inst-${code}`,
    code,
    sections: [{ sectionId: 's1', name: 'Section 1', order: 1, questions: [] }],
  });
  mockBuildResponsesPayload.mockReturnValue([
    { surveyId: 'survey-1', questionId: 'q1', textValue: 'x' },
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  SyncQueueService.resetNetworkFailures();
  (useSyncStatusStore.getState as jest.Mock).mockReturnValue({
    setSyncingId: jest.fn(),
    markSyncCompleted: jest.fn(),
    refreshPendingCount: jest.fn().mockResolvedValue(undefined),
  });
  mockDequeueNextPending.mockResolvedValue(null);
  (syncQueueStorage.markInFlight as jest.Mock).mockResolvedValue(undefined);
  mockMarkSynced.mockResolvedValue(undefined);
  (surveyDraftStore.markSynced as jest.Mock).mockResolvedValue(undefined);
  (markSurveyAsSynced as jest.Mock).mockResolvedValue(undefined);
  (markSessionAsSynced as jest.Mock).mockResolvedValue(undefined);
  (submitResponsesBatch as jest.Mock).mockResolvedValue(undefined);
  (flattenSections as jest.Mock).mockReturnValue([]);
  mockSessionCropsSave.mockResolvedValue(undefined);
  mockExtractFarmer.mockResolvedValue({
    farmer: { farmerId: 'real-farmer-1', name: 'Productora Registro', documentId: '1084084084' },
    existed: false,
  });
  mockExtractCrops.mockResolvedValue({ crops: [CAFE] });
});

// ─── Resolución de códigos ───────────────────────────────────────────────────

describe('Criterio 6 — resolución del código del flujo de registro', () => {
  it.each([
    ['S_REG', 'REG'],
    ['S1a', 'S1'],
    ['S1', 'S1'],
    ['S1b', 'S2'],
    ['S2', 'S2'],
    ['S9', null],
    [null, null],
  ])('%s → %s', (code, expected) => {
    expect(resolveRegistrationFlowCode(code)).toBe(expected);
  });
});

// ─── Elección de flujo ───────────────────────────────────────────────────────

describe('Criterios 5 y 6 — elección entre Registro y S1/S2', () => {
  it('usa el Registro si está en caché, con o sin conexión', () => {
    expect(chooseRegistrationFlow({ registrationCached: true, isOnline: false })).toBe('registro');
    expect(chooseRegistrationFlow({ registrationCached: true, isOnline: true })).toBe('registro');
  });

  it('online sin caché usa el Registro solo si el backend lo tiene', () => {
    expect(
      chooseRegistrationFlow({ registrationCached: false, isOnline: true, registrationAvailableOnline: true }),
    ).toBe('registro');
    expect(
      chooseRegistrationFlow({ registrationCached: false, isOnline: true, registrationAvailableOnline: false }),
    ).toBe('legacy');
  });

  it('offline sin Registro en caché cae al flujo S1/S2', () => {
    expect(chooseRegistrationFlow({ registrationCached: false, isOnline: false })).toBe('legacy');
  });
});

// ─── Sincronización ──────────────────────────────────────────────────────────

describe('Criterio 5 — sincronizar un borrador de Registro', () => {
  it('extrae productor y luego cultivos sobre la misma encuesta, y guarda los cultivos de la sesión', async () => {
    givenQueuedDraftOf('S_REG');

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).toHaveBeenCalledWith('survey-1');
    expect(mockExtractCrops).toHaveBeenCalledWith('survey-1');
    expect(mockExtractFarmer.mock.invocationCallOrder[0]).toBeLessThan(
      mockExtractCrops.mock.invocationCallOrder[0],
    );
    expect(mockSessionCropsSave).toHaveBeenCalledWith('session-1', [CAFE]);
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-1');
  });

  it('ante colisión de documento resuelve como separate_person y aun así extrae los cultivos', async () => {
    givenQueuedDraftOf('S_REG');
    mockExtractFarmer
      .mockRejectedValueOnce(
        new DocumentIdCollisionError({
          documentId: '1084084084',
          submittedName: 'Productora Registro',
          existingFarmer: { farmerId: 'real-farmer-otro', name: 'Otra Persona' },
        }),
      )
      .mockResolvedValueOnce({
        farmer: { farmerId: 'real-farmer-2', name: 'Productora Registro', documentId: '1084084084' },
        existed: false,
      });

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).toHaveBeenNthCalledWith(2, 'survey-1', { resolution: 'separate_person' });
    expect(mockExtractCrops).toHaveBeenCalledWith('survey-1');
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
  });
});

describe('Criterio 6 — los borradores S1a y S1b siguen como antes', () => {
  it('S1a solo extrae el productor', async () => {
    givenQueuedDraftOf('S1a');

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).toHaveBeenCalledWith('survey-1');
    expect(mockExtractCrops).not.toHaveBeenCalled();
  });

  it('S1b solo extrae los cultivos', async () => {
    givenQueuedDraftOf('S1b');

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).not.toHaveBeenCalled();
    expect(mockExtractCrops).toHaveBeenCalledWith('survey-1');
  });
});

// ─── Colisión con el orquestador en primer plano ─────────────────────────────
//
// Auditoría 41 (hallazgo mayor 2), confirmado en el emulador el 2026-09-15:
// con conexión, `enqueueSubmission()` dispara `processAll()` y el orquestador
// llama a `processSurveyNow()` sobre la misma encuesta de Registro (o S1). Si
// cualquiera de las dos corridas resolvía la colisión como `separate_person`,
// el backend (extracción idempotente por encuesta, `10affd1`) ya no le
// devolvía el 409 al orquestador y el aviso del spec 68 no aparecía nunca.
// Cuando el orquestador en línea espera esa encuesta, la cola debe dejarle la
// colisión sin resolver; sin nadie esperando (o sin conexión) sigue la
// resolución diferida de siempre.

describe('Colisión de documento con el orquestador esperando la encuesta (auditoría 41, mayor 2)', () => {
  const sessionStoreGetState = useCampaignSessionStore.getState as jest.Mock;
  const defaultSessionState = sessionStoreGetState();

  const collision = () =>
    new DocumentIdCollisionError({
      documentId: '1084084084',
      submittedName: 'Productora Registro',
      existingFarmer: { farmerId: 'real-farmer-otro', name: 'Otra Persona' },
    });

  function givenOrchestratorAwaiting(phase: 'registro' | 's1', surveyId: string, isOnline: boolean) {
    sessionStoreGetState.mockReturnValue({
      ...defaultSessionState,
      injectionPhase: phase,
      registroSurveyId: phase === 'registro' ? surveyId : null,
      s1SurveyId: phase === 's1' ? surveyId : null,
    });
    (useSyncStatusStore.getState as jest.Mock).mockReturnValue({
      isOnline,
      setSyncingId: jest.fn(),
      markSyncCompleted: jest.fn(),
      refreshPendingCount: jest.fn().mockResolvedValue(undefined),
    });
  }

  afterEach(() => {
    sessionStoreGetState.mockReturnValue(defaultSessionState);
  });

  it('Registro en processAll(): no resuelve la colisión ni extrae cultivos, y cierra la entrada sin fallo', async () => {
    givenQueuedDraftOf('S_REG');
    givenOrchestratorAwaiting('registro', 'survey-1', true);
    mockExtractFarmer.mockRejectedValueOnce(collision());

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).toHaveBeenCalledTimes(1);
    expect(mockExtractFarmer).toHaveBeenCalledWith('survey-1');
    expect(mockExtractFarmer).not.toHaveBeenCalledWith('survey-1', { resolution: 'separate_person' });
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-1');
  });

  it('Registro en processSurveyNow(): tampoco la resuelve', async () => {
    givenOrchestratorAwaiting('registro', 'survey-1', true);
    mockLoadDraft.mockResolvedValue(makeDraft('inst-S_REG'));
    mockInstrumentCacheGet.mockResolvedValue({
      instrumentId: 'inst-S_REG',
      code: 'S_REG',
      sections: [{ sectionId: 's1', name: 'Section 1', order: 1, questions: [] }],
    });
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1', textValue: 'x' }]);
    (syncQueueStorage.getPendingBySurveyId as jest.Mock).mockResolvedValueOnce(makeEntry());
    mockExtractFarmer.mockRejectedValueOnce(collision());

    await SyncQueueService.processSurveyNow('survey-1');

    expect(mockExtractFarmer).toHaveBeenCalledTimes(1);
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-1');
  });

  it('S1a heredado: tampoco la resuelve cuando el orquestador espera la fase s1', async () => {
    givenQueuedDraftOf('S1a');
    givenOrchestratorAwaiting('s1', 'survey-1', true);
    mockExtractFarmer.mockRejectedValueOnce(collision());

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).toHaveBeenCalledTimes(1);
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-1');
  });

  it('sin conexión según el estado de red, mantiene la resolución diferida como separate_person', async () => {
    givenQueuedDraftOf('S_REG');
    givenOrchestratorAwaiting('registro', 'survey-1', false);
    mockExtractFarmer.mockRejectedValueOnce(collision()).mockResolvedValueOnce({
      farmer: { farmerId: 'real-farmer-2', name: 'Productora Registro', documentId: '1084084084' },
      existed: false,
    });

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).toHaveBeenNthCalledWith(2, 'survey-1', { resolution: 'separate_person' });
    expect(mockExtractCrops).toHaveBeenCalledWith('survey-1');
  });

  it('si el orquestador espera otra encuesta, mantiene la resolución diferida como separate_person', async () => {
    givenQueuedDraftOf('S_REG');
    givenOrchestratorAwaiting('registro', 'local_survey_otra', true);
    mockExtractFarmer.mockRejectedValueOnce(collision()).mockResolvedValueOnce({
      farmer: { farmerId: 'real-farmer-2', name: 'Productora Registro', documentId: '1084084084' },
      existed: false,
    });

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).toHaveBeenNthCalledWith(2, 'survey-1', { resolution: 'separate_person' });
    expect(mockExtractCrops).toHaveBeenCalledWith('survey-1');
  });
});
