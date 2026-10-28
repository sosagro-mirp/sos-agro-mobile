/**
 * Spec 96 — Extracción en el backend desde el móvil (H3c, vía OTA).
 *
 * Cubre los criterios verificables en unitario de
 * `spec/96_extraccion_backend_movil.md`: C1–C13. Los criterios C14 (flujo
 * sin conexión intacto: lo cubren las suites existentes), C15 (compatibilidad
 * con tabletas sin la OTA y borradores encolados antes de ella) y C16
 * (entrega por OTA) se validan en la ronda manual
 * `docs/testing/test-096-extraccion-backend-movil.md`.
 *
 * ARRANCA EN ROJO, a propósito. Motivos esperados, por fase del spec:
 *   - Fase 1: `endpoints.surveyExtraction`, `getSurveyExtraction` (api/surveys),
 *     `surveyDraftStore.setFarmerId`, la migración `farmer_cache.farm_id` y el
 *     paso de `farmId` en `cacheFarmerIdentity` no existen.
 *   - Fase 2: `SyncQueueService` sigue llamando a `extract-farmer` /
 *     `extract-crops` tras el batch, no envía `clientFarmerId` y remapea el
 *     id provisional buscando por documento en `listRecent(100)`.
 *   - Fase 3: `src/lib/interpretExtraction.ts` no existe y
 *     `registrationFlow.ts` no exporta `resolveExtractionOnline`.
 *
 * Los módulos y exportaciones nuevos se cargan con `loadExport()` dentro de
 * cada caso: si aún no existen, el caso falla con un mensaje explícito en vez
 * de tumbar el archivo entero por un import roto.
 *
 * El arnés de la cola replica el de `e2e-084-registroProductor.test.ts`.
 */

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

const mockSet = jest.fn((_values: Record<string, unknown>) => ({
  where: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../storage/db/db', () => ({
  db: {
    update: jest.fn(() => ({ set: mockSet })),
  },
}));

jest.mock('../api/httpClient', () => {
  const actual = jest.requireActual('../api/httpClient');
  return {
    ...actual,
    httpClient: {
      get: jest.fn(),
      post: jest.fn().mockResolvedValue(undefined),
      patch: jest.fn().mockResolvedValue(undefined),
      put: jest.fn(),
      delete: jest.fn(),
    },
  };
});

jest.mock('../storage/secureStorage', () => ({
  secureStorage: {
    getActiveUserId: jest.fn().mockResolvedValue('user-1'),
    getTokenFor: jest.fn().mockResolvedValue('token-1'),
  },
}));

jest.mock('../storage/syncQueue', () => ({
  syncQueueStorage: {
    dequeueNextPending: jest.fn(),
    listPendingOwners: jest.fn().mockResolvedValue([null]),
    markInFlight: jest.fn(),
    markSynced: jest.fn(),
    markFailedValidation: jest.fn(),
    incrementAttempts: jest.fn(),
    getPendingBySurveyId: jest.fn(),
    getActiveBySurveyId: jest.fn(),
    resetInFlightToRetry: jest.fn(),
    resetInFlightToRetryBySurveyId: jest.fn(),
    claimPendingBySurveyId: jest.fn(),
  },
}));

jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: {
    loadDraft: jest.fn(),
    markSynced: jest.fn(),
    getBackendSurveyId: jest.fn(),
    setBackendSurveyId: jest.fn(),
    setFarmerId: jest.fn(),
  },
}));

jest.mock('../storage/farmPlotStore', () => ({
  farmPlotStore: { loadDraft: jest.fn(), markSynced: jest.fn() },
}));

jest.mock('../api/farmPlots', () => ({ createFarmPlot: jest.fn() }));

jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: { get: jest.fn() },
}));

jest.mock('../api/responses', () => ({ submitResponsesBatch: jest.fn() }));

// `getSurveyExtraction` (Fase 1) se declara aquí para que la cola pueda
// llamarlo en cuanto exista; hoy nadie lo llama y los casos fallan en sus
// aserciones, no por el mock.
jest.mock('../api/surveys', () => ({
  markSurveyAsSynced: jest.fn(),
  createSurvey: jest.fn(),
  skipStepApi: jest.fn(),
  getSurveyExtraction: jest.fn(),
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
    get: jest.fn().mockResolvedValue(null),
    getByDocumentId: jest.fn().mockResolvedValue(null),
    recordConsent: jest.fn().mockResolvedValue(1),
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

jest.mock('../store/useAuthStore', () => ({
  useAuthStore: {
    getState: jest.fn().mockReturnValue({ token: 'test-token' }),
  },
}));

jest.mock('../store/useCampaignSessionStore', () => ({
  useCampaignSessionStore: {
    getState: jest.fn(),
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
import { createSurvey, getSurveyExtraction, markSurveyAsSynced } from '../api/surveys';
import { markSessionAsSynced } from '../api/campaignSessions';
import { extractFarmer, extractCrops, DocumentIdCollisionError } from '../api/farmers';
import { sessionCropsStorage } from '../storage/sessionCropsStorage';
import { farmerCacheStorage } from '../storage/farmerCache';
import { cacheFarmerIdentity } from '../lib/cacheFarmerIdentity';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { flattenSections } from '../lib/flattenSections';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import { httpClient, NetworkError, ServerError } from '../api/httpClient';
import { endpoints } from '../api/endpoints';
import { farmerCache } from '../storage/db/schema';
import migrations from '../storage/db/migrations';

// ─── Carga perezosa de lo que aún no existe ──────────────────────────────────

function loadExport<T>(modulePath: string, name: string): T {
  let mod: Record<string, unknown>;
  try {
    mod = jest.requireActual(modulePath);
  } catch {
    throw new Error(`Spec 96 — el módulo ${modulePath} todavía no existe`);
  }
  const value = mod[name];
  if (value === undefined) {
    throw new Error(`Spec 96 — ${modulePath} todavía no exporta \`${name}\``);
  }
  return value as T;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const REAL = 'd0fcfb80-68c7-43aa-b1f0-bafe47b14896';
const LOCAL = 'local_farmer_9c3f1b2a-8e7d-4f2e-9a1b-2c3d4e5f6096';
const FARM = '5b0e6a3c-1d2e-4f30-9a8b-7c6d5e4f3096';
const CAFE = { cropId: '06ef9f9c-a91f-4680-af1c-ff0d4d501234', name: 'Café' };
const NOMBRE = 'Spec96 Productora';
const DOCUMENTO = '900960001';

type ExtractionStatus =
  | 'done'
  | 'collision'
  | 'no_identity'
  | 'pending_alias'
  | 'not_applicable'
  | 'awaiting_review'
  | 'error'
  | 'backfilled'
  | null;

/** Forma de `GET /surveys/:id/extraction` (spec 95, D-95-1). */
function extractionView(overrides: Partial<Record<string, unknown>> & { status: ExtractionStatus }) {
  return {
    farmerId: REAL,
    farmerName: NOMBRE,
    existed: false,
    clientFarmerId: null,
    farm: { farmId: FARM, name: 'Spec96 La Finca' },
    farmCropId: null,
    crops: [CAFE],
    openDiscrepancies: 0,
    extractedAt: '2026-10-28T12:00:00.000Z',
    ...overrides,
  };
}

const COLLISION = {
  documentId: DOCUMENTO,
  submittedName: NOMBRE,
  existingFarmer: { farmerId: 'e1e1e1e1-0000-4000-8000-000000000096', name: 'Spec96 Otra Persona' },
};

/** Respuesta del alias `extract-farmer` (spec 95: `crops` y `extraction` aditivos). */
const ALIAS_RESPONSE = {
  farmer: { farmerId: REAL, name: NOMBRE, documentId: DOCUMENTO, farm: { farmId: FARM, name: 'Spec96 La Finca' } },
  existed: false,
  crops: [CAFE],
  extraction: { status: 'done', farmId: FARM, farmCropId: null },
};

const mockDequeueNextPending = syncQueueStorage.dequeueNextPending as jest.Mock;
const mockMarkSynced = syncQueueStorage.markSynced as jest.Mock;
const mockMarkFailedValidation = syncQueueStorage.markFailedValidation as jest.Mock;
const mockLoadDraft = surveyDraftStore.loadDraft as jest.Mock;
const mockGetBackendSurveyId = surveyDraftStore.getBackendSurveyId as jest.Mock;
const mockInstrumentCacheGet = instrumentCacheStorage.get as jest.Mock;
const mockCreateSurvey = createSurvey as jest.Mock;
const mockGetExtraction = getSurveyExtraction as unknown as jest.Mock;
const mockExtractFarmer = extractFarmer as jest.Mock;
const mockExtractCrops = extractCrops as jest.Mock;
const mockSessionCropsSave = sessionCropsStorage.save as jest.Mock;
const mockBuildResponsesPayload = buildResponsesPayload as jest.Mock;
const mockCacheFarmerIdentity = cacheFarmerIdentity as jest.Mock;
const mockFarmerCacheGet = farmerCacheStorage.get as jest.Mock;
const mockSessionGetState = useCampaignSessionStore.getState as jest.Mock;
const mockResolveFarmer = jest.fn();

function makeEntry(surveyId = 'survey-1') {
  return {
    id: 'entry-1',
    surveyId,
    campaignSessionId: 'session-1',
    attempts: 0,
    status: 'pending' as const,
    createdAt: new Date(),
  };
}

function givenQueuedDraftOf(
  code: string,
  opts: { surveyId?: string; farmerId?: string } = {},
) {
  const surveyId = opts.surveyId ?? 'survey-1';
  mockDequeueNextPending.mockResolvedValueOnce(makeEntry(surveyId)).mockResolvedValue(null);
  mockLoadDraft.mockResolvedValue({
    surveyId,
    instrumentId: `inst-${code}`,
    ...(opts.farmerId ? { farmerId: opts.farmerId } : {}),
    answers: { q1: { questionId: 'q1', textValue: 'answer' } },
    updatedAt: new Date(),
  });
  mockInstrumentCacheGet.mockResolvedValue({
    instrumentId: `inst-${code}`,
    code,
    sections: [{ sectionId: 's1', name: 'Section 1', order: 1, questions: [] }],
  });
  mockBuildResponsesPayload.mockReturnValue([{ surveyId, questionId: 'q1', textValue: 'x' }]);
}

function givenSessionState(overrides: Record<string, unknown> = {}) {
  mockSessionGetState.mockReturnValue({
    localSessionId: null,
    localFarmerId: null,
    injectionPhase: 'none',
    registroSurveyId: null,
    s1SurveyId: null,
    resolveSession: jest.fn(),
    resolveFarmer: mockResolveFarmer,
    ...overrides,
  });
}

function givenNetwork(isOnline: boolean) {
  (useSyncStatusStore.getState as jest.Mock).mockReturnValue({
    isOnline,
    setSyncingId: jest.fn(),
    markSyncCompleted: jest.fn(),
    refreshPendingCount: jest.fn().mockResolvedValue(undefined),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  SyncQueueService.resetNetworkFailures();
  givenNetwork(true);
  givenSessionState();
  mockDequeueNextPending.mockResolvedValue(null);
  (syncQueueStorage.markInFlight as jest.Mock).mockResolvedValue(undefined);
  mockMarkSynced.mockResolvedValue(undefined);
  (surveyDraftStore.markSynced as jest.Mock).mockResolvedValue(undefined);
  (surveyDraftStore.setBackendSurveyId as jest.Mock).mockResolvedValue(undefined);
  mockGetBackendSurveyId.mockResolvedValue(null);
  (markSurveyAsSynced as jest.Mock).mockResolvedValue(undefined);
  (markSessionAsSynced as jest.Mock).mockResolvedValue(undefined);
  (submitResponsesBatch as jest.Mock).mockResolvedValue(undefined);
  (flattenSections as jest.Mock).mockReturnValue([]);
  mockSessionCropsSave.mockResolvedValue(undefined);
  mockFarmerCacheGet.mockResolvedValue(null);
  mockCreateSurvey.mockResolvedValue({ surveyId: 'srv-reg' });
  mockGetExtraction.mockResolvedValue(extractionView({ status: 'done' }));
  // El comportamiento actual llama a los alias: se les da una respuesta válida
  // para que los casos fallen por las aserciones, no por un error secundario.
  mockExtractFarmer.mockResolvedValue(ALIAS_RESPONSE);
  mockExtractCrops.mockResolvedValue({ crops: [CAFE] });
});

// ═══ Fase 1 — contrato de API y caché ════════════════════════════════════════

describe('Fase 1 — GET /surveys/:id/extraction en el cliente', () => {
  it('C1: el endpoint de extracción existe y apunta a /api/surveys/:id/extraction', () => {
    const build = (endpoints as Record<string, unknown>).surveyExtraction as
      | ((id: string) => string)
      | undefined;
    expect(typeof build).toBe('function');
    expect(build!('abc')).toBe('/api/surveys/abc/extraction');
  });

  it('C1: getSurveyExtraction hace un GET a ese endpoint y devuelve la vista', async () => {
    const fn = loadExport<(id: string) => Promise<unknown>>('../api/surveys', 'getSurveyExtraction');
    (httpClient.get as jest.Mock).mockResolvedValueOnce(extractionView({ status: 'done' }));

    const view = (await fn('abc')) as { status: string; farmerId: string };

    expect(httpClient.get).toHaveBeenCalledWith('/api/surveys/abc/extraction');
    expect(view.status).toBe('done');
    expect(view.farmerId).toBe(REAL);
  });
});

describe('Fase 1 — farmer_cache.farm_id (C13)', () => {
  it('C13: existe una migración JS que agrega farm_id a farmer_cache (va por OTA)', () => {
    const m = migrations as unknown as {
      journal: { entries: { tag: string }[] };
      migrations: Record<string, string>;
    };
    const tag = Object.keys(m.migrations).find((t) =>
      /ALTER TABLE `?farmer_cache`? ADD COLUMN `?farm_id`?/i.test(m.migrations[t]),
    );
    expect(tag).toBeDefined();
    expect(m.journal.entries.map((e) => e.tag)).toContain(tag);
  });

  it('C13: el esquema de Drizzle declara la columna farm_id en farmer_cache', () => {
    expect((farmerCache as unknown as Record<string, unknown>).farmId).toBeDefined();
  });

  it('C13: cacheFarmerIdentity persiste el farmId de la finca', async () => {
    const actualCache = loadExport<(i: Record<string, unknown>) => Promise<void>>(
      '../lib/cacheFarmerIdentity',
      'cacheFarmerIdentity',
    );

    await actualCache({ farmerId: REAL, name: NOMBRE, documentId: DOCUMENTO, farmId: FARM });

    expect(farmerCacheStorage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ farmerId: REAL, farmId: FARM }),
    );
  });
});

describe('Fase 1 — el borrador del Registro conserva su id provisional (C11)', () => {
  it('C11: surveyDraftStore.setFarmerId existe y escribe farmer_id en la encuesta local', async () => {
    const store = loadExport<Record<string, unknown>>('../storage/surveyDraftStore', 'surveyDraftStore');
    const setFarmerId = store.setFarmerId as ((id: string, farmerId: string) => Promise<void>) | undefined;
    expect(typeof setFarmerId).toBe('function');

    await setFarmerId!('local_survey_reg', LOCAL);

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ farmerId: LOCAL }));
  });
});

// ═══ Fase 2 — cola de sincronización ═════════════════════════════════════════

describe('Fase 2 — la cola ya no llama a extract-* tras el batch (C6)', () => {
  it('C6: Registro sincronizado en segundo plano: una consulta de extracción y ningún extract-*', async () => {
    givenQueuedDraftOf('S_REG');

    await SyncQueueService.processAll();

    expect(mockGetExtraction).toHaveBeenCalledTimes(1);
    expect(mockGetExtraction.mock.calls[0][0]).toBe('survey-1');
    expect(mockExtractFarmer).not.toHaveBeenCalled();
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-1');
  });

  it('C6: guarda los cultivos de la sesión desde la vista de extracción', async () => {
    givenQueuedDraftOf('S_REG');

    await SyncQueueService.processAll();

    expect(mockGetExtraction).toHaveBeenCalled();
    expect(mockSessionCropsSave).toHaveBeenCalledWith('session-1', [CAFE]);
  });

  it('C6 + C13: cachea la identidad real con la finca que devolvió la extracción', async () => {
    givenQueuedDraftOf('S_REG');

    await SyncQueueService.processAll();

    expect(mockCacheFarmerIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ farmerId: REAL, name: NOMBRE, farmId: FARM }),
    );
  });

  it('C6: S1a heredado tampoco llama a extract-farmer', async () => {
    givenQueuedDraftOf('S1a');

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).not.toHaveBeenCalled();
    expect(mockGetExtraction).toHaveBeenCalledTimes(1);
  });

  it('C6: S1b heredado tampoco llama a extract-crops y guarda los cultivos de la vista', async () => {
    givenQueuedDraftOf('S1b');

    await SyncQueueService.processAll();

    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(mockGetExtraction).toHaveBeenCalledTimes(1);
    expect(mockSessionCropsSave).toHaveBeenCalledWith('session-1', [CAFE]);
  });

  it('C6: un instrumento que no es de registro no consulta la extracción ni llama a extract-*', async () => {
    givenQueuedDraftOf('S3');

    await SyncQueueService.processAll();

    expect(mockGetExtraction).not.toHaveBeenCalled();
    expect(mockExtractFarmer).not.toHaveBeenCalled();
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-1');
  });
});

describe('Fase 2 — colisión descubierta al sincronizar (C7, D-H3-1)', () => {
  it('C7: sin nadie esperando, resuelve como separate_person por el alias, una sola vez', async () => {
    givenQueuedDraftOf('S_REG');
    mockGetExtraction.mockResolvedValue(
      extractionView({ status: 'collision', farmerId: null, farmerName: null, collision: COLLISION }),
    );

    await SyncQueueService.processAll();

    expect(mockGetExtraction).toHaveBeenCalled();
    expect(mockExtractFarmer).toHaveBeenCalledTimes(1);
    expect(mockExtractFarmer.mock.calls[0][0]).toBe('survey-1');
    expect(mockExtractFarmer.mock.calls[0][1]).toEqual({ resolution: 'separate_person' });
  });

  it('C7: los cultivos salen de la respuesta del alias, sin extract-crops', async () => {
    givenQueuedDraftOf('S_REG');
    mockGetExtraction.mockResolvedValue(
      extractionView({ status: 'collision', farmerId: null, farmerName: null, collision: COLLISION }),
    );

    await SyncQueueService.processAll();

    expect(mockGetExtraction).toHaveBeenCalled();
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(mockSessionCropsSave).toHaveBeenCalledWith('session-1', [CAFE]);
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
  });
});

describe('Fase 2 — el orquestador en línea espera la encuesta (C8)', () => {
  it('C8: processSurveyNow sobre el Registro esperado no consulta ni resuelve nada', async () => {
    givenSessionState({ injectionPhase: 'registro', registroSurveyId: 'survey-1' });
    givenNetwork(true);
    mockLoadDraft.mockResolvedValue({
      surveyId: 'survey-1',
      instrumentId: 'inst-S_REG',
      answers: { q1: { questionId: 'q1', textValue: 'answer' } },
      updatedAt: new Date(),
    });
    mockInstrumentCacheGet.mockResolvedValue({
      instrumentId: 'inst-S_REG',
      code: 'S_REG',
      sections: [{ sectionId: 's1', name: 'Section 1', order: 1, questions: [] }],
    });
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1', textValue: 'x' }]);
    (syncQueueStorage.claimPendingBySurveyId as jest.Mock).mockResolvedValueOnce(makeEntry());

    await SyncQueueService.processSurveyNow('survey-1');

    expect(submitResponsesBatch).toHaveBeenCalled();
    expect(mockGetExtraction).not.toHaveBeenCalled();
    expect(mockExtractFarmer).not.toHaveBeenCalled();
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-1');
  });
});

describe('Fase 2 — una falla al leer la extracción no condena la encuesta (C9)', () => {
  it('C9: un error de servidor tras un batch exitoso cierra la entrada sin marcarla fallida', async () => {
    givenQueuedDraftOf('S_REG');
    mockGetExtraction.mockRejectedValue(new ServerError(500, 'Internal server error'));

    await SyncQueueService.processAll();

    expect(mockGetExtraction).toHaveBeenCalled();
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-1');
  });
});

describe('Fase 2 — correcciones de la auditoría 63', () => {
  it('C9: un error de red al leer la extracción deja la entrada pendiente, sin fallo ni cierre', async () => {
    givenQueuedDraftOf('S_REG');
    mockGetExtraction.mockRejectedValue(new NetworkError('offline'));

    await SyncQueueService.processAll();

    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
    expect(mockMarkSynced).not.toHaveBeenCalled();
  });

  it('C7: si el reintento por el alias devuelve 409, resuelve como separate_person', async () => {
    givenQueuedDraftOf('S_REG');
    mockGetExtraction.mockResolvedValue(extractionView({ status: 'error', farmerId: null, farmerName: null }));
    mockExtractFarmer
      .mockRejectedValueOnce(new DocumentIdCollisionError(COLLISION))
      .mockResolvedValueOnce(ALIAS_RESPONSE);

    await SyncQueueService.processAll();

    expect(mockExtractFarmer).toHaveBeenCalledTimes(2);
    expect(mockExtractFarmer.mock.calls[1][1]).toEqual({ resolution: 'separate_person' });
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('entry-1');
  });

  it('D-96-4: sin fila provisional conserva documento y teléfono de la fila real en caché', async () => {
    givenQueuedDraftOf('S2');
    mockFarmerCacheGet.mockImplementation(async (id: string) =>
      id === REAL
        ? { farmerId: REAL, name: NOMBRE, documentId: DOCUMENTO, phone: '3009600001', farmName: 'La Finca', cachedAt: new Date() }
        : null,
    );

    await SyncQueueService.processAll();

    expect(mockCacheFarmerIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ farmerId: REAL, documentId: DOCUMENTO, phone: '3009600001' }),
    );
  });
});

describe('Fase 2 — clientFarmerId al materializar (C10)', () => {
  it('C10: envía clientFarmerId cuando el borrador tiene un productor provisional', async () => {
    givenQueuedDraftOf('S3', { surveyId: 'local_survey_s3', farmerId: LOCAL });

    await SyncQueueService.processAll();

    expect(mockCreateSurvey).toHaveBeenCalledTimes(1);
    const payload = mockCreateSurvey.mock.calls[0][0];
    expect(payload.clientFarmerId).toBe(LOCAL);
    expect(payload.farmerId).not.toBe(LOCAL);
  });

  it('C10: el Registro capturado sin conexión viaja con su id provisional como clientFarmerId', async () => {
    givenQueuedDraftOf('S_REG', { surveyId: 'local_survey_reg', farmerId: LOCAL });

    await SyncQueueService.processAll();

    expect(mockCreateSurvey).toHaveBeenCalledWith(
      expect.objectContaining({ clientFarmerId: LOCAL, clientSurveyId: 'local_survey_reg' }),
    );
  });

  // test-096 TC-07: la caché ya tenía a otra persona con el mismo documento; el
  // id real de esa persona no debe viajar, o el backend omite la colisión.
  it('C10: el Registro con productor provisional no envía el farmerId resuelto por documento', async () => {
    const OTRA_PERSONA = 'e1e1e1e1-0000-4000-8000-000000000096';
    mockFarmerCacheGet.mockResolvedValue({ farmerId: LOCAL, documentId: DOCUMENTO });
    (farmerCacheStorage.getByDocumentId as jest.Mock).mockResolvedValue({ farmerId: OTRA_PERSONA });
    givenQueuedDraftOf('S_REG', { surveyId: 'local_survey_reg', farmerId: LOCAL });

    await SyncQueueService.processAll();

    const payload = mockCreateSurvey.mock.calls[0][0];
    expect(payload.clientFarmerId).toBe(LOCAL);
    expect(payload).not.toHaveProperty('farmerId');
  });

  it('C10: un instrumento que no es de registro sigue resolviendo el id real por documento', async () => {
    mockFarmerCacheGet.mockResolvedValue({ farmerId: LOCAL, documentId: DOCUMENTO });
    (farmerCacheStorage.getByDocumentId as jest.Mock).mockResolvedValue({ farmerId: REAL });
    givenQueuedDraftOf('S3', { surveyId: 'local_survey_s3', farmerId: LOCAL });

    await SyncQueueService.processAll();

    const payload = mockCreateSurvey.mock.calls[0][0];
    expect(payload.clientFarmerId).toBe(LOCAL);
    expect(payload.farmerId).toBe(REAL);
  });

  it('C10: con un productor real no envía clientFarmerId', async () => {
    givenQueuedDraftOf('S3', { surveyId: 'local_survey_s3', farmerId: REAL });

    await SyncQueueService.processAll();

    const payload = mockCreateSurvey.mock.calls[0][0];
    expect(payload.farmerId).toBe(REAL);
    expect(payload).not.toHaveProperty('clientFarmerId');
  });
});

describe('Fase 2 — remapeo del id provisional por alias (C12)', () => {
  const PROVISIONAL_CACHE = {
    farmerId: LOCAL,
    name: NOMBRE,
    documentId: DOCUMENTO,
    phone: '3009600001',
    cachedAt: new Date('2026-10-28T10:00:00Z'),
    consentVersion: 'v3',
    consentedAt: new Date('2026-10-28T10:01:00Z'),
  };

  function givenOfflineRegistroSynced(cacheEntry: Record<string, unknown> | null) {
    givenQueuedDraftOf('S_REG', { surveyId: 'local_survey_reg', farmerId: LOCAL });
    mockFarmerCacheGet.mockImplementation(async (id: string) => (id === LOCAL ? cacheEntry : null));
    mockGetExtraction.mockResolvedValue(extractionView({ status: 'done', clientFarmerId: LOCAL }));
    givenSessionState({ localFarmerId: LOCAL });
  }

  it('C12: remapea las encuestas locales del provisional al productor real', async () => {
    givenOfflineRegistroSynced(PROVISIONAL_CACHE);

    await SyncQueueService.processAll();

    expect(mockGetExtraction).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ farmerId: REAL }));
    expect(mockResolveFarmer).toHaveBeenCalledWith(REAL);
  });

  it('C12: no busca por documento en listRecent (falla con >100 agricultores en caché)', async () => {
    givenOfflineRegistroSynced(PROVISIONAL_CACHE);

    await SyncQueueService.processAll();

    expect(mockGetExtraction).toHaveBeenCalled();
    expect(farmerCacheStorage.listRecent).not.toHaveBeenCalled();
  });

  it('C12: borra la fila provisional y lleva documento, teléfono y consentimiento a la real', async () => {
    givenOfflineRegistroSynced(PROVISIONAL_CACHE);

    await SyncQueueService.processAll();

    expect(farmerCacheStorage.remove).toHaveBeenCalledWith(LOCAL);
    expect(mockCacheFarmerIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ farmerId: REAL, documentId: DOCUMENTO, phone: '3009600001', farmId: FARM }),
    );
    expect(farmerCacheStorage.recordConsent).toHaveBeenCalledWith(
      REAL,
      'v3',
      PROVISIONAL_CACHE.consentedAt,
    );
  });

  it('C12: remapea aunque el productor provisional no tenga documento', async () => {
    givenOfflineRegistroSynced({ ...PROVISIONAL_CACHE, documentId: undefined });

    await SyncQueueService.processAll();

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ farmerId: REAL }));
    expect(farmerCacheStorage.remove).toHaveBeenCalledWith(LOCAL);
  });
});

// ═══ Fase 3 — orquestador en línea ═══════════════════════════════════════════

type Outcome =
  | { kind: 'resolved'; farmerId: string; farmerName: string; farmId: string | null; crops: unknown[] }
  | { kind: 'collision'; documentId: string; submittedName: string; existingFarmerName: string }
  | { kind: 'retry_alias' }
  | { kind: 'blocked'; message: string };

describe('Fase 3 — interpretExtraction: tabla de decisión por estado (C5)', () => {
  const interpret = () =>
    loadExport<(view: unknown) => Outcome>('../lib/interpretExtraction', 'interpretExtraction');

  it.each(['done', 'backfilled'] as const)('C5: %s con productor → resolved', (status) => {
    const outcome = interpret()(extractionView({ status }));
    expect(outcome).toEqual(
      expect.objectContaining({ kind: 'resolved', farmerId: REAL, farmerName: NOMBRE, farmId: FARM, crops: [CAFE] }),
    );
  });

  it('C5: not_applicable con productor anclado → resolved', () => {
    const outcome = interpret()(extractionView({ status: 'not_applicable' }));
    expect(outcome.kind).toBe('resolved');
  });

  it('C2/C5: collision → los datos del aviso del spec 68', () => {
    const outcome = interpret()(
      extractionView({ status: 'collision', farmerId: null, farmerName: null, collision: COLLISION }),
    );
    expect(outcome).toEqual({
      kind: 'collision',
      documentId: DOCUMENTO,
      submittedName: NOMBRE,
      existingFarmerName: 'Spec96 Otra Persona',
    });
  });

  it.each(['error', null] as const)('C5: estado %s → un reintento por el alias', (status) => {
    const outcome = interpret()(extractionView({ status, farmerId: null, farmerName: null }));
    expect(outcome.kind).toBe('retry_alias');
  });

  it.each(['no_identity', 'pending_alias', 'awaiting_review'] as const)(
    'C5 (D-96-2): %s → bloqueado con un mensaje en español sin términos técnicos',
    (status) => {
      const outcome = interpret()(extractionView({ status, farmerId: null, farmerName: null }));
      expect(outcome.kind).toBe('blocked');
      const message = (outcome as { message: string }).message;
      expect(message).toBeTruthy();
      expect(message).not.toMatch(/extraction|status|alias|no_identity|pending|farmer/i);
    },
  );
});

describe('Fase 3 — resolveExtractionOnline: el camino en línea del orquestador', () => {
  type ResolveOnline = (
    surveyId: string,
    opts?: { resolution?: 'same_person' | 'separate_person'; correctedDocumentId?: string },
  ) => Promise<Outcome>;
  const resolveOnline = () => loadExport<ResolveOnline>('../lib/registrationFlow', 'resolveExtractionOnline');

  it('C1: con la extracción hecha por el batch, una sola GET y ningún extract-*', async () => {
    const fn = resolveOnline();

    const outcome = await fn('srv-1');

    expect(mockGetExtraction).toHaveBeenCalledTimes(1);
    expect(mockGetExtraction.mock.calls[0][0]).toBe('srv-1');
    expect(mockExtractFarmer).not.toHaveBeenCalled();
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(outcome).toEqual(expect.objectContaining({ kind: 'resolved', farmerId: REAL, crops: [CAFE] }));
  });

  it('C2: ante una colisión pendiente devuelve el aviso y no la resuelve', async () => {
    const fn = resolveOnline();
    mockGetExtraction.mockResolvedValue(
      extractionView({ status: 'collision', farmerId: null, farmerName: null, collision: COLLISION }),
    );

    const outcome = await fn('srv-1');

    expect(outcome.kind).toBe('collision');
    expect(mockExtractFarmer).not.toHaveBeenCalled();
  });

  it('C3: la decisión del encuestador viaja por extract-farmer {resolution}, una vez y sin extract-crops', async () => {
    const fn = resolveOnline();

    const outcome = await fn('srv-1', { resolution: 'same_person' });

    expect(mockExtractFarmer).toHaveBeenCalledTimes(1);
    expect(mockExtractFarmer.mock.calls[0][0]).toBe('srv-1');
    expect(mockExtractFarmer.mock.calls[0][1]).toEqual({ resolution: 'same_person' });
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(outcome).toEqual(expect.objectContaining({ kind: 'resolved', farmerId: REAL, crops: [CAFE] }));
  });

  it('C4: el documento corregido viaja por extract-farmer {correctedDocumentId}', async () => {
    const fn = resolveOnline();

    const outcome = await fn('srv-1', { correctedDocumentId: '900960099' });

    expect(mockExtractFarmer).toHaveBeenCalledTimes(1);
    expect(mockExtractFarmer.mock.calls[0][1]).toEqual({ correctedDocumentId: '900960099' });
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(outcome.kind).toBe('resolved');
  });

  it('C4: si el documento corregido también colisiona, devuelve el aviso', async () => {
    const fn = resolveOnline();
    mockExtractFarmer.mockRejectedValueOnce(new DocumentIdCollisionError(COLLISION));

    const outcome = await fn('srv-1', { correctedDocumentId: '900960099' });

    expect(outcome).toEqual(expect.objectContaining({ kind: 'collision', documentId: DOCUMENTO }));
  });

  it('C5: estado error → un único reintento por el alias, que resuelve', async () => {
    const fn = resolveOnline();
    mockGetExtraction.mockResolvedValue(extractionView({ status: 'error', farmerId: null, farmerName: null }));

    const outcome = await fn('srv-1');

    expect(mockExtractFarmer).toHaveBeenCalledTimes(1);
    expect(mockExtractFarmer.mock.calls[0][1]).toBeUndefined();
    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(outcome).toEqual(expect.objectContaining({ kind: 'resolved', farmerId: REAL }));
  });
});
