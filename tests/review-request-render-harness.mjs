import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stageFixture } from './stage-fixture.ts';
import { freezeRound } from '../lib/live/validation.ts';

const root = new URL('../', import.meta.url);
const codeURL = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

/** @param {'organizer'|'head'|'judge'} role @param {'correction'|'withdrawal'} kind
 * @returns {import('../lib/live/types.ts').LiveView & {reviewRequests: import('../lib/live/types.ts').ReviewRequest[]}} */
export function fixture(role = 'organizer', kind = 'correction') {
  const setup = stageFixture('approval-feedback', 3), definition = freezeRound(setup, setup.rounds[0]), key = definition.id + ':1';
  return { eventId: 'fictional-request-event', version: 7, status: 'active', role, judgeId: role === 'organizer' ? null : setup.headJudgeId,
    setup, context: { blockId: setup.blocks[0].id, performanceId: null, visited: [] }, ballots: [],
    rounds: [{ id: definition.id, key, generation: 1, version: 2, phase: 'discussion', definition }],
    reviewRequests: [{ id: 'fictional-request', kind, version: 3, payload: { roundKey: key, competitionId: definition.competitionId,
      ...(kind === 'correction' ? { heatId: definition.heats[0].id, judgeId: definition.judgeIds[0], submissionId: 'fictional-submission',
        changes: [{ performanceId: definition.heats[0].songs[0].id, subjectId: definition.subjects[0].id, before: 'No', after: 'Yes' }] } : { subjectId: definition.subjects[0].id }) },
      reason: 'Synthetic exact-version reason', requester: setup.organizerParticipantId, createdAt: '2026-10-27T00:00:00Z', approvals: [] }] };
}

// Executes real ReviewRequests/approval controls, with deterministic hook identity/effect cleanup.
// The unrelated Correction editor body is substituted; its real element key/props are recorded.
// This is controlled component evidence, not a React DOM/StrictMode/browser/server model.
/** @param {ReturnType<typeof fixture>} data @param {(input: Record<string, unknown>) => Promise<boolean>} action */
export async function harness(data = fixture(), action = async () => true) {
  const buckets = new Map(); let current = '', index = 0, tree, seen = new Set(), idSequence = 0;
  const calls = /** @type {Record<string, unknown>[]} */([]), prompts = /** @type {string[]} */([]);
  const revisions = /** @type {import('../lib/live/types.ts').ReviewRequest[]} */([]);
  let corrections = [], lateStateUpdates = 0;
  let actionKeys = /** @type {{approval: string | null, cancellation: string | null}[]} */([]);
  let confirmResult = /** @type {boolean | ((message: string) => boolean)} */(true);
  const bucket = () => { seen.add(current); if (!buckets.has(current)) buckets.set(current, []); return buckets.get(current); };
  const hooks = {
    useState(initial) { const key = current, values = bucket(), slot = index++; if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial;
      return [values[slot], value => { if (buckets.get(key) !== values) lateStateUpdates++; values[slot] = typeof value === 'function' ? value(values[slot]) : value; }]; },
    useRef(initial) { const values = bucket(), slot = index++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; },
    useId() { const values = bucket(), slot = index++; if (!(slot in values)) values[slot] = 'request-feedback-' + (++idSequence); return values[slot]; },
    useEffect(fn, deps) { const values = bucket(), slot = index++, old = values[slot]; if (!old || deps.some((v, i) => !Object.is(v, old.deps[i]))) values[slot] = { kind: 'effect', fn, deps: [...deps], cleanup: old?.cleanup, changed: true }; },
  };
  const key = '__requestApprovalRender' + crypto.randomUUID().replaceAll('-', ''); globalThis[key] = hooks;
  const react = codeURL(`export const {useState,useRef,useId,useEffect}=globalThis[${JSON.stringify(key)}];`);
  let code = ts.transpileModule(readFileSync(new URL('components/live/result-management.tsx', root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  code = code.replace(/from\s*(['"])([^'"]+)\1/g, (_all, _q, specifier) => {
    if (specifier === 'react') return 'from ' + JSON.stringify(react);
    if (specifier === 'react/jsx-runtime') return 'from ' + JSON.stringify(import.meta.resolve(specifier));
    throw Error('Unreviewed result-management import: ' + specifier);
  });
  const { ReviewRequests } = await import(codeURL(code)); delete globalThis[key];
  const originalWindow = globalThis.window; globalThis.window = { confirm(message) { prompts.push(message); return typeof confirmResult === 'function' ? confirmResult(message) : confirmResult; } };
  function expand(node, path = 'root') {
    if (Array.isArray(node)) return node.map((child, i) => expand(child, path + '/' + (isValidElement(child) && child.key !== null ? child.key : i)));
    if (!isValidElement(node)) return node;
    if (node.type === 'div' && node.props.className === 'shared-inline') {
      const controls = (Array.isArray(node.props.children) ? node.props.children : [node.props.children]).filter(n => isValidElement(n) && typeof n.type === 'function' && ['RequestApproval', 'RequestCancellation'].includes(n.type.name));
      if (controls.length) {
        const keys = controls.map(n => n.key); if (new Set(keys).size !== keys.length) throw Error('Duplicate action sibling React keys');
        actionKeys.push({ approval: controls.find(n => n.type.name === 'RequestApproval')?.key ?? null, cancellation: controls.find(n => n.type.name === 'RequestCancellation')?.key ?? null });
      }
    }
    const identity = path + '/' + (node.key ?? '');
    if (typeof node.type === 'function') {
      if (node.type.name === 'Correction') { corrections.push({ key: node.key, props: node.props }); return null; }
      const previous = current, previousIndex = index; current = identity + '/' + node.type.name; index = 0; seen.add(current);
      const value = node.type(node.props); current = previous; index = previousIndex; return expand(value, identity + '/body');
    }
    return createElement(node.type, { ...node.props, key: node.key }, expand(node.props.children, identity + '/children'));
  }
  function nodes(node, out = []) { if (Array.isArray(node)) node.forEach(n => nodes(n, out)); else if (isValidElement(node)) { out.push(node); nodes(node.props.children, out); } return out; }
  const text = node => Array.isArray(node) ? node.map(text).join('') : isValidElement(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  const run = input => { calls.push(structuredClone(input)); return action(input); };
  return {
    get data() { return data; }, setData(value) { data = value; }, calls, prompts, revisions, text,
    get corrections() { return corrections; }, get lateStateUpdates() { return lateStateUpdates; }, get actionKeys() { return actionKeys; },
    setConfirm(value) { confirmResult = value; },
    render() { seen = new Set(); corrections = []; actionKeys = []; tree = expand(createElement(ReviewRequests, { data, action: run, embedded: true, pendingOnly: false, onReviseWithdrawal: q => revisions.push(q) }));
      for (const key of buckets.keys()) if (!seen.has(key)) { buckets.get(key).forEach(v => { if (v?.kind === 'effect') v.cleanup?.(); }); buckets.delete(key); }
      for (const values of buckets.values()) for (const v of values) if (v?.kind === 'effect' && v.changed) { v.cleanup?.(); v.cleanup = v.fn(); v.changed = false; }
      return renderToStaticMarkup(tree); },
    nodes: () => nodes(tree),
    article(id = data.reviewRequests[0].id) { return nodes(tree).find(n => n.type === 'article' && n.props.id === 'review-request-' + id); },
    approval(id = data.reviewRequests[0].id) { return nodes(this.article(id)).find(n => n.type === 'button' && /^(Approve request as |Approving request)/.test(text(n))); },
    approvalStatus(id = data.reviewRequests[0].id) { const statusId = this.approval(id)?.props['aria-describedby']; return statusId ? nodes(this.article(id)).find(n => n.type === 'p' && n.props.id === statusId) : undefined; },
    cancellation(id = data.reviewRequests[0].id) { return nodes(this.article(id)).find(n => n.type === 'button' && /^(Cancel request$|Cancelling request)/.test(text(n))); },
    cancellationStatus(id = data.reviewRequests[0].id) { const statusId = this.cancellation(id)?.props['aria-describedby']; return statusId ? nodes(this.article(id)).find(n => n.type === 'p' && n.props.id === statusId) : undefined; },
    button(pattern, id = data.reviewRequests[0].id) { return nodes(this.article(id)).find(n => n.type === 'button' && pattern.test(text(n))); },
    restore() { for (const values of buckets.values()) values.forEach(v => { if (v?.kind === 'effect') v.cleanup?.(); }); buckets.clear(); if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; },
  };
}
