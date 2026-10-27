import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, finalsFixture, harness, tie } from './organizer-review-render-harness.mjs';

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
    h.setView(next); h.render(); assert.equal(h.cards().length, 1); assert.match(h.text(h.hero()), /Head tie decision needed/); assert.match(h.text(h.cards()[0]), /Head tie decision needed/);
    assert.deepEqual(h.env.posts, []);
  } finally { h.restore(); }
});

test('mixed competitions keep both panel voting and currently available head review visible', async () => {
  const data = fixture(), head = data.setup.headJudgeId;
  data.rounds[0].standings.advancementTies = [tie(data.rounds[0], [head])];
  const ready = data.rounds[1]; ready.standings.advancementTies = [tie(ready, ready.definition.judgeIds)]; ready.standings.advancementTies[0].deadlocked = true;
  const h = await harness(data);
  try { h.render(); assert.match(h.text(h.hero()), /Panel votes and head review needed/); assert.match(h.text(h.hero()), /Head tie decisions can be recorded now/); assert.equal(h.cards().length, 3); assert.match(h.text(h.cards().find(c => h.text(c).includes('Head Judge'))), /Head tie decision needed/); }
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

test('complete-panel deadlock identifies a head decision and returns to approval after resolution', async () => {
  const data = fixture(); data.rounds.forEach(r => { const t = tie(r, r.definition.judgeIds); t.deadlocked = true; r.standings.advancementTies = [t]; r.standings.ties = [{ key: t.key, group: t.group, subjectIds: t.subjectIds }]; });
  const original = structuredClone(data), h = await harness(data);
  try {
    h.render(); assert.match(h.text(h.hero()), /Waiting for head decision/); assert.match(h.text(h.hero()), /Head tie decision needed/); assert.match(h.text(h.hero()), /Review each competition’s approval separately/);
    assert.equal(h.cards().length, 1); assert.match(h.text(h.cards()[0]), /Head tie decision needed/); assert.match(h.cards()[0].props.className, /is-pending/);
    const beforeLink = h.nodes(h.cards()[0]).find(n => n.type === 'a')!.props.href;
    assert.deepEqual(data, original); const next = structuredClone(data); next.rounds.forEach(r => { r.standings.advancementTies[0].complete = true; });
    h.setView(next); h.render(); assert.match(h.text(h.hero()), /Head approval needed/); assert.doesNotMatch(h.text(h.hero()), /Head tie decision needed/); assert.equal(h.nodes(h.cards()[0]).find(n => n.type === 'a')!.props.href, beforeLink); assert.deepEqual(h.env.posts, []);
  } finally { h.restore(); }
});

test('a ready deadlock in one group remains actionable while another group in the same round awaits votes', async () => {
  const data = fixture(), r = data.rounds[0], ready = tie(r, r.definition.judgeIds, 'ready-group'), pending = tie(r, [r.definition.judgeIds[0]], 'pending-group'); ready.deadlocked = true;
  r.standings.advancementTies = [ready, pending]; data.rounds[1].standings.approved = true;
  const h = await harness(data);
  try { h.render(); assert.match(h.text(h.hero()), /Panel votes and head review needed/); assert.match(h.text(h.hero()), /Head tie decisions can be recorded now/); const head = h.cards().find(c => h.text(c).includes('Head Judge'))!; assert.match(h.text(head), /Advancement vote needed/); assert.ok(h.nodes(head).some(n => n.type === 'a')); assert.deepEqual(h.env.posts, []); }
  finally { h.restore(); }
});

test('missing or non-panel votes and incomplete results do not invent a ready head decision', async () => {
  for (const mode of ['missing', 'non-panel', 'extra-vote', 'incomplete']) {
    const data = fixture(); data.rounds.forEach(r => { const voters = mode === 'non-panel' ? [...r.definition.judgeIds.slice(0, -1), 'outsider'] : mode === 'missing' ? r.definition.judgeIds.slice(0, -1) : mode === 'extra-vote' ? [...r.definition.judgeIds, 'outsider'] : r.definition.judgeIds; const t = tie(r, voters); t.deadlocked = true; r.standings.advancementTies = [t]; if (mode === 'incomplete') r.standings.complete = false; });
    const h = await harness(data); try { h.render(); assert.doesNotMatch(h.text(h.hero()), /Head tie decision needed|Head tie decisions can be recorded now/); if (mode === 'missing' || mode === 'non-panel') assert.match(h.text(h.hero()), /Panel votes needed/); } finally { h.restore(); }
  }
});

test('Finals placement ties use existing unresolved-place semantics without changing No zero scores', async () => {
  const data = finalsFixture(), finals = data.rounds.filter(r => r.definition.kind === 'finals');
  assert.ok(finals.every(r => r.standings.complete && r.standings.rows.some(row => !row.decided)));
  assert.ok(finals.flatMap(r => r.standings.rows).every(row => row.average === 0));
  const original = structuredClone(data), h = await harness(data);
  try { h.render(); assert.match(h.text(h.hero()), /Head tie decision needed/); assert.match(h.text(h.cards()[0]), /Head tie decision needed/); assert.deepEqual(data, original);
    const next = structuredClone(data); next.rounds.filter(r => r.definition.kind === 'finals').forEach(r => r.standings.rows.forEach(row => { row.decided = true; }));
    h.setView(next); h.render(); assert.match(h.text(h.hero()), /Head approval needed/); assert.ok(next.rounds.filter(r => r.definition.kind === 'finals').flatMap(r => r.standings.rows).every(row => row.average === 0)); assert.deepEqual(h.env.posts, []);
  } finally { h.restore(); }
});

test('approved, other-stage and scoring deadlocks do not replace current review guidance', async () => {
  for (const mode of ['approved', 'other-stage', 'scoring']) {
    const data = fixture(), r = data.rounds[0], t = tie(r, r.definition.judgeIds); t.deadlocked = true; r.standings.advancementTies = [t];
    if (mode === 'approved') { r.standings.approved = true; r.phase = 'approved'; }
    else if (mode === 'other-stage') data.setup.blocks[0].roundIds = data.setup.blocks[0].roundIds.filter(id => id !== r.id);
    else data.rounds.forEach(r => { r.phase = 'dancing'; });
    const h = await harness(data); try { h.render(); assert.doesNotMatch(h.text(h.hero()), /Head tie decision needed|Waiting for head decision/); } finally { h.restore(); }
  }
});

test('revoked head decision card preserves the exact existing recovery control and accessible name', async () => {
  const data = fixture(); data.rounds.forEach(r => { const t = tie(r, r.definition.judgeIds); t.deadlocked = true; r.standings.advancementTies = [t]; });
  const head = data.judgeLinks.find(j => j.id === data.setup.headJudgeId)!; head.revoked = true;
  const h = await harness(data); try { h.render(); const card = h.cards()[0]; assert.match(h.text(card), /Head tie decision needed/); assert.equal(h.nodes(card).filter(n => n.type === 'a').length, 0); const manage = h.nodes(card).find(n => n.type === 'button')!; assert.equal(manage.props['aria-label'], 'Manage link for ' + head.name); assert.equal(manage.props['aria-controls'], 'judge-link-controls-' + head.id); assert.deepEqual(h.env.posts, []); } finally { h.restore(); }
});
