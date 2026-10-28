import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './head-approval-render-harness.mjs';
import { fixture, finalsFixture } from './organizer-results-render-harness.mjs';
import type { LiveView, ReviewRequest } from '../lib/live/types.ts';

type Render = Awaited<ReturnType<typeof harness>>;
const summary = (h: Render) => h.nodes().find(n => n.props['aria-label'] === 'Current head review tasks');
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
function deferred() { let resolve!: (value: boolean) => void; const promise = new Promise<boolean>(r => { resolve = r; }); return { promise, resolve }; }
function request(data: LiveView, id = 'fictional-waiting-request'): ReviewRequest {
  return { id, version: 2, kind: 'correction', payload: { roundKey: data.rounds[0].key }, reason: 'Synthetic recording error', requester: 'Organizer', createdAt: '2026-10-28T14:00:00Z', approvals: [{ role: 'head', participantId: 'Head judge', version: 2, at: '2026-10-28T14:01:00Z' }] };
}
function make(mode = 'panel-empty', format = 'Strictly') {
  const f = mode === 'finals' ? finalsFixture() : fixture(format);
  if (mode !== 'finals') f.data.rounds.forEach(r => f.derive(r, mode));
  const data = f.data; data.role = 'head'; data.judgeId = data.setup.headJudgeId;
  delete data.setup.organizerParticipantId; data.setup.judges.forEach(j => { delete j.participantId; });
  data.rounds.forEach(r => { r.definition.judges = r.definition.judges.map(({ id, name }) => ({ id, name })); });
  data.rounds[0].phase = 'approved'; data.rounds[0].standings!.approved = true;
  data.reviewRequests = [request(data)]; return f;
}
async function render(data: LiveView, action: (input: Record<string, unknown>) => Promise<boolean> = async () => true) {
  const h = await harness(true, action, { requests: true }); h.setData(data); h.render(); return h;
}
function links(h: Render) { const node = summary(h); return node ? h.nodes().filter(n => n.type === 'a' && String(n.props.href).startsWith('#')) : []; }
function exactTargets(h: Render) {
  for (const link of links(h)) {
    const target = decodeURIComponent(link.props.href.slice(1)), nodes = h.nodes().filter(n => n.props.id === target);
    assert.equal(nodes.length, 1, target); assert.equal(nodes[0].props.tabIndex, -1);
    assert.equal(link.props.onClick, undefined, 'native fragment navigation cannot submit an action');
  }
}
function toggleWaiting(h: Render, data: LiveView, waiting: boolean) {
  const next = structuredClone(data); next.reviewRequests![0].approvals = waiting ? request(next).approvals : [];
  h.setData(next); h.render(); return next;
}

for (const [mode, expected] of [['panel-empty', 'Review advancement votes'], ['deadlocked', 'head decision'], ['approval', 'Review results for approval'], ['finals', 'head decision']]) test(`mixed ${mode} offers exact existing targets ahead of the waiting request`, async () => {
  const f = make(mode), before = structuredClone(f.data), h = await render(f.data);
  try {
    assert.match(h.text(summary(h)), /One request is waiting for the organizer/);
    assert.ok(links(h).some(n => h.text(n).includes(expected))); exactTargets(h);
    assert.ok(h.nodes().indexOf(summary(h)!) < h.nodes().findIndex(n => n.props.id === 'review-request-fictional-waiting-request'));
    assert.equal(h.nodes().filter(n => n.props.className === 'result-sheet').length, 1);
    assert.ok(h.button(/^Approve request as head/)!.props.disabled); assert.deepEqual(h.calls, []); assert.deepEqual(f.data, before);
    assert.doesNotMatch(h.text(summary(h)), /nothing else|all.*saved|approve now|ready to approve/i);
    assert.ok(f.evidence.every(e => e.submissions.every(s => Object.values(s.cells).every(c => c.mark === 'No'))));
    assert.ok(f.data.rounds.every(r => r.standings!.rows.every(row => row.average === 0)));
  } finally { h.restore(); }
});

test('a separate own request gets its exact article link, with organizer-projected approval accepted', async () => {
  const f = make('head-voted'), q = request(f.data, 'fictional-own-request');
  q.approvals = [{ role: 'organizer', participantId: 'Organizer', version: q.version, at: 'synthetic' }]; f.data.reviewRequests!.push(q);
  const h = await render(f.data);
  try { assert.match(h.text(summary(h)), /Review request 2/); assert.equal(links(h)[0].props.href, '#review-request-fictional-own-request'); exactTargets(h); assert.equal(h.buttons(/^Approve request as head/)[1].props.disabled, false); assert.deepEqual(h.calls, []); }
  finally { h.restore(); }
});

test('mixed J&J groups link both the remaining vote and full-panel head decision without changing numeric places', async () => {
  const f = make('mixed', 'Jack & Jill'), h = await render(f.data);
  try {
    // In this fixture the head already voted in the second group; only its first group needs a decision.
    assert.equal(links(h).filter(n => /head decision/.test(h.text(n))).length, 1);
    assert.equal(links(h).filter(n => /advancement votes/.test(h.text(n))).length, 0); exactTargets(h);
    const round = f.data.rounds[1], tie = round.standings!.advancementTies!.find(t => !t.deadlocked)!;
    tie.votes = []; h.setData(structuredClone(f.data)); h.render();
    assert.equal(links(h).filter(n => /advancement votes/.test(h.text(n))).length, 1); exactTargets(h);
  } finally { h.restore(); }
});

for (const edge of ['ordinary', 'wrong-head', 'missing-head', 'empty-person', 'archived', 'history', 'legacy', 'incomplete', 'dancing', 'unknown-target', 'wrong-version', 'wrong-person', 'both-roles', 'duplicate-request', 'wrong-panel', 'wrong-fingerprint']) test(`${edge} does not invent mixed head-duty guidance`, async () => {
  const f = make(), q = f.data.reviewRequests![0], round = f.data.rounds[1];
  if (edge === 'ordinary') f.data.role = 'judge';
  else if (edge === 'wrong-head') f.data.judgeId = f.data.setup.judges[0].id;
  else if (edge === 'missing-head') f.data.setup.judges = f.data.setup.judges.filter(j => j.id !== f.data.judgeId);
  else if (edge === 'empty-person') f.data.setup.judges.find(j => j.id === f.data.judgeId)!.participantId = '';
  else if (edge === 'archived') f.data.status = 'archived';
  else if (edge === 'legacy') delete f.data.setup.workflow;
  else if (edge === 'incomplete') round.standings!.complete = false;
  else if (edge === 'dancing') round.phase = 'dancing';
  else if (edge === 'unknown-target') q.payload.roundKey = 'missing-round';
  else if (edge === 'wrong-version') q.approvals[0].version--;
  else if (edge === 'wrong-person') q.approvals[0].participantId = 'not the projected head';
  else if (edge === 'both-roles') q.approvals.push({ ...q.approvals[0], role: 'organizer', participantId: 'Organizer' });
  else if (edge === 'duplicate-request') f.data.reviewRequests!.push(structuredClone(q));
  else if (edge === 'wrong-panel') round.definition.judgeIds.push(round.definition.judgeIds[0]);
  else if (edge === 'wrong-fingerprint') { f.derive(round, 'head-voted'); round.standings!.advancementTies![0].votes[0].fingerprint = 'old fingerprint'; }
  const h = await render(f.data);
  try { if (edge === 'history') { h.setPart('history'); h.render(); } assert.equal(summary(h), undefined); assert.deepEqual(h.calls, []); }
  finally { h.restore(); }
});

test('waiting-only and no-waiting cases keep their existing presentation', async () => {
  const f = make('head-voted'), h = await render(f.data);
  try {
    assert.equal(summary(h), undefined); assert.ok(h.nodes().some(n => n.props['aria-label'] === 'Current head review waiting status'));
    f.derive(f.data.rounds[1], 'panel-empty'); f.data.reviewRequests = []; h.setData(f.data); h.render(); assert.equal(summary(h), undefined);
  } finally { h.restore(); }
});

test('explicit actor compatibility requires the exact participant and retains private projected labels only when omitted', async () => {
  const f = make(), head = f.data.setup.judges.find(j => j.id === f.data.judgeId)!;
  head.participantId = 'fictional-person'; f.data.reviewRequests![0].approvals[0].participantId = 'fictional-person'; const h = await render(f.data);
  try { assert.ok(summary(h)); f.data.reviewRequests![0].approvals[0].participantId = 'Head judge'; h.setData(f.data); h.render(); assert.equal(summary(h), undefined); }
  finally { h.restore(); }
});

test('summary transitions retain unsaved vote selections and material editor identities across equivalent polling', async () => {
  const f = make(), h = await render(f.data);
  try {
    h.nodes().find(n => n.type === 'input' && n.props.type === 'checkbox' && !n.props.disabled)!.props.onChange({ target: { checked: true } }); h.render();
    const before = h.identities(), checked = () => h.nodes().filter(n => n.type === 'input' && n.props.checked).length;
    assert.equal(checked(), 1); toggleWaiting(h, f.data, false); assert.equal(summary(h), undefined); assert.equal(checked(), 1); assert.deepEqual(h.identities(), before);
    toggleWaiting(h, f.data, true); assert.ok(summary(h)); assert.equal(checked(), 1); assert.deepEqual(h.identities(), before);
    h.setData(structuredClone(f.data)); h.render(); assert.equal(checked(), 1); assert.deepEqual(h.calls, []);
  } finally { h.restore(); }
});

for (const mode of ['deadlocked', 'finals']) test(`${mode} unsaved decision explanation survives summary toggles`, async () => {
  const f = make(mode), h = await render(f.data);
  try {
    const explanation = () => h.nodes().find(n => n.type === 'input' && n.props.maxLength === 500)!;
    explanation().props.onChange({ target: { value: 'Retained local decision explanation' } }); h.render(); h.render(); const before = h.identities();
    toggleWaiting(h, f.data, false); assert.equal(explanation().props.value, 'Retained local decision explanation'); assert.deepEqual(h.identities(), before);
    toggleWaiting(h, f.data, true); assert.equal(explanation().props.value, 'Retained local decision explanation'); assert.deepEqual(h.identities(), before); assert.deepEqual(h.calls, []);
  } finally { h.restore(); }
});

for (const kind of ['vote', 'decision', 'approval', 'request']) test(`held ${kind} owner and original action survive summary transitions`, async () => {
  const f = make(kind === 'vote' ? 'panel-empty' : kind === 'decision' ? 'deadlocked' : kind === 'request' ? 'head-voted' : 'approval');
  if (kind === 'request') { const q = request(f.data, 'fictional-own-request'); q.approvals = []; f.data.reviewRequests!.push(q); }
  const held = deferred(), h = await render(f.data, () => held.promise);
  try {
    if (kind === 'vote') {
      const tie = f.data.rounds[1].standings!.advancementTies![0];
      for (let i = 0; i < tie.slots; i++) { h.nodes().filter(n => n.type === 'input' && n.props.type === 'checkbox' && !n.props.disabled)[i].props.onChange({ target: { checked: true } }); h.render(); }
    }
    const pattern = kind === 'vote' ? /^Submit advancement vote/ : kind === 'decision' ? /^Save head judge decision/ : kind === 'request' ? /^Approve request as head/ : /^Approve these exact/;
    const button = h.buttons(pattern).find(n => !n.props.disabled)!; assert.ok(button); button.props.onClick(); await flush(); h.render();
    assert.equal(h.calls.length, 1); const sent = structuredClone(h.calls[0]), before = h.identities();
    assert.equal(sent.action, kind === 'request' ? 'approve-request' : kind === 'approval' ? 'approve' : kind === 'decision' ? 'tie' : 'vote');
    if (kind === 'request') { assert.equal(sent.reviewRequestId, 'fictional-own-request'); assert.equal(sent.requestVersion, 2); }
    else { assert.equal(sent.roundKey, f.data.rounds[1].key); assert.equal(sent.roundVersion, f.data.rounds[1].version); assert.equal(sent.fingerprint, f.data.rounds[1].standings!.fingerprint); }
    toggleWaiting(h, f.data, false); assert.equal(summary(h), undefined); assert.deepEqual(h.identities(), before);
    toggleWaiting(h, f.data, true); assert.ok(summary(h)); assert.deepEqual(h.identities(), before);
    button.props.onClick(); await flush(); assert.deepEqual(h.calls, [sent]);
    assert.ok(h.nodes().some(n => n.type === 'button' && n.props['aria-busy'] && n.props.disabled));
    held.resolve(false); await flush(); h.render(); assert.deepEqual(h.calls, [sent]);
  } finally { held.resolve(false); h.restore(); }
});
