CREATE TABLE `data_actions` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`op_hash` text NOT NULL,
	`backup_id` text NOT NULL,
	`created_at` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `data_backups` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
ALTER TABLE `health_connections` ADD `health_revision` integer DEFAULT 0 NOT NULL;