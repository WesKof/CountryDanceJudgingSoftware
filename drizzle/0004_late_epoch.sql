CREATE TABLE `live_publication_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_live_outbox_event` ON `live_publication_outbox` (`event_id`);--> statement-breakpoint
CREATE TABLE `live_publication_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`competition_id` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_live_publication_event` ON `live_publication_snapshots` (`event_id`);