ALTER TABLE `responses` ADD COLUMN `media_local_path` text;
--> statement-breakpoint
ALTER TABLE `responses` ADD COLUMN `mime_type` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media_upload_queue` (
  `id` text PRIMARY KEY NOT NULL,
  `survey_id` text NOT NULL,
  `question_id` text NOT NULL,
  `attachment_id` text,
  `local_path` text NOT NULL,
  `mime_type` text NOT NULL,
  `file_size_bytes` integer,
  `original_filename` text,
  `status` text NOT NULL DEFAULT 'pending',
  `attempts` integer NOT NULL DEFAULT 0,
  `error_detail` text,
  `created_at` integer NOT NULL
);
