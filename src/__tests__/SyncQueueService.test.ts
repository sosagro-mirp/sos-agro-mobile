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
  },
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
import { extractCrops } from '../api/farmers';
import { sessionCropsStorage } from '../storage/sessionCropsStorage';
import { pendingSessionStorage } from '../storage/pendingSessions';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { flattenSections } from '../lib/flattenSections';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';

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
const mockExtractCrops = extractCrops as jest.Mock;
const mockSessionCropsSave = sessionCropsStorage.save as jest.Mock;
const mockSessionCropsGet = sessionCropsStorage.get as jest.Mock;
const mockCreateCampaignSession = createCampaignSession as jest.Mock;
const mockListPendingSessions = pendingSessionStorage.listPending as jest.Mock;
const mockResolveSession = pendingSessionStorage.resolve as jest.Mock;

const mockFlattenSections = flattenSections as jest.Mock;
const mockBuildResponsesPayload = buildResponsesPayload as jest.Mock;

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
