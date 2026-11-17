/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6).
 * Registro de productor nuevo sin conexión desde «Productores» (DM7) y remapeo
 * del id provisional al sincronizar. Cubre el criterio C9 de
 * `spec/103_encuestador_movil_por_productor.md`. La red de seguridad del
 * flujo de campañas sigue en `e2e-084`, `e2e-068-*`, `e2e-090` y `e2e-096`.
 *
 * ARRANCA EN ROJO. Motivos esperados:
 *   - `src/lib/registrationCompletion.ts` y `src/storage/coverageCache.ts` no
 *     existen (Fases 2 y 6).
 *   - `extractCropsOffline()` exige `campaignId` y sin campaña devuelve [] (Fase 4).
 *   - `applyResolvedExtraction` no remapea el productor provisional en la caché
 *     de cobertura ni en las constancias (Fase 4).
 *
 * `../storage/coverageCache` se registra con `jest.doMock(..., { virtual })`
 * (virtual solo mientras no exista) y `SyncQueueService` se carga con
 * `require` después, para que vea ese mock cuando lo importe.
 *
 * ── Contrato de `src/lib/registrationCompletion.ts` ────────────────────────
 *
 *   export type RegistrationCompletionOutcome =
 *     | { kind: 'resolved'; farmerId: string; farmerName: string; isProvisional: boolean; crops: CropSummary[] }
 *     | { kind: 'collision'; documentId: string; submittedName: string; existingFarmerName: string;
 *         localDraft: LocalFarmerDraft }
 *     | { kind: 'pending' };              // sin identidad legible en el borrador
 *
 *   export function completeRegistrationOffline(params: {
 *     registroSurveyId: string;           // id local del S_REG
 *     campaignId?: string;                // solo en el flujo de campaña
 *     sessionId?: string;                 // solo en el flujo de campaña
 *   }): Promise<RegistrationCompletionOutcome>;
 *     Lógica extraída del orquestador, sin cambiar su comportamiento:
 *     1. `extractFarmerLocally(registroSurveyId)`; null → 'pending'.
 *     2. Colisión de documento contra la caché → 'collision', sin efectos
 *        (la pantalla muestra `DocumentIdCollisionModal`).
 *     3. `cacheFarmerIdentity(...)`; si es provisional,
 *        `surveyDraftStore.setFarmerId(registroSurveyId, farmerId)` y
 *        `coverageCacheStorage.addProvisional({ farmerId, name, documentId })`
 *        (aparece en la lista como provisional).
 *     4. `extractCropsOffline(registroSurveyId, campaignId)` — `campaignId`
 *        puede faltar.
 *     5. Con `sessionId`: `applyPendingConsentToFarmer(sessionId, farmerId)` y
 *        `sessionCropsStorage.save(sessionId, crops)` si hay cultivos.
 *
 * ── Cambios en módulos existentes ────────────────────────────────────────────
 *
 *   extractCropsOffline(surveyId: string, campaignId?: string): Promise<CropSummary[]>
 *     Sin `campaignId`, el cultivo elegido en la pregunta `farm.crops` del S_REG
 *     se resuelve con la propia opción (`metadataId` = cropId, `text` = nombre),
 *     sin consultar la caché de campañas.
 *
 *   SyncQueueService.applyResolvedExtraction, con productor provisional:
 *     además de lo de hoy (surveys.farmer_id, farmer_cache), llama a
 *     `coverageCacheStorage.remapFarmer(localId, realId)` y a
 *     `consentRecordStore.remapFarmer(localId, realId)`.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Mocks de módulos existentes (hoisted) ───────────────────────────────────

const mockSet = jest.fn((_values: Record<string, unknown>) => ({ where: jest.fn().mockResolvedValue(undefined) }));
const mockChain: Record<string, jest.Mock> = {};

jest.mock('../storage/db/db', () => {
  for (const m of ['from', 'where', 'orderBy']) mockChain[m] = jest.fn(() => mockChain);
  mockChain.get = jest.fn();
  mockChain.all = jest.fn();
  return {
    db: {
      update: jest.fn(() => ({ set: mockSet })),
      select: jest.fn(() => mockChain),
    },
  };
});

jest.mock('../api/httpClient', () => {
  const actual = jest.requireActual('../api/httpClient');
  return { ...actual, httpClient: { get: jest.fn(), post: jest.fn().mockResolvedValue(undefined), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } };
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
  },
}));
jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: { loadDraft: jest.fn(), markSynced: jest.fn(), getBackendSurveyId: jest.fn(), setBackendSurveyId: jest.fn(), setFarmerId: jest.fn() },
}));
jest.mock('../storage/consentRecordStore', () => ({
  consentRecordStore: {
    get: jest.fn(),
    markSynced: jest.fn(),
    markFailed: jest.fn(),
    remapSession: jest.fn(),
    remapFarmer: jest.fn().mockResolvedValue(undefined),
    getBySessionId: jest.fn(),
  },
}));
jest.mock('../api/consents', () => ({ submitConsent: jest.fn() }));
jest.mock('../storage/farmPlotStore', () => ({ farmPlotStore: { loadDraft: jest.fn(), markSynced: jest.fn() } }));
jest.mock('../api/farmPlots', () => ({ createFarmPlot: jest.fn() }));
jest.mock('../storage/instrumentCache', () => ({ instrumentCacheStorage: { get: jest.fn() } }));
jest.mock('../storage/campaignCache', () => ({ campaignCacheStorage: { get: jest.fn(), list: jest.fn().mockResolvedValue([]) } }));
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
    remove: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    getByDocumentId: jest.fn().mockResolvedValue(null),
    recordConsent: jest.fn().mockResolvedValue(1),
  },
}));
jest.mock('../lib/cacheFarmerIdentity', () => ({ cacheFarmerIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/extractFarmerLocally', () => ({ extractFarmerLocally: jest.fn(), readFarmerIdentityFromDraft: jest.fn() }));
jest.mock('../lib/extractCropsOffline', () => ({ extractCropsOffline: jest.fn().mockResolvedValue([]) }));
jest.mock('../lib/applyPendingConsentToFarmer', () => ({ applyPendingConsentToFarmer: jest.fn().mockResolvedValue(undefined) }));
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

// ─── Mock del módulo futuro ──────────────────────────────────────────────────

function moduleExists(rel: string): boolean {
  const base = path.resolve(__dirname, rel);
  return ['.ts', '.tsx', '/index.ts'].some((ext) => fs.existsSync(base + ext));
}

const coverageCacheMock = {
  coverageCacheStorage: {
    replaceAll: jest.fn(),
    getSnapshotMeta: jest.fn().mockResolvedValue(null),
    list: jest.fn().mockResolvedValue([]),
    getDetail: jest.fn().mockResolvedValue(null),
    addProvisional: jest.fn().mockResolvedValue(undefined),
    remapFarmer: jest.fn().mockResolvedValue(undefined),
  },
};
jest.doMock('../storage/coverageCache', () => coverageCacheMock, { virtual: !moduleExists('../storage/coverageCache') });

// ─── SUT e imports ───────────────────────────────────────────────────────────

import { syncQueueStorage } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { consentRecordStore } from '../storage/consentRecordStore';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { campaignCacheStorage } from '../storage/campaignCache';
import { submitResponsesBatch } from '../api/responses';
import { createSurvey, getSurveyExtraction, markSurveyAsSynced } from '../api/surveys';
import { farmerCacheStorage } from '../storage/farmerCache';
import { cacheFarmerIdentity } from '../lib/cacheFarmerIdentity';
import { extractFarmerLocally } from '../lib/extractFarmerLocally';
import { extractCropsOffline } from '../lib/extractCropsOffline';
import { applyPendingConsentToFarmer } from '../lib/applyPendingConsentToFarmer';
import { sessionCropsStorage } from '../storage/sessionCropsStorage';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { flattenSections } from '../lib/flattenSections';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SyncQueueService } = require('../sync/SyncQueueService') as typeof import('../sync/SyncQueueService');

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

type Outcome =
  | { kind: 'resolved'; farmerId: string; farmerName: string; isProvisional: boolean; crops: { cropId: string; name: string }[] }
  | { kind: 'collision'; documentId: string; submittedName: string; existingFarmerName: string; localDraft: unknown }
  | { kind: 'pending' };
type CompleteOffline = (p: { registroSurveyId: string; campaignId?: string; sessionId?: string }) => Promise<Outcome>;
const completeRegistrationOffline = () =>
  loadExport<CompleteOffline>('../lib/registrationCompletion', 'completeRegistrationOffline');

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LOCAL = 'local_farmer_9c3f1b2a-8e7d-4f2e-9a1b-2c3d4e5f6103';
const REAL = 'd0fcfb80-68c7-43aa-b1f0-bafe47b14103';
const FARM = '5b0e6a3c-1d2e-4f30-9a8b-7c6d5e4f3103';
const SREG = 'local_survey_reg_103';
const CAFE = { cropId: 'crop-cafe-uuid', name: 'Café' };

function localDraft(extra: Record<string, unknown> = {}) {
  return {
    farmerId: LOCAL,
    name: 'Productora Nueva',
    documentId: '900103001',
    phone: '3000000000',
    farmName: 'La Nueva',
    corregimiento: null,
    isProvisional: true,
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  SyncQueueService.resetNetworkFailures();
  for (const m of ['from', 'where', 'orderBy']) mockChain[m].mockImplementation(() => mockChain);
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
  (syncQueueStorage.dequeueNextPending as jest.Mock).mockResolvedValue(null);
  (surveyDraftStore.getBackendSurveyId as jest.Mock).mockResolvedValue(null);
  (extractCropsOffline as jest.Mock).mockResolvedValue([]);
});

// ═══ C9 — registro offline desde «Productores» ═══════════════════════════════

describe('completeRegistrationOffline — C9: productor nuevo sin conexión y sin campaña', () => {
  it('cachea la identidad, marca el S_REG con el id provisional y lo agrega como provisional a la lista', async () => {
    (extractFarmerLocally as jest.Mock).mockResolvedValue(localDraft());

    const outcome = await completeRegistrationOffline()({ registroSurveyId: SREG });

    expect(outcome).toMatchObject({ kind: 'resolved', farmerId: LOCAL, isProvisional: true });
    expect(cacheFarmerIdentity).toHaveBeenCalledWith(expect.objectContaining({ farmerId: LOCAL, name: 'Productora Nueva', documentId: '900103001' }));
    expect(surveyDraftStore.setFarmerId).toHaveBeenCalledWith(SREG, LOCAL);
    expect(coverageCacheMock.coverageCacheStorage.addProvisional).toHaveBeenCalledWith(
      expect.objectContaining({ farmerId: LOCAL, name: 'Productora Nueva', documentId: '900103001' }),
    );
  });

  it('extrae los cultivos sin campaignId y no toca la sesión de campaña', async () => {
    (extractFarmerLocally as jest.Mock).mockResolvedValue(localDraft());
    (extractCropsOffline as jest.Mock).mockResolvedValue([CAFE]);

    const outcome = await completeRegistrationOffline()({ registroSurveyId: SREG });

    expect(extractCropsOffline).toHaveBeenCalledTimes(1);
    expect((extractCropsOffline as jest.Mock).mock.calls[0][0]).toBe(SREG);
    expect((extractCropsOffline as jest.Mock).mock.calls[0][1]).toBeUndefined();
    expect(outcome).toMatchObject({ kind: 'resolved', crops: [CAFE] });
    expect(sessionCropsStorage.save).not.toHaveBeenCalled();
    expect(applyPendingConsentToFarmer).not.toHaveBeenCalled();
  });

  it('una colisión de documento contra la caché devuelve la colisión sin efectos', async () => {
    (extractFarmerLocally as jest.Mock).mockResolvedValue(
      localDraft({
        collision: { documentId: '900103001', existingFarmerId: REAL, existingName: 'Otra Persona', submittedName: 'Productora Nueva' },
      }),
    );

    const outcome = await completeRegistrationOffline()({ registroSurveyId: SREG });

    expect(outcome).toMatchObject({
      kind: 'collision',
      documentId: '900103001',
      submittedName: 'Productora Nueva',
      existingFarmerName: 'Otra Persona',
    });
    expect(cacheFarmerIdentity).not.toHaveBeenCalled();
    expect(coverageCacheMock.coverageCacheStorage.addProvisional).not.toHaveBeenCalled();
    expect(surveyDraftStore.setFarmerId).not.toHaveBeenCalled();
  });

  it('sin identidad legible queda pendiente', async () => {
    (extractFarmerLocally as jest.Mock).mockResolvedValue(null);

    await expect(completeRegistrationOffline()({ registroSurveyId: SREG })).resolves.toEqual({ kind: 'pending' });
  });

  it('en el flujo de campaña conserva lo de hoy: consentimiento de la sesión y cultivos de la sesión', async () => {
    (extractFarmerLocally as jest.Mock).mockResolvedValue(localDraft());
    (extractCropsOffline as jest.Mock).mockResolvedValue([CAFE]);

    await completeRegistrationOffline()({ registroSurveyId: SREG, campaignId: 'c1', sessionId: 'local_session_1' });

    expect(extractCropsOffline).toHaveBeenCalledWith(SREG, 'c1');
    expect(applyPendingConsentToFarmer).toHaveBeenCalledWith('local_session_1', LOCAL);
    expect(sessionCropsStorage.save).toHaveBeenCalledWith('local_session_1', [CAFE]);
  });
});

// ═══ C9 — extractCropsOffline sin campaignId ═════════════════════════════════

describe('extractCropsOffline — C9: sin campaña', () => {
  it('resuelve el cultivo elegido en farm.crops con la propia opción del S_REG', async () => {
    const realExtract = loadExport<(id: string, campaignId?: string) => Promise<unknown>>(
      '../lib/extractCropsOffline',
      'extractCropsOffline',
    );
    mockChain.get.mockResolvedValue({ instrumentId: 'inst-sreg' });
    (instrumentCacheStorage.get as jest.Mock).mockResolvedValue({
      instrumentId: 'inst-sreg',
      code: 'S_REG',
      sections: [
        {
          sectionId: 'sec-1',
          questions: [
            {
              questionId: 'q-crops',
              systemField: 'farm.crops',
              options: [
                { optionId: 'opt-cafe', text: 'Café', value: 'cafe', metadataId: CAFE.cropId },
                { optionId: 'opt-cacao', text: 'Cacao', value: 'cacao', metadataId: 'crop-cacao-uuid' },
              ],
            },
          ],
        },
      ],
    });
    // 1.ª consulta: respuestas Sí/No afirmativas (ninguna); 2.ª: respuestas de opción.
    mockChain.all.mockResolvedValueOnce([]).mockResolvedValueOnce([{ questionId: 'q-crops', optionId: 'opt-cafe' }]);

    const crops = await realExtract(SREG);

    expect(crops).toEqual([CAFE]);
    expect(campaignCacheStorage.get).not.toHaveBeenCalled();
  });
});

// ═══ C9 — al sincronizar, remapeo del provisional al id real ═════════════════

describe('SyncQueueService — C9: remapeo del productor provisional en caché de cobertura y constancias', () => {
  function givenProvisionalRegistroQueued() {
    (syncQueueStorage.dequeueNextPending as jest.Mock)
      .mockResolvedValueOnce({ id: 'entry-reg', surveyId: SREG, itemType: 'survey', attempts: 0, status: 'pending', createdAt: new Date() })
      .mockResolvedValue(null);
    (surveyDraftStore.loadDraft as jest.Mock).mockResolvedValue({
      surveyId: SREG,
      instrumentId: 'inst-sreg',
      farmerId: LOCAL,
      answers: { q1: { questionId: 'q1', textValue: 'Productora Nueva' } },
      updatedAt: new Date(),
    });
    (instrumentCacheStorage.get as jest.Mock).mockResolvedValue({
      instrumentId: 'inst-sreg',
      code: 'S_REG',
      sections: [{ sectionId: 's1', name: 'S1', order: 1, questions: [] }],
    });
    (flattenSections as jest.Mock).mockReturnValue([]);
    (buildResponsesPayload as jest.Mock).mockReturnValue([{ surveyId: SREG, questionId: 'q1', textValue: 'x' }]);
    (createSurvey as jest.Mock).mockResolvedValue({ surveyId: 'srv-reg-103' });
    (submitResponsesBatch as jest.Mock).mockResolvedValue(undefined);
    (markSurveyAsSynced as jest.Mock).mockResolvedValue(undefined);
    (syncQueueStorage.markInFlight as jest.Mock).mockResolvedValue(undefined);
    (syncQueueStorage.markSynced as jest.Mock).mockResolvedValue(undefined);
    (surveyDraftStore.setBackendSurveyId as jest.Mock).mockResolvedValue(undefined);
    (surveyDraftStore.markSynced as jest.Mock).mockResolvedValue(undefined);
    (getSurveyExtraction as jest.Mock).mockResolvedValue({
      status: 'done',
      farmerId: REAL,
      farmerName: 'Productora Nueva',
      existed: false,
      clientFarmerId: LOCAL,
      farm: { farmId: FARM, name: 'La Nueva' },
      farmCropId: null,
      crops: [CAFE],
      openDiscrepancies: 0,
      extractedAt: '2026-11-08T12:00:00.000Z',
    });
    (farmerCacheStorage.get as jest.Mock).mockImplementation(async (id: string) =>
      id === LOCAL
        ? { farmerId: LOCAL, name: 'Productora Nueva', documentId: '900103001', cachedAt: new Date() }
        : null,
    );
  }

  it('el S_REG sin sesión se materializa con clientFarmerId y sin campaignSessionId', async () => {
    givenProvisionalRegistroQueued();

    await SyncQueueService.processAll();

    const payload = (createSurvey as jest.Mock).mock.calls[0][0];
    expect(payload).toMatchObject({ clientFarmerId: LOCAL, clientSurveyId: SREG });
    expect(payload.campaignSessionId).toBeUndefined();
  });

  it('remapea encuestas (como hoy), la caché de cobertura y las constancias al id real', async () => {
    givenProvisionalRegistroQueued();

    await SyncQueueService.processAll();

    // Lo de hoy (spec 96): las encuestas locales pasan al id real.
    expect(mockSet).toHaveBeenCalledWith({ farmerId: REAL });
    // Lo nuevo (spec 103):
    expect(coverageCacheMock.coverageCacheStorage.remapFarmer).toHaveBeenCalledWith(LOCAL, REAL);
    expect(consentRecordStore.remapFarmer).toHaveBeenCalledWith(LOCAL, REAL);
  });

  it('con un productor real no remapea nada', async () => {
    givenProvisionalRegistroQueued();
    (surveyDraftStore.loadDraft as jest.Mock).mockResolvedValue({
      surveyId: SREG,
      instrumentId: 'inst-sreg',
      farmerId: REAL,
      answers: { q1: { questionId: 'q1', textValue: 'x' } },
      updatedAt: new Date(),
    });
    (getSurveyExtraction as jest.Mock).mockResolvedValue({
      status: 'done',
      farmerId: REAL,
      farmerName: 'Productora',
      existed: true,
      clientFarmerId: null,
      farm: { farmId: FARM, name: 'La Nueva' },
      farmCropId: null,
      crops: [],
      openDiscrepancies: 0,
      extractedAt: '2026-11-08T12:00:00.000Z',
    });

    await SyncQueueService.processAll();

    expect(coverageCacheMock.coverageCacheStorage.remapFarmer).not.toHaveBeenCalled();
    expect(consentRecordStore.remapFarmer).not.toHaveBeenCalled();
  });
});
