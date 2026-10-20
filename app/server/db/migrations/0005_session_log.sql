CREATE TABLE `session_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`actor_id` text,
	`detail` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `tutoring_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `tutoring_sessions` ADD `attendance` text;--> statement-breakpoint
ALTER TABLE `tutoring_sessions` ADD `actual_hours` real;--> statement-breakpoint
ALTER TABLE `tutoring_sessions` ADD `topics_covered` text;--> statement-breakpoint
ALTER TABLE `tutoring_sessions` ADD `session_notes` text;--> statement-breakpoint
ALTER TABLE `tutoring_sessions` ADD `completed_at` text;--> statement-breakpoint
-- Sessions completed before logging existed: assume the student attended for the booked time.
UPDATE `tutoring_sessions` SET `attendance` = 'present', `actual_hours` = `hours`, `topics_covered` = `topic`, `session_notes` = '', `completed_at` = `date` || 'T12:00:00.000Z' WHERE `status` = 'completed';
