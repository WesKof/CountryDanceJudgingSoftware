CREATE TABLE `live_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`judge_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_approval_round` ON `live_approvals` (`round_key`);--> statement-breakpoint
CREATE TABLE `live_ballots` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_key` text NOT NULL,
	`judge_id` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`cells` text DEFAULT '{}' NOT NULL,
	`locked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_key`) REFERENCES `live_round_versions`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_ballots_round_judge` ON `live_ballots` (`round_key`,`judge_id`);--> statement-breakpoint
CREATE INDEX `idx_live_ballots_event` ON `live_ballots` (`event_id`);--> statement-breakpoint
CREATE TABLE `live_tie_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`tie_key` text NOT NULL,
	`decision` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_tie_scope` ON `live_tie_decisions` (`round_key`,`fingerprint`,`tie_key`);--> statement-breakpoint
CREATE TABLE `live_events` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`setup` text NOT NULL,
	`context` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`restored_history` text
);
--> statement-breakpoint
CREATE TABLE `live_mutation_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`passed` integer NOT NULL,
	CONSTRAINT "live_guard_passed" CHECK("live_mutation_guards"."passed" = 1)
);
--> statement-breakpoint
CREATE TABLE `live_links` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`code` text NOT NULL,
	`slug` text NOT NULL,
	`role` text NOT NULL,
	`judge_id` text,
	`revoked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_links_code_hash` ON `live_links` (`code_hash`);--> statement-breakpoint
CREATE INDEX `idx_live_links_event` ON `live_links` (`event_id`);--> statement-breakpoint
CREATE TABLE `live_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`response` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `live_round_versions` (
	`key` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_id` text NOT NULL,
	`generation` integer NOT NULL,
	`definition` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `live_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`generation` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`phase` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_live_rounds_event` ON `live_rounds` (`event_id`);--> statement-breakpoint
CREATE TABLE `live_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_key` text NOT NULL,
	`judge_id` text NOT NULL,
	`ballot_version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_key`) REFERENCES `live_round_versions`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_submissions_round_judge` ON `live_submissions` (`round_key`,`judge_id`);--> statement-breakpoint
CREATE INDEX `idx_live_submissions_event` ON `live_submissions` (`event_id`);