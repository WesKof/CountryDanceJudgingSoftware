CREATE INDEX `idx_live_approvals_event` ON `live_approvals` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_live_ties_event` ON `live_tie_decisions` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_live_round_versions_event` ON `live_round_versions` (`event_id`);