CREATE TABLE `parent_links` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text NOT NULL,
	`declined_by` text,
	`requested_at` text NOT NULL,
	`student_at` text,
	`admin_at` text,
	FOREIGN KEY (`parent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Existing one-child links were made without verification; keep them as approved.
INSERT INTO `parent_links` (`id`, `parent_id`, `student_id`, `status`, `requested_at`)
SELECT 'pl_' || `id`, `id`, `child_id`, 'approved', `joined` FROM `users`
WHERE `role` = 'parent' AND `child_id` IN (SELECT `id` FROM `users` WHERE `role` = 'student');--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `parent_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `child_id`;