ALTER TABLE `sync_queue` ADD COLUMN `item_type` text NOT NULL DEFAULT 'survey';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `farm_plots` (`id` text PRIMARY KEY NOT NULL, `farm_id` text NOT NULL, `name` text NOT NULL, `description` text, `area` real, `polygon` text NOT NULL, `status` text NOT NULL DEFAULT 'draft', `captured_offline` integer NOT NULL DEFAULT 1, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
