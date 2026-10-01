import * as FileSystem from 'expo-file-system/legacy';
import { mediaUploadQueueStorage } from '../storage/mediaUploadQueueStorage';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { secureStorage } from '../storage/secureStorage';
import { httpClient, NetworkError, type RequestOptions } from '../api/httpClient';
import { resolveSyncErrorAction } from '../lib/syncErrorAction';
import { endpoints } from '../api/endpoints';
import { createResponse } from '../api/responses';
import { logger } from '../lib/logger';
import { captureError } from '../lib/sentry';
import { useSyncStatusStore } from '../store/useSyncStatusStore';

interface PresignedUrlResponse {
  attachmentId: string;
  presignedUrl: string;
  storageKey: string;
  expiresAt: string;
}

interface ConfirmUploadResponse {
  attachmentId: string;
  publicUrl: string;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// Caps a single attachment upload so a huge file can't stall the sync queue
// (or a presigned-URL request) indefinitely over a poor field connection.
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

class MediaUploadServiceClass {
  // Uploads all pending media for a survey and returns a map of questionId → attachmentId.
  //
  // `localSurveyId` and `realSurveyId` are deliberately separate: every
  // local table (media_upload_queue, responses) is keyed by the id the
  // survey was created with offline, which never changes (see schema.ts).
  // The backend, however, only knows the id it assigned when
  // SyncQueueService materialized the survey — that's the id the
  // presigned-url/confirm endpoints require. Passing the local id there
  // 404s ("Survey not found") for every attachment.
  async processPendingForSurvey(
    localSurveyId: string,
    realSurveyId: string,
    // Spec 86 (D6) — token del dueño de la encuesta (tablet compartida).
    opts?: RequestOptions,
  ): Promise<Record<string, string>> {
    const { setUploadingMediaId, refreshPendingMediaCount } = useSyncStatusStore.getState();

    // Populate queue from responses table for entries not yet tracked
    const unenqueued = await mediaUploadQueueStorage.findUnenqueued(localSurveyId);
    for (const item of unenqueued) {
      const info = await FileSystem.getInfoAsync(item.localPath);
      await mediaUploadQueueStorage.enqueueIfAbsent({
        id: generateId(),
        surveyId: localSurveyId,
        questionId: item.questionId,
        localPath: item.localPath,
        mimeType: item.mimeType,
        fileSizeBytes: info.exists ? (info.size ?? undefined) : undefined,
        originalFilename: item.localPath.split('/').pop(),
      });
    }

    // Process pending entries
    let entry = await mediaUploadQueueStorage.dequeueNextPending(localSurveyId);

    while (entry) {
      setUploadingMediaId(entry.id);
      await refreshPendingMediaCount();

      try {
        await this.uploadEntry(entry, realSurveyId, opts);
      } catch (error) {
        if (error instanceof NetworkError) {
          // Propagate so SyncQueueService can retry the whole survey entry
          setUploadingMediaId(null);
          throw error;
        }
        // Spec 86 (CA-7): un 401 (sesión por renovar) o un 429 no es un fallo
        // del adjunto: vuelve a pendiente y se propaga para que la cola de
        // sincronización deje la encuesta pendiente, sin marcar nada `failed`.
        const action = resolveSyncErrorAction(error);
        if (action === 'retry_auth' || action === 'retry_transient') {
          await mediaUploadQueueStorage.resetInFlightToRetry();
          setUploadingMediaId(null);
          throw error;
        }
        // Validation / file error — mark failed and continue with remaining files
        logger.error(`[MediaUpload] non-network error for ${entry.id}`, error);
        captureError(error, { entryId: entry.id, surveyId: localSurveyId });
        const detail = error instanceof Error ? error.message : String(error);
        await mediaUploadQueueStorage.markFailed(entry.id, detail);
      }

      entry = await mediaUploadQueueStorage.dequeueNextPending(localSurveyId);
    }

    setUploadingMediaId(null);
    await refreshPendingMediaCount();

    // Build and return questionId → attachmentId map for all confirmed uploads
    const uploaded = await mediaUploadQueueStorage.getUploadedForSurvey(localSurveyId);
    const map: Record<string, string> = {};
    for (const u of uploaded) {
      if (u.attachmentId) map[u.questionId] = u.attachmentId;
    }
    return map;
  }

  private async uploadEntry(
    entry: { id: string; surveyId: string; questionId: string; localPath: string; mimeType: string; fileSizeBytes: number | null },
    realSurveyId: string,
    opts?: RequestOptions,
  ): Promise<void> {
    await mediaUploadQueueStorage.markInFlight(entry.id);

    // Verify the file still exists
    const info = await FileSystem.getInfoAsync(entry.localPath);
    if (!info.exists) {
      throw new Error(`Archivo no encontrado: ${entry.localPath}`);
    }

    const fileSizeBytes = info.size ?? entry.fileSizeBytes ?? 0;

    if (fileSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
      // Validation error, not NetworkError: retrying won't shrink the file.
      // Surfaces in the sync UI as a failed attachment instead of silently
      // hanging or blocking the rest of the queue.
      throw new Error(
        `Archivo demasiado grande (${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB, máx 50 MB)`,
      );
    }

    // Request presigned URL from backend
    const { attachmentId, presignedUrl } = await httpClient.post<PresignedUrlResponse>(
      endpoints.mediaAttachmentsPresignedUrl,
      {
        surveyId: realSurveyId,
        questionId: entry.questionId,
        mimeType: entry.mimeType,
        fileSizeBytes,
        originalFilename: entry.localPath.split('/').pop() ?? 'file',
      },
      ...(opts ? [opts] : []),
    );

    // Upload directly to R2 via presigned URL
    const uploadResult = await FileSystem.uploadAsync(presignedUrl, entry.localPath, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': entry.mimeType },
    });

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(`Upload a R2 falló con status ${uploadResult.status}`);
    }

    // Confirm upload with backend
    await httpClient.patch<ConfirmUploadResponse>(
      endpoints.mediaAttachmentsConfirm(attachmentId),
      ...(opts ? [undefined, opts] as const : []),
    );

    await mediaUploadQueueStorage.markUploaded(entry.id, attachmentId);
    logger.info(`[MediaUpload] uploaded ${entry.id} → attachmentId ${attachmentId}`);
  }

  // Manual retry for a `failed` attachment surfaced in the sync UI.
  //
  // The survey it belongs to is almost always already `synced` by this
  // point — buildResponsesPayload skips a media response entirely until its
  // attachmentId resolves, so the *response* that links this question to an
  // attachment was never submitted in the original batch. Re-uploading the
  // file alone (what this method used to do) leaves the new attachment
  // orphaned on the backend: nothing ever creates that link. So after a
  // successful re-upload, POST it as a single response.
  //
  // This must use POST /api/responses (createResponse), not
  // /responses/batch: ResponsesService.createMany is idempotent per survey
  // — it no-ops (returns existing rows, inserts nothing) once the survey
  // already has *any* response, which retryEntry's target survey always
  // does by definition. The single-response endpoint has no such guard.
  async retryEntry(entryId: string, questionId: string, localSurveyId: string): Promise<void> {
    const realSurveyId = await surveyDraftStore.getBackendSurveyId(localSurveyId);
    if (!realSurveyId) {
      throw new Error(
        'No se encontró el ID de esta encuesta en el servidor; ya no se puede reintentar el adjunto (puede haberse purgado el borrador local).',
      );
    }

    // M4 (auditoría 44): el reintento manual también sale con el token del
    // DUEÑO de la encuesta, no con el del encuestador que esté al frente.
    const owner = await surveyDraftStore.getOwnerUserId(localSurveyId);
    const ownerToken = owner ? await secureStorage.getTokenFor(owner) : null;
    const opts: RequestOptions | undefined = ownerToken ? { authToken: ownerToken } : undefined;

    await mediaUploadQueueStorage.resetToRetry(entryId);
    const attachmentIds = await this.processPendingForSurvey(localSurveyId, realSurveyId, opts);

    const attachmentId = attachmentIds[questionId];
    if (!attachmentId) {
      // Upload failed again — mediaUploadQueueStorage already marked it
      // `failed` with the new error detail; nothing to link.
      return;
    }

    // Known gap: if the upload succeeds but this call fails (e.g. a network
    // drop right here), the queue entry is already `uploaded` and drops out
    // of the "failed" list the sync UI surfaces, so there's no retry
    // affordance left for the still-unlinked attachment. Narrow window;
    // recoverable today only via `GET /surveys/:id/media-attachments`.
    await createResponse(
      { surveyId: realSurveyId, questionId, attachmentId },
      ...(opts ? [opts] : []),
    );
  }
}

export const MediaUploadService = new MediaUploadServiceClass();
