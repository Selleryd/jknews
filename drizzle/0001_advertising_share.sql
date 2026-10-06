CREATE TABLE `ad_allocations` (
	`revision` text PRIMARY KEY NOT NULL,
	`next_ticket` integer DEFAULT 0 NOT NULL,
	`allocation` text NOT NULL,
	`created_at` text NOT NULL
);
