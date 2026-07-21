import { eq } from 'drizzle-orm';
import { db } from '../storage/db/db';
import { surveys, syncQueue } from '../storage/db/schema';
import { syncQueueStorage, type SyncQueueEntry } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { pendingSessionStorage } from '../storage/pendingSessions';
import { farmerCacheStorage } from '../storage/farmerCache';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { submitResponsesBatch } from '../api/responses';
import { createSurvey, markSurveyAsSynced } from '../api/surveys';
import { markSessionAsSynced, createCampaignSession } from '../api/campaignSessions';
import { extractFarmer, extractCrops } from '../api/farmers';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import { flattenSections } from '../lib/flattenSections';
import { resolveOtherOptions } from '../lib/resolveOtherOptions';
import { isLocalId } from '../lib/isLocalId';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { NetworkError, httpClient } from '../api/httpClient';
import { endpoints } from '../api/endpoints';
import { logger } from '../lib/logger';
import { sessionCropsStorage } from '../storage/sessionCropsStorage';
import { captureError } from '../lib/sentry';
import { MediaUploadService } from './MediaUploadService';
import { changeRequestStorage } from '../storage/changeRequestStorage';
import { postChangeRequest, fetchMyResolved } from '../api/changeRequests';
import { useChangeRequestStore } from '../store/useChangeRequestStore';

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
      // Resolve any provisional sessions before processing the queue.
      try {
        await this.resolveLocalSessions();
      } catch (err) {
        logger.error('[Sync] resolveLocalSessions failed, continuing anyway', err);
      }

      // Flush pending change requests before processing surveys.
      try {
        await this.flushPendingChangeRequests();
      } catch (err) {
        logger.error('[Sync] flushPendingChangeRequests failed, continuing anyway', err);
      }

      let entry = await syncQueueStorage.dequeueNextPending();

      while (entry) {
        setSyncingId(entry.id);
        await this.processEntry(entry);
        await refreshPendingCount();
        entry = await syncQueueStorage.dequeueNextPending();
      }
      // Pull resolved change requests after the survey loop.
      try {
        const { lastSyncAt } = useSyncStatusStore.getState();
        // Fall back to epoch when lastSyncAt is null (first sync or after app restart)
        // so we always catch any resolved tickets.
        const since = lastSyncAt ?? new Date(0);
        await this.pullResolvedChangeRequests(since);
      } catch (err) {
        logger.error('[Sync] pullResolvedChangeRequests failed, continuing anyway', err);
      }
    } finally {
      // isProcessing must clear even if the cleanup below throws, or every
      // future processAll() call silently no-ops forever (see the guard at
      // the top of this method).
      this.isProcessing = false;
      setSyncingId(null);
      markSyncCompleted();

      // Reset any entries left in_flight (e.g., deferred due to unresolved session)
      // so they're retried on the next sync run.
      try {
        await syncQueueStorage.resetInFlightToRetry();
      } catch (err) {
        logger.error('[Sync] resetInFlightToRetry failed', err);
      }
      await refreshPendingCount();
    }
  }

  private async flushPendingChangeRequests(): Promise<void> {
    const pending = await changeRequestStorage.listPendingSync();
    if (pending.length === 0) return;

    for (const cr of pending) {
      await postChangeRequest({
        description: cr.description,
        farmerId: cr.farmerId,
        localId: cr.id,
      });
      await changeRequestStorage.markSynced(cr.id);
      logger.info(`[Sync] change request ${cr.id} synced`);
    }

    await useChangeRequestStore.getState().loadAll();
  }

  private async pullResolvedChangeRequests(since: Date): Promise<void> {
    const resolved = await fetchMyResolved(since);
    if (resolved.length === 0) return;

    let newCount = 0;
    for (const item of resolved) {
      if (!item.localId) continue;
      await changeRequestStorage.markResolved(item.localId, new Date(item.resolvedAt));
      newCount++;
    }

    if (newCount > 0) {
      useChangeRequestStore.getState().setHasNewResolved(true);
      await useChangeRequestStore.getState().loadAll();
      logger.info(`[Sync] ${newCount} change request(s) marked as resolved`);
    }
  }

  private async resolveLocalSessions(): Promise<void> {
    const pending = await pendingSessionStorage.listPending();

    for (const session of pending) {
      try {
        let farmerIdForBackend: string | undefined = session.farmerId;

        // If the farmerId is provisional, don't send it — backend will assign after extractFarmer.
        if (farmerIdForBackend && isLocalId(farmerIdForBackend)) {
          farmerIdForBackend = undefined;
        }

        const sessionResponse = await createCampaignSession({
          campaignId: session.campaignId,
          userId: session.userId,
          ...(farmerIdForBackend ? { farmerId: farmerIdForBackend } : {}),
        });

        const realSessionId = sessionResponse.sessionId;
        const localSessionId = session.localSessionId;

        // Remap all surveys and syncQueue entries that reference the provisional session.
        await db
          .update(surveys)
          .set({ campaignSessionId: realSessionId })
          .where(eq(surveys.campaignSessionId, localSessionId));

        await db
          .update(syncQueue)
          .set({ campaignSessionId: realSessionId })
          .where(eq(syncQueue.campaignSessionId, localSessionId));

        await pendingSessionStorage.resolve(localSessionId, realSessionId);

        // Update the active store if this session is still open.
        const storeState = useCampaignSessionStore.getState();
        if (storeState.localSessionId === localSessionId) {
          storeState.resolveSession(realSessionId);
        }

        logger.info(`[Sync] resolved local session ${localSessionId} → ${realSessionId}`);
      } catch (err) {
        if (err instanceof NetworkError) {
          logger.error('[Sync] network error resolving session, will retry later', err);
          break;
        } else {
          logger.error(`[Sync] failed to resolve session ${session.localSessionId}`, err);
          captureError(err, { localSessionId: session.localSessionId });
          await pendingSessionStorage.markFailed(session.localSessionId);
        }
      }
    }
  }

  private async processEntry(entry: SyncQueueEntry): Promise<void> {
    await syncQueueStorage.markInFlight(entry.id);

    try {
      // If the campaign session is still provisional (resolveLocalSessions failed earlier),
      // leave the entry in_flight so this run's dequeue loop skips it.
      // resetInFlightToRetry() in the finally block resets it to pending for the next sync run.
      if (entry.campaignSessionId && isLocalId(entry.campaignSessionId)) {
        logger.warn(`[Sync] campaign session not yet resolved for entry ${entry.id}, deferring`);
        return;
      }

      // If the survey was created offline, it doesn't exist on the backend yet.
      // Create it now to obtain a real surveyId before sending responses.
      let realSurveyId = entry.surveyId;
      if (isLocalId(entry.surveyId)) {
        realSurveyId = await this.materializeSurvey(entry);
        // Persisted so a failed media attachment can still be retried after
        // this survey syncs and its local `id` (still the local one) is all
        // that's left to look it up by — see surveyDraftStore.getBackendSurveyId.
        await surveyDraftStore.setBackendSurveyId(entry.surveyId, realSurveyId);
      }

      const payload = await this.buildPayload(entry, realSurveyId);

      if (!payload || payload.length === 0) {
        await syncQueueStorage.markSynced(entry.id);
        await surveyDraftStore.markSynced(entry.surveyId);
        return;
      }

      // Log any response items with suspicious optionId values before sending.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const item of payload) {
        if (item.optionId !== undefined && !UUID_RE.test(item.optionId)) {
          const msg = `[Sync] NON-UUID optionId detected before submit — questionId: ${item.questionId}, optionId: "${item.optionId}", surveyId: ${realSurveyId}`;
          logger.error(msg);
        }
      }

      await submitResponsesBatch(payload);
      await markSurveyAsSynced(realSurveyId);

      // After responses are on the backend, run deferred extraction for S1/S2.
      await this.maybeExtractFarmerAndCrops(entry, realSurveyId);

      if (entry.campaignSessionId) {
        await markSessionAsSynced(entry.campaignSessionId);
      }

      // Non-blocking telemetry — ignore errors
      httpClient.post(endpoints.telemetrySync, {
        surveyId: realSurveyId,
        campaignSessionId: entry.campaignSessionId,
        attempts: entry.attempts,
      }).catch(() => {});

      await syncQueueStorage.markSynced(entry.id);
      await surveyDraftStore.markSynced(entry.surveyId);

      logger.info(`[Sync] processed entry ${entry.id} for survey ${realSurveyId}`);
      this.consecutiveNetworkFailures = 0;
    } catch (error) {
      if (error instanceof NetworkError) {
        logger.error('[Sync] network error', error);
        await this.handleNetworkError(entry);
      } else {
        logger.error('[Sync] validation error', error);
        captureError(error, { surveyId: entry.surveyId, entryId: entry.id });
        const detail = error instanceof Error ? error.message : String(error);
        await syncQueueStorage.markFailedValidation(entry.id, detail);
        this.consecutiveNetworkFailures = 0;
      }
    }
  }

  // Creates the survey on the backend for surveys that were started offline.
  // Returns the real surveyId assigned by the backend.
  private async materializeSurvey(entry: SyncQueueEntry): Promise<string> {
    const draft = await surveyDraftStore.loadDraft(entry.surveyId);
    if (!draft) throw new Error(`Draft not found for local survey ${entry.surveyId}`);

    const { surveyId: realSurveyId } = await createSurvey({
      instrumentIds: [draft.instrumentId],
      campaignSessionId: entry.campaignSessionId,
      ...(entry.stepOrder != null ? { stepOrder: entry.stepOrder } : {}),
    });

    logger.info(`[Sync] materialized local survey ${entry.surveyId} → ${realSurveyId}`);
    return realSurveyId;
  }

  private async maybeExtractFarmerAndCrops(entry: SyncQueueEntry, realSurveyId: string): Promise<void> {
    const draft = await surveyDraftStore.loadDraft(entry.surveyId);
    if (!draft) return;

    const instrument = await instrumentCacheStorage.get(draft.instrumentId);
    if (!instrument) {
      logger.warn(`[Sync] instrument not in cache for survey ${entry.surveyId}, skipping extraction`);
      return;
    }

    const code = instrument.code;
    if (code !== 'S1' && code !== 'S2') return;

    if (code === 'S1') {
      const { farmer } = await extractFarmer(realSurveyId);

      // Remap provisional farmerId if one exists in farmerCache.
      const allRecent = await farmerCacheStorage.listRecent(100);
      const provisionalEntry = allRecent.find(
        (f) => isLocalId(f.farmerId) && f.documentId && f.documentId === farmer.documentId
      );

      if (provisionalEntry) {
        const localFarmerId = provisionalEntry.farmerId;

        await db
          .update(surveys)
          .set({ farmerId: farmer.farmerId })
          .where(eq(surveys.farmerId, localFarmerId));

        const storeState = useCampaignSessionStore.getState();
        if (storeState.localFarmerId === localFarmerId) {
          storeState.resolveFarmer(farmer.farmerId);
        }
      }

      await farmerCacheStorage.upsert({
        farmerId: farmer.farmerId,
        name: farmer.name,
        documentId: farmer.documentId ?? undefined,
        cachedAt: new Date(),
      });

      logger.info(`[Sync] extractFarmer completed for survey ${realSurveyId}`);
    } else if (code === 'S2') {
      const cropsResult = await extractCrops(realSurveyId);
      logger.info(`[Sync] extractCrops completed for survey ${realSurveyId}`);
      if (entry.campaignSessionId) {
        await sessionCropsStorage.save(entry.campaignSessionId, cropsResult.crops);
      }
    }
  }

  private async buildPayload(entry: SyncQueueEntry, realSurveyId: string) {
    const draft = await surveyDraftStore.loadDraft(entry.surveyId);
    if (!draft) return [];

    const instrument = await instrumentCacheStorage.get(draft.instrumentId);
    if (!instrument) return [];

    const attachmentIds = await MediaUploadService.processPendingForSurvey(
      entry.surveyId,
      realSurveyId,
    );

    const flattenedQuestions = flattenSections(instrument.sections);

    const resolvedAnswers = await resolveOtherOptions(flattenedQuestions, draft.answers);

    // Persist resolved answers so a retry doesn't create the same dynamic option twice.
    const hasChanges = Object.keys(resolvedAnswers).some(
      (qId) => resolvedAnswers[qId] !== draft.answers[qId],
    );
    if (hasChanges) {
      await surveyDraftStore.saveMultipleAnswers(entry.surveyId, resolvedAnswers);
      for (const [qId, answer] of Object.entries(resolvedAnswers)) {
        if (answer !== draft.answers[qId]) {
          logger.info(
            `[Sync] resolved other option — questionId: ${qId}, newOptionId: ${answer.optionId}`,
          );
        }
      }
    }

    return buildResponsesPayload(realSurveyId, flattenedQuestions, resolvedAnswers, attachmentIds);
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
  }

  async processSurveyNow(surveyId: string): Promise<void> {
    const entry = await syncQueueStorage.getPendingBySurveyId(surveyId);

    if (entry) {
      await this.processEntry(entry);
      return;
    }

    // Entry may be in_flight (processAll already picked it up); wait up to 10s.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const active = await syncQueueStorage.getActiveBySurveyId(surveyId);
      if (!active) return;
      await sleep(300);
    }
  }

  resetNetworkFailures(): void {
    this.consecutiveNetworkFailures = 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const SyncQueueService = new SyncQueueServiceClass();
