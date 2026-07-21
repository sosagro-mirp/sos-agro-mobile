/**
 * Unit tests for MediaUploadService, focused on the local-vs-real surveyId
 * distinction (see the block comment on processPendingForSurvey) and on
 * retryEntry actually linking a re-uploaded attachment to its response.
 */

// expo-file-system/legacy is already mapped (moduleNameMapper) to
// __mocks__/expo-file-system-legacy.ts; override the two methods this
// suite exercises in beforeEach below.
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('../storage/mediaUploadQueueStorage', () => ({
  mediaUploadQueueStorage: {
    findUnenqueued: jest.fn().mockResolvedValue([]),
    enqueueIfAbsent: jest.fn(),
    dequeueNextPending: jest.fn(),
    markInFlight: jest.fn().mockResolvedValue(undefined),
    markUploaded: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    getUploadedForSurvey: jest.fn().mockResolvedValue([]),
    resetToRetry: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../storage/surveyDraftStore', () => ({
  surveyDraftStore: {
    getBackendSurveyId: jest.fn(),
  },
}));

jest.mock('../api/httpClient', () => {
  class NetworkError extends Error {}
  return {
    httpClient: { post: jest.fn(), patch: jest.fn() },
    NetworkError,
  };
});

jest.mock('../api/responses', () => ({
  submitResponsesBatch: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../store/useSyncStatusStore', () => ({
  useSyncStatusStore: {
    getState: jest.fn().mockReturnValue({
      setUploadingMediaId: jest.fn(),
      refreshPendingMediaCount: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock('../lib/sentry', () => ({
  captureError: jest.fn(),
}));

import { MediaUploadService } from '../sync/MediaUploadService';
import { mediaUploadQueueStorage } from '../storage/mediaUploadQueueStorage';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { httpClient } from '../api/httpClient';
import { submitResponsesBatch } from '../api/responses';

const mockDequeueNextPending = mediaUploadQueueStorage.dequeueNextPending as jest.Mock;
const mockGetUploadedForSurvey = mediaUploadQueueStorage.getUploadedForSurvey as jest.Mock;
const mockResetToRetry = mediaUploadQueueStorage.resetToRetry as jest.Mock;
const mockGetBackendSurveyId = surveyDraftStore.getBackendSurveyId as jest.Mock;
const mockHttpPost = httpClient.post as jest.Mock;
const mockHttpPatch = httpClient.patch as jest.Mock;
const mockSubmitResponsesBatch = submitResponsesBatch as jest.Mock;

const LOCAL_SURVEY_ID = 'local_survey_abc';
const REAL_SURVEY_ID = 'real-survey-uuid';

function pendingEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'media-1',
    surveyId: LOCAL_SURVEY_ID,
    questionId: 'q1',
    localPath: 'file:///photo.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 1234,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 1234 });
  (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 200, body: '' });
  mockHttpPost.mockResolvedValue({
    attachmentId: 'attach-1',
    presignedUrl: 'https://r2.example/put',
  });
  mockHttpPatch.mockResolvedValue({ attachmentId: 'attach-1', publicUrl: 'https://cdn/attach-1' });
});

describe('MediaUploadService.processPendingForSurvey', () => {
  it('requests the presigned URL with the real surveyId, not the local one', async () => {
    mockDequeueNextPending.mockResolvedValueOnce(pendingEntry()).mockResolvedValueOnce(null);
    mockGetUploadedForSurvey.mockResolvedValue([
      { questionId: 'q1', attachmentId: 'attach-1' },
    ]);

    const result = await MediaUploadService.processPendingForSurvey(
      LOCAL_SURVEY_ID,
      REAL_SURVEY_ID,
    );

    expect(mockHttpPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ surveyId: REAL_SURVEY_ID }),
    );
    // Local-keyed lookups still use the local id.
    expect(mockDequeueNextPending).toHaveBeenCalledWith(LOCAL_SURVEY_ID);
    expect(result).toEqual({ q1: 'attach-1' });
  });
});

describe('MediaUploadService.retryEntry', () => {
  it('re-uploads and links the response via submitResponsesBatch', async () => {
    mockGetBackendSurveyId.mockResolvedValue(REAL_SURVEY_ID);
    mockDequeueNextPending.mockResolvedValueOnce(pendingEntry()).mockResolvedValueOnce(null);
    mockGetUploadedForSurvey.mockResolvedValue([
      { questionId: 'q1', attachmentId: 'attach-1' },
    ]);

    await MediaUploadService.retryEntry('media-1', 'q1', LOCAL_SURVEY_ID);

    expect(mockResetToRetry).toHaveBeenCalledWith('media-1');
    expect(mockSubmitResponsesBatch).toHaveBeenCalledWith([
      { surveyId: REAL_SURVEY_ID, questionId: 'q1', attachmentId: 'attach-1' },
    ]);
  });

  it('throws instead of retrying when the backend surveyId was never persisted', async () => {
    mockGetBackendSurveyId.mockResolvedValue(null);

    await expect(
      MediaUploadService.retryEntry('media-1', 'q1', LOCAL_SURVEY_ID),
    ).rejects.toThrow();

    expect(mockResetToRetry).not.toHaveBeenCalled();
  });

  it('does not call submitResponsesBatch when the re-upload fails again', async () => {
    mockGetBackendSurveyId.mockResolvedValue(REAL_SURVEY_ID);
    mockDequeueNextPending.mockResolvedValueOnce(pendingEntry()).mockResolvedValueOnce(null);
    mockGetUploadedForSurvey.mockResolvedValue([]); // nothing confirmed uploaded
    mockHttpPost.mockRejectedValue(Object.assign(new Error('boom'), { status: 400 }));

    await MediaUploadService.retryEntry('media-1', 'q1', LOCAL_SURVEY_ID);

    expect(mockSubmitResponsesBatch).not.toHaveBeenCalled();
  });
});
