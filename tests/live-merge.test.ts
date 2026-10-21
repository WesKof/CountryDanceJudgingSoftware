import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeLiveView } from '../lib/live/merge.ts';
import type { LiveView } from '../lib/live/types.ts';
import { liveFixture } from './live-fixture.ts';
import { freezeRound } from '../lib/live/validation.ts';

test('delayed reads cannot roll back an acknowledged cell or room version; new round generations replace old ballots', () => {
  const current: LiveView = { eventId: 'e', version: 2, status: 'active', setup: liveFixture(2), context: { blockId: 'b', performanceId: 'song2', visited: ['song1', 'song2'] }, role: 'judge', judgeId: 'j', rounds: [], ballots: [{ roundKey: 'r:1', judgeId: 'j', version: 3, locked: false, cells: { 'song1:s': { mark: 'A2', note: 'Acknowledged', revision: 3, mutationId: 'm' } } }] };
  const delayed = structuredClone(current); delayed.ballots[0].version = 2; delayed.ballots[0].cells['song1:s'] = { mark: 'Yes', note: 'Old', revision: 2, mutationId: 'old' };
  assert.equal(mergeLiveView(current, delayed).ballots[0].cells['song1:s'].note, 'Acknowledged');
  delayed.version = 1; delayed.context.performanceId = 'song1'; assert.equal(mergeLiveView(current, delayed).context.performanceId, 'song2');
  const reopened = structuredClone(current); reopened.version = 3; reopened.ballots[0].roundKey = 'r:2'; reopened.ballots[0].version = 0; reopened.ballots[0].cells = {};
  assert.deepEqual(mergeLiveView(current, reopened).ballots[0].cells, {});
  current.heatSubmissions = [{ id: 'heat-submission', roundKey: 'r:1', judgeId: 'j', heatId: 'h', version: 1, ballotVersion: 3, createdAt: '' }];
  const oldPoll = structuredClone(current); oldPoll.heatSubmissions = [];
  assert.equal(mergeLiveView(current, oldPoll).heatSubmissions?.[0].id, 'heat-submission');
});

test('organizer scores resist delayed draft/submission reads but accept new authoritative event state and generations', () => {
  const setup = liveFixture(2);
  const current: LiveView = { eventId: 'e', version: 2, status: 'active', setup, context: { blockId: null, performanceId: null, visited: [] }, role: 'organizer', judgeId: null, ballots: [], rounds: [{ id: 'r', key: 'r:1', generation: 1, version: 1, phase: 'dancing', definition: freezeRound(setup, setup.rounds[0]), liveScores: [{ heatId: 'h', judgeId: 'j', ballotVersion: 3, submissionVersion: 0, marks: { 'song:s': 'No' } }] }] };
  const stale = structuredClone(current);
  stale.rounds[0].liveScores![0] = { heatId: 'h', judgeId: 'j', ballotVersion: 2, submissionVersion: 0, marks: { 'song:s': 'Yes' } };
  assert.equal(mergeLiveView(current, stale).rounds[0].liveScores![0].marks['song:s'], 'No');
  current.rounds[0].liveScores![0].submissionVersion = 1;
  stale.rounds[0].liveScores![0].ballotVersion = 4;
  assert.equal(mergeLiveView(current, stale).rounds[0].liveScores![0].submissionVersion, 1);
  const amended = structuredClone(current);
  amended.version++;
  amended.rounds[0].liveScores![0].submissionVersion = 2;
  amended.rounds[0].liveScores![0].marks['song:s'] = '';
  assert.equal(mergeLiveView(current, amended).rounds[0].liveScores![0].marks['song:s'], '');
  const reopened = structuredClone(stale); reopened.rounds[0].key = 'r:2';
  assert.equal(mergeLiveView(current, reopened).rounds[0].liveScores![0].submissionVersion, 0);
  const judge = structuredClone(stale); judge.role = 'judge'; delete judge.rounds[0].liveScores;
  assert.equal(mergeLiveView(current, judge).rounds[0].liveScores, undefined);
});

test('late polls cannot unlock a submitted stage or move completed stage results back into dancing', () => {
  const setup = liveFixture(2);
  const current: LiveView = { eventId: 'stage', version: 7, status: 'active', setup, context: { blockId: 'b', performanceId: null, visited: [], stageSubmission: true, stageReviewOpen: true }, role: 'judge', judgeId: 'j', ballots: [{ roundKey: 'r:1', judgeId: 'j', version: 5, locked: true, cells: {} }], rounds: [{ id: 'r', key: 'r:1', generation: 1, version: 2, phase: 'discussion', definition: freezeRound(setup, setup.rounds[0]) }] };
  const late = structuredClone(current); late.ballots[0].version = 4; late.ballots[0].locked = false; late.rounds[0].version = 1; late.rounds[0].phase = 'dancing';
  const merged = mergeLiveView(current, late);
  assert.equal(merged.ballots[0].locked, true); assert.equal(merged.rounds[0].phase, 'discussion');
});
