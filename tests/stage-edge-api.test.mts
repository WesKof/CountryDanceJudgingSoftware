import test from 'node:test';
import assert from 'node:assert/strict';
import { api, command, nonce, save, submitHeat } from './stage-helpers.ts';
import { stageFixture } from './stage-fixture.ts';
import { cellKey, type LiveSetup, type LiveView, type RoundView } from '../lib/live/types.ts';

async function create(setup: LiveSetup) {
  const c = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: 'Synthetic stage boundaries', venue: '', date: '' });
  const organizer = c.path.split('/').at(-1)!; await command(organizer, { action: 'setup', setup });
  const v = await api<LiveView>(organizer), tokens = v.judgeLinks!.map((l) => l.path.split('/').at(-1)!);
  return { organizer, tokens, head: tokens[2] };
}
function limited(count: number) {
  const setup = stageFixture(undefined, 4), ids = setup.competitions.slice(0, count).map((c) => c.id);
  setup.competitions = setup.competitions.filter((c) => ids.includes(c.id)); setup.rounds = setup.rounds.filter((r) => ids.includes(r.competitionId));
  setup.blocks = setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)) }));
  for (const r of setup.rounds) r.heats = [{ ...r.heats[0], subjectIds: r.subjects.map((s) => s.id), songs: r.heats[0].songs.slice(0, 2) }];
  return setup;
}
async function heat(organizer: string, tokens: string[], r: RoundView, mark: 'Yes' | 'A1' = 'Yes') {
  const h = r.definition.heats[0];
  for (const token of tokens) for (const id of h.subjectIds) await save(token, r, h.songs[0].id, id, mark);
  await command(organizer, { action: 'next' }); await command(organizer, { action: 'lineup' });
  await Promise.all(tokens.map((token) => submitHeat(token, r, h.id)));
}
async function exact(token: string, roundId: string, action: string, extra: Record<string, unknown> = {}) {
  const v = await api<LiveView>(token), r = v.rounds.find((r) => r.id === roundId)!;
  return command(token, { action, roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint, ...extra });
}

test('stage CAS race, panel deadlock, amended approved advancement and explicit finals tie decision', async () => {
  const setup = limited(1), { organizer, tokens, head } = await create(setup);
  await command(organizer, { action: 'open-stage', kind: 'prelims' });
  const frozen = structuredClone(setup); frozen.organizerParticipantId += '-changed';
  await command(organizer, { action: 'setup', setup: frozen }, 423);
  let v = await api<LiveView>(organizer), r = v.rounds[0]; const h = r.definition.heats[0];
  for (const token of tokens) for (const id of h.subjectIds) await save(token, r, h.songs[0].id, id, 'Yes');
  await command(organizer, { action: 'next' }); await command(organizer, { action: 'lineup' });
  const own = await api<LiveView>(tokens[0]), b = own.ballots[0], id = h.subjectIds[0];
  const common = { roundKey: r.key, requestId: crypto.randomUUID() };
  const inputs = [{ ...common, action: 'save-cell', performanceId: h.songs[0].id, subjectId: id, mark: 'Yes', note: 'Race observation retained', baseRevision: b.cells[cellKey(h.songs[0].id, id)].revision }, { ...common, requestId: crypto.randomUUID(), action: 'submit-heat', heatId: h.id, acknowledged: true, ballotVersion: b.version, expectedVersion: own.version }];
  const responses = await Promise.all(inputs.map((input) => fetch(`${process.env.LIVE_TEST_URL ?? 'http://127.0.0.1:3000'}/api/live`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) })));
  assert.equal(responses.filter((res) => res.status === 200).length, 1);
  assert.ok(responses.some((res) => [409, 423].includes(res.status)));
  await submitHeat(tokens[0], r, h.id); await Promise.all(tokens.slice(1).map((token) => submitHeat(token, r, h.id)));
  await save(tokens[0], r, h.songs[0].id, id, 'No', '', 423);
  await command(organizer, { action: 'conclude-stage' });
  v = await api<LiveView>(head); r = v.rounds[0]; const tie = r.standings!.advancementTies![0];
  assert.equal(tie.slots, 2); assert.equal(r.standings!.rows[0].average, 10);
  const all = r.definition.subjects.map((s) => s.id);
  await command(tokens[0], { action: 'vote', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint, tieKey: tie.key, selected: [all[0]] }, 400);
  for (const [j, token] of tokens.entries()) await exact(token, r.id, 'vote', { tieKey: tie.key, selected: [all[0], all[j + 1]] });
  v = await api<LiveView>(head); r = v.rounds[0]; assert.equal(r.standings!.advancementTies![0].deadlocked, true);
  await command(head, { action: 'approve', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint }, 400);
  await exact(head, r.id, 'tie', { tieKey: tie.key, order: [...all].reverse(), shared: false, explanation: 'Synthetic panel deadlock' });
  v = await api<LiveView>(head); r = v.rounds[0]; assert.deepEqual(new Set(r.standings!.advancingIds), new Set([all[0], all[3]]));
  await exact(head, r.id, 'approve');
  const priorFingerprint = r.standings!.fingerprint, source = v.heatSubmissions!.find((s) => s.judgeId === setup.judges[0].id)!;
  const q = await command(organizer, { action: 'request-correction', roundKey: r.key, heatId: h.id, judgeId: setup.judges[0].id, submissionId: source.id, reason: 'Synthetic recorded Yes should be A1', changes: [{ performanceId: h.songs[0].id, subjectId: all[0], after: 'A1' }] }) as { reviewRequestId: string };
  await command(head, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 }); await command(organizer, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 });
  v = await api<LiveView>(head); r = v.rounds[0];
  assert.equal(r.phase, 'discussion'); assert.equal(r.standings!.approved, false); assert.notEqual(r.standings!.fingerprint, priorFingerprint);
  assert.equal(r.standings!.advancementTies![0].votes.length, 0); assert.equal(r.standings!.decisions.length, 0);
  assert.ok(Math.abs(r.standings!.rows.find((s) => s.subjectId === all[0])!.average - (4.5 + 10 + 10) / 3) < 1e-9);
  for (const token of tokens) await exact(token, r.id, 'vote', { tieKey: r.standings!.advancementTies![0].key, selected: [all[1], all[2]] });
  await exact(head, r.id, 'approve');
  v = await api<LiveView>(organizer); const next = structuredClone(v.setup), final = next.rounds.find((f) => f.kind === 'finals')!;
  final.finalistIds = v.rounds[0].standings!.advancingIds!; final.subjects = v.rounds[0].definition.subjects.filter((s) => final.finalistIds.includes(s.id)); final.heats[0].subjectIds = final.subjects.map((s) => s.id);
  await command(organizer, { action: 'setup', setup: next }); await command(organizer, { action: 'open-stage', kind: 'finals' });
  v = await api<LiveView>(organizer); r = v.rounds.find((r) => r.definition.kind === 'finals')!;
  await heat(organizer, tokens, r, 'A1'); await command(organizer, { action: 'conclude-stage' });
  v = await api<LiveView>(head); r = v.rounds.find((r) => r.definition.kind === 'finals')!; const finalists = r.definition.subjects.map((s) => s.id);
  await command(tokens[0], { action: 'tie', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint, tieKey: r.standings!.ties[0].key, order: finalists, shared: false }, 403);
  await command(head, { action: 'approve', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint }, 400);
  await exact(head, r.id, 'tie', { tieKey: r.standings!.ties[0].key, order: [...finalists].reverse(), shared: false, explanation: 'Synthetic finals placement' }); await exact(head, r.id, 'approve');
  v = await api<LiveView>(head); r = v.rounds.find((r) => r.definition.kind === 'finals')!;
  assert.deepEqual(r.standings!.rows.map((s) => s.place), [1, 2]); assert.ok(r.standings!.rows.every((s) => s.average === 4.5));
  assert.equal(r.standings!.rows[0].subjectId, finalists[1]);
  const backup = await command(organizer, { action: 'backup' }); assert.ok((backup.history as { approvals: unknown[] }).approvals.length >= 3);
});

test('withdrawing the current last competition preserves a usable conclude-stage context and history', async () => {
  const setup = limited(2), { organizer, tokens, head } = await create(setup); await command(organizer, { action: 'open-stage', kind: 'prelims' });
  let v = await api<LiveView>(organizer); await heat(organizer, tokens, v.rounds[0]); await command(organizer, { action: 'next' });
  const q = await command(organizer, { action: 'request-withdrawal', competitionId: setup.competitions[1].id, reason: 'Synthetic current-heat withdrawal' }) as { reviewRequestId: string };
  await command(organizer, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 }); await command(head, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 });
  v = await api<LiveView>(organizer); assert.equal(v.context.lineupHeatId, v.rounds[0].definition.heats[0].id); assert.equal(v.rounds.length, 1);
  await command(organizer, { action: 'conclude-stage' }); v = await api<LiveView>(organizer); assert.equal(v.rounds[0].phase, 'discussion');
  const backup = await command(organizer, { action: 'backup' }); assert.equal((backup.history as { heatSubmissions: unknown[] }).heatSubmissions.length, 3);
});
