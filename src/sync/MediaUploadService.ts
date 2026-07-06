import * as FileSystem from 'expo-file-system/legacy';
import { mediaUploadQueueStorage } from '../storage/mediaUploadQueueStorage';
import { httpClient, NetworkError } from '../api/httpClient';
import { endpoints } from '../api/endpoints';
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

class MediaUploadServiceClass {
  // Uploads all pending media for a survey and returns a map of questionId → attachmentId.
  async processPendingForSurvey(surveyId: string): Promise<Record<string, string>> {
    const { setUploadingMediaId, refreshPendingMediaCount } = useSyncStatusStore.getState();

    // Populate queue from responses table for entries not yet tracked
    const unenqueued = await mediaUploadQueueStorage.findUnenqueued(surveyId);
    for (const item of unenqueued) {
      const info = await FileSystem.getInfoAsync(item.localPath);
      await mediaUploadQueueStorage.enqueueIfAbsent({
        id: generateId(),
        surveyId,
        questionId: item.questionId,
        localPath: item.localPath,
        mimeType: item.mimeType,
        fileSizeBytes: info.exists ? (info.size ?? undefined) : undefined,
        originalFilename: item.localPath.split('/').pop(),
      });
    }

    // Process pending entries
    let entry = await mediaUploadQueueStorage.dequeueNextPending(surveyId);

    while (entry) {
      setUploadingMediaId(entry.id);
      await refreshPendingMediaCount();

      try {
        await this.uploadEntry(entry, surveyId);
      } catch (error) {
        if (error instanceof NetworkError) {
          // Propagate so SyncQueueService can retry the whole survey entry
          setUploadingMediaId(null);
          throw error;
        }
        // Validation / file error — mark failed and continue with remaining files
        logger.error(`[MediaUpload] non-network error for ${entry.id}`, error);
        captureError(error, { entryId: entry.id, surveyId });
        const detail = error instanceof Error ? error.message : String(error);
        await mediaUploadQueueStorage.markFailed(entry.id, detail);
      }

      entry = await mediaUploadQueueStorage.dequeueNextPending(surveyId);
    }

    setUploadingMediaId(null);
    await refreshPendingMediaCount();

    // Build and return questionId → attachmentId map for all confirmed uploads
    const uploaded = await mediaUploadQueueStorage.getUploadedForSurvey(surveyId);
    const map: Record<string, string> = {};
    for (const u of uploaded) {
      if (u.attachmentId) map[u.questionId] = u.attachmentId;
    }
    return map;
  }

  private async uploadEntry(
    entry: { id: string; surveyId: string; questionId: string; localPath: string; mimeType: string; fileSizeBytes: number | null },
    surveyId: string,
  ): Promise<void> {
    await mediaUploadQueueStorage.markInFlight(entry.id);

    // Verify the file still exists
    const info = await FileSystem.getInfoAsync(entry.localPath);
    if (!info.exists) {
      throw new Error(`Archivo no encontrado: ${entry.localPath}`);
    }

    const fileSizeBytes = info.size ?? entry.fileSizeBytes ?? 0;

    // Request presigned URL from backend
    const { attachmentId, presignedUrl } = await httpClient.post<PresignedUrlResponse>(
      endpoints.mediaAttachmentsPresignedUrl,
      {
        surveyId,
        questionId: entry.questionId,
        mimeType: entry.mimeType,
        fileSizeBytes,
        originalFilename: entry.localPath.split('/').pop() ?? 'file',
      },
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
    );

    await mediaUploadQueueStorage.markUploaded(entry.id, attachmentId);
    logger.info(`[MediaUpload] uploaded ${entry.id} → attachmentId ${attachmentId}`);
  }
}

export const MediaUploadService = new MediaUploadServiceClass();
