-- Spec 78 — Consentimiento informado y autorización de tratamiento de datos.
ALTER TABLE `farmer_cache` ADD COLUMN `consent_version` text;
--> statement-breakpoint
ALTER TABLE `farmer_cache` ADD COLUMN `consented_at` integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `consent_document_cache` (`id` text PRIMARY KEY NOT NULL, `data` text NOT NULL, `cached_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `consent_records` (`id` text PRIMARY KEY NOT NULL, `session_id` text NOT NULL, `consent_document_id` text NOT NULL, `respondent_name` text, `accepted_data_processing` integer NOT NULL, `accepted_photo` integer NOT NULL DEFAULT 0, `accepted_audio` integer NOT NULL DEFAULT 0, `accepted_video` integer NOT NULL DEFAULT 0, `accepted_follow_up_contact` integer NOT NULL DEFAULT 0, `accepted_at` integer NOT NULL, `status` text NOT NULL DEFAULT 'pending', `created_at` integer NOT NULL);
