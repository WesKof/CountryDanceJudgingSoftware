import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, finalsFixture, harness } from './organizer-results-render-harness.mjs';
import type { RoundView } from '../lib/live/types.ts';

type Render = Awaited<ReturnType<typeof harness>>;
const links = (h: Render) => h.heroNodes().filter(n => n.type === 'a');
const button = (h: Render, label: string) => h.heroNodes().find(n => n.type === 'button' && h.text(n) === label)!;
const heading = (h: Render) => h.text(h.heroNodes().find(n => n.type === 'h2'));
const current = (f: ReturnType<typeof fixture>) => { const r = f.data.rounds.find(r => r.id === f.selected); assert.ok(r?.standings); return r as RoundView & { standings: NonNullable<RoundView['standings']> }; };

test('actual submitted No marks derive complete zero averages and pending panel duty after the head votes', async () => {
  const f = fixture(), r = current(f); f.derive(r, 'head-voted');
  assert.equal(r.standings.complete, true); assert.ok(r.standings.rows.every(row => row.average === 0));
  const original = structuredClone(f.data), h = await harness(f.data, f.selected);
  try {
    h.render(); assert.equal(heading(h), 'Panel votes needed');
    assert.match(h.text(h.hero()), /Waiting for Synthetic one, Synthetic two to vote/);
    assert.match(h.text(h.decisions()), /Waiting for Synthetic one, Synthetic two/);
    assert.deepEqual(links(h).map(n => n.props.href), f.data.judgeLinks.filter(j => j.id !== f.data.setup.headJudgeId).map(j => j.path));
    links(h).forEach(n => { assert.equal(n.props.className, 'primary-button'); assert.equal(n.props.target, '_blank'); assert.equal(n.props.rel, 'noreferrer'); assert.equal(n.props['aria-describedby'], 'results-panel-vote-duty'); });
    button(h, 'Review tie decisions & approval').props.onClick(); assert.deepEqual(h.env.reveals, ['results-decisions']);
    assert.deepEqual(f.data, original); assert.deepEqual(h.env.posts, []);
  } finally { h.restore(); }
});

test('head also owing a vote keeps the established accessible name and deduplicates group duties', async () => {
  const f = fixture('Jack & Jill'), r = current(f); f.derive(r, 'panel-empty');
  assert.equal(r.standings.advancementTies!.length, 2);
  const h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(heading(h), 'Panel votes needed'); assert.equal(links(h).length, 3); assert.equal(links(h).filter(n => h.text(n) === 'Open Head Judge — Synthetic head ↗').length, 1); assert.equal(new Set(links(h).map(n => n.props.href)).size, 3); }
  finally { h.restore(); }
});

test('mixed actual role groups show pending panel links and the separate ready head decision', async () => {
  const f = fixture('Jack & Jill'), r = current(f); f.derive(r, 'mixed');
  const h = await harness(f.data, f.selected);
  try {
    h.render(); assert.equal(heading(h), 'Panel votes and head review needed'); assert.match(h.text(h.hero()), /Head decisions can be recorded now for completed cutoff votes/);
    assert.equal(links(h).filter(n => n.props.className === 'primary-button').length, 2);
    const head = links(h).find(n => n.props.href.endsWith(f.data.setup.headJudgeId))!;
    assert.equal(head.props.className, 'quiet-button'); assert.equal(links(h).length, 3);
    assert.deepEqual(h.env.posts, []);
  } finally { h.restore(); }
});

test('polling follows the selected round from panel voting through decision to approval', async () => {
  const f = fixture(), r = current(f); f.derive(r, 'head-voted'); const h = await harness(f.data, f.selected);
  try {
    h.render(); assert.equal(heading(h), 'Panel votes needed');
    f.derive(r, 'deadlocked'); h.setView(f.data); h.render(); assert.equal(heading(h), 'Head tie decision needed'); assert.equal(links(h).length, 1);
    f.derive(r, 'resolved'); h.setView(f.data); h.render(); assert.equal(heading(h), 'Head approval needed'); assert.equal(links(h).length, 1);
    assert.doesNotMatch(h.text(h.hero()), /Waiting for|decisions can be recorded now/); assert.deepEqual(h.env.posts, []);
  } finally { h.restore(); }
});

test('a different round waiting for votes cannot change selected-round approval or links', async () => {
  const f = fixture(); f.derive(f.data.rounds[1], 'head-voted'); const h = await harness(f.data, f.selected);
  try {
    h.render(); assert.equal(heading(h), 'Head approval needed'); assert.equal(links(h).length, 1); assert.doesNotMatch(h.text(h.hero()), /Waiting for Synthetic/);
    h.setView(f.data, f.data.rounds[1].id); h.render(); assert.equal(heading(h), 'Panel votes needed'); assert.equal(links(h).length, 2);
  } finally { h.restore(); }
});

test('exact frozen panel membership ignores outsiders, duplicate votes, and mutable setup names', async () => {
  const f = fixture(), r = current(f); f.derive(r, 'head-voted');
  const t = r.standings.advancementTies![0]; t.votes.push({ ...t.votes[0] }, { ...t.votes[0], judgeId: 'outsider' }); t.deadlocked = true;
  f.data.setup.judges[0].name = 'Changed setup name'; r.definition.judgeIds.push(r.definition.judgeIds[0]);
  const h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(heading(h), 'Panel votes needed'); assert.match(h.text(h.hero()), /Synthetic one, Synthetic two/); assert.doesNotMatch(h.text(h.hero()), /Changed setup name|Head decisions can/); assert.equal(links(h).length, 2); }
  finally { h.restore(); }
});

test('incomplete numeric coverage cannot advertise ready panel voting or a head decision', async () => {
  const f = fixture(), r = current(f); f.derive(r, 'deadlocked'); r.standings.complete = false;
  const h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(heading(h), 'Results ready for review'); assert.doesNotMatch(h.text(h.hero()), /Panel votes needed|Head decisions can be recorded now/); }
  finally { h.restore(); }
});

for (const unavailable of ['revoked', 'missing'] as const) test(`${unavailable} pending-voter link uses supported shared access recovery`, async () => {
  const f = fixture(), r = current(f); f.derive(r, 'head-voted'); const id = r.definition.judgeIds[0], oldPath = f.data.judgeLinks.find(j => j.id === id)!.path;
  if (unavailable === 'revoked') f.data.judgeLinks.find(j => j.id === id)!.revoked = true;
  else f.data.judgeLinks = f.data.judgeLinks.filter(j => j.id !== id);
  const original = structuredClone(f.data), h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(links(h).length, 1); assert.ok(links(h).every(n => n.props.href !== oldPath)); assert.match(h.text(h.hero()), /Synthetic one: judge link unavailable or revoked/); const recovery = button(h, 'Manage judge access'); assert.equal(recovery.props['aria-describedby'], 'results-judge-access-help'); recovery.props.onClick(); assert.equal(h.env.headAccess, 1); assert.deepEqual(f.data, original); assert.deepEqual(h.env.posts, []); }
  finally { h.restore(); }
});

test('all unavailable pending links have a primary recovery and Score fallback when callback is absent', async () => {
  const f = fixture(); f.derive(current(f), 'head-voted'); f.data.judgeLinks = [];
  const h = await harness(f.data, f.selected, { openHeadAccess: false });
  try { h.render(); assert.equal(links(h).length, 0); assert.equal(button(h, 'Manage judge access').props.className, 'primary-button'); button(h, 'Manage judge access').props.onClick(); assert.deepEqual(h.env.navigation, [1]); assert.equal(h.env.headAccess, 0); assert.deepEqual(h.env.posts, []); }
  finally { h.restore(); }
});

test('revoked head access is irrelevant when only the other judges still owe votes', async () => {
  const f = fixture(); f.derive(current(f), 'head-voted'); f.data.judgeLinks.find(j => j.id === f.data.setup.headJudgeId)!.revoked = true;
  const h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(links(h).length, 2); assert.ok(!button(h, 'Open head judge access')); assert.ok(!button(h, 'Manage judge access')); assert.equal(h.env.headAccess, 0); }
  finally { h.restore(); }
});

for (const mode of ['deadlocked', 'approval']) test(`legitimate ${mode} retains the head recovery route when revoked`, async () => {
  const f = fixture(); f.derive(current(f), mode); f.data.judgeLinks.find(j => j.id === f.data.setup.headJudgeId)!.revoked = true;
  const h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(heading(h), mode === 'deadlocked' ? 'Head tie decision needed' : 'Head approval needed'); assert.equal(links(h).length, 0); button(h, 'Open head judge access').props.onClick(); assert.equal(h.env.headAccess, 1); }
  finally { h.restore(); }
});

test('actual Finals equal-average placement needs a head decision, not approval wording', async () => {
  const f = finalsFixture(), r = current(f); const original = structuredClone(f.data), h = await harness(f.data, f.selected);
  try { h.render(); assert.ok(r.standings.rows.some(row => !row.decided)); assert.equal(heading(h), 'Head tie decision needed'); assert.match(h.text(h.hero()), /Head placement decisions are needed/); assert.equal(links(h).length, 1); assert.deepEqual(f.data, original); }
  finally { h.restore(); }
});

test('no-result and archived views preserve scoring and read-only routes', async () => {
  const f = fixture(); delete f.data.rounds[0].standings; const h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(heading(h), 'Judging not yet concluded'); button(h, 'Go to Score').props.onClick(); assert.deepEqual(h.env.navigation, [1]); f.data.status = 'archived'; h.setView(f.data); h.render(); assert.equal(heading(h), 'Archived results · read only'); assert.equal(h.heroNodes().filter(n => n.type === 'a' || n.type === 'button').length, 0); }
  finally { h.restore(); }
});

test('approved-round navigation retains remaining competition, Finals, and publication steps', async () => {
  const f = fixture(), r = current(f); r.standings.approved = true; const h = await harness(f.data, f.selected);
  try {
    h.render(); button(h, 'Review remaining competition').props.onClick(); assert.deepEqual(h.env.selections, [f.data.rounds[1].id]);
    current({ ...f, selected: f.data.rounds[1].id }).standings.approved = true; h.setView(f.data); h.render(); button(h, 'Continue to Finals').props.onClick(); assert.equal(h.env.selections.at(-1), f.data.setup.rounds.find(x => x.prelimRoundId === f.selected)!.id); assert.deepEqual(h.env.navigation, [1]);
  } finally { h.restore(); }
  const ff = finalsFixture(); current(ff).standings.approved = true; const hh = await harness(ff.data, ff.selected);
  try { hh.render(); button(hh, 'Review remaining event requirements').props.onClick(); assert.deepEqual(hh.env.navigation, [3]); }
  finally { hh.restore(); }
});

test('finalist-count and pending-request workflows retain exact navigation and block approval-ready heading', async () => {
  const f = fixture(), r = current(f); r.standings.finalistCount = 999;
  const h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(heading(h), 'Results ready for review'); button(h, 'Review finalist count').props.onClick(); assert.deepEqual(h.env.setupRoutes, [{ id: f.data.setup.rounds.find(x => x.prelimRoundId === f.selected)!.id, section: 'Finalists & pairings' }]); }
  finally { h.restore(); }
  const next = fixture(); next.data.reviewRequests = [{ id: 'fictional-request', kind: 'correction', version: 1, reason: 'Synthetic review', requester: 'Synthetic organizer', createdAt: '2026-10-27T00:00:00Z', payload: { roundKey: current(next).key }, approvals: [] }];
  const hh = await harness(next.data, next.selected);
  try { hh.render(); assert.equal(heading(hh), 'Results ready for review'); assert.match(hh.text(hh.hero()), /1 pending correction\/withdrawal requests/); const control = hh.heroNodes().find(n => n.type === 'button' && hh.text(n).startsWith('Review request ·'))!; control.props.onClick(); assert.deepEqual(hh.env.reveals, ['review-request-fictional-request']); assert.deepEqual(hh.env.posts, []); }
  finally { hh.restore(); }
});

test('archived pending-vote results expose no active judge links or voting controls', async () => {
  const f = fixture(); f.derive(current(f), 'panel-empty'); f.data.status = 'archived';
  const h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(heading(h), 'Archived results · read only'); assert.equal(h.heroNodes().filter(n => n.type === 'a' || n.type === 'button').length, 0); assert.doesNotMatch(h.text(h.hero()), /Waiting for|Panel votes needed/); assert.deepEqual(h.env.posts, []); }
  finally { h.restore(); }
});

test('retained correction-draft shortcut preserves its exact context without retargeting', async () => {
  const f = fixture(), target = f.data.rounds[1], fields = { source: 'stage', songId: target.definition.heats[0].songs[0].id, subjectId: target.definition.subjects[0].id, mark: 'No' as const, intended: 'Yes', reason: 'Fictional retained correction' };
  const h = await harness(f.data, f.selected, { correctionDraft: { target, fields } });
  try { h.render(); const shortcut = button(h, 'Open correction draft'); assert.equal(shortcut.props['aria-describedby'], 'results-correction-draft-context'); assert.equal(typeof shortcut.props.onClick, 'function'); assert.match(h.text(h.heroNodes().find(n => n.props.id === 'results-correction-draft-context')), /Advanced · prelims/); assert.equal(f.selected, f.data.rounds[0].id); assert.deepEqual(h.env.posts, []); }
  finally { h.restore(); }
});

test('all approved Finals retain the primary publication-review route and empty selection stays explicit', async () => {
  const f = finalsFixture(), r = current(f); r.standings.approved = true;
  const other = structuredClone(r); other.id = f.data.setup.rounds.find(x => x.kind === 'finals' && x.id !== f.selected)!.id; other.definition.competitionId = f.data.setup.competitions.find(c => c.id !== r.definition.competitionId)!.id; f.data.rounds.push(other);
  const h = await harness(f.data, f.selected);
  try { h.render(); assert.equal(button(h, 'Review event to publish').props.className, 'primary-button'); button(h, 'Review event to publish').props.onClick(); assert.deepEqual(h.env.navigation, [3]); h.setView(f.data, ''); h.render(); assert.equal(heading(h), 'No current competition selected'); assert.equal(links(h).length, 0); }
  finally { h.restore(); }
});
