import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createElement, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { useRecovery } from '../components/live/recovery.tsx';
import type { LiveView } from '../lib/live/types.ts';
import { stageFixture } from './stage-fixture.ts';

type Controller = ReturnType<typeof useRecovery>;
type Optional = { disabled?: boolean; history?: unknown; extra?: ReactNode; children?: ReactNode };
type Node = ReactElement<Record<string, unknown>>;
type Call = { token: string; input: Record<string, unknown> };
const quiet = 'Backups, restore and event management';
const root = new URL('../', import.meta.url), codeURL = (code: string) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const backupResult = (notes = false) => ({ format: 'country-dance-live-backup', backupVersion: 1, includesPrivateNotes: notes, fictional: true });
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function deferred() { let resolve!: (value: unknown) => void; const promise = new Promise<unknown>(r => { resolve = r; }); return { promise, resolve }; }
function fileEvent(contents = '{"fictional":true}', size = contents.length) {
  const target = { value: 'fictional.json', files: [{ size, text: async () => contents }] };
  return { event: { currentTarget: target } as unknown as ChangeEvent<HTMLInputElement>, target };
}
function nodes(node: ReactNode, out: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach(n => nodes(n, out));
  else if (isValidElement<Record<string, unknown>>(node)) { out.push(node); nodes(node.props.children as ReactNode, out); }
  return out;
}
function text(node: ReactNode): string { return Array.isArray(node) ? node.map(text).join('') : isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : ''; }

// Actual Recovery hook/body and SetupSection execute. Only React hooks, client
// effects and window callbacks are modeled; no file, fetch, download or navigation.
async function harness(stage = false, publication = false) {
  const slots: unknown[] = [], identities: { name: string; path: string }[] = [];
  let index = 0, controller: Controller, tree: ReactNode, visible = true, props: Optional = { children: 'Fictional management controls' };
  const env: { calls: Call[]; downloads: { name: string; body: string }[]; navigations: string[]; publicationActions: Record<string, unknown>[]; confirm: boolean; confirmations: string[]; nonces: number; api: (token: string, input: Record<string, unknown>) => Promise<unknown> } = { calls: [], downloads: [], navigations: [], publicationActions: [], confirm: true, confirmations: [], nonces: 0, api: async () => { throw Error('Unconfigured fictional response'); } };
  const hooks = {
    useState(initial: unknown) { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? (initial as () => unknown)() : initial; return [slots[slot], (value: unknown) => { slots[slot] = typeof value === 'function' ? (value as (old: unknown) => unknown)(slots[slot]) : value; }]; },
    useRef(initial: unknown) { const slot = index++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
  };
  const key = '__recoveryFeedback' + crypto.randomUUID().replaceAll('-', '');
  (globalThis as unknown as Record<string, unknown>)[key] = { hooks, env };
  const react = codeURL(`export const useLayoutEffect=()=>{};export const useMemo=(make)=>make();export const {useState,useRef}=globalThis[${JSON.stringify(key)}].hooks;`);
  const client = codeURL(`const e=globalThis[${JSON.stringify(key)}].env;export const creationNonce=()=>"fictional-receipt-"+(++e.nonces);export const download=(name,body)=>e.downloads.push({name,body});export const liveApi=async(token,input)=>{e.calls.push({token,input:structuredClone(input)});return e.api(token,input);};`);
  function compile(file: string, imports: Record<string, string> = {}) {
    const code = ts.transpileModule(fs.readFileSync(new URL(file, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    return codeURL(code.replace(/from\s*(['"])([^'"]+)\1/g, (_all, _quote, name: string) => 'from ' + JSON.stringify(name === 'react' ? react : name.startsWith('@/') ? new URL(name.slice(2) + '.ts', root).href : imports[name] ?? import.meta.resolve(name))));
  }
  const section = compile('components/live/setup-section.tsx'), recoveryModule = await import(compile('components/live/recovery.tsx', { './client': client, './setup-section': section }));
  const publicationModule = publication ? await import(compile('components/live/publication.tsx')) : null;
  const setup = stageFixture('00000000-0000-4000-8000-000000000098', 3), data: LiveView = { eventId: 'fictional-recovery-event', version: 1, status: 'active', role: 'organizer', judgeId: null, setup, context: { blockId: setup.blocks[0].id, performanceId: null, visited: [] }, rounds: [], ballots: [], publications: [] };
  // Execute the exact presentation prop from the real StageDesk call site. This
  // is not a model of unrelated StageDesk editors or their effects.
  let issueWire: (recovery: Controller) => 'backup' | 'restore' | undefined = () => undefined;
  if (publication) {
    const source = fs.readFileSync(new URL('components/live/stage-desk.tsx', root), 'utf8'), ast = ts.createSourceFile('stage-desk.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let expression = '';
    const visit = (node: ts.Node) => { if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'PublicationPanel') { const prop = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === 'recoveryIssue'); if (prop && ts.isJsxAttribute(prop) && prop.initializer && ts.isJsxExpression(prop.initializer)) expression = prop.initializer.expression?.getText(ast) ?? ''; } ts.forEachChild(node, visit); }; visit(ast); assert.ok(expression);
    issueWire = (await import(codeURL(`export const issue=(recovery)=>(${expression});`))).issue;
  }
  delete (globalThis as unknown as Record<string, unknown>)[key];
  const Recovery = recoveryModule.default as (props: Controller & Optional) => ReactNode, recovery = recoveryModule.useRecovery as typeof useRecovery;
  const PublicationPanel = publicationModule?.PublicationPanel as (props: Record<string, unknown>) => ReactNode;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { confirm: (message: string) => { env.confirmations.push(message); return env.confirm; }, location: { assign: (path: string) => { env.navigations.push(path); } } } });
  function expand(node: ReactNode, path = 'root'): ReactNode {
    if (Array.isArray(node)) return node.map((n, i) => expand(n, path + '/' + (isValidElement(n) && n.key !== null ? n.key : i)));
    if (!isValidElement<{ children?: ReactNode }>(node)) return node;
    if (typeof node.type === 'function') { identities.push({ name: node.type.name, path }); return expand((node.type as (props: object) => ReactNode)(node.props), path + '/body'); }
    return createElement(node.type, { ...node.props, key: node.key }, expand(node.props.children, path + '/children'));
  }
  const h = { env, text, data, get controller() { return controller; }, setProps(patch: Optional) { props = { ...props, ...patch }; }, setVisible(value: boolean) { visible = value; }, render() { index = 0; identities.length = 0; controller = recovery('fictional-token', stage); const panel = createElement(Recovery, { ...controller, ...props }); tree = visible ? expand(publication ? createElement(PublicationPanel, { data, action: async (input: Record<string, unknown>) => { env.publicationActions.push(input); return true; }, recovery: panel, recoveryIssue: issueWire(controller) }) : panel) : null; return renderToStaticMarkup(tree); }, nodes: () => nodes(tree), identities: () => structuredClone(identities), summary() { return nodes(this.outer()).find(n => n.type === 'summary')!; }, outer() { return nodes(tree).find(n => n.props['data-section'] === 'Data & recovery')!; }, supporting() { return nodes(tree).find(n => n.props.id === 'publication-supporting')!; }, supportingSummary() { return nodes(this.supporting()).find(n => n.type === 'summary')!; }, fieldset() { return nodes(tree).find(n => n.type === 'fieldset')!; }, button() { return nodes(tree).find(n => n.type === 'button' && text(n) === 'Download event backup')!; }, file() { return nodes(tree).find(n => n.type === 'input' && n.props.type === 'file')!; }, checkbox() { return nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox')!; }, restore() { if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window'); } };
  h.render(); return h;
}

for (const stage of [false, true]) {
  test(`${stage ? 'stage' : 'legacy'} idle failures expose curated retry cues in the actual closed section`, async () => {
    const h = await harness(stage);
    try {
      const before = h.identities(); h.env.api = async () => { throw Error('FICTIONAL_PRIVATE_DETAIL'); };
      await h.controller.backup(); h.render(); assert.match(h.text(h.summary()), /Backup failed\. Open for retry details\./); assert.doesNotMatch(h.text(h.summary()), /FICTIONAL_PRIVATE_DETAIL/);
      assert.match(String(h.outer().props.className), /setup-needs-attention/); assert.equal(h.outer().props.open, false); assert.equal(h.fieldset().props.disabled, false); assert.deepEqual(h.identities(), before);
      assert.ok(h.nodes().some(n => n.props.role === 'alert' && h.text(n).includes('FICTIONAL_PRIVATE_DETAIL')));
      const file = fileEvent(); await h.controller.restore(file.event); h.render(); assert.equal(file.target.value, ''); assert.match(h.text(h.summary()), /Restore did not finish here\. Open for retry details\./); assert.doesNotMatch(h.text(h.summary()), /FICTIONAL_PRIVATE_DETAIL|no event exists|Restore failed/);
      assert.equal(h.outer().props.open, false); assert.deepEqual(h.env.downloads, []); assert.deepEqual(h.env.navigations, []); assert.deepEqual(h.identities(), before);
    } finally { h.restore(); }
  });

  test(`${stage ? 'stage' : 'legacy'} backup retry clears attention while pending and preserves locks and exact completion wording`, async () => {
    const h = await harness(stage), hold = deferred();
    try {
      h.env.api = async () => { throw Error('Fictional interrupted response'); }; await h.controller.backup(); h.render();
      h.env.api = () => hold.promise; const pending = h.controller.backup(); h.render();
      assert.match(h.text(h.summary()), /Preparing backup…/); assert.doesNotMatch(String(h.outer().props.className), /setup-needs-attention/); assert.equal(h.fieldset().props.disabled, true); assert.equal(h.button().props['aria-busy'], true);
      await h.controller.backup(); await h.controller.restore(fileEvent().event); assert.equal(h.env.calls.length, 2);
      hold.resolve(backupResult()); await pending; h.render(); assert.equal(h.text(h.summary()).endsWith(quiet), true); assert.doesNotMatch(String(h.outer().props.className), /setup-needs-attention/);
      assert.ok(h.nodes().some(n => n.props.role === 'status' && h.text(n) === 'Backup download started. Private judge notes excluded.'));
      assert.equal(h.env.downloads[0].name, stage ? 'shared-stage-event-backup.json' : 'shared-event-backup.json'); assert.deepEqual(JSON.parse(h.env.downloads[0].body), backupResult()); assert.equal(h.fieldset().props.disabled, false);
    } finally { hold.resolve(backupResult()); await flush(); h.restore(); }
  });

  test(`${stage ? 'stage' : 'legacy'} captured privacy and successful restore navigation remain unchanged`, async () => {
    const h = await harness(stage), path = '/live/' + 'a'.repeat(64);
    try {
      (h.checkbox().props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } }); h.render();
      assert.match(h.nodes().map(h.text).join(''), /anyone with the file can read them/); h.env.api = async () => backupResult(true); await h.controller.backup(); h.render();
      assert.equal(h.env.calls[0].input.includeNotes, true); assert.ok(h.nodes().some(n => n.props.role === 'status' && h.text(n) === 'Backup download started. Private judge notes included.')); assert.equal(h.text(h.summary()).endsWith(quiet), true);
      h.env.api = async () => ({ path }); await h.controller.restore(fileEvent().event); h.render(); assert.deepEqual(h.env.navigations, [stage ? '/?event=' + 'a'.repeat(64) : path]); assert.equal(h.controller.task, 'restore'); assert.equal(h.fieldset().props.disabled, true); assert.match(h.text(h.summary()), /Restoring a new event…/); assert.doesNotMatch(String(h.outer().props.className), /setup-needs-attention/);
    } finally { h.restore(); }
  });
}

for (const result of [{}, { format: 'country-dance-live-backup', backupVersion: 2, includesPrivateNotes: false }, backupResult(true)]) test('unverified backup response never downloads and shows retry attention', async () => {
  const h = await harness(); try { h.env.api = async () => result; await h.controller.backup(); h.render(); assert.deepEqual(h.env.downloads, []); assert.match(h.text(h.summary()), /Backup failed/); assert.ok(h.nodes().some(n => n.props.role === 'alert' && /could not be verified/.test(h.text(n)))); } finally { h.restore(); }
});

test('cancellation is quiet and sends nothing; oversized/invalid files show restore retry attention without a request', async () => {
  const h = await harness(); try {
    h.env.confirm = false; const canceled = fileEvent(); await h.controller.restore(canceled.event); h.render(); assert.equal(canceled.target.value, ''); assert.equal(h.text(h.summary()).endsWith(quiet), true); assert.deepEqual(h.env.calls, []); assert.doesNotMatch(String(h.outer().props.className), /setup-needs-attention/);
    assert.ok(h.nodes().some(n => n.props.role === 'status' && h.text(n) === 'Restore canceled. No restore request was sent.'));
    h.env.confirm = true; for (const file of [fileEvent('{}', 1500001), fileEvent('invalid JSON')]) { await h.controller.restore(file.event); h.render(); assert.match(h.text(h.summary()), /Restore did not finish here/); assert.equal(file.target.value, ''); assert.deepEqual(h.env.calls, []); }
  } finally { h.restore(); }
});

test('same-file retries retain the receipt and differing contents get a new receipt; summary never claims a failed creation', async () => {
  const h = await harness(); try {
    h.env.api = async () => { throw Error('Fictional interruption'); }; await h.controller.restore(fileEvent().event); h.render();
    h.env.api = async () => ({ path: '/unverified' }); await h.controller.restore(fileEvent().event); h.render(); await h.controller.restore(fileEvent('{"fictional":"different"}').event); h.render();
    const ids = h.env.calls.map(c => c.input.requestId); assert.equal(ids[0], ids[1]); assert.notEqual(ids[1], ids[2]); assert.equal(h.env.nonces, 2); assert.deepEqual(h.env.navigations, []);
    assert.match(h.text(h.summary()), /Restore did not finish here/); assert.doesNotMatch(h.text(h.summary()), /no event|nothing was created|unverified/i); assert.ok(h.nodes().some(n => n.props.role === 'alert' && /Choose the same file to retry; your source event stays unchanged/.test(h.text(n))));
  } finally { h.restore(); }
});

test('parent disabled semantics, optional history and hook lifetime survive collapsed error attention', async () => {
  const h = await harness(); try {
    h.setProps({ disabled: true, history: { fictional: 'HISTORY_CANARY' }, extra: 'OPTIONAL_CONTEXT' }); h.render();
    (h.button().props.onClick as () => void)(); (h.file().props.onChange as (event: ChangeEvent<HTMLInputElement>) => void)(fileEvent().event); await flush(); assert.deepEqual(h.env.calls, []); assert.equal(h.fieldset().props.disabled, true); assert.equal(h.text(h.summary()).endsWith(quiet), true); assert.doesNotMatch(h.text(h.summary()), /HISTORY_CANARY|OPTIONAL_CONTEXT/);
    h.setProps({ disabled: false }); h.render(); h.env.api = async () => { throw Error('Fictional failure'); }; await h.controller.backup(); h.render(); const before = h.identities(); assert.match(h.text(h.summary()), /Backup failed/);
    h.setVisible(false); h.render(); h.setVisible(true); h.render(); assert.match(h.text(h.summary()), /Backup failed/); assert.deepEqual(h.identities(), before); assert.equal(h.outer().props.open, false);
    h.setProps({ disabled: true }); h.render(); assert.equal(h.fieldset().props.disabled, true); assert.match(h.text(h.summary()), /Open for retry details/); assert.doesNotMatch(h.text(h.summary()), /ready|available|HISTORY_CANARY/i);
  } finally { h.restore(); }
});

for (const kind of ['backup', 'restore'] as const) test(`stage ${kind} error reaches the real closed publication ancestor through the actual StageDesk prop`, async () => {
  const h = await harness(true, true);
  try {
    h.setProps({ history: { fictional: 'HISTORY_CANARY' }, extra: 'OPTIONAL_CANARY' }); h.render();
    const original = structuredClone(h.data), before = h.identities(), primary = () => h.nodes().filter(n => String(n.props.className).includes('primary-button')).map(n => ({ text: h.text(n), disabled: n.props.disabled })), controls = primary();
    h.env.api = async () => { throw Error('PRIVATE_ERROR_CANARY'); };
    if (kind === 'backup') await h.controller.backup(); else await h.controller.restore(fileEvent().event); h.render();
    assert.match(h.text(h.supportingSummary()), kind === 'backup' ? /Backup failed/ : /Restore did not finish here/);
    assert.match(h.text(h.supportingSummary()), /Open Data & recovery for retry details/); assert.doesNotMatch(h.text(h.supportingSummary()), /PRIVATE_ERROR_CANARY|HISTORY_CANARY|OPTIONAL_CANARY/);
    assert.match(String(h.supporting().props.className), /setup-needs-attention/); assert.equal(Boolean(h.supporting().props.open), false); assert.equal(h.outer().props.open, false);
    assert.match(h.text(h.summary()), /Open for retry details/); assert.deepEqual(primary(), controls); assert.deepEqual(h.identities(), before); assert.deepEqual(h.data, original); assert.deepEqual(h.env.publicationActions, []); assert.deepEqual(h.env.downloads, []); assert.deepEqual(h.env.navigations, []);
  } finally { h.restore(); }
});

for (const kind of ['backup', 'restore'] as const) test(`stage ${kind} retry preserves the publication/recovery slots while clearing both idle-error cues`, async () => {
  const h = await harness(true, true), hold = deferred();
  try {
    h.env.api = async () => { throw Error('Fictional interrupted request'); };
    if (kind === 'backup') await h.controller.backup(); else await h.controller.restore(fileEvent().event); h.render(); const before = h.identities(); assert.match(String(h.supporting().props.className), /setup-needs-attention/);
    h.env.api = () => hold.promise; const pending = kind === 'backup' ? h.controller.backup() : h.controller.restore(fileEvent().event); await flush(); h.render();
    assert.equal(h.text(h.supportingSummary()), 'Publication records & tools History, backup & recovery'); assert.doesNotMatch(String(h.supporting().props.className), /setup-needs-attention/); assert.doesNotMatch(String(h.outer().props.className), /setup-needs-attention/);
    assert.match(h.text(h.summary()), kind === 'backup' ? /Preparing backup/ : /Restoring a new event/); assert.equal(h.fieldset().props.disabled, true); assert.deepEqual(h.identities(), before); assert.equal(Boolean(h.supporting().props.open), false);
    hold.resolve(kind === 'backup' ? backupResult() : { path: '/unverified' }); await pending; h.render();
    if (kind === 'backup') assert.doesNotMatch(String(h.supporting().props.className), /setup-needs-attention/); else assert.match(h.text(h.supportingSummary()), /Restore did not finish here/);
    assert.deepEqual(h.identities(), before); assert.deepEqual(h.env.publicationActions, []);
  } finally { hold.resolve({}); await flush(); h.restore(); }
});

test('publication optional summaries stay quiet for canceled/successful recovery and preserve read-only publication controls', async () => {
  const h = await harness(true, true);
  try {
    h.data.status = 'archived'; h.render(); const before = h.identities();
    assert.ok(h.nodes().some(n => n.type === 'button' && h.text(n) === 'Archived · read only' && n.props.disabled));
    h.env.api = async () => backupResult(); await h.controller.backup(); h.render(); assert.equal(h.text(h.supportingSummary()), 'Publication records & tools History, backup & recovery'); assert.doesNotMatch(String(h.supporting().props.className), /setup-needs-attention/);
    h.env.confirm = false; await h.controller.restore(fileEvent().event); h.render(); assert.equal(h.text(h.supportingSummary()), 'Publication records & tools History, backup & recovery'); assert.deepEqual(h.identities(), before); assert.equal(h.env.calls.length, 1); assert.deepEqual(h.env.publicationActions, []);
    assert.ok(h.nodes().some(n => n.type === 'button' && h.text(n) === 'Archived · read only' && n.props.disabled));
  } finally { h.restore(); }
});
