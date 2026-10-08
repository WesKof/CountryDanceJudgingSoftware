import test from 'node:test';
import assert from 'node:assert/strict';
import { liveFixture } from './live-fixture.ts';
import { freezeRound, roundOpeningIssues, validateSetup } from '../lib/live/validation.ts';
import { deriveStandings, missingCells, requiredCells } from '../lib/live/scoring.ts';
import { cellKey, type Cells, type LiveSubmission, type TieDecision } from '../lib/live/types.ts';

test('live averages use exact tenths and only the entrant’s assigned heat', () => {
  const setup = liveFixture(); const round = freezeRound(setup, setup.rounds[0]);
  const submissions = round.judgeIds.map((judgeId, judgeIndex): LiveSubmission => {
    const cells: Cells = Object.fromEntries(requiredCells(round).map((c, index) => [c.key, { mark: judgeIndex === 0 ? 'A1' : 'A2', note: '', revision: 1, mutationId: String(index) }]));
    return { id: judgeId, judgeId, roundKey: 'round:1', cells, ballotVersion: 1, createdAt: '' };
  });
  const result = deriveStandings(round, submissions);
  assert.equal(result.complete, true); assert.equal(result.rows.length, 22);
  assert.equal(result.rows[0].average, 4.4); assert.equal(result.rows[0].sumTenths, 264); assert.equal(result.rows[0].denominator, 6);
  assert.deepEqual(deriveStandings(round, submissions.slice(0, 1)).rows, []);
  delete submissions[0].cells[cellKey(round.heats[0].songs[0].id, round.subjects[0].id)];
  assert.equal(missingCells(round, submissions[0].cells).length, 1);
  assert.equal(deriveStandings(round, submissions).rows.length, 21);
});
test('No is complete, role groups stay separate, and head decisions leave averages intact', () => {
  const setup = liveFixture(2); const round = freezeRound(setup, setup.rounds[4]);
  const submissions = round.judgeIds.map((judgeId): LiveSubmission => ({ id: judgeId, judgeId, roundKey: 'round:1', cells: Object.fromEntries(requiredCells(round).map((c) => [c.key, { mark: 'No', note: '', revision: 1, mutationId: '' }])), ballotVersion: 1, createdAt: '' }));
  const initial = deriveStandings(round, submissions); assert.equal(initial.complete, true); assert.equal(initial.ties.length, 2);
  assert.equal(initial.rows[0].average, 0); assert.equal(missingCells(round, submissions[0].cells).length, 0);
  const decisions: TieDecision[] = initial.ties.map((t) => ({ key: t.key, order: [...t.subjectIds].reverse(), shared: t.group === 'Follows', explanation: 'Reviewed', decidedAt: '', judgeId: setup.headJudgeId, role: 'head', fingerprint: 'f' }));
  const result = deriveStandings(round, submissions, decisions);
  assert.deepEqual(result.rows.filter((r) => r.group === 'Leads').map((r) => r.place), [1, 2]);
  assert.deepEqual(result.rows.filter((r) => r.group === 'Follows').map((r) => r.place), [1, 1]);
  assert.ok(result.rows.every((r) => r.average === 0 && r.decided));
});
test('setup validation rejects duplicated assignments, wrong pairs and missing finalists', () => {
  const setup = liveFixture(2); assert.doesNotThrow(() => validateSetup(setup));
  const duplicate = structuredClone(setup); duplicate.rounds[0].heats[0].subjectIds.push(duplicate.rounds[0].subjects[0].id);
  assert.throws(() => validateSetup(duplicate), /Duplicate heat/);
  const prelim = setup.rounds[4], finals = setup.rounds[5];
  finals.finalistIds = prelim.subjects.map((s) => s.id); finals.finalistCount = 2;
  finals.subjects = [0, 1].map((i) => ({ id: crypto.randomUUID(), number: i + 301, primary: prelim.subjects[i].primary, secondary: prelim.subjects[i + 2].primary, members: [prelim.subjects[i].id, prelim.subjects[i + 2].id] }));
  finals.heats[0].subjectIds = finals.subjects.map((s) => s.id);
  assert.doesNotThrow(() => freezeRound(setup, finals));
  finals.subjects[1].members = finals.subjects[0].members;
  assert.throws(() => freezeRound(setup, finals), /Duplicate finalist pair/);
});

test('opening checks identify the division, empty heat and unassigned bibs', () => {
  const setup = liveFixture(2), round = setup.rounds[0];
  const empty = { ...structuredClone(round.heats[0]), id: crypto.randomUUID(), name: 'Heat 2', subjectIds: [], songs: round.heats[0].songs.map((p) => ({ ...p, id: crypto.randomUUID() })) };
  round.heats.push(empty);
  assert.match(roundOpeningIssues(setup, round)[0], /Strictly · Beginner \/ Intermediate · prelims: Heat 2 has no entrants/);
  assert.throws(() => freezeRound(setup, round), /Heat 2 has no entrants/);
  round.heats.splice(0, 1);
  assert.equal(round.subjects.length, 2);
  assert.ok(roundOpeningIssues(setup, round).some((issue) => issue.includes('Assign bibs 101, 102')));
  round.heats[0].subjectIds = round.subjects.map((s) => s.id);
  assert.deepEqual(roundOpeningIssues(setup, round), []);
  assert.doesNotThrow(() => freezeRound(setup, round));
});
