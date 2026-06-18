import { db } from '../storage/db/db';
import { responses, surveys } from '../storage/db/schema';
import { syncQueueStorage, type SyncQueueEntry } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { submitResponsesBatch } from '../api/responses';
import { markSurveyAsSynced } from '../api/surveys';
import { markSessionAsSynced } from '../api/campaignSessions';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import { flattenSections } from '../lib/flattenSections';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { MediaUploadService } from './MediaUploadService';
import { eq } from 'drizzle-orm';
import { NetworkError, httpClient } from '../api/httpClient';
import { endpoints } from '../api/endpoints';
import { logger } from '../lib/logger';
import { captureError } from '../lib/sentry';

const MAX_CONSECUTIVE_NETWORK_FAILURES = 5;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

class SyncQueueServiceClass {
  private isProcessing = false;
  private consecutiveNetworkFailures = 0;

  async processAll(): Promise<void> {
    if (this.isProcessing) return;
    if (this.consecutiveNetworkFailures >= MAX_CONSECUTIVE_NETWORK_FAILURES) return;

    this.isProcessing = true;
    const { setSyncingId, markSyncCompleted, refreshPendingCount } =
      useSyncStatusStore.getState();

    try {
      let entry = await syncQueueStorage.dequeueNextPending();

      while (entry) {
        setSyncingId(entry.id);
        await this.processEntry(entry);
        await refreshPendingCount();
        entry = await syncQueueStorage.dequeueNextPending();
      }
    } finally {
      this.isProcessing = false;
      setSyncingId(null);
      markSyncCompleted();
      await refreshPendingCount();
    }
  }

  private async processEntry(entry: SyncQueueEntry): Promise<void> {
    await syncQueueStorage.markInFlight(entry.id);

    try {
      await MediaUploadService.processPendingForSurvey(entry.surveyId);

      const payload = await this.buildPayload(entry);

      if (!payload || payload.length === 0) {
        // Nothing to send — survey may have had no answers; remove from queue.
        await syncQueueStorage.markSynced(entry.id);
        await surveyDraftStore.markSynced(entry.surveyId);
        return;
      }

      await submitResponsesBatch(payload);
      await markSurveyAsSynced(entry.surveyId);

      if (entry.campaignSessionId) {
        await markSessionAsSynced(entry.campaignSessionId);
      }

      // Non-blocking telemetry — ignore errors
      httpClient.post(endpoints.telemetrySync, {
        surveyId: entry.surveyId,
        campaignSessionId: entry.campaignSessionId,
        attempts: entry.attempts,
      }).catch(() => {});

      await syncQueueStorage.markSynced(entry.id);
      await surveyDraftStore.markSynced(entry.surveyId);

      logger.info(`[Sync] processed entry ${entry.id} for survey ${entry.surveyId}`);
      this.consecutiveNetworkFailures = 0;
    } catch (error) {
      if (error instanceof NetworkError) {
        logger.error('[Sync] network error', error);
        await this.handleNetworkError(entry);
      } else {
        // 4xx or unknown — mark as failed, do not retry
        logger.error('[Sync] validation error', error);
        captureError(error, { surveyId: entry.surveyId, entryId: entry.id });
        const detail = error instanceof Error ? error.message : String(error);
        await syncQueueStorage.markFailedValidation(entry.id, detail);
        this.consecutiveNetworkFailures = 0;
      }
    }
  }

  private async buildPayload(entry: SyncQueueEntry) {
    const draft = await surveyDraftStore.loadDraft(entry.surveyId);
    if (!draft) return [];

    const instrument = await instrumentCacheStorage.get(draft.instrumentId);
    if (!instrument) return [];

    const flattenedQuestions = flattenSections(instrument.sections);
    return await buildResponsesPayload(entry.surveyId, flattenedQuestions, draft.answers);
  }

  private async handleNetworkError(entry: SyncQueueEntry): Promise<void> {
    this.consecutiveNetworkFailures++;
    await syncQueueStorage.incrementAttempts(entry.id);

    const delayMs = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, entry.attempts),
      BACKOFF_MAX_MS
    );

    if (this.consecutiveNetworkFailures < MAX_CONSECUTIVE_NETWORK_FAILURES) {
      await sleep(delayMs);
    }
    // If we hit the cap, processAll() will stop on the next iteration check.
  }

  resetNetworkFailures(): void {
    this.consecutiveNetworkFailures = 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const SyncQueueService = new SyncQueueServiceClass();
