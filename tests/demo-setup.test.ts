import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, isAppState } from '../lib/domain.ts';
import { applyLocalSetup, localSetup, reconcileLocalSetup, removeLocalCompetition } from '../lib/demo-setup.ts';
import { validateSetup } from '../lib/live/validation.ts';

test('local setup extension preserves legacy totals, marks and revisions; last removal is reloadable', () => {
  const state = createDefaultState();
  state.competitions[0].revisions = [{ id: 'r1', createdAt: '2026-10-08', label: 'Original', rows: [] }];
  const setup = validateSetup(localSetup(state));
  setup.venue = 'Synthetic venue';
  setup.rounds[0].heats.push({ ...structuredClone(setup.rounds[0].heats[0]), id: 'second-heat', subjectIds: [], songs: [] });
  const updated = applyLocalSetup(state, setup);
  assert.deepEqual(updated.competitions[0].scores, state.competitions[0].scores);
  assert.deepEqual(updated.competitions[0].revisions, state.competitions[0].revisions);
  assert.equal(updated.event.venue, 'Synthetic venue');
  const one = removeLocalCompetition(updated, updated.activeCompetitionId);
  assert.equal(one.activeCompetitionId, state.competitions[1].id);
  assert.deepEqual(one.competitions[0], state.competitions[1]);
  const empty = removeLocalCompetition(one, one.activeCompetitionId);
  assert.equal(empty.competitions.length, 0);
  assert.equal(empty.activeCompetitionId, '');
  assert.equal(empty.removedCompetitions?.length, 2);
  assert.ok(isAppState(JSON.parse(JSON.stringify(empty))));
  assert.deepEqual(empty.judges, state.judges);
  assert.ok(isAppState(state));
  assert.ok(!isAppState({ ...empty, activeCompetitionId: 'missing' }));
});

test('legacy editor changes reconcile with rich setup without duplicating rounds or losing assignments/history', () => {
  const original = createDefaultState(), state = applyLocalSetup(original, validateSetup(localSetup(original)));
  const first = state.competitions[0], rid = state.demoSetup!.rounds.find((r) => r.competitionId === first.id && r.kind === (/final/i.test(first.round) ? 'finals' : 'prelims'))!.id;
  state.event.venue = 'Edited legacy venue'; first.division = 'Edited division'; first.entries.pop();
  state.judges[0].name = 'Edited legacy judge';
  const next = reconcileLocalSetup(state);
  assert.equal(next.demoSetup!.venue, state.event.venue);
  assert.equal(next.demoSetup!.competitions[0].division, first.division);
  assert.equal(next.demoSetup!.judges[0].name, state.judges[0].name);
  assert.equal(next.demoSetup!.rounds.length, state.demoSetup!.rounds.length);
  assert.equal(next.demoSetup!.rounds.find((r) => r.id === rid)!.subjects.length, first.entries.length);
  assert.ok(next.demoSetup!.rounds.find((r) => r.id === rid)!.heats[0].subjectIds.every((id) => first.entries.some((e) => e.id === id)));
  assert.deepEqual(next.competitions[0].scores, original.competitions[0].scores);
  const restored = applyLocalSetup(next, validateSetup(next.demoSetup));
  assert.equal(restored.competitions[0].entries.length, first.entries.length);
  assert.equal(restored.competitions[0].division, first.division);
});
