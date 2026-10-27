import { deliveryAcknowledgement, confirmsDelivery, readDeliveryReceipt, type DeliveryEnvelope } from './delivery-ack.ts';
import { adminAcknowledgement } from './admin-ack.ts';
import { resultAudit } from './result-audit.ts';
import { cellKey, roundKey, type Cells, type EventSummary, type FrozenRound, type HeatSubmission, type LiveBallot, type LiveContext, type LiveSetup, type LiveSubmission, type LiveView, type ReviewRequest, type RoundView, type StageVote, type TieDecision } from './types.ts';
import { deriveStandings, missingCells, requiredCells, LIVE_MARKS } from './scoring.ts';
import { finalistLimitIssues, finalistCountIssues, freezeRound, id, integer, LiveError, record, requireRule, text, validateSetup } from './validation.ts';
import { populateFinalists } from './finalists.ts';
import { applyEligibility, validatePairingPlan, withdrawalBoundary } from './eligibility.ts';
import { buildPublicSnapshot, publicId, latestPublications, type PublicationRecord } from './publication.ts';
import { advancement, deriveStageStandings, heatSnapshot, latestHeatSubmissions, missingHeatSubjects } from './stage.ts';

type EventRow = { id: string; version: number; setup: string; context: string; status: 'active' | 'archived'; restored_history: string | null; link_id: string; role: 'organizer' | 'judge'; judge_id: string | null };
type RoundRow = { id: string; generation: number; version: number; phase: RoundView['phase']; definition: string };
type BallotRow = { round_key: string; judge_id: string; version: number; cells: string; locked: number };
type SubmissionRow = { id: string; round_key: string; judge_id: string; ballot_version: number; snapshot: string; created_at: string };
type DecisionRow = { round_key: string; fingerprint: string; decision: string };
type ApprovalRow = { id: string; judge_id?: string; round_key: string; fingerprint: string; created_at: string; snapshot: string };
type Snapshot = { event: EventRow; setup: LiveSetup; context: LiveContext; rounds: RoundView[]; historyRounds: { key: string; definition: FrozenRound }[]; ballots: LiveBallot[]; submissions: LiveSubmission[]; decisions: DecisionRow[]; approvals: ApprovalRow[]; heatSubmissions: HeatSubmission[]; requests: ReviewRequest[]; votes: StageVote[]; publications: PublicationRecord[] };

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
    stmt(db, 'SELECT data FROM live_publication_snapshots WHERE event_id = ?', event.id),
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
  for (const r of rounds) r.definition = applyEligibility(r.definition, requests);
  return { historyRounds: (result[1].results as unknown as RoundRow[]).map((r) => ({ key: roundKey(r.id, r.generation), definition: parse<FrozenRound>(r.definition) })), publications: (result[9].results as unknown as { data: string }[]).map((r) => parse<PublicationRecord>(r.data)), event: current, setup, context: parse<LiveContext>(current.context), rounds, ballots, submissions, decisions: result[4].results as unknown as DecisionRow[], approvals: result[5].results as unknown as ApprovalRow[], heatSubmissions, requests, votes };
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
    const finals = s.setup.rounds.find((f) => f.prelimRoundId === r.id);
    const finalistCount = finals?.finalistCount ?? 0;
    const prelimKey = s.rounds.find((pre) => pre.id === r.definition.prelimRoundId)?.key;
    const fingerprint = await hash(json({ round: r.key, head: s.setup.headJudgeId, finalistCount, ...(finals?.advancementRevision ? { advancementRevision: finals.advancementRevision } : {}), submissions: latest.map((sub) => [sub.heatId, sub.judgeId, sub.id, sub.version]).sort(), prelimSources: prelimKey ? latestHeatSubmissions(s.heatSubmissions).filter((sub) => sub.roundKey === prelimKey).map((sub) => [sub.id, sub.version]).sort() : [], withdrawals: s.requests.filter((q) => q.kind === 'withdrawal' && q.appliedAt && (!q.payload.competitionId || q.payload.competitionId === r.definition.competitionId) && (q.payload.sourceStage !== 'finals' || r.definition.kind === 'finals')).map((q) => q.id).sort() }));
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
  return { ...round, judges:round.judges.map((j)=>({id:j.id,name:j.name})), heats: round.heats.map((heat) => ({ ...heat, songs: heat.songs.filter((p) => s.context.stageSubmission || s.context.visited.includes(p.id)).map((p) => ({ ...p, notes: '' })) })) };
}
// Older approved events can expose an empty unopened Finals roster without a read-side write.
async function preparedFinals(s: Snapshot) {
  let setup = s.setup;
  for (const r of s.rounds.filter((r) => r.definition.kind === 'prelims' && r.phase === 'approved')) {
    const empty = setup.rounds.filter((f) => f.prelimRoundId === r.id && !f.finalistIds.length).map((f) => f.id);
    if (!empty.length) continue;
    const result = await standings(s, r);
    if (result.approved && 'advancingIds' in result) setup = populateFinalists(setup, r.definition, result.advancingIds, setup.rounds.filter((f) => !empty.includes(f.id) || s.rounds.some((x) => x.id === f.id && x.phase !== 'setup')).map((f) => f.id));
  }
  return setup;
}
async function view(db: D1Database, s: Snapshot): Promise<LiveView> {
  const isOrganizer = s.event.role === 'organizer';
  const isHead = s.event.judge_id === s.setup.headJudgeId && s.event.role === 'judge';
  const visible = isOrganizer ? s.rounds : s.rounds.filter((r) => r.phase !== 'setup' && r.definition.judgeIds.includes(s.event.judge_id!));
  const rounds: RoundView[] = await Promise.all(visible.map(async (r) => {
    const base = { ...r, definition: isOrganizer ? r.definition : safeDefinition(s, r.definition) };
    if (s.setup.workflow === 'stage-v1') {
      const reviewed = ['discussion', 'approved'].includes(r.phase);
      const latest = latestHeatSubmissions(s.heatSubmissions).filter((sub) => sub.roundKey === r.key);
      const draftProgress = isOrganizer || isHead ? r.definition.judgeIds.map((judgeId) => { const b = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === judgeId); return { judgeId, missing: r.definition.heats.map((h) => ({ heatId: h.id, subjectIds: missingHeatSubjects(h, latest.find((sub) => sub.heatId === h.id && sub.judgeId === judgeId)?.cells ?? b?.cells ?? {}) })), filled: r.definition.heats.reduce((n, h) => n + h.subjectIds.filter((id)=>!h.withdrawnIds?.includes(id)).length - missingHeatSubjects(h, b?.cells ?? {}).length, 0), required: r.definition.subjects.filter((s)=>!r.definition.withdrawnIds?.includes(s.id)).length, ballotVersion: b?.version ?? 0, locked: r.definition.heats.every((h) => latest.some((sub) => sub.heatId === h.id && sub.judgeId === judgeId)) }; }) : undefined;
      const liveScores = isOrganizer ? r.definition.heats.flatMap((heat) => r.definition.judgeIds.map((judgeId) => {
        const ballot = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === judgeId);
        const submitted = latest.find((sub) => sub.heatId === heat.id && sub.judgeId === judgeId);
        const cells = submitted?.cells ?? ballot?.cells ?? {};
        const marks = Object.fromEntries(heat.songs.filter((song) => s.context.stageSubmission || s.context.visited.includes(song.id)).flatMap((song) => heat.subjectIds.flatMap((subjectId) => {
          const key = cellKey(song.id, subjectId);
          return cells[key] ? [[key, cells[key].mark]] : [];
        })));
        return { heatId: heat.id, judgeId, ballotVersion: submitted?.ballotVersion ?? ballot?.version ?? 0, submissionVersion: submitted?.version ?? 0, marks };
      })) : undefined;
      return { ...base, draftProgress, ...(isOrganizer ? { liveScores } : {}), ...(reviewed ? { standings: await standings(s, r), submittedMarks: latest.flatMap((sub) => Object.entries(sub.cells).map(([key, cell]) => ({ judgeId: sub.judgeId, performanceId: key.split(':')[0], subjectId: key.split(':')[1], mark: cell.mark }))) } : {}) };
    }
    if (!isOrganizer && !isHead) return base;
    const submitted = s.submissions.filter((item) => item.roundKey === r.key);
    const draftProgress = r.definition.judgeIds.map((judgeId) => { const b = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === judgeId); return { judgeId, filled: requiredCells(r.definition).filter((c) => b?.cells[c.key]?.mark).length, required: requiredCells(r.definition).length, ballotVersion: b?.version ?? 0, savedAt: b ? Object.values(b.cells).map((c) => c.savedAt ?? '').sort().at(-1) || undefined : undefined, locked: b?.locked ?? false }; });
    return { ...base, standings: await standings(s, r), draftProgress, submissions: submitted.map((sub) => ({ id: sub.id, roundKey: sub.roundKey, judgeId: sub.judgeId, ballotVersion: sub.ballotVersion, createdAt: sub.createdAt })),
      submittedMarks: submitted.flatMap((submission) => requiredCells(r.definition).map((c) => ({ judgeId: submission.judgeId, performanceId: c.performanceId, subjectId: c.subjectId, mark: submission.cells[c.key]?.mark ?? '' }))) };
  }));
  const setup: LiveSetup = isOrganizer ? await preparedFinals(s) : { name: s.setup.name, venue: s.setup.venue, date: s.setup.date, workflow: s.setup.workflow, headJudgeId: s.setup.headJudgeId, judges: s.setup.judges.filter((j) => j.id === s.event.judge_id || rounds.some((r) => r.definition.judgeIds.includes(j.id))).map((j) => ({ id: j.id, name: j.name })), competitions: s.setup.competitions.filter((c) => rounds.some((r) => r.definition.competitionId === c.id)), rounds: rounds.filter((r) => r.phase !== 'setup').map((r) => r.definition), blocks: s.setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => rounds.some((r) => r.id === id && r.phase !== 'setup')) })).filter((b) => b.roundIds.length) };
  const ballots = s.ballots.filter((b) => !isOrganizer && b.judgeId === s.event.judge_id && rounds.some((r) => r.key === b.roundKey && r.phase !== 'setup')).map((b) => ({ ...b, cells: Object.fromEntries(Object.entries(b.cells).filter(([key]) => s.context.stageSubmission || s.context.visited.includes(key.split(':')[0]))) }));
  const payload: LiveView = { eventId: s.event.id, version: s.event.version, status: s.event.status, setup, context: s.context,
    role: isOrganizer ? 'organizer' : isHead ? 'head' : 'judge', judgeId: s.event.judge_id, rounds, ballots };
  if (s.setup.workflow === 'stage-v1') {
    payload.heatSubmissions = latestHeatSubmissions(s.heatSubmissions).filter((sub) => isOrganizer || isHead || sub.judgeId === s.event.judge_id).map((sub) => ({ id: sub.id, roundKey: sub.roundKey, heatId: sub.heatId, judgeId: sub.judgeId, version: sub.version, ballotVersion: sub.ballotVersion, supersedes: sub.supersedes, createdAt: sub.createdAt, acknowledgedAt: sub.acknowledgedAt }));
    payload.reviewRequests = s.requests.filter((q) => (isOrganizer || isHead || q.payload.judgeId === s.event.judge_id || q.kind === 'withdrawal' && rounds.some((r) => r.definition.competitionId === q.payload.competitionId)) && !s.requests.some((newer) => newer.id === q.id && newer.version > q.version)).map((q)=>isOrganizer ? q : {...q,requester:'Organizer',approvals:q.approvals.map((a)=>({...a,participantId:a.role==='organizer'?'Organizer':'Head judge'}))});
  }
  if (isOrganizer) {
    if (s.setup.workflow === 'stage-v1') payload.resultAudit = resultAudit({ ...s, rounds });
    payload.publications = s.publications;
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

async function stageOpening(db: D1Database, s: Snapshot, kind: unknown, stageSubmission: boolean) {
  distinctPanel(s);
  const statements: D1PreparedStatement[] = [];
  const block = s.setup.blocks.find((b) => b.kind === kind);
  requireRule(block?.roundIds.length, 'Add competitions and save the stage setup first.');
  requireRule(!s.rounds.some((r) => ['dancing', 'discussion'].includes(r.phase)), 'Finish review and approve the current stage first.');
  const prepared = kind === 'finals' ? await preparedFinals(s) : s.setup;
  if (prepared !== s.setup) statements.push(stmt(db, 'UPDATE live_events SET setup = ? WHERE id = ?', json(prepared), s.event.id));
  let first = '';
  for (const rid of block.roundIds) {
    const definition = applyEligibility(freezeRound(prepared, prepared.rounds.find((r) => r.id === rid)!),s.requests);
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
  statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ automaticStages: s.context.automaticStages, blockId: block.id, performanceId: first, visited: stageSubmission ? s.context.visited : [...s.context.visited, first], lineupHeatId: null, stageSubmission, stageReviewOpen: false }), s.event.id));
  return statements;
}

async function stageMutation(db: D1Database, s: Snapshot, codeHash: string, input: Record<string, unknown>) {
  distinctPanel(s);
  const statements: D1PreparedStatement[] = [];
  let response: Record<string, unknown> = { ok: true };
  if (input.action === 'open-stage') {
    organizer(s);
    statements.push(...await stageOpening(db, s, input.kind, input.submissionMode !== 'heat'));
  } else if (['enable-stage-submission', 'open-stage-review', 'record-performance'].includes(String(input.action))) {
    organizer(s);
    const { rounds } = stageOrder(s);
    requireRule(rounds.length && rounds.every((r) => r.phase === 'dancing'), 'Choose an open stage.');
    requireRule(!s.context.stageReviewOpen, 'Stage review is already open.');
    const songs = rounds.flatMap((r) => r.definition.heats.flatMap((h) => h.songs));
    if (input.action === 'record-performance') requireRule(s.context.stageSubmission && songs.some((p) => p.id === input.performanceId), 'Choose a song in this stage.');
    statements.push(...guard(db, stmt(db, 'UPDATE live_events SET context = context WHERE id = ? AND context = ?', s.event.id, json(s.context))));
    const review = input.action === 'open-stage-review';
    if (review) requireRule(input.acknowledged === true, 'Confirm that the scheduled stage dancing is complete before opening review.');
    const performed = review ? songs.map((p) => p.id) : input.action === 'record-performance' ? [String(input.performanceId)] : [];
    statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ ...s.context, stageSubmission: true, stageReviewOpen: review, lineupHeatId: null, visited: [...new Set([...s.context.visited, ...performed])] }), s.event.id));
    // An existing stage may already have all its immutable heat snapshots.
    if (review && rounds.every((r) => r.definition.heats.every((h) => r.definition.judgeIds.every((j) => s.heatSubmissions.some((sub) => sub.roundKey === r.key && sub.heatId === h.id && sub.judgeId === j))))) {
      for (const r of rounds) statements.push(stmt(db, "UPDATE live_rounds SET phase = 'discussion', version = version + 1 WHERE id = ? AND generation = ?", r.id, r.generation));
    }
  } else if (input.action === 'submit-stage') {
    if (s.event.role !== 'judge' || !s.event.judge_id) throw new LiveError(403, 'Only an assigned judge can submit a stage.');
    requireRule(s.context.stageSubmission && input.blockId === s.context.blockId, 'Choose your current assigned stage.');
    const { rounds } = stageOrder(s), judgeId = s.event.judge_id;
    const assigned = rounds.filter((r) => r.definition.judgeIds.includes(judgeId));
    requireRule(assigned.length, 'No assigned rounds in this stage.');
    const latest = latestHeatSubmissions(s.heatSubmissions);
    const submittedIds: string[] = [];
    const outstanding = assigned.filter((r) => r.definition.heats.some((h) => !latest.some((sub) => sub.roundKey === r.key && sub.heatId === h.id && sub.judgeId === judgeId)));
    if (!outstanding.length) return { statements, response: { ok: true, wholeStage: true, acknowledged: true, submittedIds: latest.filter((sub) => sub.judgeId === judgeId && assigned.some((r) => r.key === sub.roundKey)).map((sub) => sub.id) } };
    requireRule(input.acknowledged === true, 'Acknowledge your checked bibs and marks for the entire stage.');
    if (input.expectedVersion !== s.event.version) throw new LiveError(409, 'Stage or eligibility changed. Review and acknowledge the stage again.');
    const versions = record(input.ballotVersions), roundVersions = record(input.roundVersions);
    for (const r of assigned) {
      requireRule(r.phase === 'dancing', 'This stage is locked for results review.');
      const ballot = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === judgeId)!;
      if (versions[r.key] !== ballot.version || roundVersions[r.key] !== r.version) throw new LiveError(409, 'Saved marks or assignments changed. Review the entire stage again.');
      for (const heat of r.definition.heats) {
        const prior = latest.find((sub) => sub.roundKey === r.key && sub.heatId === heat.id && sub.judgeId === judgeId);
        const missing = missingHeatSubjects(heat, prior?.cells ?? ballot.cells);
        requireRule(!missing.length, `${r.definition.format} · ${r.definition.division} · ${heat.name}: score each assigned entrant at least once. Missing bibs: ${missing.map((id) => r.definition.subjects.find((s) => s.id === id)!.number).join(', ')}.`);
        if (prior) { submittedIds.push(prior.id); continue; }
        const sub: HeatSubmission = { id: uid(), roundKey: r.key, heatId: heat.id, judgeId, ballotVersion: ballot.version, version: 1, cells: heatSnapshot(heat, ballot.cells), createdAt: now(), acknowledgedAt: now() };
        submittedIds.push(sub.id); statements.push(heatInsert(db, s, sub));
      }
      // Every guard and every heat snapshot belongs to the same D1 batch. A failed
      // version, role or stage check rolls back all snapshots and locks together.
      statements.push(...guard(db, stmt(db, `UPDATE live_ballots SET locked = 1, version = version + 1 WHERE round_key = ? AND judge_id = ? AND version = ? AND locked = 0 AND EXISTS (SELECT 1 FROM live_rounds WHERE id = ? AND generation = ? AND version = ? AND phase = 'dancing') AND EXISTS (SELECT 1 FROM live_events WHERE id = ? AND version = ? AND status = 'active') AND EXISTS (SELECT 1 FROM live_links WHERE code_hash = ? AND revoked = 0)`, r.key, judgeId, ballot.version, r.id, r.generation, r.version, s.event.id, s.event.version, codeHash)));
    }
    // A judge submits only after finishing their scheduled dancing. Protect even
    // unmarked songs in that assignment without overwriting concurrent observations.
    for (const song of assigned.flatMap((r) => r.definition.heats.flatMap((h) => h.songs))) statements.push(stmt(db, `UPDATE live_events SET context = json_insert(context, '$.visited[#]', ?) WHERE id = ? AND NOT EXISTS (SELECT 1 FROM json_each(json_extract(context, '$.visited')) WHERE value = ?)`, song.id, s.event.id, song.id));
    // SQL checks the post-insert state, including concurrent submissions by other judges.
    // Results become visible for the whole stage together, never one division early.
    const required = rounds.flatMap((r) => r.definition.heats.flatMap((h) => r.definition.judgeIds.map((j) => ({ r, h, j }))));
    const complete = `NOT EXISTS (SELECT 1 FROM json_each(?) AS needed WHERE NOT EXISTS (SELECT 1 FROM live_heat_submissions sub WHERE sub.round_key = json_extract(needed.value, '$[0]') AND sub.heat_id = json_extract(needed.value, '$[1]') AND sub.judge_id = json_extract(needed.value, '$[2]')))`;
    const values = [json(required.map(({ r, h, j }) => [r.key, h.id, j]))];
    for (const r of rounds) statements.push(stmt(db, `UPDATE live_rounds SET phase = 'discussion', version = version + 1 WHERE id = ? AND generation = ? AND phase = 'dancing' AND ${complete}`, r.id, r.generation, ...values));
    response = { ok: true, wholeStage: true, acknowledged: true, submittedIds };
  } else if (['next', 'lineup', 'conclude-stage'].includes(String(input.action))) {
    requireRule(!s.context.stageSubmission, 'Use stage review; songs and heats are already available.');
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
    requireRule(!s.context.stageSubmission, 'Submit the entire stage after reviewing every assigned heat.');
    if (s.event.role !== 'judge' || !s.event.judge_id) throw new LiveError(403, 'Only an assigned judge can submit a heat.');
    const r = currentRound(s, input.roundKey), heat = r.definition.heats.find((h) => h.id === input.heatId);
    requireRule(heat && r.definition.judgeIds.includes(s.event.judge_id), 'This heat is outside your assignment.');
    const existing = latestHeatSubmissions(s.heatSubmissions).find((sub) => sub.roundKey === r.key && sub.heatId === heat.id && sub.judgeId === s.event.judge_id);
    if (existing) return { statements, response: { ok: true, submittedId: existing.id, acknowledged: true } };
    requireRule(input.acknowledged === true, 'Acknowledge that you checked this heat’s bibs and song marks before final submission.');
    if (input.expectedVersion !== s.event.version) throw new LiveError(409, 'Eligibility or room context changed after review. Review and acknowledge this heat again.');
    requireRule(r.phase === 'dancing' && s.context.lineupHeatId === heat.id && heat.songs.every((p) => s.context.visited.includes(p.id)), 'Submit at this heat’s lineup check after all its songs.');
    const ballot = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === s.event.judge_id)!;
    if (input.ballotVersion !== ballot.version) throw new LiveError(409, 'Saved marks changed after review. Refresh and review this heat again.');
    const missing = missingHeatSubjects(heat, ballot.cells);
    requireRule(!missing.length, `Score each assigned entrant at least once across this heat. Uncovered bibs: ${missing.map((id) => r.definition.subjects.find((s) => s.id === id)!.number).join(', ')}.`);
    const sub: HeatSubmission = { id: uid(), roundKey: r.key, heatId: heat.id, judgeId: s.event.judge_id, ballotVersion: ballot.version, version: 1, cells: heatSnapshot(heat, ballot.cells), createdAt: now(), acknowledgedAt: now() };
    statements.push(...guard(db, stmt(db, "UPDATE live_ballots SET version = version + 1 WHERE round_key = ? AND judge_id = ? AND version = ? AND locked = 0 AND NOT EXISTS (SELECT 1 FROM live_heat_submissions WHERE round_key = ? AND heat_id = ? AND judge_id = ?) AND EXISTS (SELECT 1 FROM live_rounds WHERE id = ? AND generation = ? AND phase = 'dancing') AND EXISTS (SELECT 1 FROM live_links WHERE code_hash = ? AND revoked = 0) AND EXISTS (SELECT 1 FROM live_events WHERE id = ? AND status = 'active' AND json_extract(context, '$.lineupHeatId') = ? AND version = ?)", r.key, s.event.judge_id, ballot.version, r.key, heat.id, s.event.judge_id, r.id, r.generation, codeHash, s.event.id, heat.id, s.event.version)), heatInsert(db, s, sub));
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
      requireRule(!s.requests.some((q) => !q.appliedAt && !q.cancelledAt && q.kind === 'correction' && q.payload.roundKey === r.key && !s.requests.some((newer) => newer.id === q.id && newer.version > q.version)), 'Resolve pending correction requests before approval.');
      if (r.definition.kind === 'prelims') {
        const countIssues = finalistCountIssues(r.definition.format, 'finalistCount' in result ? result.finalistCount : 0, r.definition.subjects.filter((subject) => !r.definition.withdrawnIds?.includes(subject.id)));
        requireRule(!countIssues.length, countIssues[0]);
        requireRule('advancementTies' in result && result.advancementTies.every((t) => t.complete), 'Every required judge must vote and advancement deadlocks need a head decision.');
      } else {
        const prelim = s.rounds.find((p) => p.id === r.definition.prelimRoundId);
        const pre = prelim && await standings(s, prelim);
        requireRule(pre?.approved && 'advancingIds' in pre && r.definition.finalistIds.length === pre.advancingIds.length && r.definition.finalistIds.every((id) => pre.advancingIds.includes(id)), 'Dependent advancement changed. Review the prelims and finalist identities before finals approval.');
        requireRule(result.rows.every((row) => row.decided), 'Decide all finals placement ties explicitly.');
      }
      if (r.definition.kind === 'prelims' && 'advancingIds' in result) {
        const prepared = populateFinalists(s.setup, r.definition, result.advancingIds, s.rounds.filter((x) => x.phase !== 'setup').map((x) => x.id));
        statements.push(stmt(db, 'UPDATE live_events SET setup = ? WHERE id = ?', json(prepared), s.event.id));
      }
      statements.push(stmt(db, 'INSERT INTO live_approvals (id, event_id, round_key, fingerprint, snapshot, created_at, judge_id) VALUES (?, ?, ?, ?, ?, ?, ?)', uid(), s.event.id, r.key, result.fingerprint, json({ rows: result.rows, decisions: result.decisions, ...('advancingIds' in result ? { advancingIds: result.advancingIds, votes: result.advancementTies } : {}), role: 'head' }), now(), s.event.judge_id!));
    }
    statements.push(...guard(db, stmt(db, 'UPDATE live_rounds SET phase = ?, version = version + 1 WHERE id = ? AND generation = ? AND version = ? AND phase = ?', input.action === 'approve' ? 'approved' : 'discussion', r.id, r.generation, r.version, 'discussion')));
  } else if (input.action === 'request-correction' || input.action === 'request-withdrawal') {
    organizer(s);
    const reason = text(input.reason, 'genuine-error / withdrawal reason', 500, true);
    const prior = input.reviewRequestId ? s.requests.filter((q) => q.id === input.reviewRequestId).sort((a, b) => b.version - a.version)[0] : undefined;
    if (input.reviewRequestId) requireRule(prior && !prior.appliedAt && !prior.cancelledAt && prior.requester === participant(s), 'Only the original requester can revise a pending request.');
    const q: ReviewRequest = { id: prior?.id ?? uid(), kind: input.action === 'request-correction' ? 'correction' : 'withdrawal', version: (prior?.version ?? 0) + 1, payload: {}, reason, requester: participant(s), createdAt: now(), approvals: [] };
    requireRule(!prior || prior.kind === q.kind, 'A request revision must retain its request type.');
    if (q.kind === 'correction') {
      const r = currentRound(s, input.roundKey), heat = r.definition.heats.find((h) => h.id === input.heatId);
      requireRule(heat && ['discussion', 'approved'].includes(r.phase), 'Request genuine recording errors during stage review.');
      const sub = latestHeatSubmissions(s.heatSubmissions).find((sub) => sub.roundKey === r.key && sub.heatId === heat.id && sub.judgeId === input.judgeId);
      requireRule(sub && sub.id === input.submissionId, 'Use the exact current submitted heat version.');
      requireRule(Array.isArray(input.changes) && input.changes.length > 0 && input.changes.length <= 10, 'Identify the exact recording-error cells.');
      const changes = input.changes.map((value) => {
        const c = record(value), key = cellKey(id(c.performanceId), id(c.subjectId));
        requireRule(key in sub.cells && (c.after === '' || LIVE_MARKS.includes(c.after as typeof LIVE_MARKS[number])) && sub.cells[key].mark !== c.after, 'Choose a changed mark in this submitted heat.');
        return { performanceId: String(c.performanceId), subjectId: String(c.subjectId), before: sub.cells[key].mark, after: c.after as typeof sub.cells[string]['mark'] };
      });
      requireRule(new Set(changes.map((c) => cellKey(c.performanceId, c.subjectId))).size === changes.length, 'Do not repeat a correction cell.');
      requireRule(changes.every((c) => c.before !== '' || c.after === '' || changes.some((other) => other.performanceId === c.performanceId && other.subjectId !== c.subjectId && other.before === c.after && other.after !== other.before)), 'A blank cannot become an invented observation; identify the recorded source of a mistaken-bib transfer.');
      const corrected = structuredClone(sub.cells); for (const c of changes) corrected[cellKey(c.performanceId, c.subjectId)].mark = c.after;
      requireRule(!missingHeatSubjects(heat, corrected).length, 'An amendment cannot leave an entrant uncovered or guess a missing observation.');
      q.payload = { roundKey: r.key, heatId: heat.id, judgeId: sub.judgeId, submissionId: sub.id, changes };
    } else {
      organizer(s); requireRule(s.setup.competitions.some((c) => c.id === input.competitionId) && s.rounds.some((r) => r.definition.competitionId === input.competitionId), 'Use preparation removal for an unstarted competition.');
      q.payload = { competitionId: String(input.competitionId) };
      if (input.subjectId) {
        const r = currentRound(s, input.roundKey), subjectId = id(input.subjectId);
        requireRule(r.definition.competitionId === input.competitionId && r.definition.subjects.some((subject) => subject.id === subjectId) && !r.definition.withdrawnIds?.includes(subjectId), 'Choose a current eligible entrant/couple in this competition.');
        q.payload = { competitionId: r.definition.competitionId, roundKey: r.key, subjectId, sourceStage:r.definition.kind, sourceBoundary: withdrawalBoundary(r.definition, s.context), pairingPlan: validatePairingPlan(r.definition, subjectId, s.context, input.pairingPlan) };
      }
    }
    statements.push(requestInsert(db, s, q)); response = { ok: true, reviewRequestId: q.id, requestVersion: q.version };
  } else if (input.action === 'cancel-request') {
    organizer(s);
    const q = s.requests.filter((q) => q.id === input.reviewRequestId).sort((a,b) => b.version-a.version)[0];
    requireRule(q && !q.appliedAt && !q.cancelledAt, 'Choose a pending request.');
    if (input.requestVersion !== q.version) throw new LiveError(409, 'The request changed. Review its current version.');
    const next = { ...q, version: q.version + 1, approvals: [], cancelledAt: now() };
    statements.push(requestInsert(db,s,next));
  } else if (input.action === 'approve-request') {
    const q = s.requests.filter((q) => q.id === input.reviewRequestId).sort((a, b) => b.version - a.version)[0];
    requireRule(q && !q.appliedAt && !q.cancelledAt, 'Choose a pending review request.');
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
      } else if (q.payload.subjectId) {
        const r = currentRound(s, q.payload.roundKey);
        if (withdrawalBoundary(r.definition, s.context) !== q.payload.sourceBoundary) throw new LiveError(409, 'Eligibility or danced pairings changed. Revise the exact withdrawal plan and renew both approvals.');
        validatePairingPlan(r.definition, q.payload.subjectId, s.context, q.payload.pairingPlan);
        statements.push(...guard(db, stmt(db, 'UPDATE live_events SET context = context WHERE id = ? AND context = ?', s.event.id, json(s.context))));
        const affected = s.rounds.filter((round) => round.definition.competitionId === r.definition.competitionId && (r.definition.kind !== 'finals' || round.definition.kind === 'finals'));
        // Preserve every original mark/submission. A version bump invalidates unsubmitted acknowledgements.
        for (const ballot of s.ballots.filter((b) => affected.some((r) => r.key === b.roundKey))) statements.push(...guard(db,stmt(db, 'UPDATE live_ballots SET version = version + 1 WHERE round_key = ? AND judge_id = ? AND version = ?', ballot.roundKey, ballot.judgeId, ballot.version)));
        statements.push(...invalidateReview(db,s,affected));
      } else {
        const competitionId = q.payload.competitionId, removed = new Set(s.setup.rounds.filter((r) => r.competitionId === competitionId).map((r) => r.id));
        requireRule(removed.size, 'This competition is already withdrawn.');
        const setup = { ...s.setup, competitions: s.setup.competitions.filter((c) => c.id !== competitionId), rounds: s.setup.rounds.filter((r) => !removed.has(r.id)), blocks: s.setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => !removed.has(id)) })) };
        statements.push(stmt(db, 'UPDATE live_events SET setup = ? WHERE id = ?', json(setup), s.event.id));
        statements.push(...invalidateReview(db, s, s.rounds.filter((r)=>r.definition.competitionId===competitionId)));
        if (s.context.stageSubmission) {
          const remaining = s.rounds.filter((r) => !removed.has(r.id) && r.definition.blockId === s.context.blockId);
          if (remaining.length && remaining.every((r) => r.definition.heats.every((h) => r.definition.judgeIds.every((j) => s.heatSubmissions.some((sub) => sub.roundKey === r.key && sub.heatId === h.id && sub.judgeId === j))))) {
            for (const r of remaining) statements.push(stmt(db, "UPDATE live_rounds SET phase = 'discussion', version = version + 1 WHERE id = ? AND generation = ? AND phase = 'dancing'", r.id, r.generation));
          }
        }
        const removedCurrent = s.rounds.some((r) => removed.has(r.id) && r.definition.heats.some((h) => h.songs.some((p) => p.id === s.context.performanceId)));
        if (removedCurrent) {
          const remaining = s.setup.blocks.find((b) => b.id === s.context.blockId)?.roundIds.filter((rid) => !removed.has(rid)).flatMap((rid) => {
            const r = s.rounds.find((r) => r.id === rid); return r?.definition.heats.map((h) => ({ r, h })) ?? [];
          }) ?? [];
          const latest = latestHeatSubmissions(s.heatSubmissions);
          const next = remaining.find(({ r, h }) => !h.songs.every((p) => s.context.visited.includes(p.id)) || !r.definition.judgeIds.every((j) => latest.some((sub) => sub.roundKey === r.key && sub.heatId === h.id && sub.judgeId === j))) ?? remaining.at(-1);
          const p = next?.h.songs.find((p) => !s.context.visited.includes(p.id)) ?? next?.h.songs.at(-1);
          statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ ...s.context, blockId: p ? s.context.blockId : null, performanceId: p?.id ?? null, lineupHeatId: next?.h.songs.every((p) => s.context.visited.includes(p.id)) ? next.h.id : null, visited: [...new Set([...s.context.visited, ...(!s.context.stageSubmission && p ? [p.id] : [])])] }), s.event.id));
        }
      }
      statements.push(...await invalidatePublication(db, s, q.payload.competitionId ?? s.rounds.find((r) => r.key === q.payload.roundKey)?.definition.competitionId));
    }
    statements.push(...guard(db, stmt(db, 'UPDATE live_review_requests SET data = ? WHERE request_id = ? AND version = ? AND data = ? AND NOT EXISTS (SELECT 1 FROM live_review_requests WHERE request_id = ? AND version > ?)', json(next), q.id, q.version, json(q), q.id, q.version)));
  } else throw new LiveError(400, 'Use the stage/heat controls. Legacy block submission and single-role reopening do not apply to this event.');
  return { statements, response };
}

async function advanceReadyStage(db: D1Database, codeHash: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await load(db, codeHash);
    if (s.setup.workflow !== 'stage-v1' || !s.context.automaticStages || s.event.status !== 'active' || s.rounds.some((r) => ['dancing', 'discussion'].includes(r.phase))) return;
    const kind = !s.rounds.some((r) => r.definition.kind === 'prelims' && r.phase !== 'setup') ? 'prelims' : !s.rounds.some((r) => r.definition.kind === 'finals' && r.phase !== 'setup') ? 'finals' : null;
    if (!kind) return;
    let opening: D1PreparedStatement[];
    try { opening = await stageOpening(db, s, kind, true); }
    catch (error) { if (error instanceof LiveError && error.status === 400) return; throw error; }
    try { await batch(db, [...eventGuard(db, s, codeHash, s.event.version), ...opening]); return; }
    catch (error) { if (!(error instanceof LiveError && error.status === 409)) throw error; }
  }
}

// Organizer catalog reads need no ballots, private notes or result computation.
export async function readEventSummary(db: D1Database, code: string): Promise<EventSummary> {
  const event = await stmt(db, 'SELECT e.id, e.version, e.status, e.setup, l.role FROM live_events e JOIN live_links l ON l.event_id = e.id WHERE l.code_hash = ? AND l.revoked = 0', await hash(code)).first<Pick<EventRow, 'id' | 'version' | 'status' | 'setup' | 'role'>>();
  if (!event || event.role !== 'organizer') throw new LiveError(403, 'An active organizer link is required to open this event.');
  const setup = parse<LiveSetup>(event.setup);
  return { eventId: event.id, version: event.version, status: event.status, name: setup.name, venue: setup.venue, date: setup.date, competitionCount: setup.competitions.length };
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
        submissions: s.submissions.map((sub) => ({ ...sub, cells: Object.fromEntries(Object.entries(sub.cells).map(([key, c]) => [key, { mark: c.mark }])) })), heatSubmissions: s.heatSubmissions.map((sub) => ({ ...sub, cells: Object.fromEntries(Object.entries(sub.cells).map(([key, c]) => [key, { mark: c.mark }])) })), reviewRequests: s.requests, publications: s.publications, votes: s.votes, decisions: s.decisions, approvals: s.approvals },
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
  if (input.action === 'reactivate') {
    organizer(s); requireRule(s.event.status === 'archived', 'This event is already active.');
    if (input.expectedVersion !== s.event.version) throw new LiveError(409, 'The event changed. Refresh before returning it to active events.');
    const response = { ok: true };
    const statements = guard(db, stmt(db, "UPDATE live_events SET status = 'active', version = version + 1 WHERE id = ? AND version = ? AND status = 'archived' AND EXISTS (SELECT 1 FROM live_links WHERE code_hash = ? AND role = 'organizer' AND revoked = 0)", s.event.id, s.event.version, codeHash));
    statements.push(stmt(db, 'INSERT INTO live_receipts (id, event_id, input_hash, response) VALUES (?, ?, ?, ?)', receiptId, s.event.id, inputHash, json(response)));
    try { await batch(db, statements); }
    catch (error) {
      const retry = await stmt(db, 'SELECT response FROM live_receipts WHERE id = ? AND input_hash = ?', receiptId, inputHash).first<{ response: string }>();
      if (retry) return parse(retry.response); throw error;
    }
    return response;
  }
  active(s);
  let statements: D1PreparedStatement[] = [];
  let response: Record<string, unknown> = { ok: true };
  if (input.action === 'save-cell') {
    if (!s.event.judge_id || s.event.role !== 'judge') throw new LiveError(403, 'Use your judge link to score.');
    const r = currentRound(s, input.roundKey);
    const performanceId = id(input.performanceId), subjectId = id(input.subjectId);
    const key = cellKey(performanceId, subjectId);
    requireRule(r.definition.judgeIds.includes(s.event.judge_id) && requiredCells(r.definition).some((c) => c.key === key) && (s.context.stageSubmission || s.context.visited.includes(performanceId)), 'This song/entrant is outside your assignment.');
    if (!['dancing', ...(s.setup.workflow === 'stage-v1' ? [] : ['discussion'])].includes(r.phase)) throw new LiveError(423, 'This ballot is locked. Ask for an explicit correction.');
    const heat = r.definition.heats.find((h) => h.songs.some((p) => p.id === performanceId))!;
    if(s.requests.some((q)=>q.appliedAt && q.payload.pairingPlan?.some((p)=>p.performanceId===performanceId))) requireRule(heat.songs.find((p)=>p.id===performanceId)?.partners.some((pair)=>pair.includes(subjectId)), 'This dancer is not scheduled in the approved pairing plan for this song.');
    requireRule(!r.definition.withdrawnIds?.includes(subjectId), 'This entrant/couple is withdrawn; retained marks are read only.');
    if (s.setup.workflow === 'stage-v1' && s.heatSubmissions.some((sub) => sub.roundKey === r.key && sub.heatId === heat.id && sub.judgeId === s.event.judge_id)) throw new LiveError(423, 'This submitted heat is locked. Request a genuine-error amendment.');
    requireRule(input.mark === '' || LIVE_MARKS.includes(input.mark as typeof LIVE_MARKS[number]), 'Invalid mark.');
    const ballot = s.ballots.find((b) => b.roundKey === r.key && b.judgeId === s.event.judge_id)!;
    const cell = { mark: input.mark, note: text(input.note, 'note', 2000), revision: integer(input.baseRevision) + 1, mutationId: requestId, savedAt: now() };
    if (ballot.locked) throw new LiveError(423, 'Finalized ballot is locked. Your pending edit is preserved.');
    if ((ballot.cells[key]?.revision ?? 0) !== input.baseRevision) throw new LiveError(409, 'Another device saved this entry. Compare your edit with the saved version.', { cell: ballot.cells[key] ?? { mark: '', note: '', revision: 0, mutationId: '' } });
    const path = `$."${key}"`;
    statements = guard(db, stmt(db, `UPDATE live_ballots SET cells = json_set(cells, ?, json(?)), version = version + 1 WHERE round_key = ? AND judge_id = ? AND locked = 0 AND COALESCE(json_extract(cells, ?), 0) = ? AND EXISTS (SELECT 1 FROM live_rounds WHERE id = ? AND generation = ? AND phase IN (${s.setup.workflow === 'stage-v1' ? "'dancing'" : "'dancing','discussion'"})) AND NOT EXISTS (SELECT 1 FROM live_heat_submissions WHERE round_key = ? AND heat_id = ? AND judge_id = ?) AND EXISTS (SELECT 1 FROM live_events WHERE id = ? AND status = 'active' AND version = ?) AND EXISTS (SELECT 1 FROM live_links WHERE code_hash = ? AND revoked = 0)`, path, json(cell), r.key, s.event.judge_id, `${path}.revision`, Number(input.baseRevision), r.id, r.generation, r.key, heat.id, s.event.judge_id, s.event.id, s.event.version, codeHash));
    if (s.context.stageSubmission && input.mark !== '' && !s.context.visited.includes(performanceId)) {
      // Availability never implies performance. The first recorded observation freezes
      // this song's partnerships, including against an already pending withdrawal.
      statements.push(stmt(db, `UPDATE live_events SET context = json_insert(context, '$.visited[#]', ?) WHERE id = ? AND NOT EXISTS (SELECT 1 FROM json_each(json_extract(context, '$.visited')) WHERE value = ?)`, performanceId, s.event.id, performanceId));
    }
    response = { cell, roundKey: r.key, performanceId, subjectId };
  } else {
    statements = ['submit-heat', 'submit-stage'].includes(String(input.action)) ? [] : eventGuard(db, s, codeHash, input.expectedVersion);
    if (input.action === 'enable-auto-stages') {
      organizer(s);
      requireRule(s.setup.workflow === 'stage-v1', 'Automatic stages require the stage workflow.');
      const stageRounds = s.rounds.filter((r) => r.definition.blockId === s.context.blockId && r.phase === 'dancing');
      statements.push(...guard(db, stmt(db, 'UPDATE live_events SET context = context WHERE id = ? AND context = ?', s.event.id, json(s.context))));
      statements.push(stmt(db, 'UPDATE live_events SET context = ? WHERE id = ?', json({ ...s.context, automaticStages: true, ...(stageRounds.length ? { stageSubmission: true, lineupHeatId: null } : {}) }), s.event.id));
      if (stageRounds.length && stageRounds.every((r) => r.definition.heats.every((h) => r.definition.judgeIds.every((j) => s.heatSubmissions.some((sub) => sub.roundKey === r.key && sub.heatId === h.id && sub.judgeId === j))))) for (const r of stageRounds) statements.push(stmt(db, "UPDATE live_rounds SET phase = 'discussion', version = version + 1 WHERE id = ? AND generation = ? AND phase = 'dancing'", r.id, r.generation));
    } else if (['prepare-publication','approve-publication','prepare-event-publication','approve-event-publication'].includes(String(input.action))) {
      const change = await publicationMutation(db, s, input); statements.push(...change.statements); response = change.response;
    } else if (s.setup.workflow === 'stage-v1' && input.action !== 'setup' && !['backup', 'replace-link', 'revoke-link', 'archive'].includes(String(input.action))) {
      const change = await stageMutation(db, s, codeHash, input);
      statements.push(...change.statements); response = change.response;
    } else if (input.action === 'setup') {
      organizer(s);
      const setup = validateSetup(input.setup);
      // Server-owned revision distinguishes renewed review even when a count returns to an earlier value.
      // Incoming revision fields are ignored by validateSetup; existing immutable approvals remain intact.
      if (setup.workflow === 'stage-v1') for (const finals of setup.rounds.filter((r) => r.kind === 'finals')) {
        const prior = s.setup.rounds.find((r) => r.id === finals.id);
        if (prior) {
          const revision = (prior.advancementRevision ?? 0) + Number(finals.finalistCount !== prior.finalistCount);
          if (revision) finals.advancementRevision = revision;
        }
      }

      const frozenChanged = s.rounds.some((r) => r.phase !== 'setup' && (json(s.setup.rounds.find((x) => x.id === r.id)) !== json(setup.rounds.find((x) => x.id === r.id)) || json(s.setup.blocks.find((b) => b.id === r.definition.blockId)) !== json(setup.blocks.find((b) => b.id === r.definition.blockId)) || json(s.setup.judges) !== json(setup.judges) || s.setup.headJudgeId !== setup.headJudgeId || s.setup.organizerParticipantId !== setup.organizerParticipantId || s.setup.separationAttested !== setup.separationAttested || json(s.setup.competitions.find((c) => c.id === r.definition.competitionId)) !== json(setup.competitions.find((c) => c.id === r.definition.competitionId))));
      if (frozenChanged && (s.setup.workflow === 'stage-v1' || input.correction !== true)) throw new LiveError(423, s.setup.workflow === 'stage-v1' ? 'Started stage assignments are frozen. Use a dual-approved amendment or withdrawal; setup cannot reopen submitted scores.' : 'Opened assignments are frozen. Use the explicit setup correction action.');
      if (s.rounds.length && s.setup.workflow !== setup.workflow) throw new LiveError(423, 'An existing event retains its original scoring workflow. Create a new event for the stage workflow.');
      const limitIssues = finalistLimitIssues(setup, Object.fromEntries(s.rounds.map((r) => [r.id, r.definition.withdrawnIds ?? []])));
      requireRule(!limitIssues.length, limitIssues[0]);
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
      if (setup.workflow === 'stage-v1' && (input.automaticStages !== undefined || s.context.automaticStages === undefined)) statements.push(stmt(db, "UPDATE live_events SET context = json_set(context, '$.automaticStages', json(?)) WHERE id = ?", json(input.automaticStages !== false), s.event.id));
      // Saving the same validated setup does not change the reviewed publication source.
      if (json(setup) !== json(s.setup)) statements.push(...await invalidatePublication(db, s));
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
        const definition = applyEligibility(freezeRound(s.setup, s.setup.rounds.find((r) => r.id === rid)!),s.requests);
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
  if (['setup', 'approve', 'approve-request', 'enable-auto-stages'].includes(String(input.action))) await advanceReadyStage(db, codeHash);
  return response;
}


function publicationWrite(db: D1Database, s: Snapshot, record: PublicationRecord) {
  return stmt(db,'INSERT INTO live_publication_snapshots (id,event_id,competition_id,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',record.id,s.event.id,record.competitionId,json(record));
}
function outboxWrite(db: D1Database, s: Snapshot, kind: string, payload: unknown) {
  return stmt(db,'INSERT INTO live_publication_outbox (id,event_id,kind,payload,created_at) VALUES (?,?,?,?,?)',uid(),s.event.id,kind,json(payload),now());
}
async function invalidatePublication(db: D1Database, s: Snapshot, competitionId?: string) {
  const statements: D1PreparedStatement[] = [];
  const bundled=(await stmt(db,"SELECT id,payload FROM live_publication_outbox WHERE event_id = ? AND kind = 'release-set' AND status = 'pending'",s.event.id).all<{id:string;payload:string}>()).results;
  const ids=new Set(s.publications.filter((p)=>!competitionId||p.competitionId===competitionId).map((p)=>p.id));
  for(const item of bundled){const members=parse<PublicationRecord[]>(item.payload);for(const member of members)ids.add(member.id);statements.push(stmt(db,"UPDATE live_publication_outbox SET status = 'stale' WHERE id = ? AND status = 'pending' AND payload = ?",item.id,item.payload));}
  for (const record of s.publications.filter((p) => ids.has(p.id))) {
    statements.push(...guard(db,stmt(db,'UPDATE live_publication_snapshots SET data = ? WHERE id = ? AND data = ?',json({ ...record, status: record.status === 'released' ? 'released' : 'stale', underReview: record.status === 'released' ? true : record.underReview }),record.id,json(record))));
    statements.push(stmt(db,"UPDATE live_publication_outbox SET status = 'stale' WHERE event_id = ? AND kind = 'release' AND json_extract(payload,'$.id') = ? AND status = 'pending'",s.event.id,record.id));
    if (record.status === 'released' || record.status === 'queued') statements.push(outboxWrite(db,s,'status',{ id: record.id, eventId: await publicId(s.event.id,s.event.id), competitionId: await publicId(s.event.id,record.competitionId), revision: record.revision, status: 'Under review' }));
  }
  return statements;
}
async function publicationMutation(db: D1Database, s: Snapshot, input: Record<string,unknown>) {
  organizer(s);
  const statements: D1PreparedStatement[] = [];
  if (input.action === 'prepare-event-publication') {
    requireRule(s.setup.competitions.length, 'Add a competition first.');
    for (const competition of s.setup.competitions) {
      const change = await publicationMutation(db, s, {action:'prepare-publication', competitionId:competition.id});
      statements.push(...change.statements);
    }
    return {statements, response:{ok:true}};
  }
  if (input.action === 'approve-event-publication') {
    const records = exactPublicationSet(s, input.publications);
    const currentView = await view(db,s);
    requireRule(records.some((p)=>p.status==='prepared'), 'These results have already been sent.');
    for (const item of records) {
      requireRule(['prepared','requested','released'].includes(item.status) && !item.underReview, 'Review the latest results for every competition before sending.');
      await currentPublication(currentView,item);
      if(item.status==='prepared') statements.push(publicationWrite(db,s,{...item,status:'requested',organizerApprovedAt:now()}));
    }
    return {statements,response:{ok:true}};
  }
  if (input.action === 'prepare-publication') {
    const unresolved=await stmt(db,"SELECT id FROM live_publication_outbox WHERE event_id = ? AND kind IN ('release','release-set') AND status = 'stale' LIMIT 1",s.event.id).first();
    requireRule(!unresolved,'Delivery status is unconfirmed. Ask the website admin to use Retry sending before preparing updated results.');
    const competitionId = id(input.competitionId), released = s.publications.filter((p) => p.competitionId === competitionId && p.status === 'released').sort((a,b)=>b.revision-a.revision)[0];
    const snapshot = await buildPublicSnapshot(await view(db,s),competitionId,(released?.revision ?? 0)+1,released?.id ?? null,now(),uid());
    // A reviewed historical release must not regain approvals when edited content returns.
    for(const existing of s.publications.filter((p)=>p.competitionId===competitionId && p.status!=='stale' && !p.underReview)) { const check=await buildPublicSnapshot(await view(db,s),competitionId,existing.revision,existing.snapshot.supersedes,existing.snapshot.preparedAt,existing.id); if(check.sourceFingerprint===existing.sourceFingerprint) return {statements,response:{publicationId:existing.id}}; }
    const record: PublicationRecord = { id: snapshot.id, competitionId, revision: snapshot.revision, sourceFingerprint: snapshot.sourceFingerprint, snapshot, status: 'prepared' };
    statements.push(publicationWrite(db,s,record)); return { statements,response: { publicationId: record.id } };
  }
  const record = s.publications.find((p)=>p.id===input.publicationId);
  requireRule(record && record.status === 'prepared' && input.sourceFingerprint === record.sourceFingerprint, 'Review an exact prepared snapshot before organizer approval.');
  const current = await buildPublicSnapshot(await view(db,s),record.competitionId,record.revision,record.snapshot.supersedes,record.snapshot.preparedAt,record.id);
  if (current.sourceFingerprint !== record.sourceFingerprint) throw new LiveError(409,'Displayed data or head-approved source changed. Prepare and review a new snapshot.');
  statements.push(publicationWrite(db,s,{ ...record,status:'requested',organizerApprovedAt:now() }));
  return { statements,response:{ ok:true } };
}
function exactPublicationSet(s:Snapshot, value:unknown) {
  requireRule(Array.isArray(value) && value.length===s.setup.competitions.length && value.length>0, 'Include the latest results for every competition in this event.');
  const latest=latestPublications(s.publications);
  const records=value.map((entry)=>{
    const item=record(entry), current=latest.find((p)=>p.id===item.publicationId);
    requireRule(current && current.sourceFingerprint===item.sourceFingerprint && s.setup.competitions.some((c)=>c.id===current.competitionId),'Results changed. Refresh and review the complete event.');
    return current;
  });
  requireRule(new Set(records.map((p)=>p.competitionId)).size===s.setup.competitions.length,'Include each competition exactly once.');
  return records;
}
async function currentPublication(currentView:LiveView, item:PublicationRecord) {
  const current=await buildPublicSnapshot(currentView,item.competitionId,item.revision,item.snapshot.supersedes,item.snapshot.preparedAt,item.id);
  if(current.sourceFingerprint!==item.sourceFingerprint) throw new LiveError(409,'Results changed. Renew the required approvals and review the new results.');
}
export type LocalPublisherConfig = { enabled: boolean; receiverUrl: string; receiverKey: string };
type DeliveryRow = {id:string;event_id:string;kind:string;payload:string;status:string};
async function reconcileDelivery(db:D1Database,item:DeliveryRow,config:LocalPublisherConfig) {
  try {
    const message={deliveryId:item.id,kind:item.kind,payload:parse(item.payload)} as DeliveryEnvelope;
    const expected=await deliveryAcknowledgement(message);
    const response=await fetch(config.receiverUrl+'/receive',{method:'POST',headers:{Authorization:`Bearer ${config.receiverKey}`,'Content-Type':'application/json','X-Publication-Receipt-Only':'1'},body:json(message),signal:AbortSignal.timeout(5000)});
    const present=await readDeliveryReceipt(response,expected);
    if(present===null)return null;
    const link=await stmt(db,"SELECT code_hash FROM live_links WHERE event_id = ? AND role = 'organizer' AND revoked = 0",item.event_id).first<{code_hash:string}>();
    if(!link)return null;
    const s=await load(db,link.code_hash);
    const statements=[...eventGuard(db,s,link.code_hash,s.event.version),...guard(db,stmt(db,"UPDATE live_publication_outbox SET status = ? WHERE id = ? AND event_id = ? AND kind = ? AND status = 'stale' AND payload = ?",present?'delivered':'cancelled',item.id,item.event_id,item.kind,item.payload))];
    if(present){
      const members=item.kind==='release-set'?parse<PublicationRecord[]>(item.payload):[parse<PublicationRecord>(item.payload)];
      const invalidDrafts=new Set<string>();
      for(const member of members){
        const original=s.publications.find((p)=>p.id===member.id);
        requireRule(original&&original.revision===member.revision&&original.sourceFingerprint===member.sourceFingerprint,'Stored publication identity changed.');
        const restored={...original,status:'released' as const,releasedAt:original.releasedAt??now(),underReview:true};
        statements.push(...guard(db,stmt(db,'UPDATE live_publication_snapshots SET data = ? WHERE id = ? AND data = ?',json(restored),original.id,json(original))));
        const notice=await stmt(db,"SELECT id FROM live_publication_outbox WHERE event_id = ? AND kind = 'status' AND status = 'pending' AND json_extract(payload,'$.id') = ?",s.event.id,original.id).first();
        if(!notice)statements.push(outboxWrite(db,s,'status',{id:original.id,eventId:original.snapshot.eventId,competitionId:original.snapshot.competitionId,revision:original.revision,status:'Under review'}));
        for(const draft of s.publications.filter((p)=>p.id!==original.id&&p.competitionId===original.competitionId&&p.revision<=original.revision&&p.status!=='released'))invalidDrafts.add(draft.id);
      }
      for(const draft of s.publications.filter((p)=>invalidDrafts.has(p.id)))statements.push(...guard(db,stmt(db,'UPDATE live_publication_snapshots SET data = ? WHERE id = ? AND data = ?',json({...draft,status:'stale'}),draft.id,json(draft))));
      const pending=(await stmt(db,"SELECT id,kind,payload FROM live_publication_outbox WHERE event_id = ? AND kind IN ('release','release-set') AND status = 'pending'",item.event_id).all<{id:string;kind:string;payload:string}>()).results;
      for(const delivery of pending){const records=delivery.kind==='release-set'?parse<PublicationRecord[]>(delivery.payload):[parse<PublicationRecord>(delivery.payload)];if(records.some((p)=>invalidDrafts.has(p.id)))statements.push(...guard(db,stmt(db,"UPDATE live_publication_outbox SET status = 'stale' WHERE id = ? AND status = 'pending' AND payload = ?",delivery.id,delivery.payload)));}
    }
    await batch(db,statements);return present;
  }catch{return null; /* Unknown receipt/changed source remains blocked; never re-release stale content. */}
}
export async function ownerPublication(db: D1Database, input: Record<string,unknown>, config: LocalPublisherConfig) {
  requireRule(config.receiverUrl.startsWith('http://127.0.0.1:') || config.receiverUrl.startsWith('http://localhost:'), 'The local fake publisher requires a loopback URL.');
  let acknowledgement:Awaited<ReturnType<typeof adminAcknowledgement>>|undefined;
  try{if(input.adminRequest!==undefined)acknowledgement=await adminAcknowledgement(input);}catch{throw new LiveError(400,'Invalid admin confirmation request.');}
  const reply=(data:Record<string,unknown>)=>acknowledgement?{...data,adminAcknowledgement:acknowledgement}:data;
  await stmt(db,"INSERT OR IGNORE INTO live_publication_service (id,state,updated_at) VALUES ('owner','enabled',?)",now()).run();
  const service = await stmt(db,"SELECT state FROM live_publication_service WHERE id = 'owner'").first<{state:string}>();
  config = {...config,enabled:config.enabled && service?.state!=='suspended' && service?.state!=='shutdown'};
  if (input.action === 'service') {
    requireRule(['enabled','suspended','shutdown'].includes(String(input.state)), 'Choose a service state.');
    await stmt(db,"INSERT INTO live_publication_service (id,state,updated_at) VALUES ('owner',?,?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",String(input.state),now()).run();
    return reply({ok:true,state:input.state});
  }
  if (input.action === 'list') {
    const publications=(await stmt(db,'SELECT data FROM live_publication_snapshots').all<{data:string}>()).results.map((r)=>parse<PublicationRecord>(r.data));
    const rows=(await stmt(db,'SELECT id,setup,status FROM live_events WHERE id IN (SELECT event_id FROM live_publication_snapshots)').all<{id:string;setup:string;status:string}>()).results;
    const events:Record<string,{competitionIds:string[];active:boolean}>={};
    for(const row of rows)events[await publicId(row.id,row.id)]={competitionIds:parse<LiveSetup>(row.setup).competitions.map((c)=>c.id),active:row.status==='active'};
    if(acknowledgement&&input.includeDeliveryChecks===true){
      const counts=(await stmt(db,"SELECT event_id,COUNT(*) AS count FROM live_publication_outbox WHERE status = 'stale' AND kind IN ('release','release-set') GROUP BY event_id").all<{event_id:string;count:number}>()).results;
      const unconfirmedDeliveries:Record<string,number>={};
      for(const row of counts)unconfirmedDeliveries[await publicId(row.event_id,row.event_id)]=row.count;
      return reply({publications,events,enabled:config.enabled,serviceState:service?.state??'enabled',unconfirmedDeliveries});
    }
    return reply({publications,events,enabled:config.enabled,serviceState:service?.state??'enabled'});
  }
  if (input.action === 'release-event') {
    requireRule(config.enabled, 'Publication is paused. Judging remains available.');
    requireRule(Array.isArray(input.publications) && input.publications.length>0 && input.publications.length<=8,'Review a complete event first.');
    const first=record(input.publications[0]);
    const row=await stmt(db,'SELECT event_id FROM live_publication_snapshots WHERE id = ?',id(first.publicationId)).first<{event_id:string}>();
    requireRule(row,'This publication request is unavailable.');
    const link=await stmt(db,"SELECT code_hash FROM live_links WHERE event_id = ? AND role = 'organizer' AND revoked = 0",row.event_id).first<{code_hash:string}>();
    requireRule(link,'Organizer access unavailable.');
    const s=await load(db,link.code_hash);active(s);
    const records=exactPublicationSet(s,input.publications), currentView=await view(db,s);
    if(acknowledgement)requireRule(input.eventId===records[0].snapshot.eventId,'The selected event changed. Review its current results.');
    requireRule(records.every((p)=>['requested','released'].includes(p.status) && p.organizerApprovedAt && !p.underReview),'The organizer must send the current results for every competition first.');
    const queued:PublicationRecord[]=[];
    const statements=[...guard(db,stmt(db,"UPDATE live_publication_service SET updated_at = updated_at WHERE id = 'owner' AND state = 'enabled'")),...eventGuard(db,s,link.code_hash,s.event.version)];
    for(const item of records){
      await currentPublication(currentView,item);
      if(item.status==='requested'){
        const next={...item,status:'queued' as const,ownerApprovedAt:now()};queued.push(next);
        statements.push(...guard(db,stmt(db,'UPDATE live_publication_snapshots SET data = ? WHERE id = ? AND data = ?',json(next),item.id,json(item))));
      }
    }
    requireRule(queued.length,'These results have already been published.');
    statements.push(outboxWrite(db,s,'release-set',queued));
    await batch(db,statements);
  } else if (input.action === 'release') {
    requireRule(config.enabled, 'Future publication is suspended. Judging remains available.');
    const row = await stmt(db,'SELECT * FROM live_publication_snapshots WHERE id = ?',id(input.publicationId)).first<{event_id:string; data:string}>();
    requireRule(row,'Unknown publication request.'); const record = parse<PublicationRecord>(row.data);
    requireRule(record.status==='requested' && record.organizerApprovedAt && record.sourceFingerprint===input.sourceFingerprint,'Owner release needs the exact current organizer-approved snapshot.');
    const link=await stmt(db,"SELECT code_hash FROM live_links WHERE event_id = ? AND role = 'organizer' AND revoked = 0",row.event_id).first<{code_hash:string}>(); requireRule(link,'Organizer access unavailable.');
    const s = await load(db,link.code_hash); active(s);
    const current=await buildPublicSnapshot(await view(db,s),record.competitionId,record.revision,record.snapshot.supersedes,record.snapshot.preparedAt,record.id);
    if(current.sourceFingerprint!==record.sourceFingerprint) throw new LiveError(409,'Source changed; renew head, organizer and owner review.');
    const next={...record,status:'queued' as const,ownerApprovedAt:now()};
    await batch(db,[...guard(db,stmt(db,"UPDATE live_publication_service SET updated_at = updated_at WHERE id = 'owner' AND state = 'enabled'")),...eventGuard(db,s,link.code_hash,s.event.version),...guard(db,stmt(db,'UPDATE live_publication_snapshots SET data = ? WHERE id = ? AND data = ?',json(next),record.id,row.data)),outboxWrite(db,s,'release',next)]);
  } else requireRule(input.action === 'retry','Unknown owner publication action.');
  const pending=(await stmt(db,"SELECT * FROM live_publication_outbox WHERE status = 'pending' OR (status = 'stale' AND kind IN ('release','release-set')) ORDER BY rowid").all<DeliveryRow>()).results;
  let delivered=0;
  for(const item of pending) {
    if(item.status==='stale'){if(await reconcileDelivery(db,item,config))delivered++;continue;}
    if(['release','release-set'].includes(item.kind) && !config.enabled) continue;
    const payload=parse<PublicationRecord>(item.payload);
    if(item.kind==='release-set') {
      const members=parse<PublicationRecord[]>(item.payload);
      let valid=members.length>0;
      for(const member of members){const current=await stmt(db,'SELECT data FROM live_publication_snapshots WHERE id = ?',member.id).first<{data:string}>();if(!current || parse<PublicationRecord>(current.data).status!=='queued')valid=false;}
      if(!valid){await stmt(db,"UPDATE live_publication_outbox SET status = 'stale' WHERE id = ? AND status = 'pending' AND payload = ?",item.id,item.payload).run();continue;}
      try{
        const message={deliveryId:item.id,kind:item.kind,payload:members} as DeliveryEnvelope, expected=await deliveryAcknowledgement(message);
        const response=await fetch(config.receiverUrl+'/receive',{method:'POST',headers:{Authorization:`Bearer ${config.receiverKey}`,'Content-Type':'application/json'},body:json(message),signal:AbortSignal.timeout(15000)});
        if(!await confirmsDelivery(response,expected))continue;
        const synchronizedAt=now(),statements=[...guard(db,stmt(db,"UPDATE live_publication_outbox SET status = 'delivered' WHERE id = ? AND status = 'pending' AND payload = ?",item.id,item.payload))];
        for(const member of members){
          const fresh=await stmt(db,'SELECT data FROM live_publication_snapshots WHERE id = ?',member.id).first<{data:string}>();
          if(!fresh)continue;
          const record=parse<PublicationRecord>(fresh.data),released={...record,status:'released' as const,releasedAt:record.releasedAt??synchronizedAt,underReview:record.underReview===true||record.status==='stale',lastSynchronizedAt:synchronizedAt};
          statements.push(...guard(db,stmt(db,'UPDATE live_publication_snapshots SET data = ? WHERE id = ? AND data = ?',json(released),record.id,fresh.data)));
          if(record.status==='stale')statements.push(stmt(db,'INSERT INTO live_publication_outbox (id,event_id,kind,payload,created_at) VALUES (?,?,?,?,?)',uid(),item.event_id,'status',json({id:record.id,eventId:record.snapshot.eventId,competitionId:record.snapshot.competitionId,revision:record.revision,status:'Under review'}),synchronizedAt));
        }
        await batch(db,statements);delivered++;
      }catch{/* Keep the complete event delivery pending for retry. */}
      continue;
    }
    if(item.kind==='release') {
      const current=await stmt(db,'SELECT data FROM live_publication_snapshots WHERE id = ?',payload.id).first<{data:string}>();
      if(!current || parse<PublicationRecord>(current.data).status!=='queued') { await stmt(db,"UPDATE live_publication_outbox SET status = 'stale' WHERE id = ? AND status = 'pending' AND payload = ?",item.id,item.payload).run(); continue; }
    }
    try {
      const message={deliveryId:item.id,kind:item.kind,payload} as DeliveryEnvelope, expected=await deliveryAcknowledgement(message);
      const response=await fetch(config.receiverUrl+'/receive',{method:'POST',headers:{Authorization:`Bearer ${config.receiverKey}`,'Content-Type':'application/json'},body:json(message),signal:AbortSignal.timeout(5000)});
      if(!await confirmsDelivery(response,expected))continue;
      // The receiver may succeed just before a source correction. Preserve its release and queue Under review.
      const fresh=await stmt(db,'SELECT data FROM live_publication_snapshots WHERE id = ?',payload.id).first<{data:string}>();
      const statements=[...guard(db,stmt(db,"UPDATE live_publication_outbox SET status = 'delivered' WHERE id = ? AND status = 'pending' AND payload = ?",item.id,item.payload))];
      if(fresh) {
        const record=parse<PublicationRecord>(fresh.data), synchronizedAt=now();
        const released=item.kind==='release' ? {...record,status:'released' as const,releasedAt:record.releasedAt ?? synchronizedAt,underReview:record.underReview===true||record.status==='stale',lastSynchronizedAt:synchronizedAt} : {...record,lastSynchronizedAt:synchronizedAt};
        statements.push(...guard(db,stmt(db,'UPDATE live_publication_snapshots SET data = ? WHERE id = ? AND data = ?',json(released),record.id,fresh.data)));
        if(item.kind==='release' && record.status==='stale') statements.push(stmt(db,'INSERT INTO live_publication_outbox (id,event_id,kind,payload,created_at) VALUES (?,?,?,?,?)',uid(),item.event_id,'status',json({id:record.id,eventId:record.snapshot.eventId,competitionId:record.snapshot.competitionId,revision:record.revision,status:'Under review'}),synchronizedAt));
      }
      await batch(db,statements); delivered++;
    } catch { /* Durable pending outbox; judging does not depend on receiver availability. */ }
  }
  return reply({ok:true,delivered,pending:(await stmt(db,"SELECT COUNT(*) AS count FROM live_publication_outbox WHERE status = 'pending' OR (status = 'stale' AND kind IN ('release','release-set'))").first<{count:number}>())?.count ?? 0});
}

// Receiver-only current-source attestation discloses no drafts, notes or operational credentials.
export async function attestPublication(db:D1Database,input:Record<string,unknown>) {
  const service=await stmt(db,"SELECT state FROM live_publication_service WHERE id='owner'").first<{state:string}>();if(service?.state!=='enabled')return {valid:false};
  const row=await stmt(db,'SELECT data,event_id FROM live_publication_snapshots WHERE id = ?',id(input.publicationId)).first<{data:string;event_id:string}>();
  if(!row)return {valid:false};const record=parse<PublicationRecord>(row.data);
  if(record.status!=='queued'||record.sourceFingerprint!==input.sourceFingerprint||record.revision!==input.revision||record.snapshot.eventId!==input.eventId||record.snapshot.competitionId!==input.competitionId)return {valid:false};
  const link=await stmt(db,"SELECT code_hash FROM live_links WHERE event_id = ? AND role = 'organizer' AND revoked = 0",row.event_id).first<{code_hash:string}>();if(!link)return {valid:false};
  try{const s=await load(db,link.code_hash);const current=await buildPublicSnapshot(await view(db,s),record.competitionId,record.revision,record.snapshot.supersedes,record.snapshot.preparedAt,record.id);return {valid:s.event.status==='active'&&current.sourceFingerprint===record.sourceFingerprint};}catch{return {valid:false};}
}
