ALTER TABLE `users` ADD `license_type` text;--> statement-breakpoint
ALTER TABLE `users` ADD `eligibility` text;--> statement-breakpoint
-- Every tutor so far applied with a PRC license.
UPDATE `users` SET `license_type` = 'licensed' WHERE `role` = 'teacher';
