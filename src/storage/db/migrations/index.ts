// Generated migration config for drizzle-orm expo-sqlite migrator.
// Format: journal entries + migrations record (tag -> SQL with --> statement-breakpoint separators).
const migrations = {
  journal: {
    entries: [
      { idx: 0, when: 0, tag: 'm0000', breakpoints: true },
      { idx: 1, when: 1, tag: 'm0001', breakpoints: true },
      { idx: 2, when: 2, tag: 'm0002', breakpoints: true },
      { idx: 3, when: 3, tag: 'm0003', breakpoints: true },
      { idx: 4, when: 4, tag: 'm0004', breakpoints: true },
      { idx: 5, when: 5, tag: 'm0005', breakpoints: true },
      { idx: 6, when: 6, tag: 'm0006', breakpoints: true },
    ],
  },
  migrations: {
    m0006: [
      'ALTER TABLE `farmer_cache` DROP COLUMN `last_name`',
    ].join('\n'),


    m0004: [
      "CREATE TABLE IF NOT EXISTS `change_requests` (`id` text PRIMARY KEY NOT NULL, `description` text NOT NULL, `farmer_id` text, `status` text NOT NULL DEFAULT 'pending_sync', `resolved_at` integer, `created_at` integer NOT NULL, `synced_at` integer)",
    ].join('\n'),

    m0003: [
      "CREATE TABLE IF NOT EXISTS `session_crops` (`session_id` text NOT NULL, `crop_id` text NOT NULL, `crop_name` text NOT NULL, PRIMARY KEY(`session_id`, `crop_id`))",
    ].join('\n'),

    m0002: [
      "CREATE TABLE IF NOT EXISTS `pending_sessions` (`local_session_id` text PRIMARY KEY NOT NULL, `campaign_id` text NOT NULL, `farmer_id` text, `user_id` text, `real_session_id` text, `status` text NOT NULL DEFAULT 'pending', `created_at` integer NOT NULL, `resolved_at` integer)",
      '--> statement-breakpoint',
      "CREATE TABLE IF NOT EXISTS `farmer_cache` (`farmer_id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `last_name` text, `document_id` text, `phone` text, `farm_name` text, `cached_at` integer NOT NULL)",
    ].join('\n'),

    m0005: [
      'ALTER TABLE `responses` ADD COLUMN `media_local_path` text',
      '--> statement-breakpoint',
      'ALTER TABLE `responses` ADD COLUMN `mime_type` text',
      '--> statement-breakpoint',
      "CREATE TABLE IF NOT EXISTS `media_upload_queue` (`id` text PRIMARY KEY NOT NULL, `survey_id` text NOT NULL, `question_id` text NOT NULL, `attachment_id` text, `local_path` text NOT NULL, `mime_type` text NOT NULL, `file_size_bytes` integer, `original_filename` text, `status` text NOT NULL DEFAULT 'pending', `attempts` integer NOT NULL DEFAULT 0, `error_detail` text, `created_at` integer NOT NULL)",
    ].join('\n'),

    m0001: [
      "ALTER TABLE `surveys` ADD COLUMN `farmer_id` text",
    ].join('\n'),

    m0000: [
      "CREATE TABLE IF NOT EXISTS `surveys` (`id` text PRIMARY KEY NOT NULL, `campaign_session_id` text, `instrument_id` text NOT NULL, `status` text NOT NULL DEFAULT 'draft', `created_at` integer NOT NULL, `updated_at` integer NOT NULL)",
      '--> statement-breakpoint',
      "CREATE TABLE IF NOT EXISTS `responses` (`id` text PRIMARY KEY NOT NULL, `survey_id` text NOT NULL, `question_id` text NOT NULL, `option_id` text, `option_ids` text, `text_value` text, `numeric_value` real, `boolean_value` integer, `other_text` text, FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON DELETE CASCADE)",
      '--> statement-breakpoint',
      "CREATE TABLE IF NOT EXISTS `sync_queue` (`id` text PRIMARY KEY NOT NULL, `survey_id` text NOT NULL, `campaign_session_id` text, `step_order` integer, `attempts` integer NOT NULL DEFAULT 0, `status` text NOT NULL DEFAULT 'pending', `last_attempt_at` integer, `payload_path` text, `error_detail` text, `created_at` integer NOT NULL)",
      '--> statement-breakpoint',
      "CREATE TABLE IF NOT EXISTS `instrument_cache` (`id` text PRIMARY KEY NOT NULL, `data` text NOT NULL, `cached_at` integer NOT NULL)",
      '--> statement-breakpoint',
      "CREATE TABLE IF NOT EXISTS `campaign_cache` (`id` text PRIMARY KEY NOT NULL, `data` text NOT NULL, `cached_at` integer NOT NULL)",
    ].join('\n'),
  },
};

export default migrations;
