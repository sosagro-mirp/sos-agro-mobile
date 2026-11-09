/**
 * Spec 103 — Flujo del encuestador por productor en el móvil (H6).
 * Consentimiento sin sesión de campaña, sin conexión (DM9, DM10). Cubre el
 * criterio C10 de `spec/103_encuestador_movil_por_productor.md`. No modifica
 * `e2e-078-consentOffline.test.ts`: la firma con `sessionId` se conserva.
 *
 * ARRANCA EN ROJO. Motivos esperados:
 *   - `src/lib/consentAnchor.ts` no existe (Fase 2).
 *   - `consentRecordStore` no guarda `farmerId`/`surveyId` ni expone
 *     `getByFarmerId`/`remapFarmer` (Fase 2).
 *   - `SyncQueueService.processConsentEntry` marca como fallida toda entrada
 *     sin `campaignSessionId` (Fase 4).
 * Los casos con `sessionId` (campaña) son de regresión y deben estar en verde.
 *
 * ── Contrato de `src/lib/consentAnchor.ts` ─────────────────────────────────
 *
 *   type ConsentAnchor = { sessionId: string } | { farmerId: string } | { surveyId: string };
 *
 *   export function resolveConsentAnchor(input: {
 *     sessionId?: string | null; farmerId?: string | null; surveyId?: string | null;
 *   }): ConsentAnchor;
 *     Exactamente una clave presente (null y '' cuentan como ausentes); lanza
 *     si no llega ninguna o llega más de una. Igual que la web (spec 102).
 *
 *   export function chooseConsentAnchor(input: {
 *     sessionId?: string | null;           // flujo de campaña
 *     farmerId?: string | null;            // productor de la ficha (real o provisional)
 *     registrationSurveyId?: string | null; // id local del S_REG del productor nuevo
 *   }): ConsentAnchor;
 *     Al capturar: con sesión → { sessionId }; productor real → { farmerId };
 *     productor provisional → { surveyId: registrationSurveyId } (id local);
 *     provisional sin S_REG → lanza.
 *
 *   export function resolveConsentAnchorForSync(
 *     record: { sessionId?: string | null; farmerId?: string | null; surveyId?: string | null },
 *     lookups: { backendSurveyIdOf(localSurveyId: string): Promise<string | null> },
 *   ): Promise<{ kind: 'ready'; anchor: ConsentAnchor } | { kind: 'defer'; reason: string }>;
 *     `surveyId` local → su `backendSurveyId`; si aún no existe → 'defer'.
 *     `farmerId` local (sin remapear todavía) → 'defer'. Nunca devuelve un id
 *     `local_…` en 'ready'.
 *
 *   export function buildAnchoredConsentPayload(
 *     record: ConsentRecordDraft, anchor: ConsentAnchor,
 *   ): CreateConsentPayload;
 *     Solo la clave del ancla (sin las otras dos), `acceptedAt` = la fecha
 *     original de aceptación en ISO, y las autorizaciones tal cual.
 *
 *   export function consentNoticeOffline(
 *     farmer: { consentVersion?: string; consentedAt?: Date } | null,
 *     activeVersion: string | null,
 *   ): 'none' | 'pending' | 'outdated' | 'unknown';
 *     Aviso NO bloqueante de la ficha: vigente → 'none'; sin consentimiento →
 *     'pending'; versión anterior → 'outdated'; versión activa desconocida →
 *     'unknown'.
 *
 * ── Cambios en módulos existentes ────────────────────────────────────────────
 *
 *   ConsentRecordDraft: `sessionId?: string | null`, `farmerId?: string | null`,
 *   `surveyId?: string | null` (exactamente una con valor).
 *   consentRecordStore.getByFarmerId(farmerId): Promise<ConsentRecordDraft | null>
 *   consentRecordStore.remapFarmer(localFarmerId, realFarmerId): Promise<void>
 *   CreateConsentPayload: `sessionId` | `farmerId` | `surveyId` (exactamente uno).
 *
 *   SyncQueueService.processConsentEntry sin `campaignSessionId`:
 *     - resuelve el ancla con `resolveConsentAnchorForSync`, usando
 *       `surveyDraftStore.getBackendSurveyId` como `backendSurveyIdOf`;
 *     - 'defer' → `syncQueueStorage.resetInFlightToRetryById(entry.id)`, sin
 *       `incrementAttempts`, sin `markFailedValidation` y sin
 *       `consentRecordStore.markFailed`;
 *     - 'ready' → `submitConsent(buildAnchoredConsentPayload(...))`.
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
  },
}));
jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: { loadDraft: jest.fn(), markSynced: jest.fn(), getBackendSurveyId: jest.fn(), setBackendSurveyId: jest.fn(), setFarmerId: jest.fn() },
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

// ─── SUT e imports ───────────────────────────────────────────────────────────

import { SyncQueueService } from '../sync/SyncQueueService';
import { syncQueueStorage } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { consentRecordStore } from '../storage/consentRecordStore';
import { submitConsent } from '../api/consents';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { pendingSessionStorage } from '../storage/pendingSessions';

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

type ConsentAnchor = { sessionId: string } | { farmerId: string } | { surveyId: string };
type SyncAnchor = { kind: 'ready'; anchor: ConsentAnchor } | { kind: 'defer'; reason: string };
type AnchorInput = { sessionId?: string | null; farmerId?: string | null; surveyId?: string | null };

const MODULE = '../lib/consentAnchor';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SESSION = '33333333-3333-4333-8333-333333333103';
const FARMER = 'aaaaaaaa-0000-4000-8000-000000000103';
const LOCAL_FARMER = 'local_farmer_9c3f1b2a-8e7d-4f2e-9a1b-2c3d4e5f6103';
const LOCAL_SREG = 'local_survey_5e0c0000-0000-4000-8000-000000000103';
const REAL_SREG = 'cccccccc-0000-4000-8000-000000000103';
const CONSENT_DOC = '44444444-4444-4444-8444-444444444103';
const ACCEPTED_AT = new Date('2026-11-08T09:15:00.000Z');

function record(anchor: AnchorInput) {
  return {
    id: 'local_consent_103',
    sessionId: null,
    farmerId: null,
    surveyId: null,
    ...anchor,
    consentDocumentId: CONSENT_DOC,
    respondentName: 'Ana Pérez',
    acceptedDataProcessing: true,
    acceptedPhoto: true,
    acceptedAudio: false,
    acceptedVideo: false,
    acceptedFollowUpContact: true,
    acceptedAt: ACCEPTED_AT,
    status: 'pending' as const,
    createdAt: new Date('2026-11-08T09:16:00.000Z'),
  };
}

function givenConsentEntry(anchor: AnchorInput, entryExtra: Record<string, unknown> = {}) {
  (syncQueueStorage.dequeueNextPending as jest.Mock)
    .mockResolvedValueOnce({
      id: 'entry-consent-103',
      surveyId: 'local_consent_103',
      itemType: 'consent',
      attempts: 0,
      status: 'pending',
      createdAt: new Date(),
      ...entryExtra,
    })
    .mockResolvedValue(null);
  (consentRecordStore.get as jest.Mock).mockResolvedValue(record(anchor));
}

const isLocal = (v: unknown) => typeof v === 'string' && v.startsWith('local_');

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
    resolveSession: jest.fn(),
    resolveFarmer: jest.fn(),
  });
  (syncQueueStorage.dequeueNextPending as jest.Mock).mockResolvedValue(null);
  (syncQueueStorage.markInFlight as jest.Mock).mockResolvedValue(undefined);
  (syncQueueStorage.markSynced as jest.Mock).mockResolvedValue(undefined);
  (syncQueueStorage.resetInFlightToRetryById as jest.Mock).mockResolvedValue(undefined);
  (surveyDraftStore.getBackendSurveyId as jest.Mock).mockResolvedValue(null);
  (pendingSessionStorage.listPending as jest.Mock).mockResolvedValue([]);
  (submitConsent as jest.Mock).mockResolvedValue({ consentRecordId: 'srv-consent-103' });
});

// ═══ Funciones puras ═════════════════════════════════════════════════════════

describe('resolveConsentAnchor — exactamente un ancla', () => {
  it('cada ancla sola produce un objeto con esa única clave', () => {
    const resolve = loadExport<(i: AnchorInput) => ConsentAnchor>(MODULE, 'resolveConsentAnchor');
    expect(resolve({ sessionId: SESSION })).toEqual({ sessionId: SESSION });
    expect(resolve({ farmerId: FARMER, sessionId: null })).toEqual({ farmerId: FARMER });
    expect(resolve({ surveyId: REAL_SREG, farmerId: '' })).toEqual({ surveyId: REAL_SREG });
  });

  it('sin ancla o con varias, lanza', () => {
    const resolve = loadExport<(i: AnchorInput) => ConsentAnchor>(MODULE, 'resolveConsentAnchor');
    expect(() => resolve({})).toThrow();
    expect(() => resolve({ sessionId: SESSION, farmerId: FARMER })).toThrow();
    expect(() => resolve({ farmerId: FARMER, surveyId: REAL_SREG })).toThrow();
  });
});

describe('chooseConsentAnchor — C10: ancla por caso al capturar (DM9)', () => {
  type Choose = (i: { sessionId?: string | null; farmerId?: string | null; registrationSurveyId?: string | null }) => ConsentAnchor;

  it('productor existente de la ficha → farmerId', () => {
    const choose = loadExport<Choose>(MODULE, 'chooseConsentAnchor');
    expect(choose({ farmerId: FARMER })).toEqual({ farmerId: FARMER });
  });

  it('productor nuevo (provisional) → surveyId de su S_REG, nunca el farmerId local', () => {
    const choose = loadExport<Choose>(MODULE, 'chooseConsentAnchor');
    expect(choose({ farmerId: LOCAL_FARMER, registrationSurveyId: LOCAL_SREG })).toEqual({ surveyId: LOCAL_SREG });
  });

  it('productor provisional sin S_REG no tiene ancla posible', () => {
    const choose = loadExport<Choose>(MODULE, 'chooseConsentAnchor');
    expect(() => choose({ farmerId: LOCAL_FARMER })).toThrow();
  });

  it('el flujo de campaña sigue anclando a la sesión', () => {
    const choose = loadExport<Choose>(MODULE, 'chooseConsentAnchor');
    expect(choose({ sessionId: SESSION, farmerId: FARMER })).toEqual({ sessionId: SESSION });
  });
});

describe('resolveConsentAnchorForSync — C10: nunca se envía un id local', () => {
  type ForSync = (r: AnchorInput, l: { backendSurveyIdOf(id: string): Promise<string | null> }) => Promise<SyncAnchor>;

  it('traduce el surveyId local del S_REG a su backendSurveyId', async () => {
    const forSync = loadExport<ForSync>(MODULE, 'resolveConsentAnchorForSync');
    const result = await forSync({ surveyId: LOCAL_SREG }, { backendSurveyIdOf: async () => REAL_SREG });
    expect(result).toEqual({ kind: 'ready', anchor: { surveyId: REAL_SREG } });
  });

  it('difiere mientras el S_REG no exista en el backend', async () => {
    const forSync = loadExport<ForSync>(MODULE, 'resolveConsentAnchorForSync');
    const result = await forSync({ surveyId: LOCAL_SREG }, { backendSurveyIdOf: async () => null });
    expect(result.kind).toBe('defer');
  });

  it('difiere un farmerId que todavía es provisional', async () => {
    const forSync = loadExport<ForSync>(MODULE, 'resolveConsentAnchorForSync');
    const result = await forSync({ farmerId: LOCAL_FARMER }, { backendSurveyIdOf: async () => null });
    expect(result.kind).toBe('defer');
  });

  it('un farmerId real sale tal cual', async () => {
    const forSync = loadExport<ForSync>(MODULE, 'resolveConsentAnchorForSync');
    const result = await forSync({ farmerId: FARMER }, { backendSurveyIdOf: async () => null });
    expect(result).toEqual({ kind: 'ready', anchor: { farmerId: FARMER } });
  });
});

describe('buildAnchoredConsentPayload — C10: conserva la fecha real de aceptación', () => {
  it('lleva solo la clave del ancla y el acceptedAt original', () => {
    const build = loadExport<(r: ReturnType<typeof record>, a: ConsentAnchor) => Record<string, unknown>>(
      MODULE,
      'buildAnchoredConsentPayload',
    );
    const payload = build(record({ farmerId: FARMER }), { farmerId: FARMER });

    expect(payload).toMatchObject({
      farmerId: FARMER,
      consentDocumentId: CONSENT_DOC,
      acceptedDataProcessing: true,
      acceptedPhoto: true,
      acceptedAudio: false,
      acceptedFollowUpContact: true,
      acceptedAt: ACCEPTED_AT.toISOString(),
    });
    expect(payload).not.toHaveProperty('sessionId');
    expect(payload).not.toHaveProperty('surveyId');
  });
});

describe('consentNoticeOffline — C10: aviso que no bloquea', () => {
  type Notice = (f: { consentVersion?: string; consentedAt?: Date } | null, active: string | null) => string;

  it('vigente → sin aviso; sin consentimiento → pendiente; versión vieja → desactualizado; sin versión activa → desconocido', () => {
    const notice = loadExport<Notice>(MODULE, 'consentNoticeOffline');
    expect(notice({ consentVersion: '1.1', consentedAt: ACCEPTED_AT }, '1.1')).toBe('none');
    expect(notice({}, '1.1')).toBe('pending');
    expect(notice(null, '1.1')).toBe('pending');
    expect(notice({ consentVersion: '1.0', consentedAt: ACCEPTED_AT }, '1.1')).toBe('outdated');
    expect(notice({ consentVersion: '1.1', consentedAt: ACCEPTED_AT }, null)).toBe('unknown');
  });
});

// ═══ consentRecordStore ══════════════════════════════════════════════════════

describe('consentRecordStore — constancia sin sesión (DM10)', () => {
  const realStore = () =>
    loadExport<Record<string, (...args: unknown[]) => Promise<unknown>>>('../storage/consentRecordStore', 'consentRecordStore');

  it('guarda una constancia anclada a farmerId con session_id nulo', async () => {
    await realStore().save(record({ farmerId: FARMER }));

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ farmerId: FARMER, sessionId: null, acceptedAt: ACCEPTED_AT }),
    );
  });

  it('expone getByFarmerId y remapFarmer', async () => {
    const store = realStore();
    expect(typeof store.getByFarmerId).toBe('function');
    expect(typeof store.remapFarmer).toBe('function');

    await store.remapFarmer(LOCAL_FARMER, FARMER);
    expect(mockUpdateSet).toHaveBeenCalledWith({ farmerId: FARMER });
  });
});

// ═══ SyncQueueService.processConsentEntry ════════════════════════════════════

describe('processConsentEntry — C10: constancia sin sesión', () => {
  it('productor existente: se sincroniza con farmerId y la fecha original, sin sesión', async () => {
    givenConsentEntry({ farmerId: FARMER });

    await SyncQueueService.processAll();

    expect(submitConsent).toHaveBeenCalledTimes(1);
    const payload = (submitConsent as jest.Mock).mock.calls[0][0];
    expect(payload).toMatchObject({ farmerId: FARMER, acceptedAt: ACCEPTED_AT.toISOString() });
    expect(payload.sessionId).toBeUndefined();
    expect(payload.surveyId).toBeUndefined();
    expect(consentRecordStore.markSynced).toHaveBeenCalledWith('local_consent_103');
    expect(syncQueueStorage.markSynced).toHaveBeenCalledWith('entry-consent-103');
    expect(syncQueueStorage.markFailedValidation).not.toHaveBeenCalled();
  });

  it('productor nuevo: se sincroniza con el surveyId real de su S_REG', async () => {
    givenConsentEntry({ surveyId: LOCAL_SREG });
    (surveyDraftStore.getBackendSurveyId as jest.Mock).mockImplementation(async (id: string) =>
      id === LOCAL_SREG ? REAL_SREG : null,
    );

    await SyncQueueService.processAll();

    expect(submitConsent).toHaveBeenCalledTimes(1);
    const payload = (submitConsent as jest.Mock).mock.calls[0][0];
    expect(payload).toMatchObject({ surveyId: REAL_SREG, acceptedAt: ACCEPTED_AT.toISOString() });
    expect(Object.values(payload).some(isLocal)).toBe(false);
  });

  it('S_REG aún no materializado: se difiere, no falla y no cuenta intento', async () => {
    givenConsentEntry({ surveyId: LOCAL_SREG });

    await SyncQueueService.processAll();

    expect(submitConsent).not.toHaveBeenCalled();
    expect(syncQueueStorage.markFailedValidation).not.toHaveBeenCalled();
    expect(consentRecordStore.markFailed).not.toHaveBeenCalled();
    expect(syncQueueStorage.incrementAttempts).not.toHaveBeenCalled();
    expect(syncQueueStorage.resetInFlightToRetryById).toHaveBeenCalledWith('entry-consent-103');
  });

  it('nunca envía un farmerId provisional: lo difiere', async () => {
    givenConsentEntry({ farmerId: LOCAL_FARMER });

    await SyncQueueService.processAll();

    expect(submitConsent).not.toHaveBeenCalled();
    expect(syncQueueStorage.markFailedValidation).not.toHaveBeenCalled();
    expect(syncQueueStorage.resetInFlightToRetryById).toHaveBeenCalledWith('entry-consent-103');
  });

  it('regresión (e2e-078): la constancia de campaña sigue saliendo con sessionId', async () => {
    givenConsentEntry({ sessionId: SESSION }, { campaignSessionId: SESSION });

    await SyncQueueService.processAll();

    expect(submitConsent).toHaveBeenCalledTimes(1);
    const payload = (submitConsent as jest.Mock).mock.calls[0][0];
    expect(payload).toMatchObject({ sessionId: SESSION, acceptedAt: ACCEPTED_AT.toISOString() });
    expect(payload.farmerId).toBeUndefined();
    expect(payload.surveyId).toBeUndefined();
  });
});
