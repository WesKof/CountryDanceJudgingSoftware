CREATE TABLE `live_heat_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_key` text NOT NULL,
	`heat_id` text NOT NULL,
	`judge_id` text NOT NULL,
	`version` integer NOT NULL,
	`ballot_version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`supersedes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_key`) REFERENCES `live_round_versions`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_heat_submission_version` ON `live_heat_submissions` (`round_key`,`heat_id`,`judge_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_live_heat_submissions_event` ON `live_heat_submissions` (`event_id`);--> statement-breakpoint
CREATE TABLE `live_review_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`request_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_request_version` ON `live_review_requests` (`request_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_live_review_requests_event` ON `live_review_requests` (`event_id`);--> statement-breakpoint
CREATE TABLE `live_stage_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`tie_key` text NOT NULL,
	`judge_id` text NOT NULL,
	`selected` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_stage_vote_scope` ON `live_stage_votes` (`round_key`,`fingerprint`,`tie_key`,`judge_id`);--> statement-breakpoint
CREATE INDEX `idx_live_stage_votes_event` ON `live_stage_votes` (`event_id`);--> statement-breakpoint
DROP INDEX `idx_live_approval_round`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_approval_version` ON `live_approvals` (`round_key`,`fingerprint`);