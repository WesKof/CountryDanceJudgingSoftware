import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createElement, isValidElement, type ReactNode, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { finalsFixture } from './organizer-review-render-harness.mjs';
import { buildPublicSnapshot } from '../lib/live/publication.ts';
import { deriveStandings, requiredCells } from '../lib/live/scoring.ts';
import { publicationPreparationIssues } from '../lib/live/publication-readiness.ts';
import type { LiveView } from '../lib/live/types.ts';
const root = new URL('../', import.meta.url), url = (s: string) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
type Node = ReactElement<Record<string, unknown>>;
function nodes(n: ReactNode, out: Node[] = []): Node[] { if (Array.isArray(n)) n.forEach(x => nodes(x, out)); else if (isValidElement<Record<string, unknown>>(n)) { out.push(n); nodes(n.props.children as ReactNode, out); } return out; }
function held() { let resolve!: (value: boolean) => void, reject!: (reason: Error) => void; const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; }
async function fixture(send = false) {
  const data = finalsFixture() as unknown as LiveView;
  for (const round of data.rounds) {
    const cells = requiredCells(round.definition);
    const submissions = round.definition.judgeIds.map(judgeId => ({id: judgeId + round.key, roundKey: round.key, judgeId, ballotVersion: 1, createdAt: 'fictional', cells: Object.fromEntries(cells.map(c => [c.key, {mark: 'No' as const, note: '', revision: 1, mutationId: 'fictional'}]))}));
    round.standings = {...deriveStandings(round.definition, submissions), approved: true, decisions: [], fingerprint: round.key + '-approved'};
    round.submittedMarks = round.definition.judgeIds.flatMap(judgeId => cells.map(c => ({judgeId, performanceId:c.performanceId, subjectId:c.subjectId, mark:'No' as const})));
    if (round.definition.kind === 'prelims') round.standings.advancingIds = data.rounds.find(r => r.definition.prelimRoundId === round.id)!.definition.finalistIds;
  }
  for (const c of data.setup.competitions) assert.deepEqual(publicationPreparationIssues(data, c.id), []);
  data.publications = [];
  if (send) for (const c of data.setup.competitions) { const snapshot = await buildPublicSnapshot(data, c.id, 1, null, '2026-10-30T14:00:00Z', c.id + '-publication'); data.publications.push({ id: snapshot.id, competitionId: c.id, revision: 1, sourceFingerprint: snapshot.sourceFingerprint, snapshot, status: 'prepared' }); }
  return data;
}
// Execute the real component, real prerequisite helper and real publication records.
// Only React lifecycle scheduling is modeled; no server, browser, DOM or network.
async function harness(data: LiveView) {
  type Instance = { slots: unknown[]; cleanups: (() => void)[]; mounted: boolean };
  const instances = new Map<string, Instance>(); let current: Instance, slot = 0, tree: ReactNode;
  const calls: Record<string, unknown>[] = [], effects: (() => void)[] = []; let staleUpdates = 0;
  const env: {callback: (input: Record<string, unknown>) => Promise<boolean>} = {callback: async () => true};
  const hooks = {
    useState(initial: unknown) { const owner = current, index = slot++; if (!(index in owner.slots)) owner.slots[index] = initial; return [owner.slots[index], (v: unknown) => { if (!owner.mounted) staleUpdates++; else owner.slots[index] = v; }]; },
    useRef(initial: unknown) { const index = slot++; return current.slots[index] ?? (current.slots[index] = {current: initial}); },
    useMemo(make: () => unknown, deps: unknown[]) { const index = slot++; const old = current.slots[index] as {deps: unknown[]; value: unknown} | undefined; if (!old || deps.some((v, i) => v !== old.deps[i])) current.slots[index] = {deps, value: make()}; return (current.slots[index] as {value: unknown}).value; },
    useLayoutEffect(effect: () => (() => void), deps: unknown[]) { const owner = current, index = slot++; const old = owner.slots[index] as {deps: unknown[]; cleanup?: () => void} | undefined; if (!old || deps.some((v, i) => v !== old.deps[i])) { const next = {deps, cleanup: undefined as (() => void) | undefined}; owner.slots[index] = next; effects.push(() => { old?.cleanup?.(); next.cleanup = effect(); }); if (!old) owner.cleanups.push(() => (owner.slots[index] as typeof next).cleanup?.()); } },
  };
  const key = '__publicationPending' + crypto.randomUUID().replaceAll('-', '');
  (globalThis as unknown as Record<string, unknown>)[key] = hooks;
  const react = url(`export const {useState,useRef,useLayoutEffect,useMemo}=globalThis[${JSON.stringify(key)}];`);
  const compiled = ts.transpileModule(fs.readFileSync(new URL('components/live/publication.tsx', root), 'utf8'), { compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022} }).outputText.replace(/from\s*(['"])([^'"]+)\1/g, (_all, _quote, name: string) => 'from ' + JSON.stringify(name === 'react' ? react : name.startsWith('@/') ? new URL(name.slice(2) + '.ts', root).href : import.meta.resolve(name)));
  const {PublicationPanel} = await import(url(compiled)); delete (globalThis as unknown as Record<string, unknown>)[key];
  let seen = new Set<string>();
  function expand(n: ReactNode, path = 'root'): ReactNode {
    if (Array.isArray(n)) return n.map((v, i) => expand(v, path + '/' + (isValidElement(v) ? v.key ?? i : i)));
    if (!isValidElement<Record<string, unknown>>(n)) return n;
    if (typeof n.type === 'function') { const id = path + '/' + n.type.name + '/' + (n.key ?? ''); let owner = instances.get(id); if (!owner) { owner = {slots: [], cleanups: [], mounted: true}; instances.set(id, owner); } seen.add(id); current = owner; slot = 0; return expand((n.type as (p: Record<string, unknown>) => ReactNode)(n.props), id); }
    return createElement(n.type, {...n.props, key: n.key}, expand(n.props.children as ReactNode, path + '/children'));
  }
  function render() { seen = new Set(); tree = expand(createElement(PublicationPanel, {data, action: async (input: Record<string, unknown>) => {calls.push(structuredClone(input)); return env.callback(input);}, recovery: createElement('input', {defaultValue: 'Retained independent recovery draft'})})); for (const [id, owner] of instances) if (!seen.has(id)) { owner.mounted = false; owner.cleanups.forEach(f => f()); instances.delete(id); } effects.splice(0).forEach(f => f()); return renderToStaticMarkup(tree); }
  return {env, calls, data, render, button: () => nodes(tree).find(n => n.type === 'button' && n.props.className === 'primary-button')!, click: (n: Node) => (n.props.onClick as () => void)(), staleUpdates: () => staleUpdates, unmount() { for (const owner of instances.values()) { owner.mounted = false; owner.cleanups.forEach(f => f()); } instances.clear(); }};
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
for (const send of [false, true]) test(`${send ? 'send' : 'prepare'} held callback is visibly pending and the same captured handler cannot duplicate it`, async () => {
 const h = await harness(await fixture(send)), d = held(); h.env.callback = () => d.promise; const original = structuredClone(h.data); h.render(); const button = h.button(); h.click(button); h.click(button); assert.equal(h.calls.length, 1); const html = h.render(); assert.equal(h.button().props.disabled, true); assert.equal(h.button().props['aria-busy'], true); assert.match(html, send ? /Sending for approval/ : /Preparing preview/); assert.match(html, /Retained independent recovery draft/); if (send) assert.deepEqual(h.calls[0].publications, original.publications!.map(p => ({publicationId:p.id, sourceFingerprint:p.sourceFingerprint}))); else assert.deepEqual(h.calls[0], {action:'prepare-event-publication'}); assert.deepEqual(h.data, original); d.resolve(false); await flush(); assert.match(h.render(), /not confirmed here/); assert.equal(h.button().props.disabled, false); h.unmount();
});
for (const outcome of ['false', 'reject', 'true'] as const) test(`${outcome} completion never invents publication success or automatically retries`, async () => {
 const h = await harness(await fixture(true)), d = held(); h.env.callback = () => d.promise; h.render(); h.click(h.button()); if (outcome === 'reject') d.reject(new Error('Uncertain transport')); else d.resolve(outcome === 'true'); await flush(); const html = h.render(); assert.equal(h.calls.length, 1); assert.equal(h.button().props.disabled, false); assert.match(html,/Send results for approval/); assert.doesNotMatch(html,/Sent for approval\./); if (outcome !== 'true') assert.match(html,/not confirmed here/); h.env.callback = async () => false; h.click(h.button()); await flush(); assert.equal(h.calls.length, 2); h.unmount();
});
for (const change of ['event', 'manifest', 'round', 'setup', 'underReview', 'archived', 'unconfirmed'] as const) test(`${change} task replacement invalidates old handlers and old completion cannot clear the new task`, async () => {
 const h = await harness(await fixture(true)), first = held(), second = held(); h.env.callback = () => first.promise; h.render(); const old = h.button(); h.click(old);
 if (change === 'event') h.data.eventId += '-other'; else if (change === 'manifest') h.data.publications![0].sourceFingerprint += '-new'; else if (change === 'round') h.data.rounds[0].version++; else if (change === 'setup') h.data.setup.name += '-changed'; else if (change === 'underReview') h.data.publications![0].underReview = true; else if (change === 'archived') h.data.status = 'archived'; else h.data.publicationDeliveryUnconfirmed = true;
 h.render(); h.click(old); assert.equal(h.calls.length, 1);
 if (change === 'event') { h.env.callback = () => second.promise; h.click(h.button()); h.render(); assert.equal(h.calls.length, 2); } else { h.click(h.button()); assert.equal(h.calls.length, 1); assert.equal(h.button().props.disabled, true); if (change !== 'archived' && change !== 'unconfirmed') assert.match(h.render(),/Finishing previous request/); }
 first.resolve(false); await flush(); const html = h.render(); assert.equal(h.staleUpdates(), 0); assert.doesNotMatch(html,/not confirmed here/); if (change === 'event') { assert.equal(h.button().props.disabled, true); second.resolve(false); await flush(); } else if (change !== 'archived' && change !== 'unconfirmed') { assert.equal(h.button().props.disabled, false); } h.unmount();
});
test('authoritative requested records replace local sending feedback and preserve website-admin gate', async () => {
 const h = await harness(await fixture(true)), d = held(); h.env.callback = () => d.promise; h.render(); const old = h.button(); h.click(old); for (const p of h.data.publications!) p.status = 'requested'; assert.match(h.render(),/Sent · awaiting website admin/); d.resolve(true); await flush(); assert.match(h.render(),/website admin can now approve/); h.click(old); assert.equal(h.calls.length,1); assert.equal(h.staleUpdates(),0); h.unmount();
});
test('unmount blocks old handlers and late rejection updates', async () => { const h = await harness(await fixture()), d = held(); h.env.callback = () => d.promise; h.render(); const old = h.button(); h.click(old); h.unmount(); h.click(old); d.reject(new Error('late')); await flush(); assert.equal(h.calls.length,1); assert.equal(h.staleUpdates(),0); });

test('same-target rerenders and eligibility round trips retain the outstanding guard', async () => { const h = await harness(await fixture(true)), d = held(); h.env.callback = () => d.promise; h.render(); const original = h.button(); h.click(original); h.data.version++; h.render(); h.click(h.button()); h.data.publicationDeliveryUnconfirmed = true; h.render(); h.data.publicationDeliveryUnconfirmed = false; h.render(); h.click(h.button()); h.click(original); assert.equal(h.calls.length,1); assert.equal(h.button().props.disabled,true); d.resolve(true); await flush(); h.render(); assert.equal(h.button().props.disabled,false); h.unmount(); });

test('returning to an earlier target never revives its captured handler', async () => { const h = await harness(await fixture(true)); h.render(); const original = h.button(), name = h.data.setup.name; h.data.setup.name += '-temporary'; h.render(); h.data.setup.name = name; h.render(); h.click(original); assert.equal(h.calls.length,0); h.click(h.button()); await flush(); assert.equal(h.calls.length,1); h.unmount(); });
