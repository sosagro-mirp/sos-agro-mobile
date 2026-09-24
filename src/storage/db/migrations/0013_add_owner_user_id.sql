-- Spec 86 — dueño por registro (owner_user_id) para la sync por dueño en tablets compartidas.
ALTER TABLE `sync_queue` ADD COLUMN `owner_user_id` text;
--> statement-breakpoint
ALTER TABLE `surveys` ADD COLUMN `owner_user_id` text;
--> statement-breakpoint
ALTER TABLE `change_requests` ADD COLUMN `owner_user_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sync_queue_owner_status_idx` ON `sync_queue` (`owner_user_id`, `status`);
