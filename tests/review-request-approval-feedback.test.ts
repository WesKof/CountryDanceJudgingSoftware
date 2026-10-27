import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, harness } from './review-request-render-harness.mjs';

function deferred() { let resolve!: (value: boolean) => void, reject!: (reason: Error) => void; const promise = new Promise<boolean>((ok, bad) => { resolve = ok; reject = bad; }); return { promise, resolve, reject }; }
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

for (const role of ['organizer', 'head'] as const) for (const kind of ['correction', 'withdrawal'] as const) test(`${role} ${kind}: held exact approval guards repeat confirmation/action synchronously`, async () => {
  const wait = deferred(), data = fixture(role, kind), original = structuredClone(data), h = await harness(data, () => wait.promise);
  try {
    h.render(); const button = h.approval()!; assert.equal(h.text(button), 'Approve request as ' + role); button.props.onClick(); button.props.onClick();
    assert.equal(h.prompts.length, 1); assert.equal(h.prompts[0], 'Approve this exact version 3: Synthetic exact-version reason? Both distinct roles are required.');
    assert.deepEqual(h.calls, [{ action: 'approve-request', reviewRequestId: data.reviewRequests[0].id, requestVersion: 3 }]);
    h.render(); assert.equal(h.approval()!.props.disabled, true); assert.equal(h.approval()!.props['aria-busy'], true); assert.match(h.text(h.approvalStatus()), /Approval is in progress/); assert.equal(h.approvalStatus()!.props.role, 'status');
    if (role === 'organizer') { assert.ok(h.button(/^Cancel request$/)); if (kind === 'withdrawal') assert.ok(h.button(/^Revise withdrawal request$/)); }
    assert.deepEqual(data, original); wait.resolve(false); await flush(); h.render(); assert.equal(h.approval()!.props.disabled, false); assert.equal(h.text(h.approval()), 'Approve request as ' + role); assert.match(h.text(h.approvalStatus()), /not confirmed.*Check its status/);
  } finally { wait.resolve(false); await flush(); h.restore(); }
});

for (const role of ['organizer', 'head'] as const) for (const outcome of ['true', 'false', 'reject'] as const) test(`${role}: ${outcome} callback without authoritative approval retains truthful retry guidance`, async () => {
  const wait = deferred(), h = await harness(fixture(role), () => wait.promise);
  try { h.render(); h.approval()!.props.onClick(); if (outcome === 'reject') wait.reject(Error('PRIVATE_ACTION_FAILURE')); else wait.resolve(outcome === 'true'); await flush(); const html = h.render(); assert.equal(h.approval()!.props.disabled, false); assert.match(h.text(h.approvalStatus()), /Approval is not confirmed/); assert.doesNotMatch(html, /PRIVATE_ACTION_FAILURE|Applied with both/); assert.equal(h.data.reviewRequests[0].approvals.length, 0); }
  finally { wait.resolve(false); await flush(); h.restore(); }
});

for (const role of ['organizer', 'head'] as const) for (const state of ['own-approval', 'applied', 'cancelled', 'archived'] as const) test(`${role}: authoritative ${state} supersedes local pending feedback and blocks stale captured clicks`, async () => {
  const wait = deferred(), data = fixture(role), h = await harness(data, () => wait.promise);
  try { h.render(); const oldButton = h.approval()!; oldButton.props.onClick(); const next = structuredClone(data), q = next.reviewRequests[0];
    if (state === 'own-approval') q.approvals = [{ role, participantId: role === 'organizer' ? next.setup.organizerParticipantId! : next.setup.judges.find(j => j.id === next.judgeId)!.participantId!, version: q.version, at: '2026-10-27T00:00:01Z' }];
    else if (state === 'applied') q.appliedAt = '2026-10-27T00:00:01Z'; else if (state === 'cancelled') q.cancelledAt = '2026-10-27T00:00:01Z'; else next.status = 'archived';
    h.setData(next); let html = h.render(); assert.doesNotMatch(html, /Approval is in progress/); oldButton.props.onClick(); assert.equal(h.calls.length, 1); if (state === 'own-approval' || state === 'archived') assert.equal(h.approval()!.props.disabled, true); else assert.equal(h.approval(), undefined);
    wait.resolve(false); await flush(); html = h.render(); assert.doesNotMatch(html, /Approval is not confirmed/); oldButton.props.onClick(); assert.equal(h.calls.length, 1); assert.equal(h.prompts.length, 1); if (state === 'applied') assert.match(html, /Applied with both distinct role approvals/); if (state === 'cancelled') assert.match(html, /Cancelled; records retained/);
  } finally { wait.resolve(false); await flush(); h.restore(); }
});

for (const change of ['version', 'event', 'role', 'organizer-person', 'head-person', 'head-judge', 'request'] as const) test(`${change} change isolates the new attempt from old completion and captured handlers`, async () => {
  const first = deferred(), second = deferred(); let calls = 0; const data = fixture(change.startsWith('head') ? 'head' : 'organizer'), h = await harness(data, () => ++calls === 1 ? first.promise : second.promise);
  try { h.render(); const oldButton = h.approval()!; oldButton.props.onClick(); const original = structuredClone(h.calls[0]), next = structuredClone(data);
    if (change === 'version') next.reviewRequests[0].version++; else if (change === 'event') next.eventId += '-new'; else if (change === 'role') { next.role = 'head'; next.judgeId = next.setup.headJudgeId; }
    else if (change === 'organizer-person') next.setup.organizerParticipantId += '-new'; else if (change === 'head-person') next.setup.judges.find(j => j.id === next.judgeId)!.participantId += '-new';
    else if (change === 'head-judge') { next.judgeId = next.setup.judges[0].id; next.setup.headJudgeId = next.judgeId; } else next.reviewRequests[0].id += '-new';
    h.setData(next); h.render(); assert.equal(h.approval()!.props.disabled, false); oldButton.props.onClick(); assert.equal(h.calls.length, 1); h.approval()!.props.onClick(); h.render(); assert.equal(h.calls.length, 2); assert.equal(h.approval()!.props.disabled, true);
    first.resolve(true); await flush(); h.render(); assert.equal(h.approval()!.props.disabled, true); assert.equal(h.approval()!.props['aria-busy'], true); oldButton.props.onClick(); assert.equal(h.calls.length, 2); assert.equal(h.prompts.length, 2); assert.deepEqual(h.calls[0], original); assert.equal(h.lateStateUpdates, 0);
    assert.deepEqual(h.calls[1], { action: 'approve-request', reviewRequestId: next.reviewRequests[0].id, requestVersion: next.reviewRequests[0].version }); second.resolve(false); await flush(); h.render(); assert.equal(h.approval()!.props.disabled, false);
  } finally { first.resolve(false); second.resolve(false); await flush(); h.restore(); }
});

test('two requests own independent waits and old completion cannot clear the other', async () => {
  const first = deferred(), second = deferred(), data = fixture(); const other = structuredClone(data.reviewRequests[0]); other.id += '-other'; data.reviewRequests.push(other); let calls = 0;
  const h = await harness(data, () => ++calls === 1 ? first.promise : second.promise);
  try { h.render(); h.approval(data.reviewRequests[0].id)!.props.onClick(); h.render(); assert.equal(h.approval(other.id)!.props.disabled, false); h.approval(other.id)!.props.onClick(); h.render(); first.resolve(false); await flush(); h.render(); assert.equal(h.approval(other.id)!.props.disabled, true); assert.equal(h.approval(data.reviewRequests[0].id)!.props.disabled, false); second.resolve(false); await flush(); h.render(); assert.equal(h.approval(other.id)!.props.disabled, false); assert.equal(h.calls.length, 2); }
  finally { first.resolve(false); second.resolve(false); await flush(); h.restore(); }
});

test('cancelled confirmation emits no action and allows a later deliberate retry', async () => {
  const h = await harness(); try { h.setConfirm(false); h.render(); h.approval()!.props.onClick(); await flush(); h.render(); assert.equal(h.calls.length, 0); assert.equal(h.approvalStatus(), undefined); h.setConfirm(true); h.approval()!.props.onClick(); await flush(); h.render(); assert.equal(h.calls.length, 1); } finally { h.restore(); }
});

test('other-role approval does not count as this actor approval and revision/cancel payloads stay exact', async () => {
  const data = fixture('organizer', 'withdrawal'), q = data.reviewRequests[0]; q.approvals = [{ role: 'head', participantId: 'fictional-head', version: q.version, at: '2026-10-27T00:00:01Z' }];
  const h = await harness(data); try { h.render(); assert.equal(h.approval()!.props.disabled, false); h.button(/^Revise withdrawal request$/)!.props.onClick(); assert.deepEqual(h.revisions, [q]); h.button(/^Cancel request$/)!.props.onClick(); assert.deepEqual(h.calls, [{ action: 'cancel-request', reviewRequestId: q.id, requestVersion: q.version }]); } finally { h.restore(); }
});

test('ordinary judges cannot approve and correction editor identity/props are unchanged by local waiting', async () => {
  const judge = await harness(fixture('judge')); try { judge.render(); assert.equal(judge.approval(), undefined); assert.equal(judge.calls.length, 0); } finally { judge.restore(); }
  const wait = deferred(), h = await harness(fixture(), () => wait.promise); try { h.render(); const before = h.corrections[0]; assert.ok(before); h.approval()!.props.onClick(); h.render(); assert.equal(h.corrections[0].key, before.key); assert.equal(h.corrections[0].props.revise, before.props.revise); assert.equal(h.corrections[0].props.round, before.props.round); assert.equal(h.corrections[0].props.action, before.props.action); wait.resolve(false); await flush(); h.render(); assert.equal(h.corrections[0].key, before.key); } finally { wait.resolve(false); await flush(); h.restore(); }
});

test('the synchronous lease exists before confirmation can re-enter the same captured handler', async () => {
  const wait = deferred(), h = await harness(fixture(), () => wait.promise);
  try { h.render(); const button = h.approval()!; h.setConfirm(() => { button.props.onClick(); return true; }); button.props.onClick(); h.render(); assert.equal(h.prompts.length, 1); assert.equal(h.calls.length, 1); assert.equal(h.approval()!.props.disabled, true); }
  finally { wait.resolve(false); await flush(); h.restore(); }
});

test('a changed target during confirmation is rechecked before sending an approval', async () => {
  const data = fixture(), h = await harness(data);
  try { h.render(); const button = h.approval()!; h.setConfirm(() => { const next = structuredClone(data); next.reviewRequests[0].version++; h.setData(next); h.render(); return true; }); button.props.onClick(); await flush(); h.render(); assert.equal(h.prompts.length, 1); assert.equal(h.calls.length, 0); assert.equal(h.approval()!.props.disabled, false); assert.equal(h.approvalStatus(), undefined); assert.equal(h.lateStateUpdates, 0); }
  finally { h.restore(); }
});
