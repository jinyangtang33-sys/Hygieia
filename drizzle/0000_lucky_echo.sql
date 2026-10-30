CREATE TABLE `health_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token_hash` text,
	`created_at` text NOT NULL,
	`last_sync` text,
	`last_error` text,
	`last_records` integer DEFAULT 0 NOT NULL,
	`last_metrics` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_connection_token` ON `health_connections` (`token_hash`);--> statement-breakpoint
CREATE TABLE `health_daily` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`metric` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `date`, `metric`)
);
