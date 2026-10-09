import test from 'node:test';
import assert from 'node:assert/strict';
import { cellKey, type Cells, type HeatSubmission } from '../lib/live/types.ts';
import { advancement, deriveStageStandings, heatSnapshot, latestHeatSubmissions, missingHeatSubjects } from '../lib/live/stage.ts';
import { freezeRound, validateSetup } from '../lib/live/validation.ts';
import { stageFixture } from './stage-fixture.ts';

const cell = (mark: '' | 'Yes' | 'A1' | 'A2' | 'No', note = '') => ({ mark, note, revision: 1, mutationId: 'unit' });
test('heat coverage counts No, ignores notes, retains explicit song blanks, and stable rotation identities', () => {
  const setup = stageFixture('unit-coverage'), r = freezeRound(setup, setup.rounds[4]), h = r.heats[0];
  const cells: Cells = {};
  for (const id of h.subjectIds) cells[cellKey(h.songs[0].id, id)] = cell('No');
  assert.deepEqual(missingHeatSubjects(h, cells), []);
  cells[cellKey(h.songs[0].id, h.subjectIds[0])] = cell('', 'A note is not an observation');
  assert.deepEqual(missingHeatSubjects(h, cells), [h.subjectIds[0]]);
  const snapshot = heatSnapshot(h, cells);
  assert.equal(Object.keys(snapshot).length, h.subjectIds.length * 3);
  assert.equal(snapshot[cellKey(h.songs[2].id, h.subjectIds[1])].mark, '');
  assert.notDeepEqual(h.songs[0].partners, h.songs[1].partners);
  assert.equal(r.subjects[0].id, h.songs[1].partners[0][0]);
});
test('partial-song averages weight judge means equally, with independent expected totals and counts', () => {
  const setup = stageFixture('unit-mean', 3), r = freezeRound(setup, setup.rounds[0]);
  const subs: HeatSubmission[] = r.heats.flatMap((h) => r.judgeIds.map((judgeId, j) => {
    const cells: Cells = Object.fromEntries(h.subjectIds.flatMap((id) => h.songs.map((p, song) => [cellKey(p.id, id), cell(j === 0 ? song === 0 ? 'Yes' : '' : song === 0 ? 'No' : song === 1 ? 'Yes' : '')])));
    return { id: `${h.id}-${judgeId}`, roundKey: 'round:1', heatId: h.id, judgeId, version: 1, ballotVersion: 1, createdAt: '', cells };
  }));
  const results = deriveStageStandings(r, 'round:1', subs);
  assert.equal(results.complete, true);
  assert.equal(results.rows[0].average, 20 / 3); // Means 10, 5, 5; all-cell mean would be 6.
  assert.equal(results.rows[0].denominator, 5);
  assert.deepEqual(results.rows[0].judgeMeans?.map((j) => j.observations), [1, 2, 2]);
  assert.equal(results.rows[0].songs[2].denominator, 0);
  const amended = { ...subs[0], id: 'amended', version: 2, supersedes: subs[0].id };
  assert.equal(latestHeatSubmissions([...subs, amended]).length, subs.length);
  assert.equal(latestHeatSubmissions([...subs, amended])[0].id, 'amended');
  assert.equal(deriveStageStandings(r, 'round:1', subs.slice(1)).complete, false);
});
test('participant overlap and invalid song counts are rejected; all votes and deadlock resolution stay separate from marks', () => {
  const s = stageFixture('unit-roles');
  const overlap = structuredClone(s); overlap.judges[0].participantId = overlap.organizerParticipantId;
  assert.throws(() => validateSetup(overlap), /organizer cannot/);
  const duplicate = structuredClone(s); duplicate.judges[1].participantId = ' ' + duplicate.judges[0].participantId!.toUpperCase() + ' ';
  assert.throws(() => validateSetup(duplicate), /Duplicate participant/);
  const short = structuredClone(s); short.rounds[0].heats[0].songs.pop(); short.rounds[0].heats[0].songs.pop();
  assert.throws(() => validateSetup(short), /2–3 songs/);
  const excludedHead = structuredClone(s); excludedHead.rounds[0].judgeIds = s.judges.slice(0, 2).map((j) => j.id);
  assert.throws(() => freezeRound(excludedHead, excludedHead.rounds[0]), /head judge/);
  const rows = ['a', 'b', 'c'].map((id) => ({ subjectId: id, number: 1, primary: id, secondary: '', group: 'Couples', average: 4.5, sumTenths: 45, denominator: 1, place: 1, tied: true, decided: false, songs: [] }));
  const votes = ['a', 'b', 'c'].map((id, i) => ({ roundKey: 'r', fingerprint: 'f', tieKey: 'Couples:a,b,c', judgeId: `j${i}`, selected: [id], createdAt: '' }));
  const tie = advancement(rows, 1, ['j0', 'j1', 'j2'], votes, []).advancementTies[0];
  assert.equal(tie.deadlocked, true); assert.equal(tie.complete, false);
  assert.equal(advancement(rows, 1, ['j0', 'j1', 'j2'], votes.slice(1), []).advancementTies[0].complete, false);
  const decided = advancement(rows, 1, ['j0', 'j1', 'j2'], votes, [{ key: tie.key, order: ['c', 'b', 'a'], shared: false, explanation: '', decidedAt: '', judgeId: 'j2', role: 'head', fingerprint: 'f' }]);
  assert.deepEqual(decided.advancingIds, ['c']);
  assert.ok(rows.every((r) => r.average === 4.5));
});
