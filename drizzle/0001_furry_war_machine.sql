CREATE TABLE `personal_mutations` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`mutation_id` text NOT NULL,
	`op_hash` text NOT NULL,
	`record_key` text NOT NULL,
	`result` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_mutation_identity` ON `personal_mutations` (`user_id`,`mutation_id`);--> statement-breakpoint
CREATE TABLE `personal_records` (
	`user_id` text NOT NULL,
	`record_key` text NOT NULL,
	`value` text,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `record_key`)
);
