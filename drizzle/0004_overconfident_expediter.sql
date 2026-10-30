CREATE TABLE `backup_jobs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`last_attempt` text,
	`last_success` text,
	`last_error` text,
	`last_status` text DEFAULT 'waiting' NOT NULL,
	`last_run_day` text,
	`last_backup_id` text,
	`run_id` text
);
