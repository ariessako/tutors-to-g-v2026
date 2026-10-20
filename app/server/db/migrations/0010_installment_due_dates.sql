ALTER TABLE `tutoring_sessions` ADD `plan_interval_days` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `installment_interval_days` integer DEFAULT 7 NOT NULL;