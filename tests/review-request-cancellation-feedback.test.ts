import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, harness } from './review-request-render-harness.mjs';

function deferred() { let resolve!: (value: boolean) => void, reject!: (reason: Error) => void; const promise = new Promise<boolean>((ok, bad) => { resolve = ok; reject = bad; }); return { promise, resolve, reject }; }
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

for (const kind of ['correction', 'withdrawal'] as const) test(`${kind}: duplicate cancellation is guarded synchronously without adding confirmation`, async () => {
  const wait = deferred(), data = fixture('organizer', kind), original = structuredClone(data), h = await harness(data, () => wait.promise);
  try { h.render(); const editor = h.corrections[0], button = h.cancellation()!; assert.equal(h.text(button), 'Cancel request'); button.props.onClick(); button.props.onClick();
    assert.deepEqual(h.calls, [{ action: 'cancel-request', reviewRequestId: data.reviewRequests[0].id, requestVersion: 3 }]); assert.equal(h.prompts.length, 0);
    h.render(); assert.equal(h.cancellation()!.props.disabled, true); assert.equal(h.cancellation()!.props['aria-busy'], true); assert.match(h.text(h.cancellationStatus()), /Cancellation is in progress/); assert.equal(h.cancellationStatus()!.props.role, 'status'); assert.equal(h.approval()!.props.disabled, false);
    if (kind === 'withdrawal') assert.equal(h.button(/^Revise withdrawal request$/)!.props.disabled, false); else { assert.equal(h.corrections[0].key, editor.key); assert.equal(h.corrections[0].props.revise, editor.props.revise); }
    assert.deepEqual(data, original); wait.resolve(false); await flush(); h.render(); assert.equal(h.text(h.cancellation()), 'Cancel request'); assert.equal(h.cancellation()!.props.disabled, false); assert.match(h.text(h.cancellationStatus()), /not confirmed.*Check its status/);
  } finally { wait.resolve(false); await flush(); h.restore(); }
});

for (const outcome of ['true', 'false', 'reject'] as const) test(`${outcome} callback alone never claims cancellation`, async () => {
  const wait = deferred(), h = await harness(fixture(), () => wait.promise);
  try { h.render(); h.cancellation()!.props.onClick(); if (outcome === 'reject') wait.reject(Error('PRIVATE_CANCEL_ERROR')); else wait.resolve(outcome === 'true'); await flush(); const html = h.render(); assert.equal(h.cancellation()!.props.disabled, false); assert.match(h.text(h.cancellationStatus()), /Cancellation is not confirmed/); assert.doesNotMatch(html, /PRIVATE_CANCEL_ERROR|Cancelled; records retained/); assert.equal(h.data.reviewRequests[0].cancelledAt, undefined); assert.equal(h.calls.length, 1); assert.equal(h.prompts.length, 0); }
  finally { wait.resolve(false); await flush(); h.restore(); }
});

for (const state of ['cancelled', 'applied', 'archived'] as const) test(`authoritative ${state} supersedes a pending cancel and stale captured handlers`, async () => {
  const wait = deferred(), data = fixture(), h = await harness(data, () => wait.promise);
  try { h.render(); const old = h.cancellation()!; old.props.onClick(); const next = structuredClone(data), q = next.reviewRequests[0]; if (state === 'cancelled') { q.version++; q.cancelledAt = '2026-10-27T00:00:01Z'; q.approvals = []; } else if (state === 'applied') q.appliedAt = '2026-10-27T00:00:01Z'; else next.status = 'archived';
    h.setData(next); let html = h.render(); assert.doesNotMatch(html, /Cancellation is in progress/); if (state === 'archived') { assert.equal(h.cancellation()!.props.disabled, true); assert.match(h.text(h.cancellationStatus()), /read only/); } else assert.equal(h.cancellation(), undefined);
    old.props.onClick(); assert.equal(h.calls.length, 1); wait.resolve(true); await flush(); html = h.render(); old.props.onClick(); assert.equal(h.calls.length, 1); assert.equal(h.prompts.length, 0); assert.doesNotMatch(html, /Cancellation is not confirmed/); if (state === 'cancelled') assert.match(html, /Cancelled; records retained/); if (state === 'applied') assert.match(html, /Applied with both distinct role approvals/); assert.equal(h.lateStateUpdates, 0);
  } finally { wait.resolve(false); await flush(); h.restore(); }
});

for (const change of ['version', 'event', 'person', 'request'] as const) test(`${change} replacement owns an independent cancellation attempt`, async () => {
  const first = deferred(), second = deferred(); let calls = 0; const data = fixture(), h = await harness(data, () => ++calls === 1 ? first.promise : second.promise);
  try { h.render(); const old = h.cancellation()!; old.props.onClick(); const original = structuredClone(h.calls[0]), next = structuredClone(data); if (change === 'version') next.reviewRequests[0].version++; else if (change === 'event') next.eventId += '-new'; else if (change === 'person') next.setup.organizerParticipantId += '-new'; else next.reviewRequests[0].id += '-new';
    h.setData(next); h.render(); assert.equal(h.cancellation()!.props.disabled, false); old.props.onClick(); assert.equal(h.calls.length, 1); h.cancellation()!.props.onClick(); h.render(); first.resolve(true); await flush(); h.render(); old.props.onClick(); assert.equal(h.calls.length, 2); assert.equal(h.cancellation()!.props.disabled, true); assert.equal(h.cancellation()!.props['aria-busy'], true); assert.deepEqual(h.calls[0], original); assert.deepEqual(h.calls[1], { action: 'cancel-request', reviewRequestId: next.reviewRequests[0].id, requestVersion: next.reviewRequests[0].version }); assert.equal(h.lateStateUpdates, 0); assert.equal(h.prompts.length, 0);
  } finally { first.resolve(false); second.resolve(false); await flush(); h.restore(); }
});

test('role replacement removes cancellation and old completion cannot clear the new head approval', async () => {
  const cancel = deferred(), approve = deferred(), data = fixture(), h = await harness(data, input => input.action === 'cancel-request' ? cancel.promise : approve.promise);
  try { h.render(); const old = h.cancellation()!; old.props.onClick(); const next = structuredClone(data); next.role = 'head'; next.judgeId = next.setup.headJudgeId; h.setData(next); h.render(); assert.equal(h.cancellation(), undefined); h.approval()!.props.onClick(); h.render(); cancel.resolve(true); await flush(); h.render(); old.props.onClick(); assert.equal(h.calls.length, 2); assert.equal(h.approval()!.props.disabled, true); assert.equal(h.approval()!.props['aria-busy'], true); assert.equal(h.prompts.length, 1); assert.equal(h.lateStateUpdates, 0); }
  finally { cancel.resolve(false); approve.resolve(false); await flush(); h.restore(); }
});

test('separate request cards own separate cancellation waits', async () => {
  const first = deferred(), second = deferred(), data = fixture(); const other = structuredClone(data.reviewRequests[0]); other.id += '-other'; data.reviewRequests.push(other); let calls = 0; const h = await harness(data, () => ++calls === 1 ? first.promise : second.promise);
  try { h.render(); h.cancellation(data.reviewRequests[0].id)!.props.onClick(); h.render(); assert.equal(h.cancellation(other.id)!.props.disabled, false); h.cancellation(other.id)!.props.onClick(); h.render(); first.resolve(false); await flush(); h.render(); assert.equal(h.cancellation(data.reviewRequests[0].id)!.props.disabled, false); assert.equal(h.cancellation(other.id)!.props.disabled, true); assert.equal(h.prompts.length, 0); }
  finally { first.resolve(false); second.resolve(false); await flush(); h.restore(); }
});

for (const kind of ['correction', 'withdrawal'] as const) test(`${kind}: approval, cancellation and revision remain independent while either action waits`, async () => {
  for (const firstAction of ['approve-request', 'cancel-request']) {
    const approval = deferred(), cancellation = deferred(), data = fixture('organizer', kind), h = await harness(data, input => input.action === 'approve-request' ? approval.promise : cancellation.promise);
    try { h.render(); const editor = h.corrections[0]; (firstAction === 'approve-request' ? h.approval()! : h.cancellation()!).props.onClick(); h.render(); assert.equal((firstAction === 'approve-request' ? h.cancellation()! : h.approval()!).props.disabled, false);
      if (kind === 'withdrawal') { h.button(/^Revise withdrawal request$/)!.props.onClick(); assert.deepEqual(h.revisions, [data.reviewRequests[0]]); } else { assert.equal(h.corrections[0].key, editor.key); assert.equal(h.corrections[0].props.revise, editor.props.revise); }
      (firstAction === 'approve-request' ? h.cancellation()! : h.approval()!).props.onClick(); h.render(); assert.equal(h.approval()!.props['aria-busy'], true); assert.equal(h.cancellation()!.props['aria-busy'], true); assert.equal(h.calls.length, 2); assert.equal(h.prompts.length, 1);
      approval.resolve(false); await flush(); h.render(); assert.equal(h.approval()!.props.disabled, false); assert.equal(h.cancellation()!.props.disabled, true); cancellation.resolve(false); await flush(); h.render(); assert.equal(h.cancellation()!.props.disabled, false);
    } finally { approval.resolve(false); cancellation.resolve(false); await flush(); h.restore(); }
  }
});

test('a recorded role approval does not falsely resolve or prohibit cancellation', async () => {
  const wait = deferred(), data = fixture(), h = await harness(data, () => wait.promise);
  try { h.render(); h.cancellation()!.props.onClick(); const next = structuredClone(data); next.reviewRequests[0].approvals = [{ role: 'organizer', participantId: next.setup.organizerParticipantId!, version: 3, at: '2026-10-27T00:00:01Z' }]; h.setData(next); h.render(); assert.equal(h.approval()!.props.disabled, true); assert.equal(h.cancellation()!.props['aria-busy'], true); wait.resolve(false); await flush(); h.render(); assert.equal(h.cancellation()!.props.disabled, false); assert.match(h.text(h.cancellationStatus()), /not confirmed/); }
  finally { wait.resolve(false); await flush(); h.restore(); }
});

test('approval and cancellation have distinct actual sibling React keys and status IDs', async () => {
  const wait = deferred(), h = await harness(fixture(), () => wait.promise);
  try { h.render(); assert.equal(h.actionKeys.length, 1); assert.equal(h.actionKeys[0].cancellation, 'cancel/' + h.actionKeys[0].approval); assert.notEqual(h.actionKeys[0].approval, h.actionKeys[0].cancellation); h.approval()!.props.onClick(); h.cancellation()!.props.onClick(); h.render(); assert.notEqual(h.approval()!.props['aria-describedby'], h.cancellation()!.props['aria-describedby']); }
  finally { wait.resolve(false); await flush(); h.restore(); }
});

test('the cancellation lease exists before a reentrant action callback', async () => {
  const wait = deferred(); let reenter = () => {}; const h = await harness(fixture(), () => { reenter(); return wait.promise; });
  try { h.render(); reenter = () => h.cancellation()!.props.onClick(); h.cancellation()!.props.onClick(); h.render(); assert.equal(h.calls.length, 1); assert.equal(h.cancellation()!.props.disabled, true); assert.equal(h.prompts.length, 0); }
  finally { wait.resolve(false); await flush(); h.restore(); }
});

test('head and ordinary judges retain no cancellation control', async () => {
  for (const role of ['head', 'judge'] as const) { const h = await harness(fixture(role)); try { h.render(); assert.equal(h.cancellation(), undefined); assert.equal(h.calls.length, 0); } finally { h.restore(); } }
});

test('unconfirmed settlement allows a deliberate exact-target retry without an automatic resend', async () => {
  const h = await harness(); try { h.render(); h.cancellation()!.props.onClick(); await flush(); h.render(); assert.equal(h.calls.length, 1); assert.equal(h.cancellation()!.props.disabled, false); h.cancellation()!.props.onClick(); await flush(); h.render(); assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[1], h.calls[0]); assert.equal(h.prompts.length, 0); } finally { h.restore(); }
});
