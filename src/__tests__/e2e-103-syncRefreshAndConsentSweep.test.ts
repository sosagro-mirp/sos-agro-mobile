/**
 * Spec 103 — correcciones de la re-revisión (auditoría 80), rama
 * `bug/103-refresco-foto-y-consentimiento`.
 *
 * M1 (DM4): tras una corrida de sync que sacó entradas de la cola, la foto de
 *     cobertura se refresca. Antes se comparaba `pendingCount` del store, que no
 *     se actualiza al encolar: en el caso típico (encuestas sin red y reconexión)
 *     antes y después valían 0 y nunca se refrescaba.
 * M2: la constancia del alta de un productor nuevo (guardada al aceptar, anclada
 *     al S_REG, sin encolar) se recupera aunque el registro no se cierre en la
 *     app; si el S_REG se descartó, se marca `failed` y no se envía.
 */

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

const mockInsertValues = jest.fn().mockResolvedValue(undefined);
const mockUpdateWhere = jest.fn().mockResolvedValue({ changes: 1 });
const mockUpdateSet = jest.fn((_values: Record<string, unknown>) => ({ where: mockUpdateWhere }));

jest.mock('../storage/db/db', () => {
  const chain: Record<string, jest.Mock> = {};
  for (const m of ['from', 'where', 'orderBy', 'limit']) chain[m] = jest.fn(() => chain);
  chain.get = jest.fn().mockResolvedValue(undefined);
  chain.all = jest.fn().mockResolvedValue([]);
  return {
    db: {
      insert: jest.fn(() => ({ values: (v: unknown) => mockInsertValues(v) })),
      update: jest.fn(() => ({ set: (v: Record<string, unknown>) => mockUpdateSet(v) })),
      select: jest.fn(() => chain),
    },
  };
});

jest.mock('../api/httpClient', () => {
  const actual = jest.requireActual('../api/httpClient');
  return {
    ...actual,
    httpClient: { get: jest.fn(), post: jest.fn().mockResolvedValue(undefined), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
  };
});
jest.mock('../storage/secureStorage', () => ({
  secureStorage: { getActiveUserId: jest.fn().mockResolvedValue('user-1'), getTokenFor: jest.fn().mockResolvedValue('token-1') },
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
    countPending: jest.fn(),
    enqueue: jest.fn(),
  },
}));
jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: {
    loadDraft: jest.fn(),
    markSynced: jest.fn(),
    getBackendSurveyId: jest.fn(),
    setBackendSurveyId: jest.fn(),
    setFarmerId: jest.fn(),
    getStatus: jest.fn(),
  },
}));
jest.mock('../storage/consentRecordStore', () => ({
  consentRecordStore: {
    get: jest.fn(),
    markSynced: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    remapSession: jest.fn().mockResolvedValue(undefined),
    remapFarmer: jest.fn().mockResolvedValue(undefined),
    getBySessionId: jest.fn(),
    getByFarmerId: jest.fn(),
    listPendingSurveyAnchored: jest.fn(),
  },
}));
jest.mock('../api/consents', () => ({ submitConsent: jest.fn() }));
jest.mock('../storage/farmPlotStore', () => ({ farmPlotStore: { loadDraft: jest.fn(), markSynced: jest.fn() } }));
jest.mock('../api/farmPlots', () => ({ createFarmPlot: jest.fn() }));
jest.mock('../storage/instrumentCache', () => ({ instrumentCacheStorage: { get: jest.fn() } }));
jest.mock('../api/responses', () => ({ submitResponsesBatch: jest.fn() }));
jest.mock('../api/surveys', () => ({ markSurveyAsSynced: jest.fn(), createSurvey: jest.fn(), skipStepApi: jest.fn(), getSurveyExtraction: jest.fn() }));
jest.mock('../api/campaignSessions', () => ({ markSessionAsSynced: jest.fn(), createCampaignSession: jest.fn() }));
jest.mock('../api/farmers', () => {
  const actual = jest.requireActual('../api/farmers');
  return { extractFarmer: jest.fn(), extractCrops: jest.fn(), DocumentIdCollisionError: actual.DocumentIdCollisionError };
});
jest.mock('../storage/sessionCropsStorage', () => ({ sessionCropsStorage: { save: jest.fn(), get: jest.fn().mockResolvedValue([]) } }));
jest.mock('../store/useSyncStatusStore', () => ({ useSyncStatusStore: { getState: jest.fn() } }));
jest.mock('../lib/flattenSections', () => ({ flattenSections: jest.fn() }));
jest.mock('../lib/buildResponsesPayload', () => ({ buildResponsesPayload: jest.fn() }));
jest.mock('../storage/pendingSessions', () => ({
  pendingSessionStorage: { listPending: jest.fn().mockResolvedValue([]), getByLocal: jest.fn(), resolve: jest.fn(), markFailed: jest.fn() },
}));
jest.mock('../storage/farmerCache', () => ({
  farmerCacheStorage: {
    listRecent: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
    remove: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    getByDocumentId: jest.fn().mockResolvedValue(null),
    recordConsent: jest.fn().mockResolvedValue(1),
  },
}));
jest.mock('../lib/cacheFarmerIdentity', () => ({ cacheFarmerIdentity: jest.fn() }));
jest.mock('../storage/changeRequestStorage', () => ({
  changeRequestStorage: { listPendingSync: jest.fn().mockResolvedValue([]), markSynced: jest.fn(), markResolved: jest.fn() },
}));
jest.mock('../api/changeRequests', () => ({ postChangeRequest: jest.fn(), fetchMyResolved: jest.fn().mockResolvedValue([]) }));
jest.mock('../store/useChangeRequestStore', () => ({
  useChangeRequestStore: { getState: jest.fn().mockReturnValue({ loadAll: jest.fn().mockResolvedValue(undefined), setHasNewResolved: jest.fn() }) },
}));
jest.mock('../store/useAuthStore', () => ({ useAuthStore: { getState: jest.fn().mockReturnValue({ token: 'test-token' }) } }));
jest.mock('../store/useCampaignSessionStore', () => ({ useCampaignSessionStore: { getState: jest.fn() } }));
jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../sync/MediaUploadService', () => ({ MediaUploadService: { processPendingForSurvey: jest.fn().mockResolvedValue({}) } }));
jest.mock('../store/useCachedCampaignsStore', () => {
  const refreshCoverageSnapshot = jest.fn().mockResolvedValue(undefined);
  return { useCachedCampaignsStore: { getState: () => ({ refreshCoverageSnapshot }) } };
});

// ─── SUT e imports ───────────────────────────────────────────────────────────

import { SyncQueueService } from '../sync/SyncQueueService';
import { syncQueueStorage } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { consentRecordStore } from '../storage/consentRecordStore';
import { submitConsent } from '../api/consents';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { useCachedCampaignsStore } from '../store/useCachedCampaignsStore';
import { pendingSessionStorage } from '../storage/pendingSessions';
import { shouldRefreshCoverageAfterRun } from '../lib/shouldRefreshCoverageAfterRun';
import {
  sweepRegistrationConsents,
  type RegistrationConsentSweepDeps,
} from '../lib/registrationConsentSweep';
import { enqueueConsent } from '../lib/saveAnchoredConsent';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FARMER = 'aaaaaaaa-0000-4000-8000-000000000103';
const LOCAL_SREG = 'local_survey_5e0c0000-0000-4000-8000-000000000103';
const CONSENT_DOC = '44444444-4444-4444-8444-444444444103';

function consent(id: string, surveyId: string | null, farmerId: string | null = null) {
  return {
    id,
    sessionId: undefined,
    farmerId: farmerId ?? undefined,
    surveyId: surveyId ?? undefined,
    consentDocumentId: CONSENT_DOC,
    respondentName: 'Ana Pérez',
    acceptedDataProcessing: true,
    acceptedPhoto: false,
    acceptedAudio: false,
    acceptedVideo: false,
    acceptedFollowUpContact: false,
    acceptedAt: new Date('2026-11-09T09:00:00.000Z'),
    status: 'pending' as const,
    createdAt: new Date('2026-11-09T09:00:00.000Z'),
  };
}

const refreshCoverageSnapshot = () =>
  useCachedCampaignsStore.getState().refreshCoverageSnapshot as jest.Mock;

/** Una entrada de consentimiento anclada a un productor real que se envía bien. */
function givenOneSyncableConsentEntry() {
  (syncQueueStorage.dequeueNextPending as jest.Mock)
    .mockResolvedValueOnce({
      id: 'entry-consent-farmer',
      surveyId: 'local_consent_farmer',
      itemType: 'consent',
      attempts: 0,
      status: 'pending',
      createdAt: new Date(),
    })
    .mockResolvedValue(null);
  (consentRecordStore.get as jest.Mock).mockResolvedValue(consent('local_consent_farmer', null, FARMER));
}

beforeEach(() => {
  jest.clearAllMocks();
  SyncQueueService.resetNetworkFailures();
  (useSyncStatusStore.getState as jest.Mock).mockReturnValue({
    isOnline: true,
    // El contador del store no se actualiza al encolar: vale 0 en el caso típico.
    pendingCount: 0,
    setSyncingId: jest.fn(),
    markSyncCompleted: jest.fn(),
    refreshPendingCount: jest.fn().mockResolvedValue(undefined),
  });
  (useCampaignSessionStore.getState as jest.Mock).mockReturnValue({
    localSessionId: null,
    localFarmerId: null,
    injectionPhase: 'none',
    resolveSession: jest.fn(),
    resolveFarmer: jest.fn(),
  });
  (syncQueueStorage.dequeueNextPending as jest.Mock).mockResolvedValue(null);
  (syncQueueStorage.markInFlight as jest.Mock).mockResolvedValue(undefined);
  (syncQueueStorage.markSynced as jest.Mock).mockResolvedValue(undefined);
  (syncQueueStorage.resetInFlightToRetryById as jest.Mock).mockResolvedValue(undefined);
  (syncQueueStorage.getActiveBySurveyId as jest.Mock).mockResolvedValue(null);
  (syncQueueStorage.enqueue as jest.Mock).mockResolvedValue(undefined);
  (syncQueueStorage.countPending as jest.Mock).mockResolvedValue(0);
  (consentRecordStore.listPendingSurveyAnchored as jest.Mock).mockResolvedValue([]);
  (surveyDraftStore.getBackendSurveyId as jest.Mock).mockResolvedValue(null);
  (surveyDraftStore.getStatus as jest.Mock).mockResolvedValue(null);
  (pendingSessionStorage.listPending as jest.Mock).mockResolvedValue([]);
  (submitConsent as jest.Mock).mockResolvedValue({ consentRecordId: 'srv-consent-103' });
});

// ═══ M1 — refresco de la foto tras sincronizar (DM4) ═════════════════════════

describe('shouldRefreshCoverageAfterRun', () => {
  it('refresca si la corrida atendió entradas y la cola bajó', () => {
    expect(shouldRefreshCoverageAfterRun({ attended: 3, pendingBefore: 3, pendingAfter: 0 })).toBe(true);
  });

  it('no refresca si no atendió nada, si la cola no bajó o si no se pudo contar', () => {
    expect(shouldRefreshCoverageAfterRun({ attended: 0, pendingBefore: 3, pendingAfter: 0 })).toBe(false);
    expect(shouldRefreshCoverageAfterRun({ attended: 2, pendingBefore: 2, pendingAfter: 2 })).toBe(false);
    expect(shouldRefreshCoverageAfterRun({ attended: 1, pendingBefore: null, pendingAfter: 0 })).toBe(false);
    expect(shouldRefreshCoverageAfterRun({ attended: 1, pendingBefore: 1, pendingAfter: null })).toBe(false);
  });
});

describe('processAll — M1: refresca la foto aunque el contador del store valga 0', () => {
  it('cola con 1 pendiente que se envía → refreshCoverageSnapshot', async () => {
    givenOneSyncableConsentEntry();
    (syncQueueStorage.countPending as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await SyncQueueService.processAll();

    expect(submitConsent).toHaveBeenCalledTimes(1);
    // Cuenta la cola completa (todos los dueños), no solo al usuario activo.
    expect(syncQueueStorage.countPending).toHaveBeenCalledWith();
    expect(refreshCoverageSnapshot()).toHaveBeenCalledTimes(1);
  });

  it('si la cola no bajó (la entrada se difirió), no refresca', async () => {
    givenOneSyncableConsentEntry();
    (syncQueueStorage.countPending as jest.Mock).mockResolvedValue(1);

    await SyncQueueService.processAll();

    expect(refreshCoverageSnapshot()).not.toHaveBeenCalled();
  });

  it('si no se puede contar la cola, no refresca y la corrida no falla', async () => {
    givenOneSyncableConsentEntry();
    (syncQueueStorage.countPending as jest.Mock).mockRejectedValue(new Error('db locked'));

    await expect(SyncQueueService.processAll()).resolves.toBeUndefined();

    expect(submitConsent).toHaveBeenCalledTimes(1);
    expect(refreshCoverageSnapshot()).not.toHaveBeenCalled();
  });
});

// ═══ M2 — constancias del alta que quedaron sin encolar ══════════════════════

function deps(overrides: Partial<RegistrationConsentSweepDeps> = {}) {
  const base: RegistrationConsentSweepDeps = {
    listPending: jest.fn().mockResolvedValue([]),
    hasActiveQueueEntry: jest.fn().mockResolvedValue(false),
    surveyStatusOf: jest.fn().mockResolvedValue(null),
    enqueue: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  return { ...base, ...overrides } as RegistrationConsentSweepDeps & Record<keyof RegistrationConsentSweepDeps, jest.Mock>;
}

describe('sweepRegistrationConsents', () => {
  it('S_REG terminado sin cerrar el registro (app cerrada en «Encuesta completada») → encola la constancia', async () => {
    const d = deps({
      listPending: jest.fn().mockResolvedValue([consent('c-completed', LOCAL_SREG)]),
      surveyStatusOf: jest.fn().mockResolvedValue('completed'),
    });

    const result = await sweepRegistrationConsents(d);

    expect(d.enqueue).toHaveBeenCalledWith('c-completed');
    expect(d.markFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: ['c-completed'], discarded: [] });
  });

  it('S_REG ya sincronizado → también la encola', async () => {
    const d = deps({
      listPending: jest.fn().mockResolvedValue([consent('c-synced', LOCAL_SREG)]),
      surveyStatusOf: jest.fn().mockResolvedValue('synced'),
    });

    await sweepRegistrationConsents(d);

    expect(d.enqueue).toHaveBeenCalledWith('c-synced');
  });

  it('S_REG todavía en borrador → espera (el registro sigue en curso)', async () => {
    const d = deps({
      listPending: jest.fn().mockResolvedValue([consent('c-draft', LOCAL_SREG)]),
      surveyStatusOf: jest.fn().mockResolvedValue('draft'),
    });

    const result = await sweepRegistrationConsents(d);

    expect(d.enqueue).not.toHaveBeenCalled();
    expect(d.markFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: [], discarded: [] });
  });

  it('S_REG descartado desde Borradores → la constancia se marca failed y no se envía', async () => {
    const d = deps({
      listPending: jest.fn().mockResolvedValue([consent('c-orphan', LOCAL_SREG)]),
      surveyStatusOf: jest.fn().mockResolvedValue(null),
    });

    const result = await sweepRegistrationConsents(d);

    expect(d.markFailed).toHaveBeenCalledWith('c-orphan');
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(result.discarded).toEqual(['c-orphan']);
  });

  it('constancia que ya está en la cola → no la toca', async () => {
    const d = deps({
      listPending: jest.fn().mockResolvedValue([consent('c-queued', LOCAL_SREG)]),
      hasActiveQueueEntry: jest.fn().mockResolvedValue(true),
    });

    await sweepRegistrationConsents(d);

    expect(d.surveyStatusOf).not.toHaveBeenCalled();
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(d.markFailed).not.toHaveBeenCalled();
  });
});

describe('processAll — M2: el barrido corre al inicio de la sincronización', () => {
  it('encola la constancia de un S_REG terminado que no tenía entrada en la cola', async () => {
    (consentRecordStore.listPendingSurveyAnchored as jest.Mock).mockResolvedValue([consent('c-completed', LOCAL_SREG)]);
    (surveyDraftStore.getStatus as jest.Mock).mockResolvedValue('completed');

    await SyncQueueService.processAll();

    expect(syncQueueStorage.enqueue).toHaveBeenCalledTimes(1);
    expect(syncQueueStorage.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ surveyId: 'c-completed', itemType: 'consent' }),
    );
  });

  it('un fallo del barrido no detiene la sincronización', async () => {
    (consentRecordStore.listPendingSurveyAnchored as jest.Mock).mockRejectedValue(new Error('db locked'));
    givenOneSyncableConsentEntry();

    await expect(SyncQueueService.processAll()).resolves.toBeUndefined();

    expect(submitConsent).toHaveBeenCalledTimes(1);
  });
});

describe('enqueueConsent — idempotente', () => {
  it('no duplica la entrada si la constancia ya está en la cola («Ver productor» después del barrido)', async () => {
    (syncQueueStorage.getActiveBySurveyId as jest.Mock).mockResolvedValue({ id: 'entry-1', surveyId: 'c-1' });

    await enqueueConsent('c-1');

    expect(syncQueueStorage.enqueue).not.toHaveBeenCalled();
  });

  it('la encola si no tiene entrada activa', async () => {
    await enqueueConsent('c-2');

    expect(syncQueueStorage.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ surveyId: 'c-2', itemType: 'consent' }),
    );
  });
});
