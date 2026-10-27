import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './review-action-render-harness.mjs';
import { text } from '../lib/live/validation.ts';

const flush = async () => { for (let n = 0; n < 24; n++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
type Harness = Awaited<ReturnType<typeof harness>>;
const checks = (h: Harness) => h.nodes().filter(n => n.type === 'input' && n.props.type === 'checkbox');
const explanation = (h: Harness) => h.nodes().find(n => n.type === 'input' && n.props.type !== 'checkbox')!;
const send = (h: Harness, mode: string) => h.button(mode === 'vote' ? /^Submit advancement|^Submitting vote/ : /^Save head|^Saving decision|^Decision saved$/)!;
function edit(h: Harness, mode: string) {
  if (mode === 'vote') checks(h)[0].props.onChange({ target: { checked: true } });
  else {
    h.buttons(/^Move up/)[1].props.onClick(); h.render();
    explanation(h).props.onChange({ target: { value: '  Exact retained explanation  ' } }); h.render();
    if (mode === 'legacyDecision') checks(h)[0].props.onChange({ target: { checked: true } });
  }
  h.render();
}

for (const mode of ['vote', 'decision', 'legacyDecision']) for (const outcome of ['true', 'false', 'throw']) {
  test(`${mode}: progress and immediate repeat guard preserve the exact draft on ${outcome}`, async () => {
    const wait = deferred<boolean>(), h = await harness(mode, () => wait.promise); h.render(); edit(h, mode);
    const original = structuredClone(h.data.rounds[0]), button = send(h, mode);
    const capturedCheckbox = checks(h)[0], capturedExplanation = mode === 'vote' ? null : explanation(h);
    button.props.onClick(); button.props.onClick();
    capturedCheckbox?.props.onChange({ target: { checked: false } });
    capturedExplanation?.props.onChange({ target: { value: 'must not replace pending draft' } });
    let html = h.render(); assert.equal(h.calls.length, 1);
    assert.equal(send(h, mode).props.disabled, true); assert.equal(send(h, mode).props['aria-busy'], true);
    assert.match(html, mode === 'vote' ? /Submitting vote…/ : /Saving this head decision…/);
    assert.ok(checks(h).every(n => n.props.disabled));
    const payload = h.calls[0];
    assert.equal(payload.roundKey, original.key); assert.equal(payload.roundVersion, original.version);
    assert.equal(payload.fingerprint, original.standings.fingerprint); assert.equal(payload.tieKey, 'controlled-tie');
    if (mode === 'vote') assert.deepEqual(payload.selected, [original.definition.subjects[0].id]);
    else {
      assert.deepEqual(payload.order, original.definition.subjects.map(s => s.id).reverse());
      assert.equal(payload.explanation, '  Exact retained explanation  ');
      assert.equal(payload.shared, mode === 'legacyDecision'); assert.equal(explanation(h).props.disabled, true);
      assert.ok(h.buttons(/^Move up/).every(n => n.props.disabled));
    }
    if (outcome === 'throw') wait.reject(Error('PRIVATE_SAVE_ERROR')); else wait.resolve(outcome === 'true');
    await flush(); html = h.render(); assert.equal(send(h, mode).props.disabled, false);
    assert.equal(send(h, mode).props['aria-busy'], false); assert.match(html, /Check current results/);
    assert.ok(!html.includes('PRIVATE_SAVE_ERROR')); assert.ok(!html.includes('Decision saved in current results.'));
    if (mode === 'vote') assert.ok(!html.includes('Vote finalized.'));
    if (mode === 'vote') assert.equal(checks(h)[0].props.checked, true);
    else { assert.equal(explanation(h).props.value, payload.explanation); if (mode === 'legacyDecision') assert.equal(checks(h)[0].props.checked, true); }
  });
}

for (const mode of ['vote', 'decision', 'legacyDecision']) for (const field of ['version', 'fingerprint', 'subjects']) {
  test(`${mode}: ${field} change retains old draft, blocks retargeting and requires explicit discard`, async () => {
    const wait = deferred<boolean>(), h = await harness(mode, () => wait.promise); h.render(); edit(h, mode);
    const oldStatus = h.nodes().find(n => n.type === 'p' && n.props.role === 'status' && /selected|order before/.test(String(n.props.children)))?.props.id;
    send(h, mode).props.onClick(); const original = structuredClone(h.calls[0]), next = structuredClone(h.data);
    if (field === 'version') next.rounds[0].version++;
    else if (field === 'fingerprint') next.rounds[0].standings.fingerprint = 'new-fingerprint';
    else {
      next.rounds[0].definition.subjects[0].primary = 'New current name';
      const tie = next.rounds[0].standings.ties[0]; tie.subjectIds = tie.subjectIds.slice(1);
      if (mode !== 'legacyDecision') next.rounds[0].standings.advancementTies![0].subjectIds = tie.subjectIds;
    }
    h.setData(next); let html = h.render(); assert.equal(send(h, mode).props.disabled, true);
    assert.equal(h.buttons(/^Discard draft/).length, 0); assert.deepEqual(h.calls, [original]);
    if (mode === 'vote') assert.equal(checks(h)[0].props.checked, true); else assert.equal(explanation(h).props.value, original.explanation);
    wait.resolve(false); await flush(); html = h.render(); assert.match(html, /Results changed/);
    assert.equal(send(h, mode).props.disabled, true); send(h, mode).props.onClick(); assert.equal(h.calls.length, 1);
    const reset = h.button(/^Discard draft and review current results/)!; assert.ok(reset);
    if (oldStatus) assert.ok(h.nodes().some(n => n.props.id === oldStatus));
    if (field === 'subjects') assert.ok(html.includes(h.data.rounds[0].definition.subjects[1].primary));
    reset.props.onClick(); html = h.render(); assert.ok(!html.includes('earlier decision draft'));
    if (mode === 'vote') { assert.equal(checks(h).filter(n => n.props.checked).length, 0); assert.equal(send(h, mode).props.disabled, true); }
    else { assert.equal(explanation(h).props.value, ''); assert.equal(send(h, mode).props.disabled, false); }
  });
}

test('authoritative own vote finalizes after round.version advances, independently of callback outcome', async () => {
  const wait = deferred<boolean>(), h = await harness('vote', () => wait.promise); h.render(); edit(h, 'vote'); send(h, 'vote').props.onClick();
  const next = structuredClone(h.data), r = next.rounds[0]; r.version++;
  r.standings.advancementTies![0].votes.push({ roundKey: r.key, fingerprint: r.standings.fingerprint, tieKey: 'controlled-tie', judgeId: next.judgeId, selected: h.calls[0].selected as string[], createdAt: 'confirmed' });
  h.setData(next); let html = h.render(); assert.match(html, /Vote finalized\./); assert.ok(!html.includes('earlier vote draft'));
  assert.equal(h.button(/^Vote finalized/)!.props.disabled, true); wait.resolve(false); await flush(); html = h.render(); assert.match(html, /Vote finalized\./);
});

test('exact authoritative head decision confirms across a version increment; boolean alone cannot', async () => {
  const wait = deferred<boolean>(), h = await harness('legacyDecision', () => wait.promise); h.render(); edit(h, 'legacyDecision'); send(h, 'legacyDecision').props.onClick();
  const payload = h.calls[0], next = structuredClone(h.data), r = next.rounds[0]; r.version++;
  r.standings.decisions.push({ key: 'controlled-tie', fingerprint: r.standings.fingerprint, judgeId: next.judgeId, role: 'head', order: payload.order as string[], shared: payload.shared as boolean, explanation: text(payload.explanation, 'tie explanation', 500), decidedAt: 'confirmed' });
  h.setData(next); let html = h.render(); assert.match(html, /Decision saved in current results\./);
  assert.ok(!html.includes('earlier decision draft')); assert.equal(h.button(/^Decision saved$/)!.props.disabled, true);
  wait.resolve(false); await flush(); html = h.render(); assert.match(html, /Decision saved in current results\./);
  h.button(/^Review current saved decision/)!.props.onClick(); h.render(); assert.equal(send(h, 'legacyDecision').props.disabled, true);
  h.button(/^Decision saved$/)!.props.onClick(); assert.equal(h.calls.length, 1);
  explanation(h).props.onChange({ target: { value: 'New explicit explanation' } }); h.render(); assert.equal(send(h, 'legacyDecision').props.disabled, false);
  send(h, 'legacyDecision').props.onClick(); await flush(); h.render(); assert.equal(h.calls.length, 2); assert.equal(h.calls[1].explanation, 'New explicit explanation');
  assert.equal(explanation(h).props.value, 'New explicit explanation');
});

test('different authoritative decision fields do not confirm the retained draft', async () => {
  const wait = deferred<boolean>(), h = await harness('legacyDecision', () => wait.promise); h.render(); edit(h, 'legacyDecision'); send(h, 'legacyDecision').props.onClick();
  const next = structuredClone(h.data), r = next.rounds[0]; r.version++;
  r.standings.decisions.push({ key: 'controlled-tie', fingerprint: r.standings.fingerprint, judgeId: next.judgeId, role: 'head', order: h.calls[0].order as string[], shared: true, explanation: 'Different authoritative explanation', decidedAt: 'confirmed' });
  h.setData(next); wait.resolve(true); await flush(); const html = h.render(); assert.ok(!html.includes('Decision saved in current results.')); assert.match(html, /Results changed/);
  assert.equal(explanation(h).props.value, '  Exact retained explanation  ');
});

test('vote slot count and existing assignment/role/archive gates remain effective', async () => {
  const h = await harness('vote'); h.render(); assert.equal(send(h, 'vote').props.disabled, true);
  checks(h)[0].props.onChange({ target: { checked: true } }); h.render(); checks(h)[1].props.onChange({ target: { checked: true } }); h.render();
  assert.equal(send(h, 'vote').props.disabled, true); send(h, 'vote').props.onClick(); assert.equal(h.calls.length, 0);
  for (const gate of ['archive', 'phase', 'assignment', 'organizer']) {
    const x = await harness('vote'); if (gate === 'archive') x.data.status = 'archived'; else if (gate === 'phase') x.data.rounds[0].phase = 'dancing'; else if (gate === 'assignment') x.data.judgeId = 'unassigned'; else x.data.role = 'organizer';
    x.render(); for (const b of x.buttons(/^Submit advancement/)) { assert.equal(b.props.disabled, true); b.props.onClick(); } assert.equal(x.calls.length, 0);
  }
});

test('head decision respects full-panel deadlock, role and shared-place controls', async () => {
  for (const gate of ['panel', 'deadlock', 'role', 'phase', 'complete']) {
    const h = await harness('decision'), r = h.data.rounds[0]; if (gate === 'panel') r.standings.advancementTies![0].votes.pop(); else if (gate === 'deadlock') r.standings.advancementTies![0].deadlocked = false; else if (gate === 'role') h.data.role = 'judge'; else if (gate === 'phase') r.phase = 'dancing'; else r.standings.complete = false;
    h.render(); assert.equal(h.buttons(/^Save head/).length, 0);
  }
  const h = await harness('decision'); h.render(); assert.equal(checks(h).length, 2); // Vote choices only; no shared-place option in Prelims.
  const legacy = await harness('legacyDecision'); legacy.render(); assert.equal(checks(legacy).length, 1);
});

test('independent tie controls own pending state and do not block the neighboring approval action', async () => {
  const first = deferred<boolean>(), second = deferred<boolean>(); let count = 0;
  const h = await harness('legacyDecision', () => ++count === 1 ? first.promise : second.promise); const r = h.data.rounds[0];
  r.standings.ties.push({ ...r.standings.ties[0], key: 'second-tie' }); h.render();
  h.buttons(/^Save head/)[0].props.onClick(); h.render(); assert.equal(h.button(/^Save head/)!.props.disabled, false);
  h.button(/^Save head/)!.props.onClick(); h.render(); assert.equal(h.buttons(/^Saving decision/).length, 2);
  first.resolve(false); await flush(); h.render(); assert.equal(h.buttons(/^Saving decision/).length, 1);
  assert.equal(h.button(/^Approve these exact/)!.props.disabled, true); // Existing unresolved-place blocker, not waiting state.
  second.resolve(true); await flush(); h.render(); assert.equal(h.calls.length, 2); assert.notEqual(h.calls[0].tieKey, h.calls[1].tieKey);
});

for (const boundary of ['event', 'actor', 'generation', 'tie']) test(`${boundary} remount owns a separate draft and old completion cannot clear its wait`, async () => {
  const old = deferred<boolean>(), fresh = deferred<boolean>(); let count = 0;
  const h = await harness('vote', () => ++count === 1 ? old.promise : fresh.promise); h.render(); edit(h, 'vote'); send(h, 'vote').props.onClick();
  const next = structuredClone(h.data), r = next.rounds[0]; if (boundary === 'event') next.eventId += '-new'; else if (boundary === 'actor') next.judgeId = r.definition.judgeIds.find(id => id !== next.judgeId)!; else if (boundary === 'generation') { r.key += '-new'; r.generation++; } else r.standings.advancementTies![0].key += '-new';
  h.setData(next); h.render(); assert.equal(checks(h).filter(n => n.props.checked).length, 0); edit(h, 'vote'); send(h, 'vote').props.onClick(); h.render();
  old.resolve(false); await flush(); h.render(); assert.equal(send(h, 'vote').props.disabled, true); assert.equal(send(h, 'vote').props['aria-busy'], true);
  fresh.resolve(true); await flush(); h.render(); assert.equal(h.calls.length, 2);
});

for (const mode of ['vote', 'decision', 'legacyDecision']) test(`${mode}: pristine refresh follows current results without a discard step`, async () => {
  const h = await harness(mode); h.render(); const next = structuredClone(h.data), r = next.rounds[0];
  r.version++; r.standings.fingerprint = 'fresh-before-edit'; h.setData(next); let html = h.render();
  assert.equal(h.buttons(/^Discard draft/).length, 0); assert.ok(!html.includes('earlier vote draft')); assert.ok(!html.includes('earlier decision draft'));
  edit(h, mode); send(h, mode).props.onClick(); await flush(); html = h.render();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].roundVersion, r.version); assert.equal(h.calls[0].fingerprint, 'fresh-before-edit');
  assert.match(html, /Check current results/);
});

test('a previously attempted default decision remains pinned even without field edits', async () => {
  const h = await harness('legacyDecision', async () => false); h.render(); send(h, 'legacyDecision').props.onClick(); await flush(); h.render();
  const next = structuredClone(h.data); next.rounds[0].version++; h.setData(next); const html = h.render();
  assert.match(html, /earlier decision draft/); assert.equal(send(h, 'legacyDecision').props.disabled, true); assert.ok(h.button(/^Discard draft/));
});

test('changed vote slots preserve the old selection and explicit new draft sends only current tuple', async () => {
  const h = await harness('vote', async () => false); h.render(); edit(h, 'vote');
  const next = structuredClone(h.data), r = next.rounds[0]; r.version++; r.standings.fingerprint = 'current-retry'; r.standings.advancementTies![0].slots = 2;
  h.setData(next); h.render(); assert.equal(checks(h)[0].props.checked, true); assert.equal(send(h, 'vote').props.disabled, true);
  h.button(/^Discard draft/)!.props.onClick(); h.render(); edit(h, 'vote'); checks(h)[1].props.onChange({ target: { checked: true } }); h.render();
  send(h, 'vote').props.onClick(); await flush(); h.render(); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].roundVersion, r.version); assert.equal(h.calls[0].fingerprint, 'current-retry'); assert.deepEqual(h.calls[0].selected, r.definition.subjects.map(s => s.id));
});

test('eligibility loss unmounts a head draft; its completion cannot clear a fresh eligible control', async () => {
  const old = deferred<boolean>(), fresh = deferred<boolean>(); let count = 0;
  const h = await harness('legacyDecision', () => ++count === 1 ? old.promise : fresh.promise); h.render(); edit(h, 'legacyDecision'); send(h, 'legacyDecision').props.onClick();
  h.data.rounds[0].phase = 'dancing'; h.render(); assert.equal(h.buttons(/^Save head/).length, 0);
  h.data.rounds[0].phase = 'discussion'; h.render(); assert.equal(explanation(h).props.value, ''); send(h, 'legacyDecision').props.onClick(); h.render();
  old.resolve(true); await flush(); h.render(); assert.equal(send(h, 'legacyDecision').props['aria-busy'], true);
  fresh.resolve(false); await flush(); h.render(); assert.equal(send(h, 'legacyDecision').props['aria-busy'], false);
});

test('server text validation preserves whitespace-only explanation; a trimmed different value cannot confirm it', async () => {
  const wait = deferred<boolean>(), h = await harness('legacyDecision', () => wait.promise); h.render();
  explanation(h).props.onChange({ target: { value: '   ' } }); h.render(); send(h, 'legacyDecision').props.onClick();
  const payload = h.calls[0], next = structuredClone(h.data), r = next.rounds[0]; r.version++;
  const stored = text(payload.explanation, 'tie explanation', 500); assert.equal(stored, '   '); assert.equal(payload.explanation, '   ');
  r.standings.decisions.push({ key: 'controlled-tie', fingerprint: r.standings.fingerprint, judgeId: next.judgeId, role: 'head', order: payload.order as string[], shared: payload.shared as boolean, explanation: stored, decidedAt: 'confirmed' });
  h.setData(next); assert.match(h.render(), /Decision saved in current results\./); assert.equal(explanation(h).props.value, '   ');
  wait.resolve(false); await flush(); h.render(); assert.equal(h.button(/^Decision saved$/)!.props.disabled, true);
  const different = structuredClone(next); different.rounds[0].standings.decisions[0].explanation = '';
  h.setData(different); const html = h.render(); assert.ok(!html.includes('Decision saved in current results.')); assert.match(html, /Results changed/);
});
