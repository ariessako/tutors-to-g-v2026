CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`part` integer NOT NULL,
	`amount` real NOT NULL,
	`reference` text,
	`receipt_file_id` text,
	`receipt_name` text NOT NULL,
	`status` text DEFAULT 'for_review' NOT NULL,
	`uploaded_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	FOREIGN KEY (`session_id`) REFERENCES `tutoring_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`receipt_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `tutoring_sessions` ADD `plan_parts` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tutoring_sessions` ADD `plan_min_first_pct` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `allow_installments` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `max_installments` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `min_first_percent` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
-- Move each session's single receipt into the payments table as part 1.
INSERT INTO `payments` (`id`, `session_id`, `part`, `amount`, `reference`, `receipt_file_id`, `receipt_name`, `status`, `uploaded_at`, `reviewed_at`)
SELECT 'pay_' || `id`, `id`, 1, COALESCE(`amount_paid`, `amount`), `payment_txn`, `receipt_file_id`, `receipt_name`,
  CASE `payment_status` WHEN 'paid' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'for_review' END,
  COALESCE(`receipt_at`, `created_at`), `reviewed_at`
FROM `tutoring_sessions` WHERE `receipt_name` IS NOT NULL AND `payment_status` != 'unpaid';
