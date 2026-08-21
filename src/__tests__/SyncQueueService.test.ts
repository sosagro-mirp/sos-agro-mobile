/**
 * Unit tests for SyncQueueService.
 *
 * All external collaborators are mocked so no DB or network is needed.
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
    loadDraft: jest.fn(),
    markSynced: jest.fn(),
  },
}));

jest.mock('../storage/farmPlotStore', () => ({
  farmPlotStore: {
    loadDraft: jest.fn(),
    markSynced: jest.fn(),
  },
}));

jest.mock('../api/farmPlots', () => ({
  createFarmPlot: jest.fn(),
}));

jest.mock('../storage/instrumentCache', () => ({
  instrumentCacheStorage: {
    get: jest.fn(),
  },
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
  useSyncStatusStore: {
    getState: jest.fn(),
  },
}));

jest.mock('../lib/flattenSections', () => ({
  flattenSections: jest.fn(),
}));

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

jest.mock('../lib/sentry', () => ({
  captureError: jest.fn(),
}));

// Mocked as a whole (not just its storage collaborators) so SyncQueueService
// tests stay isolated from MediaUploadService's own dependency graph
// (mediaUploadQueueStorage, FileSystem, R2 presigned uploads).
jest.mock('../sync/MediaUploadService', () => ({
  MediaUploadService: {
    processPendingForSurvey: jest.fn().mockResolvedValue({}),
  },
}));

// ─── Import SUT and mocked modules ───────────────────────────────────────────

import { NetworkError, ServerError } from '../api/httpClient';
import { SyncQueueService } from '../sync/SyncQueueService';
import { syncQueueStorage } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { submitResponsesBatch } from '../api/responses';
import { markSurveyAsSynced } from '../api/surveys';
import { markSessionAsSynced, createCampaignSession } from '../api/campaignSessions';
import { extractFarmer, extractCrops } from '../api/farmers';
import { sessionCropsStorage } from '../storage/sessionCropsStorage';
import { pendingSessionStorage } from '../storage/pendingSessions';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { flattenSections } from '../lib/flattenSections';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import { farmerCacheStorage } from '../storage/farmerCache';
import { cacheFarmerIdentity } from '../lib/cacheFarmerIdentity';
import { farmPlotStore } from '../storage/farmPlotStore';
import { createFarmPlot } from '../api/farmPlots';

// ─── Typed mock aliases ───────────────────────────────────────────────────────

const mockDequeueNextPending = syncQueueStorage.dequeueNextPending as jest.Mock;
const mockMarkInFlight = syncQueueStorage.markInFlight as jest.Mock;
const mockMarkSynced = syncQueueStorage.markSynced as jest.Mock;
const mockMarkFailedValidation = syncQueueStorage.markFailedValidation as jest.Mock;
const mockIncrementAttempts = syncQueueStorage.incrementAttempts as jest.Mock;

const mockLoadDraft = surveyDraftStore.loadDraft as jest.Mock;
const mockMarkSyncedDraft = surveyDraftStore.markSynced as jest.Mock;

const mockInstrumentCacheGet = instrumentCacheStorage.get as jest.Mock;

const mockSubmitResponsesBatch = submitResponsesBatch as jest.Mock;
const mockMarkSurveyAsSynced = markSurveyAsSynced as jest.Mock;
const mockMarkSessionAsSynced = markSessionAsSynced as jest.Mock;
const mockExtractFarmer = extractFarmer as jest.Mock;
const mockExtractCrops = extractCrops as jest.Mock;
const mockFarmerCacheListRecent = farmerCacheStorage.listRecent as jest.Mock;
const mockFarmerCacheRemove = farmerCacheStorage.remove as jest.Mock;
const mockCacheFarmerIdentity = cacheFarmerIdentity as jest.Mock;
const mockSessionCropsSave = sessionCropsStorage.save as jest.Mock;
const mockSessionCropsGet = sessionCropsStorage.get as jest.Mock;
const mockCreateCampaignSession = createCampaignSession as jest.Mock;
const mockListPendingSessions = pendingSessionStorage.listPending as jest.Mock;
const mockResolveSession = pendingSessionStorage.resolve as jest.Mock;

const mockFlattenSections = flattenSections as jest.Mock;
const mockBuildResponsesPayload = buildResponsesPayload as jest.Mock;

const mockFarmPlotLoadDraft = farmPlotStore.loadDraft as jest.Mock;
const mockFarmPlotMarkSynced = farmPlotStore.markSynced as jest.Mock;
const mockCreateFarmPlot = createFarmPlot as jest.Mock;

let mockSetSyncingId: jest.Mock;
let mockMarkSyncCompleted: jest.Mock;
let mockRefreshPendingCount: jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    surveyId: 'survey-1',
    campaignSessionId: 'session-1',
    attempts: 0,
    status: 'pending' as const,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDraft(instrumentId = 'inst-1') {
  return {
    surveyId: 'survey-1',
    instrumentId,
    answers: { q1: { questionId: 'q1', textValue: 'answer' } },
    updatedAt: new Date(),
  };
}

function makeFarmPlotDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plot-1',
    farmId: 'farm-1',
    name: 'Lote norte',
    description: undefined,
    area: undefined,
    polygon: { points: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }] },
    status: 'draft' as const,
    capturedOffline: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeInstrument(overrides: Record<string, unknown> = {}) {
  return {
    instrumentId: 'inst-1',
    sections: [{ sectionId: 's1', name: 'Section 1', order: 1, questions: [] }],
    ...overrides,
  };
}

// ─── Test isolation ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  SyncQueueService.resetNetworkFailures();

  mockSetSyncingId = jest.fn();
  mockMarkSyncCompleted = jest.fn();
  mockRefreshPendingCount = jest.fn();

  (useSyncStatusStore.getState as jest.Mock).mockReturnValue({
    setSyncingId: mockSetSyncingId,
    markSyncCompleted: mockMarkSyncCompleted,
    refreshPendingCount: mockRefreshPendingCount,
  });

  // Default: no pending entries
  mockDequeueNextPending.mockResolvedValue(null);
  mockRefreshPendingCount.mockResolvedValue(undefined);
  mockMarkInFlight.mockResolvedValue(undefined);
  mockMarkSynced.mockResolvedValue(undefined);
  mockMarkSyncedDraft.mockResolvedValue(undefined);
  mockMarkSurveyAsSynced.mockResolvedValue(undefined);
  mockMarkSessionAsSynced.mockResolvedValue(undefined);
  mockSubmitResponsesBatch.mockResolvedValue(undefined);
  mockIncrementAttempts.mockResolvedValue(undefined);
  mockMarkFailedValidation.mockResolvedValue(undefined);
  mockLoadDraft.mockResolvedValue(null);
  mockInstrumentCacheGet.mockResolvedValue(null);
  mockFlattenSections.mockReturnValue([]);
  mockBuildResponsesPayload.mockReturnValue([]);
  mockExtractCrops.mockResolvedValue({ crops: [] });
  mockSessionCropsSave.mockResolvedValue(undefined);
  mockSessionCropsGet.mockResolvedValue([]);
  mockListPendingSessions.mockResolvedValue([]);
  mockResolveSession.mockResolvedValue(undefined);
  mockCreateCampaignSession.mockResolvedValue({ sessionId: 'real-session-1' });
  mockExtractFarmer.mockResolvedValue({
    farmer: { farmerId: 'real-farmer-1', name: 'Mateo Quintero', documentId: '9105558899' },
    existed: false,
  });
  mockFarmerCacheListRecent.mockResolvedValue([]);
  mockFarmerCacheRemove.mockResolvedValue(undefined);
  mockCacheFarmerIdentity.mockResolvedValue(undefined);
  mockFarmPlotLoadDraft.mockResolvedValue(null);
  mockFarmPlotMarkSynced.mockResolvedValue(undefined);
  mockCreateFarmPlot.mockResolvedValue({ farmPlotId: 'backend-plot-1' });
  (useCampaignSessionStore.getState as jest.Mock).mockReturnValue({
    localSessionId: null,
    localFarmerId: null,
    resolveSession: jest.fn(),
    resolveFarmer: jest.fn(),
  });
});

// ─── processAll: guard conditions ────────────────────────────────────────────

describe('processAll', () => {
  it('does nothing if no pending entries exist', async () => {
    mockDequeueNextPending.mockResolvedValue(null);

    await SyncQueueService.processAll();

    expect(mockDequeueNextPending).toHaveBeenCalledTimes(1);
    expect(mockSubmitResponsesBatch).not.toHaveBeenCalled();
  });

  it('skips processing when consecutiveNetworkFailures >= 5', async () => {
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockFlattenSections.mockReturnValue([{ question: { questionId: 'q1' } }]);
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);
    mockSubmitResponsesBatch.mockRejectedValue(new NetworkError());

    for (let i = 0; i < 5; i++) {
      mockDequeueNextPending.mockResolvedValueOnce(makeEntry({ id: `entry-${i}` }));
      await SyncQueueService.processAll();
    }

    // Threshold reached; next call should bail out immediately
    const callsBefore = mockDequeueNextPending.mock.calls.length;
    await SyncQueueService.processAll();
    expect(mockDequeueNextPending.mock.calls.length).toBe(callsBefore);
  });

  it('processes entries sequentially until none remain', async () => {
    const e1 = makeEntry({ id: 'e1' });
    const e2 = makeEntry({ id: 'e2', surveyId: 'survey-2' });

    mockDequeueNextPending
      .mockResolvedValueOnce(e1)
      .mockResolvedValueOnce(e2)
      .mockResolvedValue(null);

    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());

    await SyncQueueService.processAll();

    expect(mockMarkSynced).toHaveBeenCalledWith('e1');
    expect(mockMarkSynced).toHaveBeenCalledWith('e2');
  });

  it('calls setSyncingId and markSyncCompleted around the loop', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());

    await SyncQueueService.processAll();

    expect(mockSetSyncingId).toHaveBeenCalledWith(entry.id);
    expect(mockSetSyncingId).toHaveBeenCalledWith(null);
    expect(mockMarkSyncCompleted).toHaveBeenCalledTimes(1);
  });
});

// ─── processEntry: success path ──────────────────────────────────────────────

describe('processEntry — success', () => {
  it('marks synced when payload is non-empty', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([
      { surveyId: 'survey-1', questionId: 'q1', textValue: 'x' },
    ]);

    await SyncQueueService.processAll();

    expect(mockSubmitResponsesBatch).toHaveBeenCalledTimes(1);
    expect(mockMarkSurveyAsSynced).toHaveBeenCalledWith('survey-1');
    expect(mockMarkSessionAsSynced).toHaveBeenCalledWith('session-1');
    expect(mockMarkSynced).toHaveBeenCalledWith(entry.id);
    expect(mockMarkSyncedDraft).toHaveBeenCalledWith('survey-1');
  });

  it('resets consecutiveNetworkFailures after a successful sync', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);

    await SyncQueueService.processAll();

    expect(mockMarkSynced).toHaveBeenCalledWith(entry.id);
  });

  it('skips markSessionAsSynced when there is no campaignSessionId', async () => {
    const entry = makeEntry({ campaignSessionId: undefined });
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);

    await SyncQueueService.processAll();

    expect(mockMarkSessionAsSynced).not.toHaveBeenCalled();
  });
});

// ─── processEntry: empty payload ─────────────────────────────────────────────

describe('processEntry — empty payload', () => {
  it('marks synced directly when payload is empty (no API calls)', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([]);

    await SyncQueueService.processAll();

    expect(mockSubmitResponsesBatch).not.toHaveBeenCalled();
    expect(mockMarkSurveyAsSynced).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith(entry.id);
    expect(mockMarkSyncedDraft).toHaveBeenCalledWith('survey-1');
  });

  it('marks synced directly when draft is not found', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(null);

    await SyncQueueService.processAll();

    expect(mockSubmitResponsesBatch).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith(entry.id);
  });
});

// ─── processEntry: NetworkError ───────────────────────────────────────────────

describe('processEntry — NetworkError', () => {
  it('increments attempts and consecutiveNetworkFailures on NetworkError', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);
    mockSubmitResponsesBatch.mockRejectedValue(new NetworkError());

    await SyncQueueService.processAll();

    expect(mockIncrementAttempts).toHaveBeenCalledWith(entry.id);
    expect(mockMarkSynced).not.toHaveBeenCalled();
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
  });

  it('does not markFailedValidation on NetworkError', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);
    mockSubmitResponsesBatch.mockRejectedValue(new NetworkError());

    await SyncQueueService.processAll();

    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
  });
});

// ─── processEntry: ServerError (4xx) ─────────────────────────────────────────

describe('processEntry — ServerError', () => {
  it('marks failed validation on 4xx ServerError', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);
    mockSubmitResponsesBatch.mockRejectedValue(new ServerError(422, 'Unprocessable entity'));

    await SyncQueueService.processAll();

    expect(mockMarkFailedValidation).toHaveBeenCalledWith(entry.id, 'Unprocessable entity');
    expect(mockIncrementAttempts).not.toHaveBeenCalled();
  });

  it('does not increment consecutiveNetworkFailures on ServerError', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);
    mockSubmitResponsesBatch.mockRejectedValue(new ServerError(400, 'Bad request'));

    await SyncQueueService.processAll();

    // After a ServerError, the failure counter is reset to 0.
    // The next processAll call should NOT bail out early.
    mockDequeueNextPending.mockResolvedValueOnce(makeEntry({ id: 'e2' })).mockResolvedValue(null);
    mockBuildResponsesPayload.mockReturnValue([]);

    await SyncQueueService.processAll();
    expect(mockMarkSynced).toHaveBeenCalledWith('e2');
  });
});

// ─── processEntry: S2 crop extraction ────────────────────────────────────────

describe('processEntry — S2 crop extraction', () => {
  it('calls extractCrops and saves crops to sessionCropsStorage after syncing an S2 survey', async () => {
    const entry = makeEntry();
    const crops = [{ cropId: 'crop-1', name: 'café' }];

    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft('inst-s2'));
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument({ code: 'S2' }));
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1', textValue: 'x' }]);
    mockExtractCrops.mockResolvedValue({ crops });

    await SyncQueueService.processAll();

    expect(mockExtractCrops).toHaveBeenCalledWith('survey-1');
    expect(mockSessionCropsSave).toHaveBeenCalledWith('session-1', crops);
  });

  it('does not call sessionCropsStorage.save when entry has no campaignSessionId', async () => {
    const entry = makeEntry({ campaignSessionId: undefined });
    const crops = [{ cropId: 'crop-1', name: 'café' }];

    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft('inst-s2'));
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument({ code: 'S2' }));
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1', textValue: 'x' }]);
    mockExtractCrops.mockResolvedValue({ crops });

    await SyncQueueService.processAll();

    expect(mockExtractCrops).toHaveBeenCalledWith('survey-1');
    expect(mockSessionCropsSave).not.toHaveBeenCalled();
  });

  it('does not call extractCrops for non-S2 instruments', async () => {
    const entry = makeEntry();

    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument()); // no code property
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1', textValue: 'x' }]);

    await SyncQueueService.processAll();

    expect(mockExtractCrops).not.toHaveBeenCalled();
    expect(mockSessionCropsSave).not.toHaveBeenCalled();
  });
});

// ─── processEntry: S1 farmer extraction — provisional cache cleanup (spec 51) ─

describe('processEntry — S1 farmer extraction, provisional cache cleanup', () => {
  it('removes the provisional farmerCache entry after remapping surveys to the real farmerId', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft('inst-s1'));
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument({ code: 'S1' }));
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1', textValue: 'x' }]);
    mockFarmerCacheListRecent.mockResolvedValue([
      { farmerId: 'local_farmer_123', name: 'Mateo Provisional', documentId: '9105558899', cachedAt: new Date() },
    ]);

    await SyncQueueService.processAll();

    expect(mockFarmerCacheRemove).toHaveBeenCalledWith('local_farmer_123');
  });

  it('does not remove anything when no provisional entry matches the resolved documentId', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft('inst-s1'));
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument({ code: 'S1' }));
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1', textValue: 'x' }]);
    mockFarmerCacheListRecent.mockResolvedValue([
      { farmerId: 'local_farmer_999', name: 'Otro Provisional', documentId: '0000000000', cachedAt: new Date() },
    ]);

    await SyncQueueService.processAll();

    expect(mockFarmerCacheRemove).not.toHaveBeenCalled();
  });

  it('completes the sync even if removing the provisional entry fails', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft('inst-s1'));
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument({ code: 'S1' }));
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1', textValue: 'x' }]);
    mockFarmerCacheListRecent.mockResolvedValue([
      { farmerId: 'local_farmer_123', name: 'Mateo Provisional', documentId: '9105558899', cachedAt: new Date() },
    ]);
    mockFarmerCacheRemove.mockRejectedValue(new Error('SQLITE_BUSY'));

    await SyncQueueService.processAll();

    expect(mockMarkSynced).toHaveBeenCalledWith(entry.id);
    expect(mockMarkSyncedDraft).toHaveBeenCalledWith('survey-1');
  });

  it('caches the real identity via cacheFarmerIdentity with phone, farmName and crops', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft('inst-s1'));
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument({ code: 'S1' }));
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1', textValue: 'x' }]);
    mockExtractFarmer.mockResolvedValue({
      farmer: {
        farmerId: 'real-farmer-1',
        name: 'Mateo Quintero',
        documentId: '9105558899',
        phone: '3001112233',
        farm: { name: 'Finca La Esperanza', crops: [{ cropId: 'crop-1', name: 'Café' }] },
      },
      existed: false,
    });

    await SyncQueueService.processAll();

    expect(mockCacheFarmerIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        farmerId: 'real-farmer-1',
        phone: '3001112233',
        farmName: 'Finca La Esperanza',
        crops: [{ cropId: 'crop-1', name: 'Café' }],
      }),
    );
  });
});

// ─── resolveLocalSessions (spec 47) ───────────────────────────────────────────

describe('resolveLocalSessions', () => {
  it('sends cropIds already saved locally when resolving a session', async () => {
    mockListPendingSessions.mockResolvedValueOnce([
      { localSessionId: 'local-session-1', campaignId: 'campaign-1', farmerId: 'farmer-1', userId: 'user-1' },
    ]);
    mockSessionCropsGet.mockResolvedValueOnce([{ cropId: 'crop-café', name: 'Café' }]);

    await SyncQueueService.processAll();

    expect(mockSessionCropsGet).toHaveBeenCalledWith('local-session-1');
    expect(mockCreateCampaignSession).toHaveBeenCalledWith(
      expect.objectContaining({ cropIds: ['crop-café'] }),
    );
    expect(mockResolveSession).toHaveBeenCalledWith('local-session-1', 'real-session-1');
  });

  it('omits cropIds when no crops were saved locally for the session', async () => {
    mockListPendingSessions.mockResolvedValueOnce([
      { localSessionId: 'local-session-2', campaignId: 'campaign-1', farmerId: 'farmer-1', userId: 'user-1' },
    ]);
    mockSessionCropsGet.mockResolvedValueOnce([]);

    await SyncQueueService.processAll();

    const callArgs = mockCreateCampaignSession.mock.calls[0][0];
    expect(callArgs.cropIds).toBeUndefined();
  });
});

// ─── resetNetworkFailures ─────────────────────────────────────────────────────

describe('resetNetworkFailures', () => {
  it('allows processAll to run again after resetting the failure counter', async () => {
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);
    mockSubmitResponsesBatch.mockRejectedValue(new NetworkError());

    for (let i = 0; i < 5; i++) {
      mockDequeueNextPending.mockResolvedValueOnce(makeEntry({ id: `fail-${i}` }));
      await SyncQueueService.processAll();
    }

    // Confirm blocked
    const callsBefore = mockDequeueNextPending.mock.calls.length;
    await SyncQueueService.processAll();
    expect(mockDequeueNextPending.mock.calls.length).toBe(callsBefore);

    // Reset and verify processing resumes
    SyncQueueService.resetNetworkFailures();
    mockDequeueNextPending.mockResolvedValueOnce(makeEntry({ id: 'after-reset' })).mockResolvedValue(null);
    mockBuildResponsesPayload.mockReturnValue([]);

    await SyncQueueService.processAll();
    expect(mockMarkSynced).toHaveBeenCalledWith('after-reset');
  });
});

// ─── processEntry — farm-plot (spec 29) ──────────────────────────────────────
//
// Escrito retroactivamente (2026-08-21): processFarmPlotEntry() no tenía
// ninguna prueba, hallazgo M-2 de `@reviewer`
// (docs/reports/auditorias/29-auditoria-mobile-development-lote-merges.md).
// Cubre también la guarda de idempotencia agregada el mismo día (evita
// duplicar el lote en el backend si la entrada se reprocesa).

describe('processEntry — farm-plot', () => {
  it('crea el lote en el backend y marca todo synced cuando el borrador está en draft', async () => {
    const entry = makeEntry({ id: 'plot-entry-1', surveyId: 'plot-1', itemType: 'farm-plot' });
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    const draft = makeFarmPlotDraft();
    mockFarmPlotLoadDraft.mockResolvedValue(draft);

    await SyncQueueService.processAll();

    expect(mockCreateFarmPlot).toHaveBeenCalledWith({
      farmId: draft.farmId,
      name: draft.name,
      description: draft.description,
      area: draft.area,
      capturedOffline: draft.capturedOffline,
      polygon: draft.polygon,
    });
    expect(mockFarmPlotMarkSynced).toHaveBeenCalledWith('plot-1');
    expect(mockMarkSynced).toHaveBeenCalledWith('plot-entry-1');
  });

  it('marca la entrada synced sin crear nada si el borrador ya no existe localmente', async () => {
    const entry = makeEntry({ id: 'plot-entry-2', surveyId: 'plot-missing', itemType: 'farm-plot' });
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockFarmPlotLoadDraft.mockResolvedValue(null);

    await SyncQueueService.processAll();

    expect(mockCreateFarmPlot).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('plot-entry-2');
  });

  it('no vuelve a crear el lote si ya está synced localmente (guarda de idempotencia)', async () => {
    const entry = makeEntry({ id: 'plot-entry-3', surveyId: 'plot-1', itemType: 'farm-plot' });
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockFarmPlotLoadDraft.mockResolvedValue(makeFarmPlotDraft({ status: 'synced' }));

    await SyncQueueService.processAll();

    expect(mockCreateFarmPlot).not.toHaveBeenCalled();
    expect(mockMarkSynced).toHaveBeenCalledWith('plot-entry-3');
  });

  it('deja la entrada para reintentar ante un error de red, sin marcar fallo de validación', async () => {
    const entry = makeEntry({ id: 'plot-entry-4', surveyId: 'plot-1', itemType: 'farm-plot' });
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockFarmPlotLoadDraft.mockResolvedValue(makeFarmPlotDraft());
    mockCreateFarmPlot.mockRejectedValue(new NetworkError());

    await SyncQueueService.processAll();

    expect(mockFarmPlotMarkSynced).not.toHaveBeenCalled();
    expect(mockMarkFailedValidation).not.toHaveBeenCalled();
    expect(mockMarkSynced).not.toHaveBeenCalledWith('plot-entry-4');
  });

  it('marca fallo de validación ante un error no relacionado con la red', async () => {
    const entry = makeEntry({ id: 'plot-entry-5', surveyId: 'plot-1', itemType: 'farm-plot' });
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockFarmPlotLoadDraft.mockResolvedValue(makeFarmPlotDraft());
    mockCreateFarmPlot.mockRejectedValue(new Error('polygon must have at least 3 points'));

    await SyncQueueService.processAll();

    expect(mockMarkFailedValidation).toHaveBeenCalledWith(
      'plot-entry-5',
      expect.stringContaining('polygon must have at least 3 points'),
    );
    expect(mockMarkSynced).not.toHaveBeenCalledWith('plot-entry-5');
  });
});
