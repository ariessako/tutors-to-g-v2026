CREATE TABLE `warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`issued_by` text,
	`reason` text NOT NULL,
	`at` text NOT NULL,
	`removed_at` text,
	`removed_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`removed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
