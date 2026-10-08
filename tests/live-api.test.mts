import test from 'node:test';
import assert from 'node:assert/strict';
import { liveFixture } from './live-fixture.ts';
import { requiredCells } from '../lib/live/scoring.ts';
import { cellKey, type Cell, type LiveSetup, type LiveView, type RoundView } from '../lib/live/types.ts';

const base = process.env.LIVE_TEST_URL ?? 'http://localhost:3000';
const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
const uid = () => crypto.randomUUID();
async function api<T = Record<string, unknown>>(token: string, input?: Record<string, unknown>, expected = 200): Promise<T> {
  const response = await fetch(`${base}/api/live`, { method: input ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) }, body: input ? JSON.stringify(input) : undefined });
  const data = await response.json() as Record<string, unknown>;
  assert.equal(response.status, expected, typeof data.error === 'string' ? data.error : `Unexpected HTTP ${response.status}`);
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
  return data as T;
}
async function command(token: string, input: Record<string, unknown>, expected = 200) { const view = await api<LiveView>(token); return api(token, { ...input, expectedVersion: view.version, requestId: uid() }, expected); }
async function save(token: string, r: RoundView, performanceId: string, subjectId: string, mark: Cell['mark'] = 'Yes', note = '', expected = 200) {
  const view = await api<LiveView>(token); const ballot = view.ballots.find((b) => b.roundKey === r.key);
  return api<{ cell: Cell }>(token, { action: 'save-cell', roundKey: r.key, performanceId, subjectId, mark, note, baseRevision: ballot?.cells[cellKey(performanceId, subjectId)]?.revision ?? 0, requestId: uid() }, expected);
}
async function fillCurrent(token: string) {
  const view = await api<LiveView>(token);
  const round = view.rounds.find((r) => r.definition.heats.some((h) => h.songs.some((p) => p.id === view.context.performanceId)))!;
  const heat = round.definition.heats.find((h) => h.songs.some((p) => p.id === view.context.performanceId))!;
  const ballot = view.ballots.find((b) => b.roundKey === round.key)!;
  await Promise.all(heat.subjectIds.map((subjectId, i) => api(token, { action: 'save-cell', roundKey: round.key, performanceId: view.context.performanceId, subjectId, mark: i < 2 ? 'Yes' : i === heat.subjectIds.length - 1 ? 'No' : 'A1', note: i === 0 ? 'PRIVATE_JUDGE_NOTE_SENTINEL' : '', baseRevision: ballot.cells[cellKey(view.context.performanceId!, subjectId)]?.revision ?? 0, requestId: uid() })));
}
async function submit(token: string, blockId: string, expected = 200) { const v = await api<LiveView>(token); return api(token, { action: 'submit', blockId, ballotVersions: Object.fromEntries(v.ballots.map((b) => [b.roundKey, b.version])), expectedVersion: v.version, requestId: uid() }, expected); }
async function approveAll(headToken: string) {
  for (const rid of (await api<LiveView>(headToken)).rounds.filter((r) => r.phase === 'discussion').map((r) => r.id)) {
    let v = await api<LiveView>(headToken), r = v.rounds.find((r) => r.id === rid)!;
    for (const tie of r.standings!.ties) {
      await command(headToken, { action: 'tie', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint, tieKey: tie.key, order: [...tie.subjectIds].reverse(), shared: false, explanation: 'Local head rehearsal decision' });
      v = await api<LiveView>(headToken); r = v.rounds.find((r) => r.id === rid)!;
    }
    await command(headToken, { action: 'approve', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint });
  }
}

test('actual local D1/API rehearsal: isolated judges, scoped saves, immutable submissions, ties, finals and lifecycle', { timeout: 180000 }, async (t) => {
  await api('', undefined, 403);
  const create = { action: 'create', requestId: nonce(), name: 'Local judging rehearsal', venue: 'Local test', date: '2026-10-08' };
  const created = await api<{ path: string }>('', create); assert.deepEqual(await api('', create), created);
  const organizer = created.path.split('/').at(-1)!;
  const setup = liveFixture(); await command(organizer, { action: 'setup', setup });
  let desk = await api<LiveView>(organizer);
  let judge = desk.judgeLinks![0].path.split('/').at(-1)!; const head = desk.judgeLinks![1].path.split('/').at(-1)!;
  const originalLink = desk.judgeLinks![0].path;
  const renamed = structuredClone(desk.setup); renamed.judges[0].name = 'Renamed rehearsal judge';
  await command(organizer, { action: 'setup', setup: renamed }); desk = await api<LiveView>(organizer); assert.equal(desk.judgeLinks![0].path, originalLink);
  await api(judge, { action: 'setup', setup, expectedVersion: desk.version, requestId: uid() }, 403);
  await command(organizer, { action: 'open-block', blockId: setup.blocks[1].id }, 400);
  await command(organizer, { action: 'open-block', blockId: setup.blocks[0].id });
  await t.test('judge isolation, future playlist privacy, cell CAS and duplicate save retries', async () => {
    const j = await api<LiveView>(judge); const r = j.rounds[0], p = j.context.performanceId!, subject = r.definition.subjects[0].id;
    assert.equal(j.ballots.length, 4); assert.equal(j.judgeLinks, undefined); assert.ok(j.rounds.every((r) => r.standings === undefined));
    assert.equal(j.rounds.flatMap((r) => r.definition.heats.flatMap((h) => h.songs)).length, 1);
    assert.ok(!JSON.stringify(j).includes('ORGANIZER_SELECTION_NOTE'));
    const input = { action: 'save-cell', roundKey: r.key, performanceId: p, subjectId: subject, mark: 'No', note: 'PRIVATE_JUDGE_NOTE_SENTINEL', baseRevision: 0, requestId: uid() };
    const first = await api<{ cell: Cell }>(judge, input); assert.deepEqual(await api(judge, input), first);
    const reloaded = await api<LiveView>(judge); assert.equal(reloaded.ballots[0].cells[cellKey(p, subject)].note, 'PRIVATE_JUDGE_NOTE_SENTINEL');
    assert.ok(!JSON.stringify(await api<LiveView>(head)).includes('PRIVATE_JUDGE_NOTE_SENTINEL'));
    assert.ok(!JSON.stringify(await api<LiveView>(organizer)).includes('PRIVATE_JUDGE_NOTE_SENTINEL'));
    const concurrent = await Promise.all([0, 1].map(async (n) => {
      const response = await fetch(`${base}/api/live`, { method: 'POST', headers: { Authorization: `Bearer ${judge}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, mark: n ? 'A1' : 'A2', baseRevision: 1, requestId: uid() }) }); return response.status;
    })); assert.deepEqual(concurrent.sort(), [200, 409]);
    const missing = r.definition.subjects.at(-1)!.id;
    await api(judge, { ...input, subjectId: missing, baseRevision: 0, requestId: uid() }, 400);
    await command(judge, { action: 'approve', roundKey: r.key, roundVersion: r.version, fingerprint: '' }, 403);
    await command(organizer, { action: 'approve', roundKey: r.key, roundVersion: r.version, fingerprint: '' }, 403);
    await command(organizer, { action: 'discussion' }, 400);
    const stale = (await api<LiveView>(organizer)).version - 1;
    await api(organizer, { action: 'next', expectedVersion: stale, requestId: uid() }, 409);
  });
  await t.test('44 couples, two divisions, multiple heats, 2–3 songs and J&J role prelims', async () => {
    const count = setup.rounds.filter((r) => r.kind === 'prelims').flatMap((r) => r.heats.flatMap((h) => h.songs)).length;
    for (let i = 0; i < count; i++) { await fillCurrent(judge); await fillCurrent(head); if (i < count - 1) await command(organizer, { action: 'next' }); }
    const before = await api<LiveView>(organizer); assert.ok(before.rounds.every((r) => r.standings!.rows.length === 0));
    await command(organizer, { action: 'discussion' });
    const j = await api<LiveView>(judge), r = j.rounds[0], cell = requiredCells(r.definition)[0];
    await save(judge, r, cell.performanceId, cell.subjectId, '');
    await submit(judge, setup.blocks[0].id, 400);
    assert.ok((await api<LiveView>(judge)).ballots.every((b) => !b.locked));
    await save(judge, r, cell.performanceId, cell.subjectId, 'Yes', 'PRIVATE_JUDGE_NOTE_SENTINEL');
    const reviewed = await api<LiveView>(judge);
    const input = { action: 'submit', blockId: setup.blocks[0].id, ballotVersions: Object.fromEntries(reviewed.ballots.map((b) => [b.roundKey, b.version])), expectedVersion: reviewed.version, requestId: uid() };
    const submitted = await api(judge, input); assert.deepEqual(await api(judge, input), submitted);
    const afterOne = await api<LiveView>(organizer); assert.ok(afterOne.rounds.every((r) => r.standings!.rows.length === 0 && r.standings!.submitted === 1));
    await save(judge, r, cell.performanceId, cell.subjectId, 'A2', '', 423);
    await submit(head, setup.blocks[0].id);
    const complete = await api<LiveView>(organizer); assert.ok(complete.rounds.every((r) => r.standings!.complete));
    assert.equal(complete.rounds[0].standings!.rows[0].denominator, 6);
    assert.deepEqual([...new Set(complete.rounds[2].standings!.rows.map((r) => r.group))], ['Leads', 'Follows']);
    const h = await api<LiveView>(head), headRound = h.rounds[0];
    await command(head, { action: 'approve', roundKey: headRound.key, roundVersion: headRound.version, fingerprint: headRound.standings!.fingerprint }, 400);
    await command(head, { action: 'approve', roundKey: headRound.key, roundVersion: headRound.version, fingerprint: 'stale-fingerprint' }, 409);
    const tie = headRound.standings!.ties[0];
    await command(head, { action: 'tie', roundKey: headRound.key, roundVersion: headRound.version, fingerprint: headRound.standings!.fingerprint, tieKey: tie.key, order: [headRound.definition.subjects.at(-1)!.id, ...tie.subjectIds.slice(1)], explanation: '', shared: false }, 400);
    await approveAll(head);
    assert.ok((await api<LiveView>(organizer)).rounds.every((r) => r.standings!.approved));
  });
  await t.test('prelim approval gates fixed-pair finals and event-long links', async () => {
    const v = await api<LiveView>(organizer); const next: LiveSetup = structuredClone(v.setup);
    for (const finals of next.rounds.filter((r) => r.kind === 'finals')) {
      const prelim = next.rounds.find((r) => r.id === finals.prelimRoundId)!; const competition = next.competitions.find((c) => c.id === finals.competitionId)!;
      finals.finalistCount = 2;
      if (competition.format === 'Strictly') { finals.subjects = prelim.subjects.slice(0, 2); finals.finalistIds = finals.subjects.map((s) => s.id); }
      else { finals.finalistIds = prelim.subjects.map((s) => s.id); finals.subjects = [0, 1].map((i) => ({ id: uid(), number: 401 + i, primary: prelim.subjects[i].primary, secondary: prelim.subjects[i + 2].primary, members: [prelim.subjects[i].id, prelim.subjects[i + 2].id] })); }
      finals.heats[0].subjectIds = finals.subjects.map((s) => s.id);
    }
    await command(organizer, { action: 'setup', setup: next });
    await command(organizer, { action: 'open-block', blockId: next.blocks[1].id });
    const start = await api<LiveView>(judge); assert.ok(start.ballots.filter((b) => start.rounds.some((r) => r.key === b.roundKey && r.definition.kind === 'finals')).every((b) => Object.keys(b.cells).length === 0));
    const count = next.rounds.filter((r) => r.kind === 'finals').flatMap((r) => r.heats.flatMap((h) => h.songs)).length;
    for (let i = 0; i < count; i++) { await fillCurrent(judge); await fillCurrent(head); if (i < count - 1) await command(organizer, { action: 'next' }); }
    await command(organizer, { action: 'discussion' }); await submit(judge, next.blocks[1].id); await submit(head, next.blocks[1].id); await approveAll(head);
    const done = await api<LiveView>(organizer); const jj = done.rounds.filter((r) => r.definition.kind === 'finals' && r.definition.format === 'Jack & Jill');
    assert.ok(jj.every((r) => r.standings!.rows.every((row) => row.group === 'Couples' && r.definition.subjects.find((s) => s.id === row.subjectId)!.members!.length === 2)));
    assert.equal(done.judgeLinks![0].path, originalLink);
  });
  await t.test('explicit reopen preserves history and invalidates dependent approvals', async () => {
    const v = await api<LiveView>(organizer), prelim = v.rounds.find((r) => r.definition.kind === 'prelims')!;
    await command(organizer, { action: 'reopen', roundKey: prelim.key, reason: 'Rehearsal correction' });
    const reopened = await api<LiveView>(organizer), current = reopened.rounds.find((r) => r.id === prelim.id)!;
    assert.equal(current.generation, prelim.generation + 1); assert.equal(current.standings!.approved, false); assert.equal(current.standings!.rows.length, 0);
    assert.equal(reopened.rounds.find((r) => r.definition.prelimRoundId === prelim.id)!.phase, 'setup');
    await save(judge, prelim, prelim.definition.heats[0].songs[0].id, prelim.definition.subjects[0].id, 'A1', '', 409);
    const changed = structuredClone(reopened.setup); changed.headJudgeId = changed.judges[0].id;
    await command(organizer, { action: 'setup', setup: changed }, 423);
  });
  await t.test('backups redact judge notes/secrets; restore creates a fresh event; revoked links and archive/delete work', async () => {
    const backup = await api<Record<string, unknown>>(organizer, { action: 'backup', requestId: uid() });
    assert.ok(!JSON.stringify(backup).includes('PRIVATE_JUDGE_NOTE_SENTINEL')); assert.ok(!JSON.stringify(backup).includes(judge)); assert.ok(!JSON.stringify(backup).includes(head));
    const privateBackup = await api(organizer, { action: 'backup', includeNotes: true, requestId: uid() }); assert.ok(JSON.stringify(privateBackup).includes('PRIVATE_JUDGE_NOTE_SENTINEL'));
    const restored = await api<{ path: string }>('', { action: 'restore', backup, requestId: nonce() }); const restoredCode = restored.path.split('/').at(-1)!;
    const copy = await api<LiveView>(restoredCode); assert.equal(copy.rounds.length, 0); assert.ok(copy.restoredHistory); assert.notEqual(copy.eventId, (await api<LiveView>(organizer)).eventId); assert.notEqual(copy.setup.judges[0].id, setup.judges[0].id);
    const reexport = await api<Record<string, unknown>>(restoredCode, { action: 'backup', requestId: uid() });
    assert.ok(reexport.restoredHistory); assert.ok(JSON.stringify(reexport.restoredHistory).includes('sumTenths'));
    assert.ok(!JSON.stringify(reexport).includes('PRIVATE_JUDGE_NOTE_SENTINEL'));
    await command(organizer, { action: 'replace-link', judgeId: setup.judges[0].id }); await api(judge, undefined, 403);
    judge = (await api<LiveView>(organizer)).judgeLinks![0].path.split('/').at(-1)!;
    assert.ok(JSON.stringify(await api<LiveView>(judge)).includes('PRIVATE_JUDGE_NOTE_SENTINEL'));
    const publicPage = await (await fetch(base)).text(); assert.ok(!publicPage.includes('PRIVATE_JUDGE_NOTE_SENTINEL') && !publicPage.includes(judge));
    await command(organizer, { action: 'archive' }); assert.equal((await api<LiveView>(organizer)).status, 'archived');
    await command(organizer, { action: 'next' }, 423);
    await command(organizer, { action: 'delete' }); await api(organizer, undefined, 403); await api(head, undefined, 403);
    await command(restoredCode, { action: 'archive' }); await command(restoredCode, { action: 'delete' });
  });
});

test('D1 transactions serialize a late save against block submission and approval against reopening', { timeout: 60000 }, async () => {
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: 'Atomic workflow rehearsal', venue: 'Local', date: '2026-10-08' });
  const organizer = created.path.split('/').at(-1)!;
  const setup = liveFixture(2); await command(organizer, { action: 'setup', setup });
  const ready = await api<LiveView>(organizer); const judge = ready.judgeLinks![0].path.split('/').at(-1)!, head = ready.judgeLinks![1].path.split('/').at(-1)!;
  await command(organizer, { action: 'open-block', blockId: setup.blocks[0].id });
  const count = setup.rounds.filter((r) => r.kind === 'prelims').flatMap((r) => r.heats.flatMap((h) => h.songs)).length;
  for (let i = 0; i < count; i++) { await fillCurrent(judge); await fillCurrent(head); if (i < count - 1) await command(organizer, { action: 'next' }); }
  await command(organizer, { action: 'discussion' });
  const reviewed = await api<LiveView>(judge), r = reviewed.rounds[0], c = requiredCells(r.definition)[0], b = reviewed.ballots.find((b) => b.roundKey === r.key)!;
  const responses = await Promise.all([
    fetch(`${base}/api/live`, { method: 'POST', headers: { Authorization: `Bearer ${judge}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-cell', requestId: uid(), roundKey: r.key, performanceId: c.performanceId, subjectId: c.subjectId, mark: 'Yes', note: 'Late save', baseRevision: b.cells[c.key].revision }) }),
    fetch(`${base}/api/live`, { method: 'POST', headers: { Authorization: `Bearer ${judge}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit', requestId: uid(), blockId: setup.blocks[0].id, expectedVersion: reviewed.version, ballotVersions: Object.fromEntries(reviewed.ballots.map((b) => [b.roundKey, b.version])) }) }),
  ]);
  const statuses = responses.map((r) => r.status);
  assert.ok((statuses[0] === 200 && statuses[1] === 409) || ([409, 423].includes(statuses[0]) && statuses[1] === 200));
  if (statuses[1] === 409) { assert.ok((await api<LiveView>(judge)).ballots.every((b) => !b.locked)); await submit(judge, setup.blocks[0].id); }
  assert.ok((await api<LiveView>(judge)).ballots.every((b) => b.locked));
  await submit(head, setup.blocks[0].id);
  let headView = await api<LiveView>(head), headRound = headView.rounds[0];
  for (const tie of headRound.standings!.ties) {
    await command(head, { action: 'tie', roundKey: headRound.key, roundVersion: headRound.version, fingerprint: headRound.standings!.fingerprint, tieKey: tie.key, order: tie.subjectIds, shared: true, explanation: 'Atomic rehearsal shared-place decision' });
    headView = await api<LiveView>(head); headRound = headView.rounds[0];
  }
  const operations = await Promise.all([
    fetch(`${base}/api/live`, { method: 'POST', headers: { Authorization: `Bearer ${head}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', requestId: uid(), expectedVersion: headView.version, roundKey: headRound.key, roundVersion: headRound.version, fingerprint: headRound.standings!.fingerprint }) }),
    fetch(`${base}/api/live`, { method: 'POST', headers: { Authorization: `Bearer ${organizer}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reopen', requestId: uid(), expectedVersion: headView.version, roundKey: headRound.key, reason: 'Concurrent correction rehearsal' }) }),
  ]);
  assert.deepEqual(operations.map((r) => r.status).sort(), [200, 409]);
  const after = await api<LiveView>(organizer), current = after.rounds.find((r) => r.id === headRound.id)!;
  if (current.generation === headRound.generation) { assert.equal(current.standings!.approved, true); assert.equal(current.standings!.fingerprint, headRound.standings!.fingerprint); }
  else { assert.equal(current.standings!.approved, false); assert.equal(current.standings!.submitted, 0); }
  const corrected = structuredClone(after.setup); corrected.headJudgeId = corrected.judges[0].id;
  await command(organizer, { action: 'setup', setup: corrected, correction: true, reason: 'Explicit event head correction' });
  const reset = await api<LiveView>(organizer); assert.ok(reset.rounds.every((r) => r.phase === 'setup' && !r.standings!.approved));
  assert.equal((await api<LiveView>(judge)).role, 'head'); assert.equal((await api<LiveView>(head)).role, 'judge');
  const history = await api<Record<string, unknown>>(organizer, { action: 'backup', requestId: uid() });
  assert.ok((history.ballots as unknown[]).length > 0);
  await command(organizer, { action: 'archive' }); await command(organizer, { action: 'delete' });
});

test('removing a started competition requires correction and preserves ballots, decisions and approvals as history', { timeout: 60000 }, async () => {
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: 'Competition withdrawal rehearsal', venue: 'Local', date: '' });
  const organizer = created.path.split('/').at(-1)!;
  const setup = liveFixture(2), competition = setup.competitions[0];
  setup.competitions = [competition]; setup.rounds = setup.rounds.filter((r) => r.competitionId === competition.id);
  setup.blocks.forEach((b) => { b.roundIds = b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)); });
  await command(organizer, { action: 'setup', setup });
  const ready = await api<LiveView>(organizer), judge = ready.judgeLinks![0].path.split('/').at(-1)!, head = ready.judgeLinks![1].path.split('/').at(-1)!;
  await command(organizer, { action: 'open-block', blockId: setup.blocks[0].id });
  const opened = await api<LiveView>(judge), round = opened.rounds[0], performanceId = opened.context.performanceId!, subjectId = round.definition.subjects[0].id;
  const songCount = setup.rounds[0].heats[0].songs.length; // Judge reads deliberately hide future songs.
  for (let i = 0; i < songCount; i++) {
    await fillCurrent(judge); await fillCurrent(head);
    if (i < songCount - 1) await command(organizer, { action: 'next' });
  }
  await command(organizer, { action: 'discussion' }); await submit(judge, setup.blocks[0].id); await submit(head, setup.blocks[0].id); await approveAll(head);
  const removed = structuredClone(setup); removed.competitions = []; removed.rounds = []; removed.blocks.forEach((b) => { b.roundIds = []; });
  await command(organizer, { action: 'setup', setup: removed }, 423);
  await command(organizer, { action: 'setup', setup: removed, correction: true }, 400);
  const before = await api<LiveView>(organizer); assert.equal(before.rounds[0].standings!.approved, true);
  await command(organizer, { action: 'setup', setup: removed, correction: true, reason: 'Competition cancelled by organizer' });
  const after = await api<LiveView>(organizer); assert.deepEqual(after.setup.competitions, []); assert.deepEqual(after.rounds, []); assert.equal(after.context.performanceId, null);
  assert.deepEqual(after.judgeLinks, ready.judgeLinks); assert.deepEqual((await api<LiveView>(judge)).ballots, []);
  await save(judge, round, performanceId, subjectId, 'No', 'Late withdrawn ballot', 409);
  await command(head, { action: 'approve', roundKey: round.key, roundVersion: round.version, fingerprint: before.rounds[0].standings!.fingerprint }, 409);
  const backup = await api<{ history: { roundVersions: { round_id: string; reason: string }[]; submissions: unknown[]; approvals: unknown[]; decisions: unknown[] }; ballots: unknown[]; results: unknown[] }>(organizer, { action: 'backup', requestId: uid() });
  assert.deepEqual(backup.results, []); assert.equal(backup.history.submissions.length, 2); assert.equal(backup.history.approvals.length, 1); assert.ok(backup.history.decisions.length > 0); assert.ok(backup.ballots.length > 0);
  assert.ok(backup.history.roundVersions.some((v) => v.round_id === round.id && v.reason === 'Competition cancelled by organizer'));
  assert.ok(!JSON.stringify(backup).includes('PRIVATE_JUDGE_NOTE_SENTINEL'));
  const withNotes = await api<Record<string, unknown>>(organizer, { action: 'backup', requestId: uid(), includeNotes: true }); assert.ok(JSON.stringify(withNotes).includes('PRIVATE_JUDGE_NOTE_SENTINEL'));
  const replacement = liveFixture(2); replacement.judges = setup.judges; replacement.headJudgeId = setup.headJudgeId;
  await command(organizer, { action: 'setup', setup: replacement }); await command(organizer, { action: 'open-block', blockId: replacement.blocks[0].id });
  assert.ok((await api<LiveView>(organizer)).rounds.every((r) => r.definition.competitionId !== competition.id));
  assert.ok((await api<LiveView>(judge)).ballots.every((b) => Object.keys(b.cells).length === 0));
  await command(organizer, { action: 'archive' }); await command(organizer, { action: 'delete' });
});
