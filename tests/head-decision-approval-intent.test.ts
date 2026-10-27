import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './review-action-render-harness.mjs';

type Harness = Awaited<ReturnType<typeof harness>>;
type Element = ReturnType<Harness['nodes']>[number];
const flush = async () => { for (let n = 0; n < 24; n++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const walk = (node: Element): Element[] => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const editors = (h: Harness) => h.nodes().filter(n => n.type === 'fieldset' && String(n.props.children[0]?.props?.children).includes('equal averages'));
const input = (h: Harness, kind: string, index = 0) => walk(editors(h)[index]).find(n => n.type === 'input' && (kind === 'shared' ? n.props.type === 'checkbox' : n.props.type !== 'checkbox'))!;
const moves = (h: Harness, index = 0) => walk(editors(h)[index]).filter(n => n.type === 'button' && n.props.children === 'Move up');
function edit(h: Harness, field = 'explanation') {
  if (field === 'order') moves(h)[1].props.onClick(); else input(h, field).props.onChange({ target: field === 'shared' ? { checked: true } : { value: 'Different local intent' } });
}
async function ready(mode = 'legacy', action: (body: Record<string, unknown>) => Promise<boolean> = async () => false) {
  const h = await harness(mode === 'legacy' ? 'legacyDecision' : 'decision', action), r = h.data.rounds[0];
  if (mode !== 'legacy') r.definition.kind = 'finals';
  r.standings.rows.forEach(row => row.decided = true);
  r.standings.decisions = [{ key: 'controlled-tie', fingerprint: r.standings.fingerprint, judgeId: h.data.judgeId, role: 'head', order: [...r.standings.ties[0].subjectIds], shared: false, explanation: 'Saved explanation', decidedAt: 'now' }];
  h.render(); return h;
}

for (const mode of ['legacy', 'stage']) for (const field of ['order', 'shared', 'explanation']) test(`${mode}: ${field} edits block even the captured pre-render approval and have explicit discard recovery`, async () => {
  const h = await ready(mode), approval = h.button(/^Approve these exact/)!; assert.equal(approval.props.disabled, false);
  edit(h, field); approval.props.onClick(); assert.equal(h.calls.length, 0);
  let html = h.render(); assert.equal(h.button(/^Approve these exact/)!.props.disabled, true); assert.match(html, /local changes awaiting confirmation/);
  const route = h.button(/^Review Couple draft/)!; assert.ok(route); const legend = h.nodes().find(n => n.props.id === route.props['aria-controls']);
  assert.equal(legend?.type, 'legend'); assert.equal(legend.props.tabIndex, -1);
  for (const id of legend.props['aria-describedby'].split(' ')) assert.ok(h.nodes().some(n => n.props.id === id));
  h.button(/^Discard decision changes/)!.props.onClick(); html = h.render(); assert.equal(input(h, 'explanation').props.value, 'Saved explanation');
  assert.equal(h.button(/^Approve these exact/)!.props.disabled, false); assert.ok(!html.includes('local changes awaiting confirmation'));
});

for (const mode of ['legacy', 'stage']) for (const outcome of ['true', 'false', 'throw']) test(`${mode}: a pending or unconfirmed head save retains the approval barrier on ${outcome}`, async () => {
  const wait = deferred<boolean>(), h = await ready(mode, () => wait.promise), capturedApproval = h.button(/^Approve these exact/)!;
  edit(h); h.render(); h.button(/^Save head/)!.props.onClick(); capturedApproval.props.onClick(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].action, 'tie');
  h.render(); assert.equal(h.button(/^Approve these exact/)!.props.disabled, true); assert.equal(h.buttons(/^Discard decision changes/).length, 0);
  if (outcome === 'throw') wait.reject(Error('save rejected')); else wait.resolve(outcome === 'true'); await flush(); h.render();
  assert.equal(h.button(/^Approve these exact/)!.props.disabled, true); assert.equal(input(h, 'explanation').props.value, 'Different local intent');
  h.button(/^Discard decision changes/)!.props.onClick(); h.render(); assert.equal(h.button(/^Approve these exact/)!.props.disabled, false);
});

for (const mode of ['legacy', 'stage']) test(`${mode}: authoritative exact confirmation releases approval while the original save callback still waits`, async () => {
  const save = deferred<boolean>(), h = await ready(mode, body => body.action === 'tie' ? save.promise : Promise.resolve(false));
  edit(h); h.render(); h.button(/^Save head/)!.props.onClick(); const body = h.calls[0], next = structuredClone(h.data), r = next.rounds[0]; r.version++;
  Object.assign(r.standings.decisions[0], { order: body.order, shared: body.shared, explanation: body.explanation }); h.setData(next); const html = h.render();
  assert.match(html, /Decision saved in current results/); assert.equal(h.button(/^Approve these exact/)!.props.disabled, false);
  h.button(/^Approve these exact/)!.props.onClick(); await flush(); h.render(); assert.equal(h.calls[1].action, 'approve'); assert.equal(h.calls[1].roundVersion, r.version);
  save.resolve(false); await flush(); h.render(); assert.equal(h.button(/^Approve these exact/)!.props.disabled, false);
});

test('returning fields to the authoritative saved values removes the conflict without discarding intent', async () => {
  const h = await ready(); edit(h); h.render(); input(h, 'explanation').props.onChange({ target: { value: 'Saved explanation' } }); const html = h.render();
  assert.match(html, /Decision saved in current results/); assert.equal(h.button(/^Approve these exact/)!.props.disabled, false);
});

for (const mode of ['legacy', 'stage']) for (const outcome of ['true', 'false', 'throw']) test(`${mode}: pending approval synchronously prevents captured late edits and save on ${outcome}`, async () => {
  const wait = deferred<boolean>(), h = await ready(mode, () => wait.promise), text = input(h, 'explanation'), shared = input(h, 'shared'), move = moves(h)[1], save = h.button(/^Decision saved$/)!;
  h.button(/^Approve these exact/)!.props.onClick(); text.props.onChange({ target: { value: 'Late conflicting intent' } }); shared.props.onChange({ target: { checked: true } }); move.props.onClick(); save.props.onClick();
  let html = h.render(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].action, 'approve'); assert.equal(input(h, 'explanation').props.value, 'Saved explanation');
  assert.equal(input(h, 'shared').props.checked, false); assert.ok(input(h, 'explanation').props.disabled); assert.ok(moves(h).every(n => n.props.disabled)); assert.match(html, /Decision edits are paused/);
  if (outcome === 'throw') wait.reject(Error('approval rejected')); else wait.resolve(outcome === 'true'); await flush(); html = h.render();
  assert.equal(input(h, 'explanation').props.disabled, false); assert.ok(!html.includes('Decision edits are paused')); edit(h); h.render(); assert.equal(h.button(/^Approve these exact/)!.props.disabled, true);
});

test('same-view polling and stable effect dependencies do not erase an edited registry claim', async () => {
  const h = await ready(); edit(h); h.render(); const cleanups = h.cleanups(); assert.equal(cleanups.length, 2);
  for (let n = 0; n < 4; n++) { h.setData(structuredClone(h.data)); h.render(); assert.equal(h.button(/^Approve these exact/)!.props.disabled, true); assert.deepEqual(h.cleanups(), cleanups); }
});

test('old same-key cleanup cannot clear a newer head-editor lease', async () => {
  const h = await ready(); edit(h); h.render(); const oldCleanup = h.cleanups();
  h.data.rounds[0].phase = 'dancing'; h.render(); h.data.rounds[0].phase = 'discussion'; h.render(); assert.equal(input(h, 'explanation').props.value, 'Saved explanation');
  edit(h); h.render(); for (const cleanup of oldCleanup) cleanup(); h.render(); assert.equal(h.button(/^Approve these exact/)!.props.disabled, true);
});

test('old approval completion or cleanup cannot release a newer same-key approval lease', async () => {
  const old = deferred<boolean>(), fresh = deferred<boolean>(); let calls = 0;
  const h = await ready('legacy', () => ++calls === 1 ? old.promise : fresh.promise); const oldCleanup = h.cleanups();
  h.button(/^Approve these exact/)!.props.onClick(); h.render(); h.data.rounds[0].phase = 'dancing'; h.render(); h.data.rounds[0].phase = 'discussion'; h.render();
  h.button(/^Approve these exact/)!.props.onClick(); h.render(); old.resolve(false); await flush(); for (const cleanup of oldCleanup) cleanup(); h.render();
  assert.equal(input(h, 'explanation').props.disabled, true); assert.equal(h.button(/^Approving/)!.props.disabled, true); fresh.resolve(false); await flush(); h.render(); assert.equal(input(h, 'explanation').props.disabled, false);
});

test('another round stays independently approval-ready and editable while this round has a draft or approval wait', async () => {
  const wait = deferred<boolean>(), h = await ready('legacy', () => wait.promise), second = structuredClone(h.data.rounds[0]); second.id += '-second'; second.key += '-second'; second.definition.id = second.id;
  h.data.rounds.push(second); h.render(); const approvals = h.buttons(/^Approve these exact/); edit(h); approvals[0].props.onClick(); approvals[1].props.onClick(); h.render();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].roundKey, second.key); assert.equal(input(h, 'explanation').props.disabled, false); assert.equal(input(h, 'explanation', 1).props.disabled, true);
  wait.resolve(false); await flush(); h.render(); assert.equal(input(h, 'explanation', 1).props.disabled, false); assert.equal(h.buttons(/^Approve these exact/)[0].props.disabled, true);
});

for (const boundary of ['tie', 'identity', 'eligibility']) test(`${boundary} removal drops only the ended local claim and a fresh form does not inherit it`, async () => {
  const h = await ready(); edit(h); h.render(); const priorTies = structuredClone(h.data.rounds[0].standings.ties);
  if (boundary === 'tie') { h.data.rounds[0].standings.ties = []; h.render(); h.data.rounds[0].standings.ties = priorTies; }
  else if (boundary === 'identity') { h.data.eventId += '-new'; }
  else { h.setHead(false); h.render(); h.setHead(true); }
  h.render(); assert.equal(input(h, 'explanation').props.value, 'Saved explanation'); assert.equal(h.button(/^Approve these exact/)!.props.disabled, false);
});

test('changed result fingerprint retains the old material draft and explicit current-result recovery releases approval', async () => {
  const h = await ready(); edit(h); h.render(); const next = structuredClone(h.data), r = next.rounds[0]; r.version++; r.standings.fingerprint = 'changed'; r.standings.decisions[0].fingerprint = 'changed';
  h.setData(next); h.render(); assert.equal(input(h, 'explanation').props.value, 'Different local intent'); assert.equal(h.button(/^Approve these exact/)!.props.disabled, true);
  h.button(/^Discard draft and review current results/)!.props.onClick(); h.render(); assert.equal(h.button(/^Approve these exact/)!.props.disabled, false); assert.equal(input(h, 'explanation').props.value, 'Saved explanation');
});
