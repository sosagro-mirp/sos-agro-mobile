import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const surveys = sqliteTable('surveys', {
  id: text('id').primaryKey(),
  campaignSessionId: text('campaign_session_id'),
  instrumentId: text('instrument_id').notNull(),
  status: text('status', { enum: ['draft', 'completed', 'synced'] })
    .notNull()
    .default('draft'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const responses = sqliteTable('responses', {
  id: text('id').primaryKey(),
  surveyId: text('survey_id')
    .notNull()
    .references(() => surveys.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull(),
  optionId: text('option_id'),
  optionIds: text('option_ids'), // JSON array for multiple_choice: string[]
  textValue: text('text_value'),
  numericValue: real('numeric_value'),
  booleanValue: integer('boolean_value', { mode: 'boolean' }),
  otherText: text('other_text'),
  mediaLocalPath: text('media_local_path'), // path local del archivo capturado offline
  mimeType: text('mime_type'),
});

export const mediaUploadQueue = sqliteTable('media_upload_queue', {
  id: text('id').primaryKey(),
  surveyId: text('survey_id').notNull(),
  questionId: text('question_id').notNull(),
  attachmentId: text('attachment_id'), // UUID retornado por el backend al crear el placeholder
  localPath: text('local_path').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  originalFilename: text('original_filename'),
  status: text('status', { enum: ['pending', 'in_flight', 'uploaded', 'failed'] })
    .notNull()
    .default('pending'),
  attempts: integer('attempts').notNull().default(0),
  errorDetail: text('error_detail'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  surveyId: text('survey_id').notNull(),
  campaignSessionId: text('campaign_session_id'),
  stepOrder: integer('step_order'),
  attempts: integer('attempts').notNull().default(0),
  status: text('status', { enum: ['pending', 'in_flight', 'failed_validation'] })
    .notNull()
    .default('pending'),
  lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
  payloadPath: text('payload_path'),
  errorDetail: text('error_detail'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const instrumentCache = sqliteTable('instrument_cache', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
  cachedAt: integer('cached_at', { mode: 'timestamp' }).notNull(),
});

export const campaignCache = sqliteTable('campaign_cache', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
  cachedAt: integer('cached_at', { mode: 'timestamp' }).notNull(),
});
