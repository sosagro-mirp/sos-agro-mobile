import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const surveys = sqliteTable('surveys', {
  id: text('id').primaryKey(),
  campaignSessionId: text('campaign_session_id'),
  instrumentId: text('instrument_id').notNull(),
  farmerId: text('farmer_id'),
  // El paso de la campaña al que pertenece la encuesta. Tiene que vivir en el
  // borrador, no solo en la cola de sincronización: con la creación diferida
  // (spec 70, fase 2) un borrador retomado desde la pestaña Borradores ya no
  // conserva el contexto de campaña en memoria, y la encuesta se materializaba
  // con `stepOrder: null`. `getNextStep()` arma los pasos completados solo a
  // partir de `stepOrder`, así que la campaña volvía a ofrecer un paso ya
  // respondido. Hallado en la ronda de campo del 2026-08-18.
  stepOrder: integer('step_order'),
  status: text('status', { enum: ['draft', 'completed', 'synced'] })
    .notNull()
    .default('draft'),
  // `id` stays the local id forever (surveys always start offline with a
  // generated id — see lib/generateLocalId.ts). Once SyncQueueService
  // materializes the survey on the backend, the real id is persisted here
  // so media attachments can still be retried after the survey is synced
  // and out of the queue.
  backendSurveyId: text('backend_survey_id'),
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
  itemType: text('item_type', { enum: ['survey', 'farm-plot'] })
    .notNull()
    .default('survey'),
});

export const farmPlots = sqliteTable('farm_plots', {
  id: text('id').primaryKey(),
  farmId: text('farm_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  area: real('area'),
  polygon: text('polygon').notNull(), // JSON serializado: PolygonDto
  status: text('status', { enum: ['draft', 'synced'] }).notNull().default('draft'),
  capturedOffline: integer('captured_offline', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
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

export const pendingSessions = sqliteTable('pending_sessions', {
  localSessionId: text('local_session_id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  farmerId: text('farmer_id'),
  userId: text('user_id'),
  realSessionId: text('real_session_id'),
  status: text('status', { enum: ['pending', 'resolved', 'failed'] })
    .notNull()
    .default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
});

export const sessionCrops = sqliteTable('session_crops', {
  sessionId: text('session_id').notNull(),
  cropId: text('crop_id').notNull(),
  cropName: text('crop_name').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.sessionId, table.cropId] }),
}));

export const changeRequests = sqliteTable('change_requests', {
  id: text('id').primaryKey(),
  description: text('description').notNull(),
  farmerId: text('farmer_id'),
  status: text('status', { enum: ['pending_sync', 'open', 'resolved'] })
    .notNull()
    .default('pending_sync'),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }),
});

export const farmerCache = sqliteTable('farmer_cache', {
  farmerId: text('farmer_id').primaryKey(),
  name: text('name').notNull(),
  documentId: text('document_id'),
  phone: text('phone'),
  farmName: text('farm_name'),
  crops: text('crops'), // JSON array of CropSummary: { cropId, name }[]
  cachedAt: integer('cached_at', { mode: 'timestamp' }).notNull(),
});
