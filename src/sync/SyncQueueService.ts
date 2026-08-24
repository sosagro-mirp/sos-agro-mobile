import { eq } from 'drizzle-orm';
import { db } from '../storage/db/db';
import { surveys, syncQueue } from '../storage/db/schema';
import { syncQueueStorage, type SyncQueueEntry } from '../storage/syncQueue';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { pendingSessionStorage } from '../storage/pendingSessions';
import { farmerCacheStorage } from '../storage/farmerCache';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { submitResponsesBatch } from '../api/responses';
import { createSurvey, markSurveyAsSynced, skipStepApi } from '../api/surveys';
import { markSessionAsSynced, createCampaignSession } from '../api/campaignSessions';
import { extractFarmer, extractCrops, DocumentIdCollisionError } from '../api/farmers';
import { cacheFarmerIdentity } from '../lib/cacheFarmerIdentity';
import { buildResponsesPayload } from '../lib/buildResponsesPayload';
import { flattenSections } from '../lib/flattenSections';
import { resolveOtherOptions } from '../lib/resolveOtherOptions';
import { isLocalId } from '../lib/isLocalId';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { useCampaignSessionStore } from '../store/useCampaignSessionStore';
import { NetworkError, ServerError, httpClient } from '../api/httpClient';
import { endpoints } from '../api/endpoints';
import { logger } from '../lib/logger';
import { sessionCropsStorage } from '../storage/sessionCropsStorage';
import { captureError } from '../lib/sentry';
import { MediaUploadService } from './MediaUploadService';
import { changeRequestStorage } from '../storage/changeRequestStorage';
import { postChangeRequest, fetchMyResolved } from '../api/changeRequests';
import { useChangeRequestStore } from '../store/useChangeRequestStore';
import { farmPlotStore } from '../storage/farmPlotStore';
import { createFarmPlot } from '../api/farmPlots';
import type { CampaignSessionResponse } from '../types/campaign';

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

        const localCrops = await sessionCropsStorage.get(session.localSessionId);
        const cropIds = localCrops.map((c) => c.cropId);

        let sessionResponse: CampaignSessionResponse;
        try {
          sessionResponse = await createCampaignSession({
            campaignId: session.campaignId,
            userId: session.userId,
            ...(farmerIdForBackend ? { farmerId: farmerIdForBackend } : {}),
            ...(cropIds.length > 0 ? { cropIds } : {}),
          });
        } catch (createErr) {
          // The farmerId was cached on this device but has since been
          // deleted on the backend (e.g. cleanup of a prior test round):
          // invalidate the stale entry and retry as a new farmer instead of
          // marking the whole session as failed (see spec 49, Bug C).
          if (
            createErr instanceof ServerError &&
            createErr.status === 404 &&
            createErr.message === 'Farmer not found' &&
            farmerIdForBackend
          ) {
            await farmerCacheStorage.remove(farmerIdForBackend);
            logger.warn(
              `[Sync] farmerId ${farmerIdForBackend} no longer exists on the backend, retrying session ${session.localSessionId} without it`,
            );
            sessionResponse = await createCampaignSession({
              campaignId: session.campaignId,
              userId: session.userId,
              ...(cropIds.length > 0 ? { cropIds } : {}),
            });
          } else {
            throw createErr;
          }
        }

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

  // Spec 71 — intenta reparar una entrada de la cola cuyo `campaignSessionId`
  // apunta a un id local que `resolveLocalSessions()` ya no va a resolver
  // (porque la fila de `pendingSessions` correspondiente dejó de estar
  // `pending`). Dos fuentes locales pueden conservar el id real:
  //   1. El borrador (`surveys.campaignSessionId`): existía cuando
  //      `resolveLocalSessions()` hizo el remapeo, así que si el id ya no es
  //      local, es el id real.
  //   2. `pendingSessions.realSessionId`: se persiste en `resolve()` aunque
  //      la fila ya no aparezca en `listPending()`.
  // Devuelve el id real si logró repararla, o `null` si ninguna fuente local
  // lo tiene (llamador decide si sigue esperando o reporta el bloqueo).
  private async repairLocalCampaignSession(entry: SyncQueueEntry): Promise<string | null> {
    const localSessionId = entry.campaignSessionId!;

    const draft = await surveyDraftStore.loadDraft(entry.surveyId);
    if (draft?.campaignSessionId && !isLocalId(draft.campaignSessionId)) {
      await syncQueueStorage.updateCampaignSessionId(entry.id, draft.campaignSessionId);
      logger.info(
        `[Sync] repaired entry ${entry.id}: campaignSessionId ${localSessionId} → ${draft.campaignSessionId} (from draft)`,
      );
      return draft.campaignSessionId;
    }

    const pendingSession = await pendingSessionStorage.getByLocal(localSessionId);
    if (pendingSession?.status === 'resolved' && pendingSession.realSessionId) {
      await syncQueueStorage.updateCampaignSessionId(entry.id, pendingSession.realSessionId);
      logger.info(
        `[Sync] repaired entry ${entry.id}: campaignSessionId ${localSessionId} → ${pendingSession.realSessionId} (from pendingSessions)`,
      );
      return pendingSession.realSessionId;
    }

    return null;
  }

  private async processEntry(entry: SyncQueueEntry): Promise<void> {
    if (entry.itemType === 'farm-plot') {
      await this.processFarmPlotEntry(entry);
    } else if (entry.itemType === 'skip-step') {
      await this.processSkipStepEntry(entry);
    } else {
      await this.processSurveyEntry(entry);
    }
  }

  // Spec 70, Fase 10 — el salto de paso hecho sin conexión llega aquí en vez
  // de caer en processSurveyEntry, que descartaría la entrada en silencio por
  // no tener respuestas (es un vacío deliberado, no un abandono). Envía el
  // marcador vía el mismo endpoint que usa el camino online
  // (POST /api/surveys/skip-step), para que el estado final de la campaña sea
  // idéntico sin importar si hubo conexión en el momento de saltar.
  private async processSkipStepEntry(entry: SyncQueueEntry): Promise<void> {
    await syncQueueStorage.markInFlight(entry.id);

    try {
      const resolved = await this.resolveCampaignSession(entry);
      if (!resolved) return;
      entry = resolved;

      if (!entry.campaignSessionId || !entry.instrumentId || entry.stepOrder == null) {
        const detail = `Entrada skip-step incompleta — sessionId: ${entry.campaignSessionId}, instrumentId: ${entry.instrumentId}, stepOrder: ${entry.stepOrder}`;
        logger.error(`[Sync] ${detail} — entry ${entry.id}`);
        captureError(new Error(detail), { entryId: entry.id });
        await syncQueueStorage.markFailedValidation(entry.id, detail);
        return;
      }

      await skipStepApi({
        sessionId: entry.campaignSessionId,
        instrumentId: entry.instrumentId,
        stepOrder: entry.stepOrder,
      });

      await syncQueueStorage.markSynced(entry.id);
      // El borrador local (creado por handleSkip() antes de encolar) ya
      // quedó en status 'completed'; marcarlo synced evita que quede
      // colgando en la vista de la app aunque no aparezca en Borradores.
      await surveyDraftStore.markSynced(entry.surveyId);

      logger.info(`[Sync] processed skip-step entry ${entry.id} for session ${entry.campaignSessionId}`);
      this.consecutiveNetworkFailures = 0;
    } catch (error) {
      if (error instanceof NetworkError) {
        logger.error('[Sync] network error (skip-step)', error);
        await this.handleNetworkError(entry);
      } else {
        logger.error('[Sync] validation error (skip-step)', error);
        captureError(error, { entryId: entry.id, surveyId: entry.surveyId });
        const detail = error instanceof Error ? error.message : String(error);
        await syncQueueStorage.markFailedValidation(entry.id, detail);
        this.consecutiveNetworkFailures = 0;
      }
    }
  }

  // Repara el campaignSessionId de `entry` si sigue apuntando a un id local
  // (spec 71), o marca la entrada aplazada/fallida y devuelve `null` cuando
  // el llamador debe cortar el procesamiento ahí mismo. Compartido por
  // processSurveyEntry y processSkipStepEntry (spec 70, Fase 10) — antes solo
  // vivía dentro de processSurveyEntry, y skip-step necesita exactamente la
  // misma resolución para llamar a POST /api/surveys/skip-step con un
  // sessionId real.
  private async resolveCampaignSession(entry: SyncQueueEntry): Promise<SyncQueueEntry | null> {
    if (!entry.campaignSessionId || !isLocalId(entry.campaignSessionId)) {
      return entry;
    }

    // If the campaign session is still provisional, try to repair it before
    // giving up. Spec 71 — antes esto solo aplazaba la entrada de forma
    // indefinida: si la fila de `pendingSessions` que le correspondía ya no
    // está `pending` (porque se resolvió *después* de que esta entrada se
    // encoló — condición de carrera entre el remapeo de
    // resolveLocalSessions() y la copia de campaignSessionId en memoria de
    // useInstrumentSurveyStore), `resolveLocalSessions()` nunca vuelve a
    // ofrecerla y la entrada quedaba congelada para siempre, en silencio.
    const repaired = await this.repairLocalCampaignSession(entry);
    if (repaired) {
      return { ...entry, campaignSessionId: repaired };
    }

    const pendingSession = await pendingSessionStorage.getByLocal(entry.campaignSessionId);
    if (pendingSession?.status === 'pending') {
      // Espera legítima: la sesión sigue en cola de resolución.
      logger.warn(`[Sync] campaign session not yet resolved for entry ${entry.id}, deferring`);
      return null;
    }

    // No hay ninguna fuente local que resuelva este id (la fila no existe, o
    // quedó `failed`) — no aplazar más. Reportar en vez de callar.
    const detail = `Sesión de campaña local sin resolución posible: ${entry.campaignSessionId}`;
    logger.error(`[Sync] ${detail} — entry ${entry.id}`);
    captureError(new Error(detail), {
      surveyId: entry.surveyId,
      entryId: entry.id,
      localSessionId: entry.campaignSessionId,
    });
    await syncQueueStorage.markFailedValidation(entry.id, detail);
    return null;
  }

  private async processSurveyEntry(entry: SyncQueueEntry): Promise<void> {
    await syncQueueStorage.markInFlight(entry.id);

    try {
      const resolved = await this.resolveCampaignSession(entry);
      if (!resolved) return;
      entry = resolved;

      // Spec 70, Fase 3 — decidir si hay contenido real ANTES de materializar,
      // usando el borrador (`draft.answers`), no el payload de envío. Antes,
      // materializar pasaba siempre que `isLocalId(entry.surveyId)`, sin mirar
      // si había respuestas — eso es exactamente el vector 2: una fila vacía
      // quedaba creada en el backend para siempre. El payload de envío NO
      // sirve como señal aquí: una encuesta con solo una respuesta multimedia
      // aún sin subir construye un payload vacío a propósito
      // (`buildResponsesPayload` la omite hasta que resuelva `attachmentId`),
      // pero sí tiene contenido real y debe materializarse igual — de lo
      // contrario `MediaUploadService` nunca consigue un `surveyId` real para
      // pedir la URL prefirmada.
      const draft = await surveyDraftStore.loadDraft(entry.surveyId);
      const hasAnswers = !!draft && Object.keys(draft.answers).length > 0;

      if (!hasAnswers) {
        logger.warn(
          `[Sync] entry ${entry.id} has no answers — not materializing survey ${entry.surveyId}`,
        );
        await syncQueueStorage.markSynced(entry.id);
        await surveyDraftStore.markSynced(entry.surveyId);
        return;
      }

      // If the survey was created offline (or deferred — see beginSurvey.ts),
      // it doesn't exist on the backend yet. Create it now that we know
      // there's real content, to obtain a real surveyId — needed unconditionally
      // from here on, including by MediaUploadService for any pending attachment.
      let realSurveyId = entry.surveyId;
      if (isLocalId(entry.surveyId)) {
        realSurveyId =
          (await surveyDraftStore.getBackendSurveyId(entry.surveyId)) ??
          (await this.materializeSurvey(entry));
        // Persisted so a failed media attachment can still be retried after
        // this survey syncs and its local `id` (still the local one) is all
        // that's left to look it up by — see surveyDraftStore.getBackendSurveyId.
        await surveyDraftStore.setBackendSurveyId(entry.surveyId, realSurveyId);
      }

      const payload = await this.buildPayload(entry, realSurveyId);

      if (!payload || payload.length === 0) {
        // Every answer is media still pending upload/confirmation (or
        // otherwise unresolved) — the survey is already materialized (it has
        // real content) but there's nothing to submit yet. The manual retry
        // flow (MediaUploadService.retryEntry) links the response once the
        // upload confirms; see its docs for why that's safe here. Logged
        // explicitly so this doesn't read as a silent "synced with nothing
        // sent" (see the `!hasAnswers` branch above for the case this isn't).
        logger.warn(
          `[Sync] entry ${entry.id} materialized survey ${realSurveyId} but has nothing to submit yet ` +
            '(pending media attachment, most likely) — closing the queue entry locally',
        );
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

  // Handles entries with itemType 'farm-plot'; entry.surveyId holds the local farmPlotId (per D5).
  private async processFarmPlotEntry(entry: SyncQueueEntry): Promise<void> {
    await syncQueueStorage.markInFlight(entry.id);

    try {
      const draft = await farmPlotStore.loadDraft(entry.surveyId);

      if (!draft) {
        await syncQueueStorage.markSynced(entry.id);
        return;
      }

      // Guarda de idempotencia: si el lote ya se marcó `synced` (ej. un
      // intento anterior creó el lote en el backend pero la entrada de la
      // cola no llegó a marcarse sincronizada antes de un cierre de la app,
      // y quedó para reintentar), no volver a crearlo — createFarmPlot() no
      // es idempotente y duplicaría el lote en el backend.
      if (draft.status === 'synced') {
        await syncQueueStorage.markSynced(entry.id);
        logger.info(`[Sync] farm-plot entry ${entry.id} already synced locally, skipping re-create`);
        return;
      }

      const { farmPlotId } = await createFarmPlot({
        farmId: draft.farmId,
        name: draft.name,
        description: draft.description,
        area: draft.area,
        capturedOffline: draft.capturedOffline,
        polygon: draft.polygon,
      });

      await farmPlotStore.markSynced(draft.id);
      await syncQueueStorage.markSynced(entry.id);

      logger.info(`[Sync] processed farm-plot entry ${entry.id} for plot ${farmPlotId}`);
      this.consecutiveNetworkFailures = 0;
    } catch (error) {
      if (error instanceof NetworkError) {
        logger.error('[Sync] network error (farm-plot)', error);
        await this.handleNetworkError(entry);
      } else {
        logger.error('[Sync] validation error (farm-plot)', error);
        captureError(error, { farmPlotId: entry.surveyId, entryId: entry.id });
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

    // `farmerId` viaja desde el borrador: al unificar la creación en este
    // único camino (Fase 2) se perdió el vínculo que el camino online de
    // `start.tsx` sí enviaba, y toda encuesta nueva quedaba con
    // `survey.farmer = NULL`. Las consultas caían a `campaignSession.farmer`,
    // así que no se notaba, pero el dato se perdía igual.
    //
    // Spec 70, Fase 9 — `clientSurveyId: entry.surveyId` es el id local
    // (`local_survey_<uuid>`) que sobrevive al reintento. Si este POST llega
    // al backend y crea la fila, pero la respuesta se pierde (reconexión
    // inestable — el escenario real de `TC-070-04`), el siguiente intento
    // reenvía el mismo id local y el backend devuelve la encuesta ya creada
    // en vez de duplicarla. Sin esto, cada reintento generaba una fila nueva.
    const { surveyId: realSurveyId } = await createSurvey({
      instrumentIds: [draft.instrumentId],
      campaignSessionId: entry.campaignSessionId,
      clientSurveyId: entry.surveyId,
      ...(draft.farmerId != null ? { farmerId: draft.farmerId } : {}),
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
      let farmer: Awaited<ReturnType<typeof extractFarmer>>['farmer'];
      try {
        ({ farmer } = await extractFarmer(realSurveyId));
      } catch (err) {
        if (!(err instanceof DocumentIdCollisionError)) throw err;

        // Spec 68, Fase 5 — colisión de documentId descubierta solo al
        // sincronizar: el encuestador ya no está frente al agricultor, no
        // hay a quién preguntarle (ver § "Resolución diferida" del spec).
        // El default es siempre "registrar aparte" — nunca fusionar en
        // silencio — porque es la única opción reversible sin backend: un
        // administrador puede revisar y corregir después vía
        // GET /api/farmers/document-collisions. No bloquear ni marcar la
        // entrada de la cola como fallida por esto.
        logger.warn(
          `[Sync] documentId collision for survey ${realSurveyId} (document ${err.documentId}: ` +
            `submitted "${err.submittedName}" vs existing "${err.existingFarmerName}") — ` +
            'resolving as separate_person, pending admin review',
        );
        ({ farmer } = await extractFarmer(realSurveyId, { resolution: 'separate_person' }));
      }

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

        try {
          await farmerCacheStorage.remove(localFarmerId);
        } catch (err) {
          logger.warn(
            `[Sync] failed to remove provisional farmer cache entry ${localFarmerId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      await cacheFarmerIdentity({
        farmerId: farmer.farmerId,
        name: farmer.name,
        documentId: farmer.documentId ?? undefined,
        phone: farmer.phone ?? undefined,
        farmName: farmer.farm?.name ?? undefined,
        crops: farmer.farm?.crops ?? undefined,
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
