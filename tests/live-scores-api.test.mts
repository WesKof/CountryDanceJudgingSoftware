import test from 'node:test';
import assert from 'node:assert/strict';
import { createStage, limitedStage } from './publication-helpers.ts';
import { api, command, save, submitHeat } from './stage-helpers.ts';
import { cellKey, type LiveView } from '../lib/live/types.ts';

test('organizer live scores expose saved marks only, preserve locked heat snapshots and keep judge/review gates', async () => {
  const { organizer, tokens, head } = await createStage(limitedStage(1, 2));
  await command(organizer, { action: 'open-stage', kind: 'prelims' });
  const initial = await api<LiveView>(organizer), round = initial.rounds[0], heat = round.definition.heats[0];
  const [first, second] = heat.subjectIds, [song1, song2] = heat.songs;
  await save(tokens[0], round, song1.id, first, 'Yes', 'PRIVATE_LIVE_SCORE_NOTE');
  await save(tokens[0], round, song1.id, second, '');
  let view = await api<LiveView>(organizer);
  let feed = view.rounds[0].liveScores!.find((f) => f.judgeId === round.definition.judgeIds[0])!;
  assert.deepEqual(feed.marks, { [cellKey(song1.id, first)]: 'Yes', [cellKey(song1.id, second)]: '' });
  assert.equal(feed.submissionVersion, 0);
  assert.equal(view.version, initial.version); // Cell saves use separate ballot versions.
  assert.equal(view.rounds[0].standings, undefined);
  assert.equal(view.rounds[0].submittedMarks, undefined);
  assert.deepEqual(view.ballots, []);
  assert.ok(!JSON.stringify(view).includes('PRIVATE_LIVE_SCORE_NOTE'));
  for (const token of [tokens[1], head]) {
    const judge = await api<LiveView>(token);
    assert.equal(judge.rounds[0].liveScores, undefined);
    assert.equal(judge.rounds[0].submittedMarks, undefined);
    assert.equal(judge.rounds[0].standings, undefined);
    assert.ok(!JSON.stringify(judge).includes('PRIVATE_LIVE_SCORE_NOTE'));
  }
  await api(organizer, { action: 'save-cell', requestId: crypto.randomUUID(), roundKey: round.key, performanceId: song1.id, subjectId: first, mark: 'A1', note: '', baseRevision: 1 }, 403);
  await command(organizer, { action: 'next' });
  await save(tokens[0], round, song2.id, second, 'No');
  await command(organizer, { action: 'lineup' });
  await submitHeat(tokens[0], round, heat.id);
  view = await api<LiveView>(organizer);
  feed = view.rounds[0].liveScores!.find((f) => f.judgeId === round.definition.judgeIds[0])!;
  assert.equal(feed.submissionVersion, 1);
  assert.equal(feed.marks[cellKey(song1.id, second)], '');
  assert.equal(feed.marks[cellKey(song2.id, second)], 'No');
  const locked = structuredClone(feed);
  await save(tokens[0], round, song1.id, first, 'A2', '', 423);
  await save(tokens[1], round, song2.id, first, 'A1');
  assert.deepEqual((await api<LiveView>(organizer)).rounds[0].liveScores!.find((f) => f.judgeId === locked.judgeId), locked);
  for (const token of tokens.slice(1)) {
    for (const id of heat.subjectIds) await save(token, round, song2.id, id, 'Yes');
    await submitHeat(token, round, heat.id);
  }
  await command(organizer, { action: 'conclude-stage' });
  view = await api<LiveView>(organizer);
  assert.equal(view.rounds[0].standings?.approved, false);
  assert.ok(view.rounds[0].submittedMarks?.length);
  assert.ok(view.rounds[0].liveScores?.every((f) => f.submissionVersion === 1));
  assert.equal((await api<LiveView>(head)).rounds[0].liveScores, undefined);
});
