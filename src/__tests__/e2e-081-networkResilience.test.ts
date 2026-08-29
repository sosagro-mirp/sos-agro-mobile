/**
 * Spec 81 — Resiliencia de red en pre-encuesta y extracción de agricultor.
 *
 * Cubre los criterios de aceptación verificables en unitario de
 * `spec/81_resiliencia_red_pre_survey_extract_farmer.md`: 1, 2, 4, 5, 6, 7 y 9.
 * Los criterios 3, 8, 10 y 11 son de UI/campo y viven en
 * `docs/testing/test-081-resiliencia-red.md`.
 *
 * ARRANCA EN ROJO, a propósito:
 *   - `src/lib/mergeFarmerResults.ts` no existe todavía (Fase 1).
 *   - `src/lib/withNetworkRetry.ts` no existe todavía (Fase 2).
 *   - `syncQueueStorage.resetInFlightToRetryBySurveyId()` no existe todavía y
 *     `processSurveyNow()` no la llama (Fase 3).
 *   - `useSyncStatusStore` no tiene `reachability` ni `setReachability()`
 *     (Fase 4).
 *
 * Contexto: los tres hallazgos de producción que originan el spec comparten
 * raíz — la app trata cualquier fallo de red como estado terminal, sin
 * fallback a caché, sin reintento y sin distinguir "sin red" de "servidor
 * inalcanzable".
 */

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

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
    resetInFlightToRetryBySurveyId: jest.fn(),
    countPending: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: {
    loadDraft: jest.fn(),
    markSynced: jest.fn(),
    getBackendSurveyId: jest.fn(),
    setBackendSurveyId: jest.fn(),
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
    searchFarmers: jest.fn(),
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
    search: jest.fn().mockResolvedValue([]),
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

import { NetworkError, ServerError } from '../api/httpClient';
import { SyncQueueService } from '../sync/SyncQueueService';
import { syncQueueStorage } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { pendingSessionStorage } from '../storage/pendingSessions';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { DocumentIdCollisionError } from '../api/farmers';

// Fase 1 y 2 — módulos nuevos: hoy no existen y el archivo no compila.
import { mergeFarmerResults } from '../lib/mergeFarmerResults';
import { withNetworkRetry } from '../lib/withNetworkRetry';

const mockGetPendingBySurveyId = syncQueueStorage.getPendingBySurveyId as jest.Mock;
const mockGetActiveBySurveyId = syncQueueStorage.getActiveBySurveyId as jest.Mock;
const mockResetBySurveyId =
  syncQueueStorage.resetInFlightToRetryBySurveyId as unknown as jest.Mock;
const mockMarkInFlight = syncQueueStorage.markInFlight as jest.Mock;
const mockIncrementAttempts = syncQueueStorage.incrementAttempts as jest.Mock;
const mockLoadDraft = surveyDraftStore.loadDraft as jest.Mock;
const mockGetByLocal = pendingSessionStorage.getByLocal as jest.Mock;
const mockSyncStatusGetState = useSyncStatusStore.getState as jest.Mock;

const NET_FARMER = {
  farmerId: '11111111-1111-4111-8111-111111111111',
  name: 'Rosa Delgado',
  documentId: '52144789',
  phone: '3001112233',
  farm: { name: 'La Esperanza', crops: null },
};

const CACHED_SAME = {
  farmerId: '11111111-1111-4111-8111-111111111111',
  name: 'Rosa Delgado',
  documentId: '52144789',
  phone: null,
  farmName: 'La Esperanza',
  crops: null,
};

const CACHED_OTHER = {
  farmerId: '22222222-2222-4222-8222-222222222222',
  name: 'Rosalba Díaz',
  documentId: '52144790',
  phone: null,
  farmName: 'El Mirador',
  crops: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncStatusGetState.mockReturnValue({
    setSyncingId: jest.fn(),
    markSyncCompleted: jest.fn(),
    refreshPendingCount: jest.fn().mockResolvedValue(undefined),
    lastSyncAt: null,
    isOnline: true,
  });
  SyncQueueService.resetNetworkFailures();
});

// ─── Criterio 1 — la caché local nunca queda fuera de la búsqueda ────────────

describe('Criterio 1 — la búsqueda no depende de la red', () => {
  it('devuelve los agricultores de caché cuando la red no aportó resultados', () => {
    const merged = mergeFarmerResults({ network: [], cached: [CACHED_SAME, CACHED_OTHER] });

    expect(merged).toHaveLength(2);
    expect(merged.map((f) => f.farmerId)).toEqual([
      CACHED_SAME.farmerId,
      CACHED_OTHER.farmerId,
    ]);
  });

  it('marca como `fromCache` solo lo que no vino de la red', () => {
    const merged = mergeFarmerResults({ network: [NET_FARMER], cached: [CACHED_OTHER] });

    const byId = Object.fromEntries(merged.map((f) => [f.farmerId, f]));
    expect(byId[NET_FARMER.farmerId].fromCache).toBe(false);
    expect(byId[CACHED_OTHER.farmerId].fromCache).toBe(true);
  });
});

// ─── Criterio 2 — sin duplicados en la fusión ───────────────────────────────

describe('Criterio 2 — la fusión red + caché no duplica agricultores', () => {
  it('colapsa por farmerId y deja ganar el dato de red', () => {
    const merged = mergeFarmerResults({ network: [NET_FARMER], cached: [CACHED_SAME] });

    expect(merged).toHaveLength(1);
    expect(merged[0].phone).toBe(NET_FARMER.phone);
  });

  it('colapsa por documentId aunque el id local sea provisional', () => {
    const provisional = { ...CACHED_SAME, farmerId: 'local_farmer_abc123' };
    const merged = mergeFarmerResults({ network: [NET_FARMER], cached: [provisional] });

    expect(merged).toHaveLength(1);
    expect(merged[0].farmerId).toBe(NET_FARMER.farmerId);
  });
});

// ─── Criterio 4 y 5 — reintento acotado, solo para NetworkError ─────────────

describe('Criterios 4 y 5 — withNetworkRetry', () => {
  it('reintenta un NetworkError y resuelve si el siguiente intento funciona', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce('ok');

    await expect(withNetworkRetry(op, { attempts: 3, baseDelayMs: 0 })).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('se rinde tras agotar los intentos y propaga el NetworkError', async () => {
    const op = jest.fn().mockRejectedValue(new NetworkError());

    await expect(
      withNetworkRetry(op, { attempts: 3, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('informa cada reintento para que la UI pueda mostrarlo', async () => {
    const onRetry = jest.fn();
    const op = jest.fn().mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce('ok');

    await withNetworkRetry(op, { attempts: 3, baseDelayMs: 0, onRetry });

    expect(onRetry).toHaveBeenCalledWith(1);
  });

  it('NO reintenta un ServerError', async () => {
    const op = jest.fn().mockRejectedValue(new ServerError(500, 'boom'));

    await expect(
      withNetworkRetry(op, { attempts: 3, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(ServerError);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('NO reintenta una colisión de documentId (spec 68): debe llegar intacta a la UI', async () => {
    const collision = new DocumentIdCollisionError({
      documentId: '52144789',
      submittedName: 'Rosa D.',
      existingFarmerName: 'Rosa Delgado',
    } as never);
    const op = jest.fn().mockRejectedValue(collision);

    await expect(withNetworkRetry(op, { attempts: 3, baseDelayMs: 0 })).rejects.toBe(collision);
    expect(op).toHaveBeenCalledTimes(1);
  });
});

// ─── Criterio 6 — processSurveyNow desatasca su propia entrada ──────────────

describe('Criterio 6 — una entrada in_flight se recupera desde el camino interactivo', () => {
  it('resetea la entrada de ese surveyId antes de consultarla', async () => {
    mockGetPendingBySurveyId.mockResolvedValue(null);
    mockGetActiveBySurveyId.mockResolvedValue(null);

    await SyncQueueService.processSurveyNow('local_survey_s1');

    expect(mockResetBySurveyId).toHaveBeenCalledWith('local_survey_s1');
    // El reset ocurre ANTES de la consulta, o la consulta seguiría viendo null.
    expect(mockResetBySurveyId.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetPendingBySurveyId.mock.invocationCallOrder[0],
    );
  });

  it('un segundo llamado sí procesa la entrada que el primero dejó in_flight', async () => {
    const entry = {
      id: 'q1',
      surveyId: 'local_survey_s1',
      attempts: 1,
      status: 'in_flight' as const,
    };

    // Primer llamado: la entrada está in_flight → hoy caería al bucle de
    // espera y volvería sin sincronizar. Tras el reset debe verse `pending`.
    mockResetBySurveyId.mockImplementation(async () => {
      entry.status = 'pending' as never;
    });
    mockGetPendingBySurveyId.mockImplementation(async () =>
      entry.status === 'pending' ? entry : null,
    );
    mockLoadDraft.mockResolvedValue(null);

    await SyncQueueService.processSurveyNow('local_survey_s1');

    expect(mockMarkInFlight).toHaveBeenCalledWith('q1');
  });
});

// ─── Criterio 7 — aplazar no deja la entrada in_flight ──────────────────────

describe('Criterio 7 — el aplazamiento por sesión provisional devuelve la entrada a pending', () => {
  it('no deja la entrada en in_flight cuando la sesión sigue sin resolverse', async () => {
    const entry = {
      id: 'q2',
      surveyId: 'local_survey_s1',
      campaignSessionId: 'local_session_xyz',
      attempts: 0,
      status: 'pending' as const,
    };
    mockGetPendingBySurveyId.mockResolvedValue(entry);
    mockGetByLocal.mockResolvedValue({ status: 'pending' });

    await SyncQueueService.processSurveyNow('local_survey_s1');

    expect(mockMarkInFlight).toHaveBeenCalledWith('q2');
    // Debe volver a quedar procesable sin depender del finally de processAll().
    expect(mockIncrementAttempts.mock.calls.length + mockResetBySurveyId.mock.calls.length)
      .toBeGreaterThan(0);
  });
});

// ─── Criterio 9 — tres estados de conectividad ─────────────────────────────

describe('Criterio 9 — "sin conexión" y "servidor inalcanzable" son estados distintos', () => {
  it('el store expone reachability y deriva isOnline de él', () => {
    jest.isolateModules(() => {
      jest.doMock('../storage/mediaUploadQueueStorage', () => ({
        mediaUploadQueueStorage: { countPending: jest.fn().mockResolvedValue(0) },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useSyncStatusStore: realStore } = jest.requireActual(
        '../store/useSyncStatusStore',
      );

      realStore.getState().setReachability('server_unreachable');
      expect(realStore.getState().reachability).toBe('server_unreachable');
      expect(realStore.getState().isOnline).toBe(false);

      realStore.getState().setReachability('offline');
      expect(realStore.getState().reachability).toBe('offline');
      expect(realStore.getState().isOnline).toBe(false);

      realStore.getState().setReachability('online');
      expect(realStore.getState().isOnline).toBe(true);
    });
  });
});
