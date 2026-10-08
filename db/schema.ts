import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable('live_events', {
  id: text('id').primaryKey(), version: integer('version').notNull().default(1),
  setup: text('setup').notNull(), context: text('context').notNull(),
  status: text('status').notNull().default('active'), createdAt: text('created_at').notNull(),
  restoredHistory: text('restored_history'),
});
export const links = sqliteTable('live_links', {
  id: text('id').primaryKey(), eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(), code: text('code').notNull(), slug: text('slug').notNull(),
  role: text('role').notNull(), judgeId: text('judge_id'), revoked: integer('revoked').notNull().default(0),
}, (t) => [uniqueIndex('idx_live_links_code_hash').on(t.codeHash), index('idx_live_links_event').on(t.eventId)]);
export const rounds = sqliteTable('live_rounds', {
  id: text('id').primaryKey(), eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  generation: integer('generation').notNull(), version: integer('version').notNull().default(1),
  phase: text('phase').notNull(),
}, (t) => [index('idx_live_rounds_event').on(t.eventId)]);
export const roundVersions = sqliteTable('live_round_versions', {
  key: text('key').primaryKey(), eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  roundId: text('round_id').notNull(), generation: integer('generation').notNull(), definition: text('definition').notNull(),
  reason: text('reason').notNull(), createdAt: text('created_at').notNull(),
}, (t) => [index('idx_live_round_versions_event').on(t.eventId)]);
export const ballots = sqliteTable('live_ballots', {
  id: text('id').primaryKey(), eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  roundKey: text('round_key').notNull().references(() => roundVersions.key), judgeId: text('judge_id').notNull(),
  version: integer('version').notNull().default(0), cells: text('cells').notNull().default('{}'), locked: integer('locked').notNull().default(0),
}, (t) => [uniqueIndex('idx_live_ballots_round_judge').on(t.roundKey, t.judgeId), index('idx_live_ballots_event').on(t.eventId)]);
export const submissions = sqliteTable('live_submissions', {
  id: text('id').primaryKey(), eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  roundKey: text('round_key').notNull().references(() => roundVersions.key), judgeId: text('judge_id').notNull(),
  ballotVersion: integer('ballot_version').notNull(), snapshot: text('snapshot').notNull(), createdAt: text('created_at').notNull(),
}, (t) => [uniqueIndex('idx_live_submissions_round_judge').on(t.roundKey, t.judgeId), index('idx_live_submissions_event').on(t.eventId)]);
export const decisions = sqliteTable('live_tie_decisions', {
  id: text('id').primaryKey(), eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  roundKey: text('round_key').notNull(), fingerprint: text('fingerprint').notNull(), tieKey: text('tie_key').notNull(),
  decision: text('decision').notNull(),
}, (t) => [uniqueIndex('idx_live_tie_scope').on(t.roundKey, t.fingerprint, t.tieKey), index('idx_live_ties_event').on(t.eventId)]);
export const approvals = sqliteTable('live_approvals', {
  id: text('id').primaryKey(), eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  roundKey: text('round_key').notNull(), fingerprint: text('fingerprint').notNull(), snapshot: text('snapshot').notNull(),
  createdAt: text('created_at').notNull(), judgeId: text('judge_id').notNull(),
}, (t) => [uniqueIndex('idx_live_approval_round').on(t.roundKey), index('idx_live_approvals_event').on(t.eventId)]);
export const receipts = sqliteTable('live_receipts', {
  id: text('id').primaryKey(), eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  inputHash: text('input_hash').notNull(), response: text('response').notNull(),
});
// A failed compare-and-swap aborts the D1 batch, including earlier writes.
export const guards = sqliteTable('live_mutation_guards', {
  id: text('id').primaryKey(), passed: integer('passed').notNull(),
}, (t) => [check('live_guard_passed', sql`${t.passed} = 1`)]);
