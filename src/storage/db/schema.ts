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
  // Spec 70, Fase 10 — 'skip-step' se agrega a 'survey' | 'farm-plot' para
  // que un salto de paso hecho sin conexión viaje por la misma cola (con sus
  // reintentos y backoff) en vez de una cola paralela.
  itemType: text('item_type', { enum: ['survey', 'farm-plot', 'skip-step', 'consent'] })
    .notNull()
    .default('survey'),
  // Spec 70, Fase 10 — solo lo usan las entradas 'skip-step': el instrumento
  // del paso que se saltó, que POST /api/surveys/skip-step exige y que
  // ninguna otra columna de esta tabla guardaba hasta ahora.
  instrumentId: text('instrument_id'),
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
  // Spec 78 — última versión de consentimiento aceptada por este agricultor,
  // conocida por este dispositivo. hasValidConsent() la compara contra la
  // versión activa cacheada (consent_document_cache) para decidir offline si
  // hay que volver a pedirlo.
  consentVersion: text('consent_version'),
  consentedAt: integer('consented_at', { mode: 'timestamp' }),
});

// Spec 78 — documento de consentimiento activo, descargado junto con la
// campaña (Fase 3 de refresh(), junto a S1/S2) para poder mostrarlo sin red.
export const consentDocumentCache = sqliteTable('consent_document_cache', {
  // Fila única: siempre 'active'. Igual patrón que instrumentCache/campaignCache
  // pero de un solo registro, así que no necesita id real.
  id: text('id').primaryKey(),
  data: text('data').notNull(),
  cachedAt: integer('cached_at', { mode: 'timestamp' }).notNull(),
});

// Spec 78 — constancia de consentimiento capturada en el dispositivo,
// pendiente de sincronizar. `sessionId` puede ser un id provisional
// (`local_session_…`) mientras la sesión no se resuelve: sync_queue.
// campaign_session_id ya remapea ese id en resolveLocalSessions(), y esta
// tabla se remapea junto con él (ver SyncQueueService).
export const consentRecords = sqliteTable('consent_records', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  consentDocumentId: text('consent_document_id').notNull(),
  respondentName: text('respondent_name'),
  acceptedDataProcessing: integer('accepted_data_processing', { mode: 'boolean' }).notNull(),
  acceptedPhoto: integer('accepted_photo', { mode: 'boolean' }).notNull().default(false),
  acceptedAudio: integer('accepted_audio', { mode: 'boolean' }).notNull().default(false),
  acceptedVideo: integer('accepted_video', { mode: 'boolean' }).notNull().default(false),
  acceptedFollowUpContact: integer('accepted_follow_up_contact', { mode: 'boolean' })
    .notNull()
    .default(false),
  // Momento real de aceptación en el dispositivo — se conserva tal cual
  // aunque la sincronización ocurra mucho después (criterio 8 del spec).
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }).notNull(),
  status: text('status', { enum: ['pending', 'synced', 'failed'] })
    .notNull()
    .default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
