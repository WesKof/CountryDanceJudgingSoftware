import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedEventSummary, eventChangeState } from '../lib/live/event-summary.ts';
import type { EventSummary } from '../lib/live/types.ts';

const original: EventSummary = { eventId: 'retained-event', version: 7, status: 'active', name: 'Synthetic event', venue: '', date: '', competitionCount: 0 };
test('summary validation accepts the complete lightweight contract including blank optional text and returns only allowed fields', () => {
  const input = { ...original, privateNotes: 'MUST_NOT_BE_RETAINED' }, before = JSON.stringify(input);
  const summary = checkedEventSummary(input);
  assert.deepEqual(summary, original); assert.notEqual(summary, input); assert.equal(JSON.stringify(input), before);
  assert.deepEqual(checkedEventSummary({ ...original, status: 'archived', competitionCount: 3, date: '2026-10-25' }), { ...original, status: 'archived', competitionCount: 3, date: '2026-10-25' });
});

test('partial, array, unusable identity, status, text and unsafe numeric replies cannot replace remembered metadata', () => {
  for (const input of [null, [], {}, ...Object.keys(original).map(key => Object.fromEntries(Object.entries(original).filter(([name]) => name !== key))),
    ...['', '   ', ' event ', 3, null].map(eventId => ({ ...original, eventId })), ...['deleted', 1, null].map(status => ({ ...original, status })),
    ...[0, -1, 1.2, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '7'].map(version => ({ ...original, version })),
    ...[-1, 1.2, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '0'].map(competitionCount => ({ ...original, competitionCount })),
    ...['name', 'date', 'venue'].flatMap(key => [null, 1, false, []].map(value => ({ ...original, [key]: value })))]) assert.equal(checkedEventSummary(input), null);
});

test('known identity and version guard cross-event and stale reads without mutating the remembered record', () => {
  const known = { eventId: original.eventId, summaryVersion: original.version }, before = JSON.stringify(known);
  assert.equal(checkedEventSummary({ ...original, eventId: 'another-event' }, known), null);
  assert.equal(checkedEventSummary({ ...original, version: 6 }, known), null);
  assert.deepEqual(checkedEventSummary(original, known), original);
  assert.deepEqual(checkedEventSummary({ ...original, version: 8 }, known), { ...original, version: 8 });
  assert.equal(JSON.stringify(known), before);
});

test('lifecycle confirmation needs a real acknowledgement and exact next version, identity and requested status', () => {
  const archived = { ...original, version: 8, status: 'archived' as const };
  for (const acknowledgement of [undefined, null, {}, [], { ok: false }, { ok: 'true' }]) {
    assert.equal(eventChangeState(acknowledgement, original, archived, 'archive'), 'unconfirmed');
    assert.equal(eventChangeState(acknowledgement, original, { ...original }, 'archive'), 'unchanged', 'a checked unchanged state allows deliberate retry without implying delivery');
  }
  assert.equal(eventChangeState({ ok: true }, original, null, 'archive'), 'unconfirmed');
  assert.equal(eventChangeState({ ok: true }, original, original, 'archive'), 'unconfirmed', 'an accepted action followed by old state remains stale');
  assert.equal(eventChangeState({}, original, original, 'reactivate'), 'unconfirmed', 'retry must remain eligible for the requested action');
  assert.equal(eventChangeState({}, archived, archived, 'archive'), 'unconfirmed');
  assert.equal(eventChangeState({ ok: true }, original, { ...archived, eventId: 'another-event' }, 'archive'), 'unconfirmed');
  assert.equal(eventChangeState({ ok: true }, original, { ...archived, version: 7 }, 'archive'), 'unconfirmed');
  assert.equal(eventChangeState({ ok: true }, original, { ...archived, status: 'active' }, 'archive'), 'unconfirmed');
  assert.equal(eventChangeState({ ok: true }, original, archived, 'archive'), 'confirmed');
  assert.equal(eventChangeState({ ok: true }, archived, { ...archived, version: 9, status: 'active' }, 'reactivate'), 'confirmed');
  for (const status of ['active', 'archived'] as const) assert.equal(eventChangeState({ ok: true }, original, { ...archived, version: 9, status }, 'archive'), 'changed-again');
  assert.deepEqual(original, { eventId: 'retained-event', version: 7, status: 'active', name: 'Synthetic event', venue: '', date: '', competitionCount: 0 });
});
