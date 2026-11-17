/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6).
 * Ancla de la encuesta (productor, finca o cultivo de finca) desde el inicio
 * hasta `POST /api/surveys`, sin sesión de campaña, y convivencia con las
 * encuestas de campaña en la misma cola. Cubre los criterios C5 y C14 de
 * `spec/103_encuestador_movil_por_productor.md`.
 *
 * ARRANCA EN ROJO. Motivos esperados:
 *   - `src/lib/surveyAnchor.ts` no existe (Fase 2).
 *   - `beginSurvey()` no recibe `farmId`/`farmCropId` y su guarda de
 *     idempotencia no distingue productor, finca ni cultivo (Fase 5).
 *   - `SyncQueueService.materializeSurvey()` no envía `farmId`/`farmCropId`
 *     ni rechaza un contexto incompleto (Fase 4).
 * Los casos de C14 (campaña intacta) son de regresión y deben estar en verde
 * desde ya: describen el comportamiento actual que no puede cambiar.
 *
 * ── Contrato de `src/lib/surveyAnchor.ts` (compartido con e2e-103-productorRouting) ──
 *
 *   type ScopeLevel = 'farmer' | 'farm' | 'farm_crop';
 *   interface SurveyAnchor { farmerId: string; farmId?: string; farmCropId?: string }
 *
 *   export function buildSurveyAnchor(input: {
 *     scopeLevel: ScopeLevel; farmerId: string; farmId?: string | null; farmCropId?: string | null;
 *   }): SurveyAnchor;
 *     productor → solo `farmerId` (descarta finca/cultivo aunque lleguen);
 *     finca → además `farmId` (lanza si falta); cultivo → además `farmId` y
 *     `farmCropId` (lanza si falta alguno). `farmerId` puede ser provisional.
 *
 *   export function isAnchorComplete(anchor: { farmId?: string | null; farmCropId?: string | null }): boolean;
 *     false si hay `farmCropId` sin `farmId`; true en cualquier otro caso.
 *
 * ── Cambios en módulos existentes ────────────────────────────────────────────
 *
 *   beginSurvey(params: { instrumentId; campaignSessionId?; farmerId?; stepOrder?;
 *                         farmId?; farmCropId? }): Promise<string>
 *     Pasa `farmId` y `farmCropId` a `surveyDraftStore.createDraft()` y la
 *     clave de idempotencia incluye productor, finca y cultivo.
 *
 *   SurveyDraft (`surveyDraftStore.loadDraft`) gana `farmId?` y `farmCropId?`
 *   (columnas `surveys.farm_id` / `surveys.farm_crop_id`, m0015).
 *
 *   SyncQueueService.materializeSurvey: con anclas en el borrador, el payload
 *   de `createSurvey` lleva `farmId` y `farmCropId`, y nunca un
 *   `campaignSessionId` que no exista. Un borrador con `farmCropId` y sin
 *   `farmId` NO se envía: la entrada queda en `failed_validation` con detalle.
 */

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

jest.mock('../storage/db/db', () => ({
  db: { update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })) },
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
    resetInFlightToRetryById: jest.fn(),
    claimPendingBySurveyId: jest.fn(),
  },
}));

jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: {
    createDraft: jest.fn().mockResolvedValue(undefined),
    loadDraft: jest.fn(),
    markSynced: jest.fn(),
    getBackendSurveyId: jest.fn(),
    setBackendSurveyId: jest.fn(),
    setFarmerId: jest.fn(),
  },
}));

jest.mock('../storage/farmPlotStore', () => ({ farmPlotStore: { loadDraft: jest.fn(), markSynced: jest.fn() } }));
jest.mock('../api/farmPlots', () => ({ createFarmPlot: jest.fn() }));
jest.mock('../storage/instrumentCache', () => ({ instrumentCacheStorage: { get: jest.fn() } }));
jest.mock('../api/responses', () => ({ submitResponsesBatch: jest.fn() }));
jest.mock('../api/surveys', () => ({
  markSurveyAsSynced: jest.fn(),
  createSurvey: jest.fn(),
  skipStepApi: jest.fn(),
  getSurveyExtraction: jest.fn(),
}));
jest.mock('../api/campaignSessions', () => ({ markSessionAsSynced: jest.fn(), createCampaignSession: jest.fn() }));
jest.mock('../api/farmers', () => {
  const actual = jest.requireActual('../api/farmers');
  return { extractFarmer: jest.fn(), extractCrops: jest.fn(), DocumentIdCollisionError: actual.DocumentIdCollisionError };
});
jest.mock('../storage/sessionCropsStorage', () => ({
  sessionCropsStorage: { save: jest.fn(), get: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../store/useSyncStatusStore', () => ({ useSyncStatusStore: { getState: jest.fn() } }));
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
jest.mock('../lib/cacheFarmerIdentity', () => ({ cacheFarmerIdentity: jest.fn().mockResolvedValue(undefined) }));
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
    getState: jest.fn().mockReturnValue({ loadAll: jest.fn().mockResolvedValue(undefined), setHasNewResolved: jest.fn() }),
  },
}));
jest.mock('../store/useAuthStore', () => ({ useAuthStore: { getState: jest.fn().mockReturnValue({ token: 'test-token' }) } }));
jest.mock('../store/useCampaignSessionStore', () => ({ useCampaignSessionStore: { getState: jest.fn() } }));
jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../sync/MediaUploadService', () => ({
  MediaUploadService: { processPendingForSurvey: jest.fn().mockResolvedValue({}) },
}));

// ─── SUT e imports ───────────────────────────────────────────────────────────

import { SyncQueueService } from '../sync/SyncQueueService';
import { beginSurvey } from '../lib/beginSurvey';
import { syncQueueStorage } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { submitResponsesBatch } from '../api/responses';
import { createSurvey, getSurveyExtraction, markSurveyAsSynced } from '../api/surveys';
import { markSessionAsSynced } from '../api/campaignSessions';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { flattenSections } from '../lib/flattenSections';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';

function loadExport<T>(modulePath: string, name: string): T {
  let mod: Record<string, unknown>;
  try {
    mod = jest.requireActual(modulePath);
  } catch {
    throw new Error(`Spec 103 — el módulo ${modulePath} todavía no existe`);
  }
  const value = mod[name];
  if (value === undefined) {
    throw new Error(`Spec 103 — ${modulePath} todavía no exporta \`${name}\``);
  }
  return value as T;
}

type ScopeLevel = 'farmer' | 'farm' | 'farm_crop';
interface SurveyAnchor { farmerId: string; farmId?: string; farmCropId?: string }
type BuildSurveyAnchor = (input: {
  scopeLevel: ScopeLevel;
  farmerId: string;
  farmId?: string | null;
  farmCropId?: string | null;
}) => SurveyAnchor;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FARMER = 'aaaaaaaa-0000-4000-8000-000000000103';
const LOCAL_FARMER = 'local_farmer_9c3f1b2a-8e7d-4f2e-9a1b-2c3d4e5f6103';
const FARM = 'f1f1f1f1-0000-4000-8000-000000000103';
const FARM_CROP = 'fc000001-0000-4000-8000-000000000103';
const SESSION = '33333333-3333-4333-8333-333333333103';

const mockDequeue = syncQueueStorage.dequeueNextPending as jest.Mock;
const mockLoadDraft = surveyDraftStore.loadDraft as jest.Mock;
const mockCreateSurvey = createSurvey as jest.Mock;
const mockCreateDraft = surveyDraftStore.createDraft as jest.Mock;

function givenQueued(
  draft: Record<string, unknown>,
  entry: Partial<{ campaignSessionId: string; stepOrder: number }> = {},
) {
  const surveyId = 'local_survey_103';
  mockDequeue
    .mockResolvedValueOnce({
      id: 'entry-103',
      surveyId,
      attempts: 0,
      status: 'pending',
      itemType: 'survey',
      createdAt: new Date(),
      ...entry,
    })
    .mockResolvedValue(null);
  mockLoadDraft.mockResolvedValue({
    surveyId,
    instrumentId: 'inst-prod',
    answers: { q1: { questionId: 'q1', textValue: 'respuesta' } },
    updatedAt: new Date(),
    ...draft,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  SyncQueueService.resetNetworkFailures();
  (useSyncStatusStore.getState as jest.Mock).mockReturnValue({
    isOnline: true,
    setSyncingId: jest.fn(),
    markSyncCompleted: jest.fn(),
    refreshPendingCount: jest.fn().mockResolvedValue(undefined),
  });
  (useCampaignSessionStore.getState as jest.Mock).mockReturnValue({
    localSessionId: null,
    localFarmerId: null,
    injectionPhase: 'none',
    registroSurveyId: null,
    s1SurveyId: null,
    resolveSession: jest.fn(),
    resolveFarmer: jest.fn(),
  });
  mockDequeue.mockResolvedValue(null);
  (syncQueueStorage.markInFlight as jest.Mock).mockResolvedValue(undefined);
  (syncQueueStorage.markSynced as jest.Mock).mockResolvedValue(undefined);
  (syncQueueStorage.markFailedValidation as jest.Mock).mockResolvedValue(undefined);
  (surveyDraftStore.markSynced as jest.Mock).mockResolvedValue(undefined);
  (surveyDraftStore.setBackendSurveyId as jest.Mock).mockResolvedValue(undefined);
  (surveyDraftStore.getBackendSurveyId as jest.Mock).mockResolvedValue(null);
  (instrumentCacheStorage.get as jest.Mock).mockResolvedValue({
    instrumentId: 'inst-prod',
    code: 'C_PROD',
    sections: [{ sectionId: 's1', name: 'S1', order: 1, questions: [] }],
  });
  (markSurveyAsSynced as jest.Mock).mockResolvedValue(undefined);
  (markSessionAsSynced as jest.Mock).mockResolvedValue(undefined);
  (submitResponsesBatch as jest.Mock).mockResolvedValue(undefined);
  (getSurveyExtraction as jest.Mock).mockResolvedValue(null);
  (flattenSections as jest.Mock).mockReturnValue([]);
  (buildResponsesPayload as jest.Mock).mockReturnValue([{ surveyId: 'x', questionId: 'q1', textValue: 'x' }]);
  mockCreateSurvey.mockResolvedValue({ surveyId: 'srv-103' });
  mockCreateDraft.mockResolvedValue(undefined);
});

// ═══ C5 — ancla por nivel (función pura) ═════════════════════════════════════

describe('buildSurveyAnchor — C5: el ancla depende del nivel del instrumento', () => {
  it('productor: solo farmerId, aunque lleguen finca y cultivo', () => {
    const build = loadExport<BuildSurveyAnchor>('../lib/surveyAnchor', 'buildSurveyAnchor');
    expect(build({ scopeLevel: 'farmer', farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP })).toEqual({
      farmerId: FARMER,
    });
  });

  it('productor provisional: conserva el id local (viaja luego como clientFarmerId)', () => {
    const build = loadExport<BuildSurveyAnchor>('../lib/surveyAnchor', 'buildSurveyAnchor');
    expect(build({ scopeLevel: 'farmer', farmerId: LOCAL_FARMER })).toEqual({ farmerId: LOCAL_FARMER });
  });

  it('finca: farmerId y farmId, sin cultivo', () => {
    const build = loadExport<BuildSurveyAnchor>('../lib/surveyAnchor', 'buildSurveyAnchor');
    expect(build({ scopeLevel: 'farm', farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP })).toEqual({
      farmerId: FARMER,
      farmId: FARM,
    });
  });

  it('cultivo: farmerId, farmId y farmCropId', () => {
    const build = loadExport<BuildSurveyAnchor>('../lib/surveyAnchor', 'buildSurveyAnchor');
    expect(build({ scopeLevel: 'farm_crop', farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP })).toEqual({
      farmerId: FARMER,
      farmId: FARM,
      farmCropId: FARM_CROP,
    });
  });

  it('un contexto incompleto se rechaza: finca sin farmId, cultivo sin farmCropId o sin farmId', () => {
    const build = loadExport<BuildSurveyAnchor>('../lib/surveyAnchor', 'buildSurveyAnchor');
    expect(() => build({ scopeLevel: 'farm', farmerId: FARMER })).toThrow();
    expect(() => build({ scopeLevel: 'farm_crop', farmerId: FARMER, farmId: FARM })).toThrow();
    expect(() => build({ scopeLevel: 'farm_crop', farmerId: FARMER, farmCropId: FARM_CROP })).toThrow();
  });

  it('isAnchorComplete: un cultivo sin finca no es un ancla válida', () => {
    const isAnchorComplete = loadExport<(a: { farmId?: string | null; farmCropId?: string | null }) => boolean>(
      '../lib/surveyAnchor',
      'isAnchorComplete',
    );
    expect(isAnchorComplete({})).toBe(true);
    expect(isAnchorComplete({ farmId: FARM })).toBe(true);
    expect(isAnchorComplete({ farmId: FARM, farmCropId: FARM_CROP })).toBe(true);
    expect(isAnchorComplete({ farmId: null, farmCropId: FARM_CROP })).toBe(false);
  });
});

// ═══ C5 — el ancla se guarda en el borrador ══════════════════════════════════

describe('beginSurvey — C5: las anclas se guardan en el borrador', () => {
  it('crea el borrador con farmerId, farmId y farmCropId, sin sesión ni paso', async () => {
    await beginSurvey({
      instrumentId: 'inst-cultivo',
      farmerId: FARMER,
      farmId: FARM,
      farmCropId: FARM_CROP,
    } as Parameters<typeof beginSurvey>[0]);

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    const params = mockCreateDraft.mock.calls[0][0];
    expect(params).toMatchObject({ instrumentId: 'inst-cultivo', farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP });
    expect(params.campaignSessionId).toBeUndefined();
    expect(params.stepOrder).toBeUndefined();
  });

  it('dos inicios concurrentes del mismo instrumento en cultivos distintos crean dos borradores', async () => {
    const OTHER_CROP = 'fc000002-0000-4000-8000-000000000103';
    const [a, b] = await Promise.all([
      beginSurvey({ instrumentId: 'inst-cultivo', farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP } as Parameters<typeof beginSurvey>[0]),
      beginSurvey({ instrumentId: 'inst-cultivo', farmerId: FARMER, farmId: FARM, farmCropId: OTHER_CROP } as Parameters<typeof beginSurvey>[0]),
    ]);

    expect(a).not.toBe(b);
    expect(mockCreateDraft).toHaveBeenCalledTimes(2);
  });

  it('dos inicios concurrentes del mismo instrumento para productores distintos crean dos borradores', async () => {
    const OTHER = 'bbbbbbbb-0000-4000-8000-000000000103';
    const [a, b] = await Promise.all([
      beginSurvey({ instrumentId: 'inst-prod', farmerId: FARMER }),
      beginSurvey({ instrumentId: 'inst-prod', farmerId: OTHER }),
    ]);

    expect(a).not.toBe(b);
    expect(mockCreateDraft).toHaveBeenCalledTimes(2);
  });

  it('el doble toque sobre la misma unidad sigue creando un solo borrador', async () => {
    const params = { instrumentId: 'inst-finca', farmerId: FARMER, farmId: FARM } as Parameters<typeof beginSurvey>[0];
    const [a, b] = await Promise.all([beginSurvey(params), beginSurvey(params)]);

    expect(a).toBe(b);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
  });
});

// ═══ C5 — materializeSurvey envía las anclas sin sesión ══════════════════════

describe('SyncQueueService.materializeSurvey — C5: anclas sin campaignSessionId', () => {
  it('encuesta de cultivo: POST /api/surveys con farmerId, farmId y farmCropId, sin sesión', async () => {
    givenQueued({ farmerId: FARMER, farmId: FARM, farmCropId: FARM_CROP });

    await SyncQueueService.processAll();

    expect(mockCreateSurvey).toHaveBeenCalledTimes(1);
    const payload = mockCreateSurvey.mock.calls[0][0];
    expect(payload).toMatchObject({
      instrumentIds: ['inst-prod'],
      farmerId: FARMER,
      farmId: FARM,
      farmCropId: FARM_CROP,
      clientSurveyId: 'local_survey_103',
    });
    expect(payload.campaignSessionId).toBeUndefined();
    expect(payload.stepOrder).toBeUndefined();
    expect(markSessionAsSynced).not.toHaveBeenCalled();
    expect(syncQueueStorage.markSynced).toHaveBeenCalledWith('entry-103');
  });

  it('encuesta de finca: envía farmId y no farmCropId', async () => {
    givenQueued({ farmerId: FARMER, farmId: FARM });

    await SyncQueueService.processAll();

    const payload = mockCreateSurvey.mock.calls[0][0];
    expect(payload).toMatchObject({ farmerId: FARMER, farmId: FARM });
    expect(payload).not.toHaveProperty('farmCropId');
  });

  it('encuesta de productor: solo farmerId', async () => {
    givenQueued({ farmerId: FARMER });

    await SyncQueueService.processAll();

    const payload = mockCreateSurvey.mock.calls[0][0];
    expect(payload).toMatchObject({ farmerId: FARMER });
    expect(payload).not.toHaveProperty('farmId');
    expect(payload).not.toHaveProperty('farmCropId');
  });

  it('un contexto incompleto (cultivo sin finca) no se envía y queda en failed_validation', async () => {
    givenQueued({ farmerId: FARMER, farmCropId: FARM_CROP });

    await SyncQueueService.processAll();

    expect(mockCreateSurvey).not.toHaveBeenCalled();
    expect(submitResponsesBatch).not.toHaveBeenCalled();
    expect(syncQueueStorage.markSynced).not.toHaveBeenCalledWith('entry-103');
    expect(syncQueueStorage.markFailedValidation).toHaveBeenCalledWith('entry-103', expect.any(String));
  });
});

// ═══ C14 — convivencia con las encuestas de campaña (regresión) ══════════════

describe('C14 — las encuestas de campaña se sincronizan exactamente como antes', () => {
  it('lleva sesión y paso, no inventa anclas de finca y marca la sesión', async () => {
    givenQueued({ farmerId: FARMER, campaignSessionId: SESSION, stepOrder: 2 }, { campaignSessionId: SESSION, stepOrder: 2 });

    await SyncQueueService.processAll();

    const payload = mockCreateSurvey.mock.calls[0][0];
    expect(payload).toMatchObject({ campaignSessionId: SESSION, stepOrder: 2, farmerId: FARMER });
    expect(payload).not.toHaveProperty('farmId');
    expect(payload).not.toHaveProperty('farmCropId');
    expect((markSessionAsSynced as jest.Mock).mock.calls[0][0]).toBe(SESSION);
    expect(syncQueueStorage.markSynced).toHaveBeenCalledWith('entry-103');
  });

  it('una cola mixta (campaña + productor) envía cada una con su propio contexto', async () => {
    mockDequeue
      .mockResolvedValueOnce({ id: 'e-camp', surveyId: 'local_survey_camp', campaignSessionId: SESSION, stepOrder: 1, attempts: 0, status: 'pending', itemType: 'survey', createdAt: new Date() })
      .mockResolvedValueOnce({ id: 'e-prod', surveyId: 'local_survey_prod', attempts: 0, status: 'pending', itemType: 'survey', createdAt: new Date() })
      .mockResolvedValue(null);
    mockLoadDraft.mockImplementation(async (id: string) =>
      id === 'local_survey_camp'
        ? { surveyId: id, instrumentId: 'inst-prod', campaignSessionId: SESSION, stepOrder: 1, farmerId: FARMER, answers: { q1: { questionId: 'q1', textValue: 'a' } }, updatedAt: new Date() }
        : { surveyId: id, instrumentId: 'inst-prod', farmerId: FARMER, farmId: FARM, answers: { q1: { questionId: 'q1', textValue: 'b' } }, updatedAt: new Date() },
    );
    mockCreateSurvey.mockResolvedValueOnce({ surveyId: 'srv-camp' }).mockResolvedValueOnce({ surveyId: 'srv-prod' });

    await SyncQueueService.processAll();

    expect(mockCreateSurvey).toHaveBeenCalledTimes(2);
    const [campPayload] = mockCreateSurvey.mock.calls[0];
    const [prodPayload] = mockCreateSurvey.mock.calls[1];
    expect(campPayload).toMatchObject({ campaignSessionId: SESSION, stepOrder: 1 });
    expect(campPayload).not.toHaveProperty('farmId');
    expect(prodPayload).toMatchObject({ farmerId: FARMER, farmId: FARM });
    expect(prodPayload.campaignSessionId).toBeUndefined();
    expect(markSessionAsSynced).toHaveBeenCalledTimes(1);
  });
});
