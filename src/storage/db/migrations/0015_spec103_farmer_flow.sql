-- Spec 103 — anclas de encuesta, foto de cobertura y consentimiento sin sesión.
ALTER TABLE `surveys` ADD COLUMN `farm_id` text;
--> statement-breakpoint
ALTER TABLE `surveys` ADD COLUMN `farm_crop_id` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coverage_snapshot` (`id` text PRIMARY KEY NOT NULL, `computed_at` text NOT NULL, `downloaded_at` integer NOT NULL, `columns` text NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `farmer_coverage_cache` (`farmer_id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `document_id` text, `department_id` text, `town_id` text, `crop_ids` text NOT NULL, `farms_count` integer NOT NULL DEFAULT 0, `has_pending_consent` integer NOT NULL DEFAULT 0, `summary` text NOT NULL, `detail` text NOT NULL, `computed_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `farmer_coverage_cache_name_idx` ON `farmer_coverage_cache` (`name`);
--> statement-breakpoint
CREATE TABLE `consent_records_new` (`id` text PRIMARY KEY NOT NULL, `session_id` text, `farmer_id` text, `survey_id` text, `consent_document_id` text NOT NULL, `respondent_name` text, `accepted_data_processing` integer NOT NULL, `accepted_photo` integer NOT NULL DEFAULT 0, `accepted_audio` integer NOT NULL DEFAULT 0, `accepted_video` integer NOT NULL DEFAULT 0, `accepted_follow_up_contact` integer NOT NULL DEFAULT 0, `accepted_at` integer NOT NULL, `status` text NOT NULL DEFAULT 'pending', `created_at` integer NOT NULL);
--> statement-breakpoint
INSERT INTO `consent_records_new` (`id`, `session_id`, `consent_document_id`, `respondent_name`, `accepted_data_processing`, `accepted_photo`, `accepted_audio`, `accepted_video`, `accepted_follow_up_contact`, `accepted_at`, `status`, `created_at`) SELECT `id`, `session_id`, `consent_document_id`, `respondent_name`, `accepted_data_processing`, `accepted_photo`, `accepted_audio`, `accepted_video`, `accepted_follow_up_contact`, `accepted_at`, `status`, `created_at` FROM `consent_records`;
--> statement-breakpoint
DROP TABLE `consent_records`;
--> statement-breakpoint
ALTER TABLE `consent_records_new` RENAME TO `consent_records`;
