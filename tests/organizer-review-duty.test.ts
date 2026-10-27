import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, harness, tie } from './organizer-review-render-harness.mjs';

test('missing panel votes name the current duty and expose the required judge links', async () => {
  const data = fixture(), round = data.rounds[0]; round.standings.advancementTies = [tie(round)];
  // No independent ready round: all current review is awaiting panel votes.
  data.rounds[1].standings.advancementTies = [tie(data.rounds[1])];
  const original = structuredClone(data), h = await harness(data);
  try {
    h.render(); assert.match(h.text(h.hero()), /Panel votes needed/);
    assert.match(h.text(h.hero()), /Synthetic one, Synthetic two, Synthetic head must submit advancement votes/);
    assert.equal(h.cards().length, 3);
    for (const card of h.cards()) assert.match(h.text(card), /Advancement vote needed/);
    for (const link of h.nodes().filter(n => n.type === 'a' && String(n.props.href).startsWith('/fictional-judge/'))) {
      assert.ok(data.judgeLinks.some(j => j.path === link.props.href)); assert.equal(link.props.target, '_blank'); assert.equal(link.props.rel, 'noreferrer');
    }
    assert.deepEqual(data, original); assert.deepEqual(h.env.posts, []);
  } finally { h.restore(); }
});

test('polling deduplicates actual pending voters and returns to head-only review after votes arrive', async () => {
  const data = fixture(), [first, second, head] = data.setup.judges.map(j => j.id);
  data.rounds.forEach(r => { r.standings.advancementTies = [tie(r, [head]), tie(r, [head], 'second-cutoff')]; });
  const h = await harness(data);
  try {
    h.render(); assert.equal(h.cards().length, 3); assert.equal(h.cards().filter(c => h.text(c).includes('Advancement vote needed')).length, 2);
    assert.match(h.text(h.cards().find(c => h.text(c).includes('Head Judge'))), /Waiting for panel votes/);
    const next = structuredClone(data); next.rounds.forEach(r => r.standings.advancementTies.forEach(t => { t.votes = tie(r, [first, second, head]).votes; t.deadlocked = true; }));
    h.setView(next); h.render(); assert.equal(h.cards().length, 1); assert.match(h.text(h.hero()), /Head approval needed/); assert.match(h.text(h.cards()[0]), /Head approval needed/);
    assert.deepEqual(h.env.posts, []);
  } finally { h.restore(); }
});

test('mixed competitions keep both panel voting and currently available head review visible', async () => {
  const data = fixture(), head = data.setup.headJudgeId;
  data.rounds[0].standings.advancementTies = [tie(data.rounds[0], [head])];
  const ready = data.rounds[1]; ready.standings.advancementTies = [tie(ready, ready.definition.judgeIds)]; ready.standings.advancementTies[0].deadlocked = true;
  const h = await harness(data);
  try { h.render(); assert.match(h.text(h.hero()), /Panel votes and head review needed/); assert.match(h.text(h.hero()), /Head review can continue/); assert.equal(h.cards().length, 3); assert.match(h.text(h.cards().find(c => h.text(c).includes('Head Judge'))), /Head approval needed/); }
  finally { h.restore(); }
});

test('only exact frozen panels on current unapproved discussion rounds determine voter duty', async () => {
  const data = fixture(), [first, second, head] = data.setup.judges.map(j => j.id);
  data.rounds[0].definition.judgeIds = [first, second]; data.rounds[0].definition.judges = data.rounds[0].definition.judges.filter(j => j.id !== head);
  data.rounds[0].standings.advancementTies = [tie(data.rounds[0], [first, head, 'unassigned-person'])];
  data.rounds[1].phase = 'approved'; data.rounds[1].standings.approved = true; data.rounds[1].standings.advancementTies = [tie(data.rounds[1])];
  const historical = structuredClone(data.rounds[0]); historical.id += '-old'; historical.key += '-old'; historical.definition.blockId = 'old-block'; historical.standings.advancementTies = [tie(historical)]; data.rounds.push(historical);
  const h = await harness(data);
  try { h.render(); assert.equal(h.cards().length, 2); assert.match(h.text(h.hero()), /Synthetic two must submit advancement votes/); assert.doesNotMatch(h.text(h.hero()), /Synthetic one must/); assert.match(h.text(h.cards().find(c => h.text(c).includes('Synthetic two'))), /Advancement vote needed/); assert.match(h.text(h.cards().find(c => h.text(c).includes('Head Judge'))), /Waiting for panel votes/); }
  finally { h.restore(); }
});

test('revoked pending-voter links stay non-clickable with the existing exact management target', async () => {
  const data = fixture(); data.rounds.forEach(r => { r.standings.advancementTies = [tie(r)]; }); data.judgeLinks[0].revoked = true;
  const h = await harness(data);
  try { h.render(); const card = h.cards().find(c => h.text(c).includes('Synthetic one'))!; assert.match(h.text(card), /Link revoked/); assert.equal(h.nodes(card).filter(n => n.type === 'a').length, 0); const control = h.nodes(card).find(n => n.type === 'button' && n.props['aria-label'] === 'Manage link for Synthetic one')!; assert.equal(control.props['aria-controls'], 'judge-link-controls-' + data.judgeLinks[0].id); assert.equal(typeof control.props.onClick, 'function'); assert.deepEqual(h.env.posts, []); }
  finally { h.restore(); }
});

test('ordinary no-tie review preserves the existing head-only navigation and action payload boundaries', async () => {
  const data = fixture(), h = await harness(data);
  try { h.render(); assert.equal(h.cards().length, 1); assert.match(h.text(h.hero()), /Head approval needed/); const review = h.nodes().find(n => n.type === 'button' && h.text(n) === 'Review prelims results')!; review.props.onClick(); h.render(); assert.deepEqual(h.env.pages, [2]); assert.equal(h.env.selections.at(-1)?.value, data.rounds[0].id); assert.equal(h.env.childProps.review.data, data); assert.equal(typeof h.env.childProps.review.action, 'function'); assert.deepEqual(h.env.posts, []); }
  finally { h.restore(); }
});

test('scoring ignores review ties and keeps submission status separate from vote duty', async () => {
  const data = fixture(); data.rounds.forEach(r => { r.phase = 'dancing'; r.standings.advancementTies = [tie(r)]; });
  const h = await harness(data);
  try { h.render(); assert.match(h.text(h.hero()), /Judging in progress/); assert.doesNotMatch(h.text(h.hero()), /Panel votes needed/); assert.equal(h.cards().length, 3); h.cards().forEach(c => assert.match(h.text(c), /Stage submitted/)); }
  finally { h.restore(); }
});

test('approved Finals and archived states retain their existing completion and read-only cues', async () => {
  for (const status of ['active', 'archived']) {
    const data = fixture(); data.rounds.forEach(r => { r.phase = 'approved'; r.standings.approved = true; r.definition.kind = 'finals'; r.standings.advancementTies = [tie(r)]; });
    data.status = status; const h = await harness(data);
    try { h.render(); assert.match(h.text(h.hero()), status === 'archived' ? /Archived event/ : /Event results approved/); assert.equal(h.cards().length, 0); assert.deepEqual(h.env.posts, []); } finally { h.restore(); }
  }
});

test('completed ties and already-approved rounds do not create panel voting duties', async () => {
  const data = fixture(); data.rounds[0].standings.advancementTies = [tie(data.rounds[0])]; data.rounds[0].standings.advancementTies[0].complete = true;
  data.rounds[1].standings.approved = true; data.rounds[1].standings.advancementTies = [tie(data.rounds[1])];
  const h = await harness(data); try { h.render(); assert.equal(h.cards().length, 1); assert.match(h.text(h.hero()), /Head approval needed/); } finally { h.restore(); }
});

test('actual Finals pairing preparation keeps its existing action and hides judge cards', async () => {
  const data = fixture(); data.rounds.forEach(r => { r.phase = 'approved'; r.standings.approved = true; });
  data.setup.competitions[0].format = 'Jack & Jill'; data.rounds[0].definition.format = 'Jack & Jill';
  const h = await harness(data);
  try { h.render(); assert.match(h.text(h.hero()), /Set the Finals pairings/); assert.equal(h.cards().length, 0); assert.deepEqual(h.env.posts, []); }
  finally { h.restore(); }
});

test('head voting duty stays explicit when another competition is already ready for head review', async () => {
  const data = fixture(); data.rounds[0].standings.advancementTies = [tie(data.rounds[0])];
  const h = await harness(data);
  try { h.render(); assert.match(h.text(h.hero()), /Panel votes and head review needed/); const card = h.cards().find(c => h.text(c).includes('Head Judge'))!; assert.match(h.text(card), /Advancement vote needed/); assert.ok(h.nodes(card).some(n => n.type === 'a' && n.props.href === data.judgeLinks.find(j => j.id === data.setup.headJudgeId)!.path)); }
  finally { h.restore(); }
});
