CREATE TABLE `brain_models` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `brain_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`cluster_key` text NOT NULL,
	`source_id` text NOT NULL,
	`first_seen` text NOT NULL,
	`published_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brain_observations_cluster` ON `brain_observations` (`cluster_key`);--> statement-breakpoint
CREATE INDEX `brain_observations_seen` ON `brain_observations` (`first_seen`);--> statement-breakpoint
CREATE INDEX `brain_observations_source` ON `brain_observations` (`source_id`,`first_seen`);--> statement-breakpoint
CREATE TABLE `brain_runs` (
	`at` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`complete` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `brain_runs_fingerprint` ON `brain_runs` (`fingerprint`,`at`);--> statement-breakpoint
CREATE TABLE `forecast_events` (
	`id` text PRIMARY KEY NOT NULL,
	`issued_at` text NOT NULL,
	`deadline` text NOT NULL,
	`kind` text NOT NULL,
	`probability` real NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forecast_events_deadline` ON `forecast_events` (`deadline`);--> statement-breakpoint
CREATE INDEX `forecast_events_issued` ON `forecast_events` (`issued_at`);--> statement-breakpoint
CREATE TABLE `forecast_resolutions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`outcome` text NOT NULL,
	`verified_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forecast_resolutions_event` ON `forecast_resolutions` (`event_id`,`verified_at`);--> statement-breakpoint
CREATE TABLE `forecast_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`signature` text NOT NULL,
	`created_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forecast_revisions_evidence` ON `forecast_revisions` (`event_id`,`signature`);--> statement-breakpoint
CREATE INDEX `forecast_revisions_event` ON `forecast_revisions` (`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reader_profiles` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
