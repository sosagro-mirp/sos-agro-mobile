import * as FileSystem from 'expo-file-system';
import { eq } from 'drizzle-orm';
import { db } from '../storage/db/db';
import { responses } from '../storage/db/schema';
import {
  mediaUploadQueueStorage,
  type MediaUploadQueueEntry,
} from '../storage/mediaUploadQueueStorage';
import { httpClient, NetworkError } from '../api/httpClient';
import { endpoints } from '../api/endpoints';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { logger } from '../lib/logger';
import { captureError } from '../lib/sentry';

const MEDIA_QUESTION_TYPES = new Set([
  'image',
  'voice_recording',
  'document',
  'video',
]);

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

class MediaUploadServiceClass {
  async processPendingForSurvey(surveyId: string): Promise<void> {
    await this.enqueueUnregisteredMedia(surveyId);

    const { setUploadingMediaId, refreshPendingMediaCount } =
      useSyncStatusStore.getState();

    let entry = await mediaUploadQueueStorage.dequeueNextPending(surveyId);

    while (entry) {
      setUploadingMediaId(entry.id);
      await this.uploadEntry(entry);
      await refreshPendingMediaCount();
      entry = await mediaUploadQueueStorage.dequeueNextPending(surveyId);
    }

    setUploadingMediaId(null);
  }

  // Scans the responses table for rows with mediaLocalPath that have not yet
  // been registered in media_upload_queue, and enqueues them.
  private async enqueueUnregisteredMedia(surveyId: string): Promise<void> {
    const rows = await db
      .select()
      .from(responses)
      .where(eq(responses.surveyId, surveyId))
      .all();

    for (const row of rows) {
      if (!row.mediaLocalPath || !row.mimeType) continue;
      if (!MEDIA_QUESTION_TYPES.has(row.questionId)) {
        // We identify media responses by presence of mediaLocalPath, not questionId
        // — include any row that has a local path.
      }

      const alreadyQueued = await mediaUploadQueueStorage.isQueued(
        surveyId,
        row.questionId,
      );
      if (alreadyQueued) continue;

      const info = await FileSystem.getInfoAsync(row.mediaLocalPath, { size: true });
      if (!info.exists) {
        logger.warn(
          `[MediaUpload] file not found for question ${row.questionId}: ${row.mediaLocalPath}`,
        );
        continue;
      }

      const filename = row.mediaLocalPath.split('/').pop() ?? 'file';

      await mediaUploadQueueStorage.enqueue({
        id: `${surveyId}:${row.questionId}`,
        surveyId,
        questionId: row.questionId,
        localPath: row.mediaLocalPath,
        mimeType: row.mimeType,
        fileSizeBytes: 'size' in info ? info.size : undefined,
        originalFilename: filename,
      });
    }
  }

  private async uploadEntry(entry: MediaUploadQueueEntry): Promise<void> {
    await mediaUploadQueueStorage.markInFlight(entry.id);

    try {
      // 1. Verify file still exists
      const info = await FileSystem.getInfoAsync(entry.localPath);
      if (!info.exists) {
        await mediaUploadQueueStorage.markFailed(
          entry.id,
          `Archivo no encontrado: ${entry.localPath}`,
        );
        return;
      }

      // 2. Request presigned URL from backend
      const { attachmentId, presignedUrl } =
        await httpClient.post<PresignedUrlResponse>(endpoints.mediaPresignedUrl, {
          surveyId: entry.surveyId,
          questionId: entry.questionId,
          mimeType: entry.mimeType,
          fileSizeBytes: entry.fileSizeBytes,
          originalFilename: entry.originalFilename,
        });

      // 3. Upload binary directly to R2 via presigned URL
      const uploadResult = await FileSystem.uploadAsync(
        presignedUrl,
        entry.localPath,
        {
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          httpMethod: 'PUT',
          headers: { 'Content-Type': entry.mimeType },
        },
      );

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        await mediaUploadQueueStorage.markFailed(
          entry.id,
          `R2 upload failed with status ${uploadResult.status}`,
        );
        return;
      }

      // 4. Confirm upload to backend
      await httpClient.patch<ConfirmUploadResponse>(
        endpoints.mediaConfirmUpload(attachmentId),
      );

      await mediaUploadQueueStorage.markUploaded(entry.id, attachmentId);
      logger.info(
        `[MediaUpload] uploaded ${entry.id} → attachmentId ${attachmentId}`,
      );
    } catch (error) {
      if (error instanceof NetworkError) {
        // Reset to pending so the next sync attempt retries this entry.
        await mediaUploadQueueStorage.incrementAttempts(entry.id);
        throw error;
      }

      // Validation / unknown error — mark failed, do not block other entries.
      const detail = error instanceof Error ? error.message : String(error);
      logger.error(`[MediaUpload] failed entry ${entry.id}`, error);
      captureError(error, { entryId: entry.id, surveyId: entry.surveyId });
      await mediaUploadQueueStorage.markFailed(entry.id, detail);
    }
  }
}

export const MediaUploadService = new MediaUploadServiceClass();
