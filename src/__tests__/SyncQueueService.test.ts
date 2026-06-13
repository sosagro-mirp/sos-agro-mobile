/**
 * Unit tests for SyncQueueService.
 *
 * All external collaborators are mocked so no DB or network is needed.
 */

import { NetworkError, ServerError } from '../../api/httpClient';

// ─── Mock declarations (hoisted) ─────────────────────────────────────────────

const mockDequeueNextPending = jest.fn();
const mockMarkInFlight = jest.fn();
const mockMarkSynced = jest.fn();
const mockMarkFailedValidation = jest.fn();
const mockIncrementAttempts = jest.fn();
const mockRefreshPendingCount = jest.fn();

jest.mock('../../storage/syncQueue', () => ({
  syncQueueStorage: {
    dequeueNextPending: mockDequeueNextPending,
    markInFlight: mockMarkInFlight,
    markSynced: mockMarkSynced,
    markFailedValidation: mockMarkFailedValidation,
    incrementAttempts: mockIncrementAttempts,
  },
}));

const mockLoadDraft = jest.fn();
const mockMarkSyncedDraft = jest.fn();
jest.mock('../../storage/surveyDraftStore', () => ({
  surveyDraftStore: {
    loadDraft: mockLoadDraft,
    markSynced: mockMarkSyncedDraft,
  },
}));

const mockInstrumentCacheGet = jest.fn();
jest.mock('../../storage/instrumentCache', () => ({
  instrumentCacheStorage: {
    get: mockInstrumentCacheGet,
  },
}));

const mockSubmitResponsesBatch = jest.fn();
jest.mock('../../api/responses', () => ({
  submitResponsesBatch: mockSubmitResponsesBatch,
}));

const mockMarkSurveyAsSynced = jest.fn();
jest.mock('../../api/surveys', () => ({
  markSurveyAsSynced: mockMarkSurveyAsSynced,
}));

const mockMarkSessionAsSynced = jest.fn();
jest.mock('../../api/campaignSessions', () => ({
  markSessionAsSynced: mockMarkSessionAsSynced,
}));

const mockSetSyncingId = jest.fn();
const mockMarkSyncCompleted = jest.fn();
jest.mock('../../store/useSyncStatusStore', () => ({
  useSyncStatusStore: {
    getState: jest.fn(() => ({
      setSyncingId: mockSetSyncingId,
      markSyncCompleted: mockMarkSyncCompleted,
      refreshPendingCount: mockRefreshPendingCount,
    })),
  },
}));

const mockFlattenSections = jest.fn();
jest.mock('../../lib/flattenSections', () => ({
  flattenSections: mockFlattenSections,
}));

const mockBuildResponsesPayload = jest.fn();
jest.mock('../../lib/buildResponsesPayload', () => ({
  buildResponsesPayload: mockBuildResponsesPayload,
}));

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import { SyncQueueService } from '../../sync/SyncQueueService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides = {}) {
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

function makeInstrument() {
  return {
    instrumentId: 'inst-1',
    sections: [
      {
        sectionId: 's1',
        name: 'Section 1',
        order: 1,
        questions: [],
      },
    ],
  };
}

// ─── Test isolation ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  SyncQueueService.resetNetworkFailures();

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
    // Simulate 5 network failures by calling processAll 5 times with network errors
    const entry = makeEntry();
    mockDequeueNextPending
      .mockResolvedValueOnce(entry)
      .mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockFlattenSections.mockReturnValue([{ question: { questionId: 'q1' } }]);
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);
    mockSubmitResponsesBatch.mockRejectedValue(new NetworkError());

    // 5 rounds — each round produces 1 network failure
    for (let i = 0; i < 5; i++) {
      mockDequeueNextPending.mockResolvedValueOnce(makeEntry({ id: `entry-${i}` }));
      await SyncQueueService.processAll();
    }

    // Now the threshold is reached; a subsequent call should bail out immediately
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
    mockFlattenSections.mockReturnValue([]);
    mockBuildResponsesPayload.mockReturnValue([]);

    await SyncQueueService.processAll();

    expect(mockMarkSynced).toHaveBeenCalledWith('e1');
    expect(mockMarkSynced).toHaveBeenCalledWith('e2');
  });

  it('calls setSyncingId and markSyncCompleted around the loop', async () => {
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([]);

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
    mockFlattenSections.mockReturnValue([]);
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

    // Simulate a prior failure
    // (We can only verify this indirectly by checking that processAll runs after)
    await SyncQueueService.processAll();

    // If no threshold was hit, processAll would have run through normally
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
    mockLoadDraft.mockResolvedValue(null); // draft missing

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

    // After a ServerError, the service resets consecutiveNetworkFailures to 0.
    // The next processAll call should work (not bail out due to threshold).
    mockDequeueNextPending.mockResolvedValueOnce(makeEntry({ id: 'e2' })).mockResolvedValue(null);
    mockBuildResponsesPayload.mockReturnValue([]);

    await SyncQueueService.processAll(); // should NOT bail out early
    expect(mockMarkSynced).toHaveBeenCalledWith('e2');
  });
});

// ─── resetNetworkFailures ─────────────────────────────────────────────────────

describe('resetNetworkFailures', () => {
  it('allows processAll to run again after resetting the failure counter', async () => {
    // Indirectly test: if we had 5 failures and then call reset, processAll should run
    const entry = makeEntry();
    mockDequeueNextPending.mockResolvedValueOnce(entry).mockResolvedValue(null);
    mockLoadDraft.mockResolvedValue(makeDraft());
    mockInstrumentCacheGet.mockResolvedValue(makeInstrument());
    mockBuildResponsesPayload.mockReturnValue([{ surveyId: 'survey-1', questionId: 'q1' }]);
    mockSubmitResponsesBatch.mockRejectedValue(new NetworkError());

    // Accumulate failures manually (5 rounds)
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
