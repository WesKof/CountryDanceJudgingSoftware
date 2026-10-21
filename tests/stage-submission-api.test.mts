import test from 'node:test';
import assert from 'node:assert/strict';
import { api, base, command, save, submitHeat } from './stage-helpers.ts';
import { createStage, limitedStage, exact } from './publication-helpers.ts';
import type { LiveView } from '../lib/live/types.ts';
import { stageFixture } from './stage-fixture.ts';
import { sampleSetup } from '../lib/sample-setup.ts';
import { setFinalsPair } from '../lib/live/finalists.ts';

async function submission(token: string) {
  const v = await api<LiveView>(token);
  return { action: 'submit-stage', requestId: crypto.randomUUID(), blockId: v.context.blockId, expectedVersion: v.version, acknowledged: true, ballotVersions: Object.fromEntries(v.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(v.rounds.map((r) => [r.key, r.version])) };
}

test('one atomic stage submission validates every assigned heat, exact versions, roles and retries', async () => {
  const setup = limitedStage(2, 4), pre = setup.rounds.filter((r) => r.kind === 'prelims');
  const h = pre[0].heats[0];
  pre[0].heats = [{ ...h, subjectIds: h.subjectIds.slice(0, 2) }, { ...h, id: h.id + '-second', name: 'Heat 2', subjectIds: h.subjectIds.slice(2), songs: h.songs.map((s) => ({ ...s, id: s.id + '-second' })) }];
  pre[0].judgeIds = [setup.judges[0].id, setup.headJudgeId];
  pre[1].judgeIds = [setup.judges[1].id, setup.headJudgeId];
  const { organizer, tokens, head } = await createStage(setup);
  await command(organizer, { action: 'open-stage', kind: 'prelims', submissionMode: 'stage' });
  let v = await api<LiveView>(head);
  assert.equal(v.context.visited.length, 0, 'prepared songs must not be represented as danced');
  assert.equal(v.rounds.flatMap((r) => r.definition.heats).length, 3);
  assert.ok(v.rounds.every((r) => r.definition.heats.every((h) => h.songs.length === 2)));
  await api(head, await submission(head), 400);
  await submitHeat(head, v.rounds[0], v.rounds[0].definition.heats[0].id, 400);
  await command(organizer, { action: 'next' }, 400);
  const missingRound = v.rounds.find((r) => r.id === pre[1].id)!, missingHeat = missingRound.definition.heats[0], missingId = missingHeat.subjectIds.at(-1)!;
  for (const token of tokens) {
    const own = await api<LiveView>(token);
    for (const r of own.rounds) for (const heat of r.definition.heats) for (const [i, id] of heat.subjectIds.entries()) {
      if (token === head && id === missingId) await save(token, r, heat.songs[1].id, id, '', 'PRIVATE_STAGE_NOTE');
      else await save(token, r, heat.songs[1].id, id, i === 0 ? 'Yes' : 'No');
    }
  }
  v = await api<LiveView>(head);
  assert.ok(v.context.visited.includes(v.rounds[0].definition.heats[0].songs[1].id));
  assert.ok(!v.context.visited.includes(v.rounds[0].definition.heats[0].songs[0].id));
  assert.ok(!JSON.stringify(await api(organizer)).includes('PRIVATE_STAGE_NOTE'));
  await api(organizer, await submission(head), 403);
  const blocked = await api(head, await submission(head), 400);
  assert.match(String(blocked.error), /Heat 1.*104/);
  v = await api<LiveView>(head);
  assert.equal(v.heatSubmissions?.filter((s) => s.judgeId === setup.headJudgeId).length, 0);
  assert.ok(v.ballots.every((b) => !b.locked), 'failure cannot partially lock earlier rounds');
  const stale = await submission(head);
  await save(head, missingRound, missingHeat.songs[1].id, missingId, 'No', 'PRIVATE_STAGE_NOTE');
  await api(head, stale, 409);
  assert.ok((await api<LiveView>(head)).ballots.every((b) => !b.locked));
  const unack = await submission(head); await api(head, { ...unack, acknowledged: false }, 400);
  const wrongGeneration = await submission(head); wrongGeneration.roundVersions = {};
  await api(head, wrongGeneration, 409);
  const inputs = await Promise.all(tokens.map(submission));
  const responses = await Promise.all(tokens.map((token, i) => api(token, inputs[i])));
  assert.ok(responses.every((r) => r.wholeStage === true));
  assert.deepEqual(await api(head, inputs[2]), responses[2], 'receipt retry returns the same acknowledgment');
  v = await api<LiveView>(organizer);
  assert.equal(v.heatSubmissions?.length, 6);
  assert.ok(v.rounds.every((r) => r.phase === 'discussion' && r.standings?.complete));
  assert.equal(v.rounds.find((r) => r.id === pre[0].id)!.standings!.rows.find((s) => s.number === 102)!.average, 0);
  assert.ok(v.rounds[0].submittedMarks?.some((m) => m.mark === ''), 'individual song blanks remain explicit');
  await save(head, missingRound, missingHeat.songs[1].id, missingId, 'Yes', '', 423);
  assert.ok((await api<LiveView>(head)).ballots.every((b) => b.locked));
  await exact(organizer, pre[1].id, 'approve', {}, 403);
  await exact(head, pre[1].id, 'approve', {}, 400);
  for (const tie of v.rounds.find((r) => r.id === pre[1].id)!.standings!.advancementTies ?? []) for (const token of [tokens[1], head]) {
    await exact(token, pre[1].id, 'vote', { tieKey: tie.key, selected: tie.subjectIds.slice(0, tie.slots) });
  }
  await exact(head, pre[1].id, 'approve');
  const sub = v.heatSubmissions!.find((s) => s.judgeId === setup.headJudgeId && s.roundKey === missingRound.key)!;
  const q = await command(organizer, { action: 'request-correction', roundKey: missingRound.key, heatId: missingHeat.id, judgeId: setup.headJudgeId, submissionId: sub.id, reason: 'Synthetic genuine recording error', changes: [{ performanceId: missingHeat.songs[1].id, subjectId: missingId, after: 'A2' }] });
  await command(organizer, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 });
  assert.equal((await api<LiveView>(organizer)).heatSubmissions!.find((s) => s.id === sub.id)!.version, 1);
  await command(head, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 });
  v = await api<LiveView>(organizer);
  assert.equal(v.rounds.find((r) => r.id === pre[1].id)!.standings!.approved, false);
  assert.ok(v.heatSubmissions!.some((s) => s.supersedes === sub.id));
  const backup = await command(organizer, { action: 'backup' });
  assert.ok(JSON.stringify(backup).includes(sub.id));
});

test('concurrent stage submission versus a same-judge save never accepts a partial stage', async () => {
  const { organizer, tokens } = await createStage(limitedStage(2, 2));
  await command(organizer, { action: 'open-stage', kind: 'prelims', submissionMode: 'stage' });
  const token = tokens[0]; let v = await api<LiveView>(token);
  for (const r of v.rounds) for (const h of r.definition.heats) for (const id of h.subjectIds) await save(token, r, h.songs[0].id, id, 'No');
  v = await api<LiveView>(token); const r = v.rounds.at(-1)!, h = r.definition.heats[0], id = h.subjectIds[0];
  const inputs = [await submission(token), { action: 'save-cell', roundKey: r.key, performanceId: h.songs[0].id, subjectId: id, mark: 'Yes', note: '', baseRevision: 1, requestId: crypto.randomUUID() }];
  const outcomes = await Promise.all(inputs.map(async (input) => {
    const response = await fetch(base + '/api/live', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); return response.status;
  }));
  assert.equal(outcomes.filter((s) => s === 200).length, 1);
  assert.ok(outcomes.every((s) => [200, 409, 423].includes(s)));
  v = await api<LiveView>(token);
  assert.ok(v.heatSubmissions!.length === 0 || v.heatSubmissions!.length === 2);
  assert.ok(v.ballots.every((b) => b.locked === (v.heatSubmissions!.length === 2)));
});

test('enabling stage flow preserves earlier heat submissions and completes only the remaining assignment', async () => {
  const { organizer, tokens } = await createStage(limitedStage(2, 2));
  await command(organizer, { action: 'open-stage', kind: 'prelims' });
  let v = await api<LiveView>(tokens[0]); const first = v.rounds[0], h = first.definition.heats[0];
  for (const id of h.subjectIds) await save(tokens[0], first, h.songs[0].id, id, 'No');
  await command(organizer, { action: 'next' }); await command(organizer, { action: 'lineup' }); await submitHeat(tokens[0], first, h.id);
  const prior = (await api<LiveView>(tokens[0])).heatSubmissions![0];
  await command(organizer, { action: 'enable-stage-submission' });
  v = await api<LiveView>(tokens[0]); const next = v.rounds[1], other = next.definition.heats[0];
  for (const id of other.subjectIds) await save(tokens[0], next, other.songs[1].id, id, 'Yes');
  await api(tokens[0], await submission(tokens[0]));
  v = await api<LiveView>(tokens[0]); assert.deepEqual(v.heatSubmissions!.find((s) => s.id === prior.id), prior); assert.equal(v.heatSubmissions!.length, 2);
});

test('prepared J&J songs remain undanced; observations invalidate an older withdrawal plan and freeze partners', async () => {
  const setup = stageFixture(undefined, 3), competition = setup.competitions[2];
  setup.competitions = [competition]; setup.rounds = setup.rounds.filter((r) => r.competitionId === competition.id);
  setup.blocks = setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)) }));
  const { organizer, tokens, head } = await createStage(setup);
  await command(organizer, { action: 'open-stage', kind: 'prelims', submissionMode: 'stage' });
  let v = await api<LiveView>(organizer); const r = v.rounds[0], heat = r.definition.heats[0], removed = r.definition.subjects[0].id;
  const leads = r.definition.subjects.filter((s) => s.role === 'Lead' && s.id !== removed), follows = r.definition.subjects.filter((s) => s.role === 'Follow');
  const plan = heat.songs.map((p, n) => ({ performanceId: p.id, partners: leads.map((s, i) => [s.id, follows[(i + n) % 3].id]) }));
  const q = await command(organizer, { action: 'request-withdrawal', competitionId: competition.id, roundKey: r.key, subjectId: removed, pairingPlan: plan, reason: 'Synthetic unperformed song plan' });
  await command(organizer, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 });
  await save(tokens[0], r, heat.songs[2].id, removed, 'No');
  await command(head, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 }, 409);
  v = await api<LiveView>(organizer);
  assert.deepEqual(v.context.visited, [heat.songs[2].id]);
  assert.deepEqual(v.rounds[0].definition.heats[0].songs[2].partners, heat.songs[2].partners);
  assert.ok(!v.reviewRequests!.find((p) => p.id === q.reviewRequestId)!.appliedAt);
  await command(organizer, { action: 'record-performance', performanceId: heat.songs[0].id });
  await command(organizer, { action: 'open-stage-review', acknowledged: true });
  v = await api<LiveView>(organizer); assert.equal(v.context.visited.length, 3);
  await command(organizer, { action: 'request-withdrawal', competitionId: competition.id, roundKey: r.key, subjectId: removed, pairingPlan: plan, reason: 'Attempt to revise performed songs' }, 400);
});

test('dual-approved removal of the only outstanding competition allows retained stage scores into review', async () => {
  const { organizer, tokens, head } = await createStage(limitedStage(2, 2));
  await command(organizer, { action: 'open-stage', kind: 'prelims' });
  const v = await api<LiveView>(organizer), first = v.rounds[0], heat = first.definition.heats[0], removed = v.rounds[1];
  for (const token of tokens) for (const id of heat.subjectIds) await save(token, first, heat.songs[0].id, id, 'No');
  await command(organizer, { action: 'next' }); await command(organizer, { action: 'lineup' });
  for (const token of tokens) await submitHeat(token, first, heat.id);
  await command(organizer, { action: 'enable-stage-submission' });
  const q = await command(organizer, { action: 'request-withdrawal', competitionId: removed.definition.competitionId, reason: 'Synthetic outstanding competition withdrawal' });
  await command(organizer, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 });
  await command(head, { action: 'approve-request', reviewRequestId: q.reviewRequestId, requestVersion: 1 });
  const after = await api<LiveView>(organizer);
  assert.equal(after.rounds[0].phase, 'discussion'); assert.equal(after.rounds[0].standings?.complete, true);
  assert.equal(after.heatSubmissions!.filter((s) => s.roundKey === first.key).length, 3);
});


test('automatic stages wait for complete setup, open from save, and advance only after every exact approval', async () => {
  const setup = limitedStage(2, 4), incomplete = structuredClone(setup);
  incomplete.rounds.find((r) => r.kind === 'prelims')!.heats[0].subjectIds = [];
  const { organizer, tokens, head } = await createStage(incomplete);
  await command(tokens[0], { action: 'enable-auto-stages' }, 403);
  await command(organizer, { action: 'enable-auto-stages' });
  const waiting = await api<LiveView>(organizer);
  assert.equal(waiting.context.automaticStages, true); assert.equal(waiting.rounds.length, 0);
  assert.equal((await api<LiveView>(organizer)).version, waiting.version, 'GET must not open or mutate a stage');
  await command(organizer, { action: 'setup', setup, automaticStages: true });
  let v = await api<LiveView>(organizer);
  const prelims = v.rounds;
  assert.equal(prelims.length, 2); assert.ok(prelims.every((r) => r.phase === 'dancing'));
  assert.equal(v.context.stageReviewOpen, false); assert.deepEqual(v.context.visited, []);
  for (const token of tokens) {
    for (const r of prelims) for (const heat of r.definition.heats) for (const [i, id] of heat.subjectIds.entries()) await save(token, r, heat.songs[0].id, id, i === 0 ? 'Yes' : i === 1 ? 'A1' : 'No');
    await api(token, await submission(token));
  }
  v = await api<LiveView>(organizer);
  assert.ok(v.rounds.every((r) => r.phase === 'discussion'));
  assert.ok(prelims.every((r) => r.definition.heats.every((h) => h.songs.every((p) => v.context.visited.includes(p.id)))), 'submission protects unmarked prepared songs too');
  await exact(head, prelims[0].id, 'approve');
  assert.ok(!(await api<LiveView>(organizer)).rounds.some((r) => r.definition.kind === 'finals'));
  await exact(head, prelims[1].id, 'approve');
  v = await api<LiveView>(organizer);
  const finals = v.rounds.filter((r) => r.definition.kind === 'finals');
  assert.equal(finals.length, 2); assert.ok(finals.every((r) => r.phase === 'dancing'));
  assert.equal(v.context.blockId, setup.blocks[1].id);
  assert.ok(finals.every((f) => f.definition.finalistIds.length === 2));
  const wrong = structuredClone(v.setup); wrong.rounds.find((r) => r.id === finals[0].id)!.heats[0].songs[0].title = 'Cannot alter frozen song';
  await command(organizer, { action: 'setup', setup: wrong, automaticStages: true }, 423);
  const stable = v.rounds.map((r) => r.key);
  await command(organizer, { action: 'enable-auto-stages' });
  assert.deepEqual((await api<LiveView>(organizer)).rounds.map((r) => r.key), stable, 'repeated activation never refreezes or clears ballots');
});

test('automatic Finals retains the actual J&J draw gate and opens from its saved setup without a Start action', async () => {
  const setup = sampleSetup();
  const { organizer, tokens, head } = await createStage(setup);
  await command(organizer, { action: 'enable-auto-stages' });
  const prelims = (await api<LiveView>(organizer)).rounds;
  for (const token of tokens) {
    for (const r of prelims) for (const h of r.definition.heats) for (const [i, id] of h.subjectIds.entries()) {
      const mark = r.definition.format === 'Strictly' ? i === 0 ? 'Yes' : i === 1 ? 'A1' : 'No' : i % 2 === 0 ? 'Yes' : 'No';
      await save(token, r, h.songs[0].id, id, mark);
    }
    await api(token, await submission(token));
  }
  for (const r of prelims) await exact(head, r.id, 'approve');
  let v = await api<LiveView>(organizer);
  assert.ok(v.rounds.every((r) => r.definition.kind === 'prelims'), 'unpaired J&J prevents the entire Finals stage opening');
  const f = v.setup.rounds.find((r) => r.kind === 'finals' && v.setup.competitions.find((c) => c.id === r.competitionId)?.format === 'Jack & Jill')!;
  const pre = v.setup.rounds.find((r) => r.id === f.prelimRoundId)!;
  const lead = pre.subjects.find((s) => s.role === 'Lead' && f.finalistIds.includes(s.id))!, follow = pre.subjects.find((s) => s.role === 'Follow' && f.finalistIds.includes(s.id))!;
  const paired = setFinalsPair(v.setup, f.id, lead.id, follow.id);
  await command(organizer, { action: 'setup', setup: paired, automaticStages: true });
  v = await api<LiveView>(organizer);
  const opened = v.rounds.find((r) => r.id === f.id)!;
  assert.equal(opened.phase, 'dancing'); assert.deepEqual(opened.definition.subjects[0].members, [lead.id, follow.id]);
  assert.ok(v.rounds.filter((r) => r.definition.kind === 'finals').every((r) => r.phase === 'dancing'));
});
