import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './head-approval-render-harness.mjs';
import { fixture, finalsFixture } from './organizer-results-render-harness.mjs';
import { deriveStageStandings } from '../lib/live/stage.ts';
import type { HeatSubmission, LiveView, ReviewRequest, RoundView, TieDecision } from '../lib/live/types.ts';

type Render = Awaited<ReturnType<typeof harness>>;
const cue = (h: Render) => h.nodes().find(n => n.props['aria-label'] === 'Current head review waiting status');
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
function deferred() { let resolve!: (value: boolean) => void; const promise = new Promise<boolean>(r => { resolve = r; }); return { promise, resolve }; }
function standing(r: RoundView) { assert.ok(r.standings); return r.standings; }
function project(data: LiveView) {
  data.role = 'head'; data.judgeId = data.setup.headJudgeId; delete data.setup.organizerParticipantId;
  data.setup.judges.forEach(j => { delete j.participantId; });
  data.rounds.forEach(r => { r.definition.judges = r.definition.judges.map(({ id, name }) => ({ id, name })); });
  return data;
}
function make(mode = 'head-voted', format = 'Strictly') {
  const f = fixture(format); f.data.rounds.forEach(r => f.derive(r, mode)); project(f.data); return f;
}
function request(data: LiveView): ReviewRequest {
  return { id: 'fictional-current-request', version: 2, kind: 'correction', payload: { roundKey: data.rounds[0].key }, reason: 'Fictional recording correction', requester: 'Organizer', createdAt: '2026-10-27T12:00:00Z', approvals: [{ role: 'head', participantId: 'Head judge', version: 2, at: '2026-10-27T12:01:00Z' }] };
}
async function render(data: LiveView, action: (input: Record<string, unknown>) => Promise<boolean> = async () => true, requests = true) {
  const h = await harness(true, action, { requests }); h.setData(data); h.render(); return h;
}
function material(h: Render) { return h.identities(); }
function retained(h: Render, before: ReturnType<typeof material>) { const after = material(h); for (const item of before) assert.deepEqual(after.find(n => n.path === item.path), item); }
function complete(data: LiveView) { data.rounds.forEach(r => { standing(r).approved = true; r.phase = 'approved'; }); }

test('projected private head waiting names exact frozen voters and leaves every review sheet visible', async () => {
  const f = make(); f.data.setup.judges[0].name = 'Changed setup label'; const original = structuredClone(f.data), h = await render(f.data);
  try {
    assert.match(h.text(cue(h)), /Waiting for others.*Synthetic one, Synthetic two/);
    assert.doesNotMatch(h.text(cue(h)), /Changed setup label|nothing else|saved|up to date/i);
    assert.equal(h.nodes().filter(n => n.props.className === 'result-sheet').length, 2);
    assert.equal(h.buttons(/^Approve these exact/).length, 2); h.buttons(/^Approve these exact/).forEach(n => assert.equal(n.props.disabled, true));
    assert.equal(h.buttons(/^Vote finalized/).length, 2); assert.deepEqual(f.data, original); assert.deepEqual(h.calls, []);
  } finally { h.restore(); }
});

for (const mode of ['panel-empty', 'deadlocked', 'approval', 'resolved']) test(`own ${mode} duty preserves ready layout without a waiting assertion`, async () => {
  const f = make(mode), h = await render(f.data);
  try { assert.equal(cue(h), undefined); if (mode === 'panel-empty') assert.ok(h.button(/^Submit advancement vote/)); if (mode === 'deadlocked') assert.ok(h.button(/^Save head judge decision/)); if (mode === 'approval' || mode === 'resolved') assert.equal(h.button(/^Approve these exact/)!.props.disabled, false); }
  finally { h.restore(); }
});

for (const mixed of ['groups', 'rounds']) test(`mixed ${mixed} retains actionable head duty rather than declaring waiting`, async () => {
  const f = make('head-voted', mixed === 'groups' ? 'Jack & Jill' : 'Strictly'); f.derive(f.data.rounds[mixed === 'groups' ? 0 : 1], mixed === 'groups' ? 'mixed' : 'approval');
  const h = await render(f.data); try { assert.equal(cue(h), undefined); assert.equal(h.nodes().filter(n => n.props.className === 'result-sheet').length, 2); }
  finally { h.restore(); }
});

test('head-approved exact projected request waits for organizer with the original disabled control retained', async () => {
  const f = make('approval'); complete(f.data); f.data.reviewRequests = [request(f.data)]; const h = await render(f.data);
  try { assert.match(h.text(cue(h)), /Waiting for the organizer to approve the request/); assert.doesNotMatch(h.text(cue(h)), /Head approval is recorded|saved|nothing else/i); assert.equal(h.button(/^Approve request as head/)!.props.disabled, true); assert.ok(h.nodes().some(n => n.props.id === 'review-request-fictional-current-request')); assert.deepEqual(h.calls, []); }
  finally { h.restore(); }
});

test('explicit participant compatibility uses the exact actor rather than treating a projected token as private identity', async () => {
  const f = make('approval'); complete(f.data); f.data.setup.judges.find(j => j.id === f.data.judgeId)!.participantId = 'fictional-head-person'; const q = request(f.data); q.approvals[0].participantId = 'fictional-head-person'; f.data.reviewRequests = [q]; const h = await render(f.data);
  try { assert.ok(cue(h)); const next = structuredClone(f.data); next.reviewRequests![0].approvals[0].participantId = 'Head judge'; h.setData(next); h.render(); assert.equal(cue(h), undefined); }
  finally { h.restore(); }
});

for (const edge of ['missing', 'unknown-approvals', 'wrong-version', 'wrong-person', 'wrong-role', 'both-roles', 'duplicate-head', 'unknown-target', 'unknown-competition', 'duplicate-request', 'invalid-version']) test(`request ${edge} cannot assert head-complete waiting`, async () => {
  const f = make('approval'); complete(f.data); const q = request(f.data); f.data.reviewRequests = [q];
  if (edge === 'missing') q.approvals = [];
  else if (edge === 'unknown-approvals') delete (q as Partial<ReviewRequest>).approvals;
  else if (edge === 'wrong-version') q.approvals[0].version--;
  else if (edge === 'wrong-person') q.approvals[0].participantId = 'unknown actor';
  else if (edge === 'wrong-role') { q.approvals[0].role = 'organizer'; q.approvals[0].participantId = 'Organizer'; }
  else if (edge === 'both-roles') q.approvals.push({ ...q.approvals[0], role: 'organizer', participantId: 'Organizer' });
  else if (edge === 'duplicate-head') q.approvals.push({ ...q.approvals[0] });
  else if (edge === 'unknown-target') q.payload.roundKey = 'missing round';
  else if (edge === 'unknown-competition') q.payload = { competitionId: 'missing competition' };
  else if (edge === 'duplicate-request') f.data.reviewRequests.push(structuredClone(q));
  else q.version = 0;
  // Older partial fixtures test the new display guard with the established request boundary;
  // the unchanged request renderer still requires its normal validated approvals array.
  const h = await render(f.data, undefined, edge !== 'unknown-approvals'); try { assert.equal(cue(h), undefined); } finally { h.restore(); }
});

for (const edge of ['ordinary', 'wrong-head', 'missing-head', 'missing-judge', 'empty-person', 'archived', 'completed', 'incomplete', 'dancing', 'unknown-round', 'legacy']) test(`${edge} state does not invent a shared waiting assertion`, async () => {
  const f = make(), r = f.data.rounds[0];
  if (edge === 'ordinary') f.data.role = 'judge';
  else if (edge === 'wrong-head') f.data.judgeId = f.data.setup.judges[0].id;
  else if (edge === 'missing-head') f.data.setup.judges = f.data.setup.judges.filter(j => j.id !== f.data.judgeId);
  else if (edge === 'missing-judge') f.data.judgeId = null;
  else if (edge === 'empty-person') f.data.setup.judges.find(j => j.id === f.data.judgeId)!.participantId = '';
  else if (edge === 'archived') f.data.status = 'archived';
  else if (edge === 'completed') { f.data.rounds.forEach(round => f.derive(round, 'approval')); complete(f.data); }
  else if (edge === 'incomplete') standing(r).complete = false;
  else if (edge === 'dancing') r.phase = 'dancing';
  else if (edge === 'unknown-round') delete r.standings;
  else delete f.data.setup.workflow;
  const h = await render(f.data); try { assert.equal(cue(h), undefined); } finally { h.restore(); }
});

for (const edge of ['outsider', 'duplicate-vote', 'duplicate-panel', 'missing-frozen-judge', 'old-fingerprint', 'old-round', 'old-tie', 'bad-selection']) test(`exact frozen ${edge} data is required before naming others`, async () => {
  const f = make(), r = f.data.rounds[0], t = standing(r).advancementTies![0];
  if (edge === 'outsider') t.votes.push({ ...t.votes[0], judgeId: 'not on panel' });
  else if (edge === 'duplicate-vote') t.votes.push({ ...t.votes[0] });
  else if (edge === 'duplicate-panel') r.definition.judgeIds.push(r.definition.judgeIds[0]);
  else if (edge === 'missing-frozen-judge') r.definition.judges = r.definition.judges.filter(j => j.id !== r.definition.judgeIds[0]);
  else if (edge === 'old-fingerprint') t.votes[0].fingerprint += '-old';
  else if (edge === 'old-round') t.votes[0].roundKey += '-old';
  else if (edge === 'old-tie') t.votes[0].tieKey += '-old';
  else t.votes[0].selected = [];
  const h = await render(f.data); try { assert.equal(cue(h), undefined); } finally { h.restore(); }
});

test('actual finalist-count blocker names organizer while exact approval remains disabled', async () => {
  const f = make('approval'); f.data.rounds.forEach(r => { standing(r).finalistCount = 999; }); const h = await render(f.data);
  try { assert.match(h.text(cue(h)), /organizer to review the finalist count/); h.buttons(/^Approve these exact/).forEach(n => assert.equal(n.props.disabled, true)); }
  finally { h.restore(); }
});

test('an approved but incomplete round suppresses waiting even with an exact head-approved request', async () => {
  const f = make('approval'); complete(f.data); standing(f.data.rounds[0]).complete = false; f.data.reviewRequests = [request(f.data)]; const h = await render(f.data);
  try { assert.equal(cue(h), undefined); } finally { h.restore(); }
});

test('ready round blocked by a current head-approved correction names organizer; own request approval takes precedence', async () => {
  const f = make('approval'); standing(f.data.rounds[1]).approved = true; f.data.reviewRequests = [request(f.data)]; const h = await render(f.data);
  try { assert.ok(cue(h)); assert.equal(h.button(/^Approve these exact/)!.props.disabled, true); const next = structuredClone(f.data); next.reviewRequests![0].approvals = []; h.setData(next); h.render(); assert.equal(cue(h), undefined); assert.equal(h.button(/^Approve request as head/)!.props.disabled, false); }
  finally { h.restore(); }
});

test('history rendering never presents a current waiting cue or alters saved private notes', async () => {
  const f = make(), h = await render(f.data), original = structuredClone(f.data);
  try { assert.ok(cue(h)); h.setPart('history'); h.render(); assert.equal(cue(h), undefined); assert.deepEqual(f.data, original); assert.deepEqual(h.calls, []); }
  finally { h.restore(); }
});

test('held Vote callback and exact payload survive a fixed cue slot appearing and disappearing', async () => {
  const f = make(); f.derive(f.data.rounds[0], 'panel-empty'); const wait = deferred(), h = await render(f.data, () => wait.promise);
  try {
    const slots = standing(f.data.rounds[0]).advancementTies![0].slots;
    for (let i = 0; i < slots; i++) { h.nodes().filter(n => n.type === 'input' && n.props.type === 'checkbox' && !n.props.disabled)[i].props.onChange({ target: { checked: true } }); h.render(); }
    const send = h.button(/^Submit advancement vote/)!; assert.equal(send.props.disabled, false); send.props.onClick(); h.render(); const ids = material(h), sent = structuredClone(h.calls[0]); assert.equal(h.calls.length, 1);
    f.derive(f.data.rounds[0], 'head-voted'); h.setData(f.data); h.render(); assert.ok(cue(h)); assert.deepEqual(material(h), ids); send.props.onClick(); assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0], sent);
    const next = structuredClone(f.data); next.setup.judges = next.setup.judges.filter(j => j.id !== next.judgeId); h.setData(next); h.render(); assert.equal(cue(h), undefined); assert.deepEqual(material(h), ids);
    wait.resolve(false); await flush(); h.render(); assert.equal(h.calls.length, 1);
  } finally { wait.resolve(false); await flush(); h.restore(); }
});

function finals() { const f = finalsFixture(); project(f.data); return f; }
function resolveFinals(f: ReturnType<typeof finals>) {
  const r = f.data.rounds.find(r => r.id === f.selected)!, old = standing(r), decisions: TieDecision[] = old.ties.map(t => ({ key: t.key, order: [...t.subjectIds], shared: false, explanation: 'Current shared decision', decidedAt: '2026-10-27T12:00:00Z', judgeId: f.data.setup.headJudgeId, role: 'head', fingerprint: old.fingerprint }));
  r.standings = { ...old, ...deriveStageStandings(r.definition, r.key, f.evidence.find(e => e.roundKey === r.key)!.submissions as HeatSubmission[], decisions), decisions };
  const q = request(f.data); q.payload.roundKey = r.key; f.data.reviewRequests = [q]; return r;
}

test('actual frozen Finals keep head decision/approval duties distinct from organizer waiting', async () => {
  const f = finals(), h = await render(f.data), original = structuredClone(f.data.rounds.find(r => r.id === f.selected)!.definition);
  try { assert.equal(cue(h), undefined); assert.ok(h.button(/^Save head judge decision/)); resolveFinals(f); h.setData(f.data); h.render(); assert.ok(cue(h)); assert.deepEqual(f.data.rounds.find(r => r.id === f.selected)!.definition, original); }
  finally { h.restore(); }
});

for (const held of [false, true]) test(`${held ? 'held' : 'unsaved'} TieEditor intent stays visible and keyed as shared waiting appears`, async () => {
  const f = finals(), wait = deferred(), h = await render(f.data, () => wait.promise);
  try {
    const explanation = h.nodes().find(n => n.type === 'input' && n.props.maxLength === 500)!; explanation.props.onChange({ target: { value: 'Retain this local decision intent' } }); h.render(); h.render();
    if (held) { h.button(/^Save head judge decision/)!.props.onClick(); h.render(); }
    const ids = material(h); resolveFinals(f); h.setData(f.data); h.render(); h.render(); assert.ok(cue(h)); retained(h, ids); assert.equal(material(h).filter(n => n.type === 'RequestApproval').length, 1);
    assert.equal(h.nodes().find(n => n.type === 'input' && n.props.maxLength === 500)!.props.value, 'Retain this local decision intent');
    if (held) { assert.equal(h.button(/^Saving decision/)!.props['aria-busy'], true); assert.equal(h.calls.length, 1); wait.resolve(false); await flush(); h.render(); assert.equal(h.calls.length, 1); }
    else assert.deepEqual(h.calls, []);
  } finally { wait.resolve(false); await flush(); h.restore(); }
});

test('held ExactApproval keeps its original owner and payload while a correction creates shared waiting', async () => {
  const f = make('approval'), wait = deferred(), h = await render(f.data, () => wait.promise);
  try { const send = h.button(/^Approve these exact/)!; send.props.onClick(); h.render(); const ids = material(h).filter(n => n.type !== 'RequestApproval'), sent = structuredClone(h.calls[0]); f.data.reviewRequests = f.data.rounds.map((r, i) => ({ ...request(f.data), id: 'pending-' + i, payload: { roundKey: r.key } })); h.setData(f.data); h.render(); assert.ok(cue(h)); assert.deepEqual(material(h).filter(n => n.type !== 'RequestApproval'), ids); assert.equal(h.button(/^Approving/)!.props['aria-busy'], true); send.props.onClick(); assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0], sent); wait.resolve(false); await flush(); h.render(); }
  finally { wait.resolve(false); await flush(); h.restore(); }
});

test('held exact RequestApproval stays mounted as its authoritative head approval produces the waiting cue', async () => {
  const f = make('approval'); complete(f.data); const q = request(f.data); q.approvals = []; f.data.reviewRequests = [q]; const wait = deferred(), h = await render(f.data, () => wait.promise);
  try { const send = h.button(/^Approve request as head/)!; send.props.onClick(); h.render(); const ids = material(h), sent = structuredClone(h.calls[0]); const next = structuredClone(f.data); next.reviewRequests![0].approvals = request(next).approvals; h.setData(next); h.render(); assert.ok(cue(h)); assert.deepEqual(material(h), ids); assert.equal(h.button(/^Approve request as head/)!.props.disabled, true); send.props.onClick(); assert.equal(h.calls.length, 1); assert.deepEqual(sent, { action: 'approve-request', reviewRequestId: q.id, requestVersion: 2 }); wait.resolve(false); await flush(); h.render(); assert.equal(h.calls.length, 1); }
  finally { wait.resolve(false); await flush(); h.restore(); }
});
