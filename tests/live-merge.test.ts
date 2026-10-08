import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeLiveView } from '../lib/live/merge.ts';
import type { LiveView } from '../lib/live/types.ts';
import { liveFixture } from './live-fixture.ts';

test('delayed reads cannot roll back an acknowledged cell or room version; new round generations replace old ballots', () => {
  const current: LiveView = { eventId: 'e', version: 2, status: 'active', setup: liveFixture(2), context: { blockId: 'b', performanceId: 'song2', visited: ['song1', 'song2'] }, role: 'judge', judgeId: 'j', rounds: [], ballots: [{ roundKey: 'r:1', judgeId: 'j', version: 3, locked: false, cells: { 'song1:s': { mark: 'A2', note: 'Acknowledged', revision: 3, mutationId: 'm' } } }] };
  const delayed = structuredClone(current); delayed.ballots[0].version = 2; delayed.ballots[0].cells['song1:s'] = { mark: 'Yes', note: 'Old', revision: 2, mutationId: 'old' };
  assert.equal(mergeLiveView(current, delayed).ballots[0].cells['song1:s'].note, 'Acknowledged');
  delayed.version = 1; delayed.context.performanceId = 'song1'; assert.equal(mergeLiveView(current, delayed).context.performanceId, 'song2');
  const reopened = structuredClone(current); reopened.version = 3; reopened.ballots[0].roundKey = 'r:2'; reopened.ballots[0].version = 0; reopened.ballots[0].cells = {};
  assert.deepEqual(mergeLiveView(current, reopened).ballots[0].cells, {});
});
