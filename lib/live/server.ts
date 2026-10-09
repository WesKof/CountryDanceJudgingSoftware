import { cellKey, roundKey, type Cells, type FrozenRound, type HeatSubmission, type LiveBallot, type LiveContext, type LiveSetup, type LiveSubmission, type LiveView, type ReviewRequest, type RoundView, type StageVote, type TieDecision } from './types.ts';
import { deriveStandings, missingCells, requiredCells, LIVE_MARKS } from './scoring.ts';
import { freezeRound, id, integer, LiveError, record, requireRule, text, validateSetup } from './validation.ts';
import { advancement, deriveStageStandings, heatSnapshot, latestHeatSubmissions, missingHeatSubjects } from './stage.ts';

type EventRow = { id: string; version: number; setup: string; context: string; status: 'active' | 'archived'; restored_history: string | null; link_id: string; role: 'organizer' | 'judge'; judge_id: string | null };
type RoundRow = { id: string; generation: number; version: number; phase: RoundView['phase']; definition: string };
type BallotRow = { round_key: string; judge_id: string; version: number; cells: string; locked: number };
type SubmissionRow = { id: string; round_key: string; judge_id: string; ballot_version: number; snapshot: string; created_at: string };
type DecisionRow = { round_key: string; fingerprint: string; decision: string };
type ApprovalRow = { round_key: string; fingerprint: string; created_at: string; snapshot: string };
type Snapshot = { event: EventRow; setup: LiveSetup; context: LiveContext; rounds: RoundView[]; ballots: LiveBallot[]; submissions: LiveSubmission[]; decisions: DecisionRow[]; approvals: ApprovalRow[]; heatSubmissions: HeatSubmission[]; requests: ReviewRequest[]; votes: StageVote[] };

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
function secret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''); }
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, '0')).join(''); }
const json = JSON.stringify;
const parse = <T,>(value: string) => JSON.parse(value) as T;
function stmt(db: D1Database, sql: string, ...values: (string | number | null)[]) { return db.prepare(sql).bind(...values); }
function guard(db: D1Database, statement: D1PreparedStatement): D1PreparedStatement[] {
  const key = uid();
  return [statement, stmt(db, 'INSERT INTO live_mutation_guards (id, passed) VALUES (?, changes())', key), stmt(db, 'DELETE FROM live_mutation_guards WHERE id = ?', key)];
}
async function batch(db: D1Database, statements: D1PreparedStatement[]) {
  try { await db.batch(statements); }
  catch (error) {
    // Never return raw database errors: statements can contain private data.
    if (/constraint|live_guard_passed|UNIQUE|FOREIGN KEY/i.test(String(error))) throw new LiveError(409, 'The event changed. Refresh and review before retrying.');
    throw error;
  }
}
const ACCESS_SQL = `SELECT e.*, l.id AS link_id, l.role, l.judge_id FROM live_events e JOIN live_links l ON l.event_id = e.id WHERE l.code_hash = ? AND l.revoked = 0`;
async function load(db: D1Database, codeHash: string): Promise<Snapshot> {
  const event = await stmt(db, ACCESS_SQL, codeHash).first<EventRow>();
  if (!event) throw new LiveError(403, 'This private link is invalid or has been revoked.');
  const result = await db.batch([
    stmt(db, ACCESS_SQL, codeHash),
    stmt(db, `SELECT r.*, v.definition FROM live_rounds r JOIN live_round_versions v ON v.key = r.id || ':' || r.generation WHERE r.event_id = ?`, event.id),
    stmt(db, 'SELECT * FROM live_ballots WHERE event_id = ?', event.id),
    stmt(db, 'SELECT * FROM live_submissions WHERE event_id = ?', event.id),
    stmt(db, 'SELECT * FROM live_tie_decisions WHERE event_id = ?', event.id),
    stmt(db, 'SELECT * FROM live_approvals WHERE event_id = ?', event.id),
    stmt(db, 'SELECT * FROM live_heat_submissions WHERE event_id = ?', event.id),
    stmt(db, 'SELECT data FROM live_review_requests WHERE event_id = ?', event.id),
    stmt(db, 'SELECT round_key, fingerprint, tie_key, judge_id, selected, created_at FROM live_stage_votes WHERE event_id = ?', event.id),
  ]);
  const current = result[0].results[0] as unknown as EventRow | undefined;
  if (!current) throw new LiveError(403, 'This private link is invalid or has been revoked.');
  const setup = parse<LiveSetup>(current.setup);
  const rounds = (result[1].results as unknown as RoundRow[]).filter((r) => setup.rounds.some((scheduled) => scheduled.id === r.id)).map((r) => ({ id: r.id, key: roundKey(r.id, r.generation), generation: r.generation, version: r.version, phase: r.phase, definition: parse<FrozenRound>(r.definition) }));
  const ballots = (result[2].results as unknown as BallotRow[]).map((b) => ({ roundKey: b.round_key, judgeId: b.judge_id, version: b.version, cells: parse<Cells>(b.cells), locked: Boolean(b.locked) }));
  const submissions = (result[3].results as unknown as SubmissionRow[]).map((s) => ({ id: s.id, roundKey: s.round_key, judgeId: s.judge_id, ballotVersion: s.ballot_version, cells: parse<Cells>(s.snapshot), createdAt: s.created_at }));
  const heatSubmissions = (result[6].results as unknown as (SubmissionRow & { heat_id: string; version: number; supersedes: string | null; acknowledged_at: string })[]).map((s) => ({ id: s.id, roundKey: s.round_key, heatId: s.heat_id, judgeId: s.judge_id, ballotVersion: s.ballot_version, version: s.version, cells: parse<Cells>(s.snapshot), createdAt: s.created_at, acknowledgedAt: s.acknowledged_at, ...(s.supersedes ? { supersedes: s.supersedes } : {}) }));
  const requests = (result[7].results as unknown as { data: string }[]).map((r) => parse<ReviewRequest>(r.data));
  const votes = (result[8].results as unknown as { round_key: string; fingerprint: string; tie_key: string; judge_id: string; selected: string; created_at: string }[]).map((v) => ({ roundKey: v.round_key, fingerprint: v.fingerprint, tieKey: v.tie_key, judgeId: v.judge_id, selected: parse<string[]>(v.selected), createdAt: v.created_at }));
  return { event: current, setup, context: parse<LiveContext>(current.context), rounds, ballots, submissions, decisions: result[4].results as unknown as DecisionRow[], approvals: result[5].results as unknown as ApprovalRow[], heatSubmissions, requests, votes };
}
function organizer(s: Snapshot) { if (s.event.role !== 'organizer') throw new LiveError(403, 'An organizer link is required.'); }
function head(s: Snapshot) { if (s.event.role !== 'judge' || s.event.judge_id !== s.setup.headJudgeId) throw new LiveError(403, 'The event head judge must make this decision.'); }
function active(s: Snapshot) { if (s.event.status !== 'active') throw new LiveError(423, 'This event is archived and read only.'); }
function currentRound(s: Snapshot, key: unknown) {
  const r = s.rounds.find((r) => r.key === key);
  if (!r) throw new LiveError(409, 'This round version is no longer current. Your pending edit has been preserved.');
  return r;
}
async function standings(s: Snapshot, r: RoundView) {
  if (s.setup.workflow === 'stage-v1') {
    const latest = latestHeatSubmissions(s.heatSubmissions).filter((sub) => sub.roundKey === r.key);
    const finalistCount = s.setup.rounds.find((f) => f.prelimRoundId === r.id)?.finalistCount ?? 0;
    const prelimKey = s.rounds.find((pre) => pre.id === r.definition.prelimRoundId)?.key;
    const fingerprint = await hash(json({ round: r.key, head: s.setup.headJudgeId, finalistCount, submissions: latest.map((sub) => [sub.heatId, sub.judgeId, sub.id, sub.version]).sort(), prelimSources: prelimKey ? latestHeatSubmissions(s.heatSubmissions).filter((sub) => sub.roundKey === prelimKey).map((sub) => [sub.id, sub.version]).sort() : [], withdrawals: s.requests.filter((q) => q.kind === 'withdrawal' && q.appliedAt).map((q) => q.id).sort() }));
    const decisions = s.decisions.filter((d) => d.round_key === r.key && d.fingerprint === fingerprint).map((d) => parse<TieDecision>(d.decision));
    const computed = deriveStageStandings(r.definition, r.key, latest, decisions);
    const votes = s.votes.filter((v) => v.roundKey === r.key && v.fingerprint === fingerprint);
    const onward = advancement(computed.rows, finalistCount, r.definition.judgeIds, votes, decisions);
    const approval = s.approvals.find((a) => a.round_key === r.key && a.fingerprint === fingerprint);
    return { ...computed, ...onward, finalistCount, fingerprint, decisions, approved: r.phase === 'approved' && Boolean(approval), approvedAt: approval?.created_at };
  }
  const submissions = s.submissions.filter((item) => item.roundKey === r.key);
  const fingerprint = await hash(json({ round: r.key, head: s.setup.headJudgeId, submissions: submissions.map((item) => [item.judgeId, item.id, item.ballotVersion]).sort() }));
  const decisions = s.decisions.filter((d) => d.round_key === r.key && d.fingerprint === fingerprint).map((d) => parse<TieDecision>(d.decision));
  const approval = s.approvals.find((a) => a.round_key === r.key && a.fingerprint === fingerprint);
  return { ...deriveStandings(r.definition, submissions, decisions), fingerprint, decisions, approved: r.phase === 'approved' && Boolean(approval), approvedAt: approval?.created_at };
}
function safeDefinition(s: Snapshot, round: FrozenRound): FrozenRound {
  return { ...round, heats: round.heats.map((heat) => ({ ...heat, songs: heat.songs.filter((p) => s.context.visited.includes(p.id)).map((p) => ({ ...p, notes: '' })) })) };
}
async function view(db: D1Database, s: Snapshot): Promise<LiveView> {
  const isOrganizer = s.event.role === 'organizer';
  const isHead = s.event.judge_id === s.setup.headJudgeId && s.event.role === 'judge';
  const visible = isOrganizer || isHead ? s.rounds : s.rounds.filter((r) => r.phase !== 'setup' && r.definition.judgeIds.includes(s.event.judge_id!));
  const rounds: RoundView[] = await Promise.all(visible.map(async (r) => {
    const base = { ...r, definition: isOrganizer ? r.definition : safeDefinition(s, r.definition) };
    if (s.setup.workflow === 'stage-v1') {
      const reviewed = ['discussion', 'approved'].includes(r.phase);
      const latest = latestHeatSubmissions(s.heatSubmissions).filter((sub) => sub.roundKey === r.key);
      const draftProgress = isOrganizer || isHead ? r.definition.judgeIds.map((judgeId) => { const b = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === judgeId); return { judgeId, filled: r.definition.heats.reduce((n, h) => n + h.subjectIds.length - missingHeatSubjects(h, b?.cells ?? {}).length, 0), required: r.definition.subjects.length, ballotVersion: b?.version ?? 0, locked: r.definition.heats.every((h) => latest.some((sub) => sub.heatId === h.id && sub.judgeId === judgeId)) }; }) : undefined;
      return { ...base, draftProgress, ...(reviewed ? { standings: await standings(s, r), submittedMarks: latest.flatMap((sub) => Object.entries(sub.cells).map(([key, cell]) => ({ judgeId: sub.judgeId, performanceId: key.split(':')[0], subjectId: key.split(':')[1], mark: cell.mark }))) } : {}) };
    }
    if (!isOrganizer && !isHead) return base;
    const submitted = s.submissions.filter((item) => item.roundKey === r.key);
    const draftProgress = r.definition.judgeIds.map((judgeId) => { const b = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === judgeId); return { judgeId, filled: requiredCells(r.definition).filter((c) => b?.cells[c.key]?.mark).length, required: requiredCells(r.definition).length, ballotVersion: b?.version ?? 0, savedAt: b ? Object.values(b.cells).map((c) => c.savedAt ?? '').sort().at(-1) || undefined : undefined, locked: b?.locked ?? false }; });
    return { ...base, standings: await standings(s, r), draftProgress, submissions: submitted.map((sub) => ({ id: sub.id, roundKey: sub.roundKey, judgeId: sub.judgeId, ballotVersion: sub.ballotVersion, createdAt: sub.createdAt })),
      submittedMarks: submitted.flatMap((submission) => requiredCells(r.definition).map((c) => ({ judgeId: submission.judgeId, performanceId: c.performanceId, subjectId: c.subjectId, mark: submission.cells[c.key]?.mark ?? '' }))) };
  }));
  const setup = isOrganizer ? s.setup : { ...s.setup, rounds: rounds.filter((r) => r.phase !== 'setup').map((r) => r.definition), blocks: s.setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => rounds.some((r) => r.id === id && r.phase !== 'setup')) })) };
  const ballots = s.ballots.filter((b) => !isOrganizer && b.judgeId === s.event.judge_id && rounds.some((r) => r.key === b.roundKey && r.phase !== 'setup')).map((b) => ({ ...b, cells: Object.fromEntries(Object.entries(b.cells).filter(([key]) => s.context.visited.includes(key.split(':')[0]))) }));
  const payload: LiveView = { eventId: s.event.id, version: s.event.version, status: s.event.status, setup, context: s.context,
    role: isOrganizer ? 'organizer' : isHead ? 'head' : 'judge', judgeId: s.event.judge_id, rounds, ballots };
  if (s.setup.workflow === 'stage-v1') {
    payload.heatSubmissions = latestHeatSubmissions(s.heatSubmissions).filter((sub) => isOrganizer || isHead || sub.judgeId === s.event.judge_id).map((sub) => ({ id: sub.id, roundKey: sub.roundKey, heatId: sub.heatId, judgeId: sub.judgeId, version: sub.version, ballotVersion: sub.ballotVersion, supersedes: sub.supersedes, createdAt: sub.createdAt, acknowledgedAt: sub.acknowledgedAt }));
    payload.reviewRequests = s.requests.filter((q) => !s.requests.some((newer) => newer.id === q.id && newer.version > q.version));
  }
  if (isOrganizer) {
    const links = await stmt(db, 'SELECT judge_id, code, slug, revoked FROM live_links WHERE event_id = ? AND role = ? ORDER BY rowid', s.event.id, 'judge').all<{ judge_id: string; code: string; slug: string; revoked: number }>();
    payload.judgeLinks = s.setup.judges.map((j) => { const l = links.results.filter((l) => l.judge_id === j.id).at(-1); return { id: j.id, name: j.name, path: l ? `/judge/${l.slug}/${l.code}` : '', revoked: !l || Boolean(l.revoked) }; });
    if (s.event.restored_history) payload.restoredHistory = parse(s.event.restored_history);
  }
  return payload;
}
function eventGuard(db: D1Database, s: Snapshot, codeHash: string, expected: unknown) {
  if (expected !== s.event.version) throw new LiveError(409, 'The desk changed. Refresh before applying this action.');
  return guard(db, stmt(db, `UPDATE live_events SET version = version + 1 WHERE id = ? AND version = ? AND status = 'active' AND EXISTS (SELECT 1 FROM live_links WHERE code_hash = ? AND revoked = 0)`, s.event.id, s.event.version, codeHash));
}
async function newLink(db: D1Database, eventId: string, role: string, judgeId: string | null, name: string) {
  const code = secret();
  const slug = name.normalize('NFKD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 60) || 'Judge';
  return { code, statement: stmt(db, 'INSERT INTO live_links (id, event_id, code_hash, code, slug, role, judge_id) VALUES (?, ?, ?, ?, ?, ?, ?)', uid(), eventId, await hash(code), code, slug, role, judgeId) };
}
function versionStatements(db: D1Database, s: Snapshot, definition: FrozenRound, generation: number, reason: string, phase: string, carry = true) {
  const key = roundKey(definition.id, generation);
  const old = s.rounds.find((r) => r.id === definition.id);
  const statements = [stmt(db, 'INSERT INTO live_round_versions (key, event_id, round_id, generation, definition, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', key, s.event.id, definition.id, generation, json(definition), reason, now()),
    stmt(db, 'INSERT INTO live_rounds (id, event_id, generation, phase) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET generation = excluded.generation, phase = excluded.phase, version = live_rounds.version + 1', definition.id, s.event.id, generation, phase)];
  for (const judgeId of definition.judgeIds) {
    const priorBallot = carry && old ? s.ballots.find((b) => b.roundKey === old.key && b.judgeId === judgeId) : undefined;
    if (priorBallot) statements.push(...guard(db, stmt(db, 'UPDATE live_ballots SET version = version WHERE round_key = ? AND judge_id = ? AND version = ?', old!.key, judgeId, priorBallot.version)));
    const previous = carry && old ? s.ballots.find((b) => b.roundKey === old.key && b.judgeId === judgeId)?.cells ?? {} : {};
    const cells = Object.fromEntries(requiredCells(definition).filter((c) => previous[c.key]).map((c) => [c.key, { ...previous[c.key], revision: 0, mutationId: '' }]));
    statements.push(stmt(db, 'INSERT INTO live_ballots (id, event_id, round_key, judge_id, cells) VALUES (?, ?, ?, ?, ?)', `${key}/${judgeId}`, s.event.id, key, judgeId, json(cells)));
  }
  return statements;
}
function remapSetup(setup: LiveSetup): LiveSetup {
  const ids = new Map<string, string>();
  const remap = (value: string) => { if (!value) return value; if (!ids.has(value)) ids.set(value, uid()); return ids.get(value)!; };
  return { ...setup, headJudgeId: remap(setup.headJudgeId), judges: setup.judges.map((j) => ({ ...j, id: remap(j.id) })), competitions: setup.competitions.map((c) => ({ ...c, id: remap(c.id) })),
    blocks: setup.blocks.map((b) => ({ ...b, id: remap(b.id), roundIds: b.roundIds.map(remap) })),
    rounds: setup.rounds.map((r) => ({ ...r, id: remap(r.id), competitionId: remap(r.competitionId), blockId: remap(r.blockId), prelimRoundId: r.prelimRoundId ? remap(r.prelimRoundId) : undefined,
      judgeIds: r.judgeIds.map(remap), finalistIds: r.finalistIds.map(remap), subjects: r.subjects.map((s) => ({ ...s, id: remap(s.id), members: s.members?.map(remap) as [string, string] | undefined })),
      heats: r.heats.map((h) => ({ ...h, id: remap(h.id), subjectIds: h.subjectIds.map(remap), songs: h.songs.map((p) => ({ ...p, id: remap(p.id), partners: p.partners.map(([l, f]) => [remap(l), remap(f)]) })) })) })) };
}
function archiveData(value: unknown, includeNotes: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => archiveData(item, includeNotes));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['code', 'code_hash', 'judgeLinks', 'accessLinks', 'publisherKey', 'authorization'].includes(key) && (includeNotes || !['note', 'privateNotes'].includes(key))).map(([key, item]) => [key, archiveData(item, includeNotes)]));
  return value;
}
async function create(db: D1Database, input: Record<string, unknown>) {
  requireRule(typeof input.requestId === 'string' && /^[a-f0-9]{64}$/.test(input.requestId), 'Invalid creation request.');
  const receiptId = `create:${await hash(input.requestId)}`;
  const inputHash = await hash(json(input));
  const prior = await stmt(db, 'SELECT * FROM live_receipts WHERE id = ?', receiptId).first<{ input_hash: string; response: string }>();
  if (prior) { if (prior.input_hash !== inputHash) throw new LiveError(409, 'This creation request was already used.'); return parse(prior.response); }
  let setup: LiveSetup;
  let history: unknown = null;
  if (input.action === 'restore') {
    const backup = record(input.backup);
    requireRule(backup.format === 'country-dance-live-backup' && backup.backupVersion === 1, 'Use a shared live backup; legacy v2 backups belong in the local demo.');
    setup = remapSetup(validateSetup(backup.setup));
    // Historical exports are inert review data; they never become current ballots/approvals.
    history = archiveData({ importedAt: now(), source: 'Restored historical record; new event requires fresh submissions and approval.', results: backup.results ?? [], history: backup.history ?? {}, ballots: backup.ballots ?? [], context: backup.context ?? {}, previousArchive: backup.restoredHistory ?? null, privateNotes: backup.privateNotes ?? [] }, backup.includesPrivateNotes === true);
  } else {
    setup = { name: text(input.name, 'event name', 160, true), venue: text(input.venue, 'venue'), date: text(input.date, 'date', 10), headJudgeId: '', judges: [], competitions: [], rounds: [], blocks: [], workflow: 'stage-v1', organizerName: '', organizerParticipantId: '', separationAttested: false };
  }
  const eventId = uid();
  const link = await newLink(db, eventId, 'organizer', null, 'Organizer');
  const response = { path: `/live/${link.code}` };
  const statements = [stmt(db, 'INSERT INTO live_events (id, setup, context, created_at, restored_history) VALUES (?, ?, ?, ?, ?)', eventId, json(setup), json({ blockId: null, performanceId: null, visited: [] }), now(), history ? json(history) : null), link.statement];
  for (const judge of setup.judges) statements.push((await newLink(db, eventId, 'judge', judge.id, judge.name)).statement);
  statements.push(stmt(db, 'INSERT INTO live_receipts (id, event_id, input_hash, response) VALUES (?, ?, ?, ?)', receiptId, eventId, inputHash, json(response)));
  try { await batch(db, statements); }
  catch (error) { const retry = await stmt(db, 'SELECT response FROM live_receipts WHERE id = ? AND input_hash = ?', receiptId, inputHash).first<{ response: string }>(); if (retry) return parse(retry.response); throw error; }
  return response;
}

function stageOrder(s: Snapshot) {
  const block = s.setup.blocks.find((b) => b.id === s.context.blockId);
  requireRule(block, 'Start a stage first.');
  const rounds = block.roundIds.map((id) => s.rounds.find((r) => r.id === id)).filter((r): r is RoundView => Boolean(r));
  const heats = rounds.flatMap((r) => r.definition.heats.map((h) => ({ round: r, heat: h })));
  const current = heats.find((x) => x.heat.songs.some((p) => p.id === s.context.performanceId));
  return { block, rounds, heats, current };
}
function distinctPanel(s: Snapshot) {
  requireRule(s.setup.separationAttested && s.setup.organizerParticipantId && s.setup.judges.every((j) => j.participantId) && !s.setup.judges.some((j) => j.participantId === s.setup.organizerParticipantId), 'Confirm distinct organizer and judge participants in setup.');
}
function participant(s: Snapshot) {
  return s.event.role === 'organizer' ? s.setup.organizerParticipantId! : s.setup.judges.find((j) => j.id === s.event.judge_id)?.participantId ?? '';
}
function heatInsert(db: D1Database, s: Snapshot, sub: HeatSubmission) {
  return stmt(db, 'INSERT INTO live_heat_submissions (id, event_id, round_key, heat_id, judge_id, version, ballot_version, snapshot, supersedes, created_at, acknowledged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', sub.id, s.event.id, sub.roundKey, sub.heatId, sub.judgeId, sub.version, sub.ballotVersion, json(sub.cells), sub.supersedes ?? null, sub.createdAt, sub.acknowledgedAt ?? '');
}
function requestInsert(db: D1Database, s: Snapshot, q: ReviewRequest) {
  return stmt(db, 'INSERT INTO live_review_requests (id, event_id, request_id, version, data) VALUES (?, ?, ?, ?, ?)', `${q.id}:${q.version}`, s.event.id, q.id, q.version, json(q));
}
function invalidateReview(db: D1Database, s: Snapshot, rounds: RoundView[]) {
  return rounds.flatMap((r) => guard(db, stmt(db, "UPDATE live_rounds SET phase = CASE WHEN phase = 'approved' THEN 'discussion' ELSE phase END, version = version + 1 WHERE id = ? AND generation = ? AND version = ?", r.id, r.generation, r.version)));
}

async function stageMutation(db: D1Database, s: Snapshot, codeHash: string, input: Record<string, unknown>) {
  distinctPanel(s);
  const statements: D1PreparedStatement[] = [];
  let response: Record<string, unknown> = { ok: true };
  if (input.action === 'open-stage') {
    organizer(s);
    const block = s.setup.blocks.find((b) => b.kind === input.kind);
    requireRule(block?.roundIds.length, 'Add competitions and save the stage setup first.');
    requireRule(!s.rounds.some((r) => ['dancing', 'discussion'].includes(r.phase)), 'Finish review and approve the current stage first.');
    let first = '';
    for (const rid of block.roundIds) {
      const definition = freezeRound(s.setup, s.setup.rounds.find((r) => r.id === rid)!);
      const old = s.rounds.find((r) => r.id === rid);
      requireRule(!old || old.phase === 'setup', 'This stage has already started. Submitted scores remain immutable.');
      if (definition.kind === 'finals') {
        const prelim = s.rounds.find((r) => r.id === definition.prelimRoundId);
        const result = prelim && await standings(s, prelim);
        requireRule(result?.approved && 'advancingIds' in result && definition.finalistIds.length === result.advancingIds.length && definition.finalistIds.every((id) => result.advancingIds.includes(id)), 'Finals must use the exact currently approved advancing entrants.');
      }
      first ||= definition.heats[0].songs[0].id;
      statements.push(...versionStatements(db, s, definition, (old?.generation ?? 0) + 1, 'Started stage; heat/song identities frozen', 'dancing', false));
    }
    statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ blockId: block.id, performanceId: first, visited: [...s.context.visited, first], lineupHeatId: null }), s.event.id));
  } else if (['next', 'lineup', 'conclude-stage'].includes(String(input.action))) {
    organizer(s);
    const { rounds, heats, current } = stageOrder(s);
    requireRule(current && rounds.every((r) => r.phase === 'dancing'), 'The current stage is not dancing.');
    const index = current.heat.songs.findIndex((p) => p.id === s.context.performanceId);
    const nextSong = current.heat.songs[index + 1];
    if (input.action === 'lineup') {
      requireRule(!nextSong, 'Finish this heat’s scheduled songs before the lineup check.');
      statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ ...s.context, lineupHeatId: current.heat.id }), s.event.id));
    } else if (input.action === 'next' && nextSong) {
      statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ ...s.context, performanceId: nextSong.id, visited: [...new Set([...s.context.visited, nextSong.id])], lineupHeatId: null }), s.event.id));
    } else {
      requireRule(s.context.lineupHeatId === current.heat.id, 'Open the heat-end lineup check first.');
      const latest = latestHeatSubmissions(s.heatSubmissions);
      const missing = current.round.definition.judgeIds.filter((j) => !latest.some((sub) => sub.roundKey === current.round.key && sub.heatId === current.heat.id && sub.judgeId === j));
      requireRule(!missing.length, `Waiting for ${missing.length} required heat submission(s).`);
      const next = heats[heats.findIndex((x) => x.heat.id === current.heat.id) + 1];
      if (input.action === 'next') {
        requireRule(next, 'All heats have finished. Conclude the stage for read-only review.');
        const p = next.heat.songs[0];
        statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ ...s.context, performanceId: p.id, visited: [...new Set([...s.context.visited, p.id])], lineupHeatId: null }), s.event.id));
      } else {
        requireRule(!next && heats.every(({ round, heat }) => heat.songs.every((p) => s.context.visited.includes(p.id)) && round.definition.judgeIds.every((j) => latest.some((sub) => sub.roundKey === round.key && sub.heatId === heat.id && sub.judgeId === j))), 'Every scheduled heat and required submission must finish before stage review.');
        for (const r of rounds) statements.push(...guard(db, stmt(db, "UPDATE live_rounds SET phase = 'discussion', version = version + 1 WHERE id = ? AND generation = ? AND phase = 'dancing'", r.id, r.generation)));
      }
    }
  } else if (input.action === 'submit-heat') {
    if (s.event.role !== 'judge' || !s.event.judge_id) throw new LiveError(403, 'Only an assigned judge can submit a heat.');
    const r = currentRound(s, input.roundKey), heat = r.definition.heats.find((h) => h.id === input.heatId);
    requireRule(heat && r.definition.judgeIds.includes(s.event.judge_id), 'This heat is outside your assignment.');
    const existing = latestHeatSubmissions(s.heatSubmissions).find((sub) => sub.roundKey === r.key && sub.heatId === heat.id && sub.judgeId === s.event.judge_id);
    if (existing) return { statements, response: { ok: true, submittedId: existing.id, acknowledged: true } };
    requireRule(input.acknowledged === true, 'Acknowledge that you checked this heat’s bibs and song marks before final submission.');
    requireRule(r.phase === 'dancing' && s.context.lineupHeatId === heat.id && heat.songs.every((p) => s.context.visited.includes(p.id)), 'Submit at this heat’s lineup check after all its songs.');
    const ballot = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === s.event.judge_id)!;
    if (input.ballotVersion !== ballot.version) throw new LiveError(409, 'Saved marks changed after review. Refresh and review this heat again.');
    const missing = missingHeatSubjects(heat, ballot.cells);
    requireRule(!missing.length, `Score each assigned entrant at least once across this heat. Uncovered bibs: ${missing.map((id) => r.definition.subjects.find((s) => s.id === id)!.number).join(', ')}.`);
    const sub: HeatSubmission = { id: uid(), roundKey: r.key, heatId: heat.id, judgeId: s.event.judge_id, ballotVersion: ballot.version, version: 1, cells: heatSnapshot(heat, ballot.cells), createdAt: now(), acknowledgedAt: now() };
    statements.push(...guard(db, stmt(db, "UPDATE live_ballots SET version = version + 1 WHERE round_key = ? AND judge_id = ? AND version = ? AND locked = 0 AND NOT EXISTS (SELECT 1 FROM live_heat_submissions WHERE round_key = ? AND heat_id = ? AND judge_id = ?) AND EXISTS (SELECT 1 FROM live_rounds WHERE id = ? AND generation = ? AND phase = 'dancing') AND EXISTS (SELECT 1 FROM live_links WHERE code_hash = ? AND revoked = 0) AND EXISTS (SELECT 1 FROM live_events WHERE id = ? AND status = 'active' AND json_extract(context, '$.lineupHeatId') = ?)", r.key, s.event.judge_id, ballot.version, r.key, heat.id, s.event.judge_id, r.id, r.generation, codeHash, s.event.id, heat.id)), heatInsert(db, s, sub));
    response = { ok: true, submittedId: sub.id, acknowledged: true };
  } else if (['vote', 'tie', 'approve'].includes(String(input.action))) {
    const r = currentRound(s, input.roundKey), result = await standings(s, r);
    requireRule(r.phase === 'discussion' && result.complete, 'Close the whole stage before review, voting or approval.');
    if (input.fingerprint !== result.fingerprint || input.roundVersion !== r.version) throw new LiveError(409, 'Review versions changed. Review the current submissions and votes.');
    if (input.action === 'vote') {
      if (s.event.role !== 'judge' || !r.definition.judgeIds.includes(s.event.judge_id!)) throw new LiveError(403, 'Only this division’s assigned judging panel can vote.');
      const tie = 'advancementTies' in result && result.advancementTies.find((t) => t.key === input.tieKey);
      requireRule(r.definition.kind === 'prelims' && tie, 'Vote only on an eligible advancement cutoff tie.');
      requireRule(Array.isArray(input.selected) && input.selected.length === tie.slots && new Set(input.selected).size === tie.slots && input.selected.every((id) => tie.subjectIds.includes(String(id))), `Select exactly ${tie.slots} tied entrant(s).`);
      requireRule(!s.votes.some((v) => v.roundKey === r.key && v.fingerprint === result.fingerprint && v.tieKey === tie.key && v.judgeId === s.event.judge_id), 'Your vote is already finalized for this review version.');
      statements.push(stmt(db, 'INSERT INTO live_stage_votes (id, event_id, round_key, fingerprint, tie_key, judge_id, selected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', uid(), s.event.id, r.key, result.fingerprint, tie.key, s.event.judge_id!, json(input.selected), now()));
    } else if (input.action === 'tie') {
      head(s);
      const tie = result.ties.find((t) => t.key === input.tieKey);
      const voteTie = 'advancementTies' in result && result.advancementTies.find((t) => t.key === input.tieKey);
      requireRule(r.definition.kind === 'finals' || (voteTie && voteTie.votes.length === r.definition.judgeIds.length && voteTie.deadlocked), 'A prelim head decision is available only after a full-panel vote deadlock.');
      requireRule(tie && Array.isArray(input.order) && input.order.length === tie.subjectIds.length && new Set(input.order).size === tie.subjectIds.length && input.order.every((id) => tie.subjectIds.includes(String(id))), 'Decide only this tied candidate group.');
      requireRule(r.definition.kind === 'finals' || input.shared !== true, 'An advancement deadlock needs a selected order.');
      const decision: TieDecision = { key: tie.key, order: input.order as string[], shared: input.shared === true, explanation: text(input.explanation ?? '', 'tie explanation', 500), decidedAt: now(), judgeId: s.event.judge_id!, role: 'head', fingerprint: result.fingerprint };
      statements.push(stmt(db, 'INSERT INTO live_tie_decisions (id, event_id, round_key, fingerprint, tie_key, decision) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(round_key, fingerprint, tie_key) DO UPDATE SET decision = excluded.decision', uid(), s.event.id, r.key, result.fingerprint, tie.key, json(decision)));
    } else {
      head(s);
      requireRule(!s.requests.some((q) => !q.appliedAt && q.kind === 'correction' && q.payload.roundKey === r.key && !s.requests.some((newer) => newer.id === q.id && newer.version > q.version)), 'Resolve pending correction requests before approval.');
      if (r.definition.kind === 'prelims') {
        requireRule('finalistCount' in result && result.finalistCount > 0 && r.definition.subjects.every((subject) => result.rows.filter((row) => row.group === (subject.role ? `${subject.role}s` : 'Couples')).length >= result.finalistCount), 'Configure a valid finalist count for each role/couple group before approval.');
        requireRule('advancementTies' in result && result.advancementTies.every((t) => t.complete), 'Every required judge must vote and advancement deadlocks need a head decision.');
      } else {
        const prelim = s.rounds.find((p) => p.id === r.definition.prelimRoundId);
        const pre = prelim && await standings(s, prelim);
        requireRule(pre?.approved && 'advancingIds' in pre && r.definition.finalistIds.length === pre.advancingIds.length && r.definition.finalistIds.every((id) => pre.advancingIds.includes(id)), 'Dependent advancement changed. Review the prelims and finalist identities before finals approval.');
        requireRule(result.rows.every((row) => row.decided), 'Decide all finals placement ties explicitly.');
      }
      statements.push(stmt(db, 'INSERT INTO live_approvals (id, event_id, round_key, fingerprint, snapshot, created_at, judge_id) VALUES (?, ?, ?, ?, ?, ?, ?)', uid(), s.event.id, r.key, result.fingerprint, json({ rows: result.rows, decisions: result.decisions, ...('advancingIds' in result ? { advancingIds: result.advancingIds, votes: result.advancementTies } : {}), role: 'head' }), now(), s.event.judge_id!));
    }
    statements.push(...guard(db, stmt(db, 'UPDATE live_rounds SET phase = ?, version = version + 1 WHERE id = ? AND generation = ? AND version = ? AND phase = ?', input.action === 'approve' ? 'approved' : 'discussion', r.id, r.generation, r.version, 'discussion')));
  } else if (input.action === 'request-correction' || input.action === 'request-withdrawal') {
    const reason = text(input.reason, 'genuine-error / withdrawal reason', 500, true);
    const prior = input.reviewRequestId ? s.requests.filter((q) => q.id === input.reviewRequestId).sort((a, b) => b.version - a.version)[0] : undefined;
    if (input.reviewRequestId) requireRule(prior && !prior.appliedAt && prior.requester === participant(s), 'Only the original requester can revise a pending request.');
    const q: ReviewRequest = { id: prior?.id ?? uid(), kind: input.action === 'request-correction' ? 'correction' : 'withdrawal', version: (prior?.version ?? 0) + 1, payload: {}, reason, requester: participant(s), createdAt: now(), approvals: [] };
    requireRule(!prior || prior.kind === q.kind, 'A request revision must retain its request type.');
    if (q.kind === 'correction') {
      const r = currentRound(s, input.roundKey), heat = r.definition.heats.find((h) => h.id === input.heatId);
      requireRule(heat && ['discussion', 'approved'].includes(r.phase), 'Request genuine recording errors during stage review.');
      if (s.event.role !== 'organizer' && s.event.judge_id !== input.judgeId) throw new LiveError(403, 'A judge may request corrections only to their own observations.');
      const sub = latestHeatSubmissions(s.heatSubmissions).find((sub) => sub.roundKey === r.key && sub.heatId === heat.id && sub.judgeId === input.judgeId);
      requireRule(sub && sub.id === input.submissionId, 'Use the exact current submitted heat version.');
      requireRule(Array.isArray(input.changes) && input.changes.length > 0 && input.changes.length <= 10, 'Identify the exact recording-error cells.');
      const changes = input.changes.map((value) => {
        const c = record(value), key = cellKey(id(c.performanceId), id(c.subjectId));
        requireRule(key in sub.cells && (c.after === '' || LIVE_MARKS.includes(c.after as typeof LIVE_MARKS[number])) && sub.cells[key].mark !== c.after, 'Choose a changed mark in this submitted heat.');
        return { performanceId: String(c.performanceId), subjectId: String(c.subjectId), before: sub.cells[key].mark, after: c.after as typeof sub.cells[string]['mark'] };
      });
      requireRule(new Set(changes.map((c) => cellKey(c.performanceId, c.subjectId))).size === changes.length, 'Do not repeat a correction cell.');
      const corrected = structuredClone(sub.cells); for (const c of changes) corrected[cellKey(c.performanceId, c.subjectId)].mark = c.after;
      requireRule(!missingHeatSubjects(heat, corrected).length, 'An amendment cannot leave an entrant uncovered or guess a missing observation.');
      q.payload = { roundKey: r.key, heatId: heat.id, judgeId: sub.judgeId, submissionId: sub.id, changes };
    } else {
      organizer(s); requireRule(s.setup.competitions.some((c) => c.id === input.competitionId) && s.rounds.some((r) => r.definition.competitionId === input.competitionId), 'Use preparation removal for an unstarted competition.');
      q.payload = { competitionId: String(input.competitionId) };
    }
    statements.push(requestInsert(db, s, q)); response = { ok: true, reviewRequestId: q.id, requestVersion: q.version };
  } else if (input.action === 'approve-request') {
    const q = s.requests.filter((q) => q.id === input.reviewRequestId).sort((a, b) => b.version - a.version)[0];
    requireRule(q && !q.appliedAt, 'Choose a pending review request.');
    if (q.version !== input.requestVersion) throw new LiveError(409, 'The request changed. Both roles must review and approve its current exact version.');
    if (s.event.role !== 'organizer') head(s);
    const role = s.event.role === 'organizer' ? 'organizer' as const : 'head' as const;
    requireRule(!q.approvals.some((a) => a.role === role || a.participantId === participant(s)), 'This participant/role has already approved; the other distinct role must approve.');
    const next: ReviewRequest = { ...q, approvals: [...q.approvals, { role, participantId: participant(s), version: q.version, at: now() }] };
    if (next.approvals.length === 2) {
      next.appliedAt = now();
      if (q.kind === 'correction') {
        const r = currentRound(s, q.payload.roundKey), sub = latestHeatSubmissions(s.heatSubmissions).find((sub) => sub.roundKey === r.key && sub.heatId === q.payload.heatId && sub.judgeId === q.payload.judgeId);
        if (!sub || sub.id !== q.payload.submissionId) throw new LiveError(409, 'The source submission changed. Submit a fresh versioned correction request.');
        const cells = structuredClone(sub.cells); for (const c of q.payload.changes!) cells[cellKey(c.performanceId, c.subjectId)] = { ...cells[cellKey(c.performanceId, c.subjectId)], mark: c.after };
        statements.push(heatInsert(db, s, { ...sub, id: uid(), version: sub.version + 1, supersedes: sub.id, cells, createdAt: now() }));
        statements.push(...invalidateReview(db, s, s.rounds.filter((round) => round.id === r.id || round.definition.prelimRoundId === r.id)));
      } else {
        const competitionId = q.payload.competitionId, removed = new Set(s.setup.rounds.filter((r) => r.competitionId === competitionId).map((r) => r.id));
        requireRule(removed.size, 'This competition is already withdrawn.');
        const setup = { ...s.setup, competitions: s.setup.competitions.filter((c) => c.id !== competitionId), rounds: s.setup.rounds.filter((r) => !removed.has(r.id)), blocks: s.setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => !removed.has(id)) })) };
        statements.push(stmt(db, 'UPDATE live_events SET setup = ? WHERE id = ?', json(setup), s.event.id));
        statements.push(...invalidateReview(db, s, s.rounds));
        const removedCurrent = s.rounds.some((r) => removed.has(r.id) && r.definition.heats.some((h) => h.songs.some((p) => p.id === s.context.performanceId)));
        if (removedCurrent) {
          const remaining = s.setup.blocks.find((b) => b.id === s.context.blockId)?.roundIds.filter((rid) => !removed.has(rid)).flatMap((rid) => {
            const r = s.rounds.find((r) => r.id === rid); return r?.definition.heats.map((h) => ({ r, h })) ?? [];
          }) ?? [];
          const latest = latestHeatSubmissions(s.heatSubmissions);
          const next = remaining.find(({ r, h }) => !h.songs.every((p) => s.context.visited.includes(p.id)) || !r.definition.judgeIds.every((j) => latest.some((sub) => sub.roundKey === r.key && sub.heatId === h.id && sub.judgeId === j))) ?? remaining.at(-1);
          const p = next?.h.songs.find((p) => !s.context.visited.includes(p.id)) ?? next?.h.songs.at(-1);
          statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ ...s.context, blockId: p ? s.context.blockId : null, performanceId: p?.id ?? null, lineupHeatId: next?.h.songs.every((p) => s.context.visited.includes(p.id)) ? next.h.id : null, visited: [...new Set([...s.context.visited, ...(p ? [p.id] : [])])] }), s.event.id));
        }
      }
    }
    statements.push(...guard(db, stmt(db, 'UPDATE live_review_requests SET data = ? WHERE request_id = ? AND version = ? AND data = ? AND NOT EXISTS (SELECT 1 FROM live_review_requests WHERE request_id = ? AND version > ?)', json(next), q.id, q.version, json(q), q.id, q.version)));
  } else throw new LiveError(400, 'Use the stage/heat controls. Legacy block submission and single-role reopening do not apply to this event.');
  return { statements, response };
}

export async function readLive(db: D1Database, code: string) { return view(db, await load(db, await hash(code))); }

export async function mutateLive(db: D1Database, code: string, unknownInput: unknown) {
  const input = record(unknownInput);
  if (input.action === 'create' || input.action === 'restore') return create(db, input);
  const codeHash = await hash(code);
  const s = await load(db, codeHash);
  const requestId = id(input.requestId);
  const receiptId = `${s.event.link_id}:${requestId}`;
  const inputHash = await hash(json(input));
  const prior = await stmt(db, 'SELECT input_hash, response FROM live_receipts WHERE id = ?', receiptId).first<{ input_hash: string; response: string }>();
  if (prior) { if (prior.input_hash !== inputHash) throw new LiveError(409, 'Retry identity has different contents.'); return parse(prior.response); }
  if (input.action === 'backup') {
    organizer(s);
    const results = await Promise.all(s.rounds.map(async (r) => ({ round: r.definition, generation: r.generation, phase: r.phase, standings: await standings(s, r) })));
    const result: Record<string, unknown> = { format: 'country-dance-live-backup', backupVersion: 1, exportedAt: now(), setup: s.setup, context: s.context, status: s.event.status, results,
      history: { roundVersions: (await stmt(db, 'SELECT round_id, generation, definition, reason, created_at FROM live_round_versions WHERE event_id = ?', s.event.id).all()).results,
        submissions: s.submissions.map((sub) => ({ ...sub, cells: Object.fromEntries(Object.entries(sub.cells).map(([key, c]) => [key, { mark: c.mark }])) })), heatSubmissions: s.heatSubmissions.map((sub) => ({ ...sub, cells: Object.fromEntries(Object.entries(sub.cells).map(([key, c]) => [key, { mark: c.mark }])) })), reviewRequests: s.requests, votes: s.votes, decisions: s.decisions, approvals: s.approvals },
      ballots: s.ballots.map((b) => ({ ...b, cells: Object.fromEntries(Object.entries(b.cells).map(([key, c]) => [key, { mark: c.mark, revision: c.revision }])) })),
      includesPrivateNotes: input.includeNotes === true };
    if (s.event.restored_history) result.restoredHistory = archiveData(parse(s.event.restored_history), input.includeNotes === true);
    if (input.includeNotes === true) result.privateNotes = s.ballots.map((b) => ({ roundKey: b.roundKey, judgeId: b.judgeId, cells: b.cells }));
    return result;
  }
  if (input.action === 'delete') {
    organizer(s); requireRule(s.event.status === 'archived', 'Archive the event before deleting it.');
    const statements = guard(db, stmt(db, 'DELETE FROM live_events WHERE id = ? AND version = ? AND status = ? AND EXISTS (SELECT 1 FROM live_links WHERE code_hash = ? AND revoked = 0)', s.event.id, integer(input.expectedVersion), 'archived', codeHash));
    await batch(db, statements); return { deleted: true };
  }
  active(s);
  let statements: D1PreparedStatement[] = [];
  let response: Record<string, unknown> = { ok: true };
  if (input.action === 'save-cell') {
    if (!s.event.judge_id || s.event.role !== 'judge') throw new LiveError(403, 'Use your judge link to score.');
    const r = currentRound(s, input.roundKey);
    const performanceId = id(input.performanceId), subjectId = id(input.subjectId);
    const key = cellKey(performanceId, subjectId);
    requireRule(r.definition.judgeIds.includes(s.event.judge_id) && requiredCells(r.definition).some((c) => c.key === key) && s.context.visited.includes(performanceId), 'This song/entrant is outside your assignment.');
    if (!['dancing', ...(s.setup.workflow === 'stage-v1' ? [] : ['discussion'])].includes(r.phase)) throw new LiveError(423, 'This ballot is locked. Ask for an explicit correction.');
    const heat = r.definition.heats.find((h) => h.songs.some((p) => p.id === performanceId))!;
    if (s.setup.workflow === 'stage-v1' && s.heatSubmissions.some((sub) => sub.roundKey === r.key && sub.heatId === heat.id && sub.judgeId === s.event.judge_id)) throw new LiveError(423, 'This submitted heat is locked. Request a genuine-error amendment.');
    requireRule(input.mark === '' || LIVE_MARKS.includes(input.mark as typeof LIVE_MARKS[number]), 'Invalid mark.');
    const ballot = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === s.event.judge_id)!;
    const cell = { mark: input.mark, note: text(input.note, 'note', 2000), revision: integer(input.baseRevision) + 1, mutationId: requestId, savedAt: now() };
    if (ballot.locked) throw new LiveError(423, 'Finalized ballot is locked. Your pending edit is preserved.');
    if ((ballot.cells[key]?.revision ?? 0) !== input.baseRevision) throw new LiveError(409, 'Another device saved this entry. Compare your edit with the saved version.', { cell: ballot.cells[key] ?? { mark: '', note: '', revision: 0, mutationId: '' } });
    const path = `$."${key}"`;
    statements = guard(db, stmt(db, `UPDATE live_ballots SET cells = json_set(cells, ?, json(?)), version = version + 1 WHERE round_key = ? AND judge_id = ? AND locked = 0 AND COALESCE(json_extract(cells, ?), 0) = ? AND EXISTS (SELECT 1 FROM live_rounds WHERE id = ? AND generation = ? AND phase IN (${s.setup.workflow === 'stage-v1' ? "'dancing'" : "'dancing','discussion'"})) AND NOT EXISTS (SELECT 1 FROM live_heat_submissions WHERE round_key = ? AND heat_id = ? AND judge_id = ?) AND EXISTS (SELECT 1 FROM live_events WHERE id = ? AND status = 'active') AND EXISTS (SELECT 1 FROM live_links WHERE code_hash = ? AND revoked = 0)`, path, json(cell), r.key, s.event.judge_id, `${path}.revision`, Number(input.baseRevision), r.id, r.generation, r.key, heat.id, s.event.judge_id, s.event.id, codeHash));
    response = { cell, roundKey: r.key, performanceId, subjectId };
  } else {
    statements = input.action === 'submit-heat' ? [] : eventGuard(db, s, codeHash, input.expectedVersion);
    if (s.setup.workflow === 'stage-v1' && input.action !== 'setup' && !['backup', 'replace-link', 'revoke-link', 'archive'].includes(String(input.action))) {
      const change = await stageMutation(db, s, codeHash, input);
      statements.push(...change.statements); response = change.response;
    } else if (input.action === 'setup') {
      organizer(s);
      const setup = validateSetup(input.setup);
      const frozenChanged = s.rounds.some((r) => r.phase !== 'setup' && (json(s.setup.rounds.find((x) => x.id === r.id)) !== json(setup.rounds.find((x) => x.id === r.id)) || json(s.setup.blocks.find((b) => b.id === r.definition.blockId)) !== json(setup.blocks.find((b) => b.id === r.definition.blockId)) || json(s.setup.judges) !== json(setup.judges) || s.setup.headJudgeId !== setup.headJudgeId || s.setup.organizerParticipantId !== setup.organizerParticipantId || s.setup.separationAttested !== setup.separationAttested || json(s.setup.competitions.find((c) => c.id === r.definition.competitionId)) !== json(setup.competitions.find((c) => c.id === r.definition.competitionId))));
      if (frozenChanged && (s.setup.workflow === 'stage-v1' || input.correction !== true)) throw new LiveError(423, s.setup.workflow === 'stage-v1' ? 'Started stage assignments are frozen. Use a dual-approved amendment or withdrawal; setup cannot reopen submitted scores.' : 'Opened assignments are frozen. Use the explicit setup correction action.');
      if (s.rounds.length && s.setup.workflow !== setup.workflow) throw new LiveError(423, 'An existing event retains its original scoring workflow. Create a new event for the stage workflow.');
      const removedRounds = s.rounds.filter((r) => !setup.rounds.some((item) => item.id === r.id));
      if (frozenChanged || removedRounds.length) {
        const reason = frozenChanged ? text(input.reason, 'correction reason', 500, true) : 'Removed competition from preparation; judging history retained';
        for (const r of frozenChanged ? s.rounds : removedRounds) {
          statements.push(...guard(db, stmt(db, 'UPDATE live_rounds SET generation = generation + 1, phase = ?, version = version + 1 WHERE id = ? AND generation = ? AND version = ?', 'setup', r.id, r.generation, r.version)));
          // Definitions/history remain immutable. Opening uses the corrected setup.
          statements.push(stmt(db, 'INSERT INTO live_round_versions (key, event_id, round_id, generation, definition, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', roundKey(r.id, r.generation + 1), s.event.id, r.id, r.generation + 1, json(r.definition), reason, now()));
        }
        if (frozenChanged) statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ blockId: null, performanceId: null, visited: [] }), s.event.id));
      }
      statements.push(stmt(db, 'UPDATE live_events SET setup = ? WHERE id = ?', json(setup), s.event.id));
      if (setup.workflow === 'stage-v1') for (const oldFinals of s.setup.rounds.filter((r) => r.kind === 'finals')) {
        const nextFinals = setup.rounds.find((r) => r.id === oldFinals.id);
        const pre = s.rounds.find((r) => r.id === oldFinals.prelimRoundId);
        if (pre && nextFinals && nextFinals.finalistCount !== oldFinals.finalistCount) statements.push(...invalidateReview(db, s, [pre]));
      }
      for (const judge of setup.judges) if (!s.setup.judges.some((j) => j.id === judge.id)) statements.push((await newLink(db, s.event.id, 'judge', judge.id, judge.name)).statement);
      for (const judge of s.setup.judges) if (!setup.judges.some((j) => j.id === judge.id)) statements.push(stmt(db, 'UPDATE live_links SET revoked = 1 WHERE event_id = ? AND judge_id = ?', s.event.id, judge.id));
    } else if (input.action === 'open-block') {
      organizer(s);
      const block = s.setup.blocks.find((b) => b.id === input.blockId);
      requireRule(block && block.roundIds.length, 'Choose a configured block.');
      requireRule(!s.rounds.some((r) => r.phase === 'dancing' || r.phase === 'discussion'), 'Finish and approve the current block before opening another.');
      let firstPerformance: string | undefined;
      for (const rid of block.roundIds) {
        const definition = freezeRound(s.setup, s.setup.rounds.find((r) => r.id === rid)!);
        const old = s.rounds.find((r) => r.id === rid);
        requireRule(!old || old.phase === 'setup', 'This block is already open or approved. Use Reopen for a correction.');
        if (definition.kind === 'finals') {
          const prelim = s.rounds.find((r) => r.id === definition.prelimRoundId);
          requireRule(prelim && (await standings(s, prelim)).approved, 'Head approval of the matching prelims is required before finals.');
        }
        firstPerformance ??= definition.heats[0].songs[0].id;
        // A setup correction reserved a generation; create a fresh, frozen generation now.
        statements.push(...versionStatements(db, s, definition, (old?.generation ?? 0) + 1, 'Opened block; assignments frozen', 'dancing'));
      }
      statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ blockId: block.id, performanceId: firstPerformance!, visited: [...new Set([...s.context.visited, firstPerformance!])] }), s.event.id));
    } else if (input.action === 'next' || input.action === 'discussion') {
      organizer(s);
      const block = s.setup.blocks.find((b) => b.id === s.context.blockId);
      requireRule(block, 'Open a block first.');
      const rounds = block.roundIds.map((id) => s.rounds.find((r) => r.id === id)!);
      requireRule(rounds.every((r) => r?.phase === 'dancing'), 'This block is no longer dancing.');
      const performances = rounds.flatMap((r) => r.definition.heats.flatMap((h) => h.songs));
      const next = performances[performances.findIndex((p) => p.id === s.context.performanceId) + 1];
      if (input.action === 'next') {
        requireRule(next, 'All songs have finished. Start the discussion break.');
        statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ ...s.context, performanceId: next.id, visited: [...new Set([...s.context.visited, next.id])] }), s.event.id));
      } else {
        requireRule(!next && performances.every((p) => s.context.visited.includes(p.id)), 'Finish every scheduled song before discussion.');
        for (const r of rounds) statements.push(...guard(db, stmt(db, 'UPDATE live_rounds SET phase = ?, version = version + 1 WHERE id = ? AND generation = ? AND phase = ?', 'discussion', r.id, r.generation, 'dancing')));
      }
    } else if (input.action === 'submit') {
      if (s.event.role !== 'judge') throw new LiveError(403, 'Use a judge link to submit.');
      const block = s.setup.blocks.find((b) => b.id === input.blockId);
      requireRule(block, 'Unknown judging block.');
      const versions = record(input.ballotVersions);
      const assigned = block.roundIds.map((id) => s.rounds.find((r) => r.id === id)).filter((r): r is RoundView => Boolean(r?.definition.judgeIds.includes(s.event.judge_id!)));
      requireRule(assigned.length, 'No assigned rounds in this block.');
      const submittedIds: string[] = [];
      for (const r of assigned) {
        const existing = s.submissions.find((sub) => sub.roundKey === r.key && sub.judgeId === s.event.judge_id);
        if (existing) { submittedIds.push(existing.id); continue; }
        requireRule(r.phase === 'discussion', 'Submit after the whole block has finished dancing.');
        const ballot = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === s.event.judge_id)!;
        if (versions[r.key] !== ballot.version) throw new LiveError(409, 'Marks changed after review. Refresh and review the saved ballot.');
        requireRule(missingCells(r.definition, ballot.cells).length === 0, 'Complete every assigned mark before submitting the block.');
        const submissionId = uid(); submittedIds.push(submissionId);
        statements.push(...guard(db, stmt(db, 'UPDATE live_ballots SET locked = 1 WHERE round_key = ? AND judge_id = ? AND locked = 0 AND version = ?', r.key, s.event.judge_id, ballot.version)));
        statements.push(stmt(db, 'INSERT INTO live_submissions (id, event_id, round_key, judge_id, ballot_version, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', submissionId, s.event.id, r.key, s.event.judge_id, ballot.version, json(ballot.cells), now()));
      }
      response = { ok: true, submittedIds, wholeBlock: true };
    } else if (input.action === 'tie' || input.action === 'approve') {
      head(s);
      const r = currentRound(s, input.roundKey);
      const result = await standings(s, r);
      requireRule(r.phase === 'discussion' && result.complete, 'All required finalized ballots must be submitted before head review.');
      if (input.fingerprint !== result.fingerprint || input.roundVersion !== r.version) throw new LiveError(409, 'Submission or decision versions changed. Review them again.');
      if (input.action === 'tie') {
        const tie = result.ties.find((t) => t.key === input.tieKey);
        requireRule(tie && Array.isArray(input.order) && input.order.length === tie.subjectIds.length && new Set(input.order).size === tie.subjectIds.length && input.order.every((x) => tie.subjectIds.includes(String(x))), 'Decide the order only within this equal-average group.');
        const decision: TieDecision = { key: tie.key, order: input.order as string[], shared: input.shared === true, explanation: text(input.explanation, 'tie explanation', 500), decidedAt: now(), judgeId: s.event.judge_id!, role: 'head', fingerprint: result.fingerprint };
        statements.push(stmt(db, 'INSERT INTO live_tie_decisions (id, event_id, round_key, fingerprint, tie_key, decision) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(round_key, fingerprint, tie_key) DO UPDATE SET decision = excluded.decision', uid(), s.event.id, r.key, result.fingerprint, tie.key, json(decision)));
        statements.push(...guard(db, stmt(db, 'UPDATE live_rounds SET version = version + 1 WHERE id = ? AND generation = ? AND version = ? AND phase = ?', r.id, r.generation, r.version, 'discussion')));
      } else {
        requireRule(result.rows.every((row) => row.decided), 'Decide every tied group before approval, including an explicit shared-place decision.');
        statements.push(...guard(db, stmt(db, 'UPDATE live_rounds SET phase = ?, version = version + 1 WHERE id = ? AND generation = ? AND version = ? AND phase = ?', 'approved', r.id, r.generation, r.version, 'discussion')));
        statements.push(stmt(db, 'INSERT INTO live_approvals (id, event_id, round_key, fingerprint, snapshot, created_at, judge_id) VALUES (?, ?, ?, ?, ?, ?, ?)', uid(), s.event.id, r.key, result.fingerprint, json({ rows: result.rows, decisions: result.decisions, submissionIds: s.submissions.filter((sub) => sub.roundKey === r.key).map((sub) => sub.id), role: 'head' }), now(), s.event.judge_id!));
      }
    } else if (input.action === 'reopen') {
      if (s.event.role !== 'organizer') head(s);
      const r = currentRound(s, input.roundKey);
      requireRule(r.phase === 'discussion' || r.phase === 'approved', 'Reopen only a reviewed round.');
      const reason = text(input.reason, 'correction reason', 500, true);
      statements.push(...versionStatements(db, s, r.definition, r.generation + 1, reason, 'discussion'));
      for (const finals of s.rounds.filter((f) => f.definition.prelimRoundId === r.id)) statements.push(...versionStatements(db, s, finals.definition, finals.generation + 1, `Prelims reopened: ${reason}`, 'setup'));
      statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ ...s.context, blockId: r.definition.blockId, performanceId: r.definition.heats[0].songs[0].id }), s.event.id));
    } else if (input.action === 'replace-link' || input.action === 'revoke-link') {
      organizer(s); const judge = s.setup.judges.find((j) => j.id === input.judgeId); requireRule(judge, 'Unknown judge.');
      statements.push(stmt(db, 'UPDATE live_links SET revoked = 1 WHERE event_id = ? AND judge_id = ?', s.event.id, judge.id));
      if (input.action === 'replace-link') statements.push((await newLink(db, s.event.id, 'judge', judge.id, judge.name)).statement);
    } else if (input.action === 'archive') {
      organizer(s); statements.push(stmt(db, 'UPDATE live_events SET status = ? WHERE id = ?', 'archived', s.event.id));
    } else throw new LiveError(400, 'Unknown live judging action.');
  }
  statements.push(stmt(db, 'INSERT INTO live_receipts (id, event_id, input_hash, response) VALUES (?, ?, ?, ?)', receiptId, s.event.id, inputHash, json(response)));
  try { await batch(db, statements); }
  catch (error) {
    const retry = await stmt(db, 'SELECT response FROM live_receipts WHERE id = ? AND input_hash = ?', receiptId, inputHash).first<{ response: string }>();
    if (retry) return parse(retry.response);
    if (input.action === 'save-cell' && error instanceof LiveError && error.status === 409) {
      const latest = await load(db, codeHash);
      const cell = latest.ballots.find((b) => b.roundKey === input.roundKey && b.judgeId === s.event.judge_id)?.cells[cellKey(String(input.performanceId), String(input.subjectId))];
      throw new LiveError(409, error.message, { cell });
    }
    throw error;
  }
  return response;
}
