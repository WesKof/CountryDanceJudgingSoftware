import assert from 'node:assert/strict';
import test from 'node:test';
import type { Competition, Judge } from '../lib/domain.ts';
import { ballotProgress, calculateResults, scoreTotal } from '../lib/scoring.ts';

const judges: Judge[] = [
  { id: 'j1', name: 'One' },
  { id: 'j2', name: 'Two' },
];

function competition(): Competition {
  return {
    id: 'c1',
    name: 'Strictly',
    format: 'Strictly',
    division: 'Open',
    round: 'Finals',
    entries: [
      { id: 'a', number: 10, lead: 'A', follow: 'AA' },
      { id: 'b', number: 20, lead: 'B', follow: 'BB' },
      { id: 'c', number: 30, lead: 'C', follow: 'CC' },
    ],
    scores: {
      a: { j1: 'Yes', j2: 'A1' },
      b: { j1: 'Yes', j2: 'A1' },
      c: { j1: 'A2', j2: '' },
    },
    revisions: [],
  };
}

test('legacy mark values are preserved', () => {
  assert.equal(scoreTotal(['Yes', 'A1', 'A2', 'No']), 18.8);
});

test('incomplete entries are excluded and equal totals share place', () => {
  const rows = calculateResults(competition(), judges);
  assert.deepEqual(rows.map(({ entryId, place, tied }) => ({ entryId, place, tied })), [
    { entryId: 'a', place: 1, tied: true },
    { entryId: 'b', place: 1, tied: true },
  ]);
});

test('ballot completeness counts every entry and judge', () => {
  assert.deepEqual(ballotProgress(competition(), judges), { selected: 5, total: 6, complete: false });
});

test('competition ranking skips the next place after a shared tie', () => {
  const input = competition();
  input.scores.c = { j1: 'A2', j2: 'A2' };
  const rows = calculateResults(input, judges);
  assert.deepEqual(rows.map((row) => row.place), [1, 1, 3]);
});

test('Jack & Jill leads and follows are ranked independently', () => {
  const input: Competition = {
    id: 'jj',
    name: 'Jack & Jill',
    format: 'Jack & Jill',
    division: 'Novice',
    round: 'Finals',
    entries: [
      { id: 'lead', number: 1, name: 'Lead dancer', role: 'Lead' },
      { id: 'follow', number: 2, name: 'Follow dancer', role: 'Follow' },
    ],
    scores: {
      lead: { j1: 'A1', j2: 'A1' },
      follow: { j1: 'Yes', j2: 'Yes' },
    },
    revisions: [],
  };
  assert.deepEqual(calculateResults(input, judges).map(({ group, place }) => ({ group, place })), [
    { group: 'Leads', place: 1 },
    { group: 'Follows', place: 1 },
  ]);
});
