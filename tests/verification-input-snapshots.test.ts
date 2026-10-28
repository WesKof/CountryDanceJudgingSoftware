import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createInputSnapshots, openInputSnapshots, MAX_INPUT_BYTES } from '../scripts/verification-input-snapshots.mjs';

type Captured = ReturnType<ReturnType<typeof createInputSnapshots>['capture']>;
type Reference = { -readonly [K in keyof Captured]: Captured[K] };
function fixture(t: { after: (cleanup: () => void) => void }) {
  const parent = fs.realpathSync(tmpdir()), root = fs.mkdtempSync(path.join(parent, 'verification-input-'));
  t.after(() => { assert.equal(fs.realpathSync(root), root); assert.ok(root.startsWith(path.join(parent, 'verification-input-'))); fs.rmSync(root, { recursive: true }); });
  return { root, pool: path.join(root, 'pool') };
}
const input = (data = Buffer.from('Fictional source bytes\r\n')) => ({ source: 'app/[slug]/page.tsx', run: 'fictional-check-1', checkpoint: 'fictional-source-1', data });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('identical inputs share one object while exact source and capture provenance remain independent', t => {
  const f = fixture(t), store = createInputSnapshots(f.pool), a = store.capture(input()), b = store.capture({ ...input(), source: 'tests/other.ts', run: 'fictional-check-2' });
  assert.equal(a.object, b.object); assert.equal(fs.readdirSync(path.join(f.pool, 'sha256')).length, 1);
  assert.notEqual(a.source, b.source); assert.notEqual(a.run, b.run); assert.equal(a.bytes, input().data.length); assert.equal(a.sha256, sha(input().data));
  const references = JSON.parse(JSON.stringify([a, b])) as Reference[], reader = openInputSnapshots(f.pool);
  assert.deepEqual(references, [a, b]); assert.deepEqual(reader.read(references[0]), input().data); assert.deepEqual(reader.read(references[1]), input().data);
  assert.equal('capture' in reader, false); assert.ok(Object.isFrozen(a));
});

test('owned capture and read copies survive caller mutation; changed content gets a new object', t => {
  const f = fixture(t), store = createInputSnapshots(f.pool), data = Buffer.from('original'), a = store.capture(input(data)); data.fill(0);
  const restored = store.read(a); assert.equal(restored.toString(), 'original'); restored.fill(1); assert.equal(store.read(a).toString(), 'original');
  const b = store.capture(input(Buffer.from('changed'))); assert.notEqual(a.object, b.object); assert.equal(store.read(a).toString(), 'original'); assert.equal(store.read(b).toString(), 'changed');
  const empty = store.capture(input(Buffer.alloc(0))); assert.equal(store.read(empty).length, 0);
});

for (const kind of ['missing', 'same-size-corrupt', 'wrong-size', 'directory', 'hardlink']) test(`${kind} object rejects resolution and known reuse without repair`, t => {
  const f = fixture(t), store = createInputSnapshots(f.pool), data = input(), ref = store.capture(data), object = path.join(f.pool, ref.object);
  if (kind === 'missing') fs.unlinkSync(object);
  else if (kind === 'same-size-corrupt') fs.writeFileSync(object, Buffer.alloc(ref.bytes));
  else if (kind === 'wrong-size') fs.writeFileSync(object, 'short');
  else if (kind === 'directory') { fs.unlinkSync(object); fs.mkdirSync(object); }
  else fs.linkSync(object, path.join(f.root, 'second-name'));
  const before = fs.existsSync(object) && fs.lstatSync(object).isFile() ? fs.readFileSync(object) : undefined;
  assert.throws(() => store.read(ref)); assert.throws(() => store.capture(data)); assert.throws(() => openInputSnapshots(f.pool).read(ref));
  if (before) assert.deepEqual(fs.readFileSync(object), before); else assert.equal(fs.existsSync(object), kind !== 'missing');
});

test('an injected hash-shaped object is verified, never trusted or overwritten on first capture', t => {
  const f = fixture(t), store = createInputSnapshots(f.pool), data = input(), file = path.join(f.pool, 'sha256', sha(data.data) + '.bin');
  const corrupt = Buffer.alloc(data.data.length); fs.writeFileSync(file, corrupt); assert.throws(() => store.capture(data)); assert.deepEqual(fs.readFileSync(file), corrupt);
});

for (const mutation of ['escape', 'absolute', 'hash', 'length', 'schema', 'source', 'run', 'checkpoint', 'extra']) test(`invalid reference ${mutation} rejects before resolving a different path`, t => {
  const f = fixture(t), store = createInputSnapshots(f.pool), original = store.capture(input()), ref = { ...original } as Reference & { extra?: string };
  if (mutation === 'escape') ref.object = '../outside';
  else if (mutation === 'absolute') ref.object = path.join(f.root, 'outside');
  else if (mutation === 'hash') ref.sha256 = 'X'.repeat(64);
  else if (mutation === 'length') ref.bytes = -1;
  else if (mutation === 'schema') ref.schema = 'unknown';
  else if (mutation === 'source') ref.source = '../private';
  else if (mutation === 'run') ref.run = '';
  else if (mutation === 'checkpoint') ref.checkpoint = 'invalid\ncontext';
  else ref.extra = 'unknown';
  assert.throws(() => store.read(ref)); assert.deepEqual(store.read(original), input().data);
});

test('invalid source labels, non-byte buffers and over-limit buffers make no object writes', t => {
  const f = fixture(t), store = createInputSnapshots(f.pool);
  for (const source of ['../private', '/absolute', 'C:/drive', 'a\\b', 'a//b', 'a/./b', 'CON.txt', 'a/NUL', 'a. ', 'a?b', '']) assert.throws(() => store.capture({ ...input(), source }));
  assert.throws(() => store.capture({ ...input(), data: 'not bytes' as unknown as Uint8Array }));
  assert.throws(() => store.capture(input(Buffer.alloc(MAX_INPUT_BYTES + 1)))); assert.deepEqual(fs.readdirSync(path.join(f.pool, 'sha256')), []);
});

test('reference accessors cannot change a validated path or cause a read outside the pool', t => {
  const f = fixture(t), store = createInputSnapshots(f.pool), data = input(), ref = store.capture(data), outside = path.join(f.root, 'outside.bin'); fs.writeFileSync(outside, data.data);
  let gets = 0, outsideOpens = 0; const candidate = { ...ref }, open = fs.openSync;
  Object.defineProperty(candidate, 'object', { enumerable: true, get() { return ++gets === 1 ? ref.object : '../outside.bin'; } });
  fs.openSync = (file, flags, mode) => { if (file === outside) outsideOpens++; return open(file, flags, mode); };
  try { assert.throws(() => store.read(candidate)); assert.equal(gets, 0); assert.equal(outsideOpens, 0); }
  finally { fs.openSync = open; }
});

test('reader uses only the validated primitive snapshot after caller metadata changes', t => {
  const f = fixture(t), store = createInputSnapshots(f.pool), data = input(), ref = store.capture(data), candidate = { ...ref }, outside = path.join(f.root, 'outside.bin'); fs.writeFileSync(outside, data.data);
  let changed = false, outsideOpens = 0; const open = fs.openSync;
  fs.openSync = (file, flags, mode) => { if (file === path.join(f.pool, 'format')) { changed = true; candidate.object = '../outside.bin'; candidate.bytes = 0; candidate.sha256 = '0'.repeat(64); } if (file === outside) outsideOpens++; return open(file, flags, mode); };
  try { assert.deepEqual(store.read(candidate), data.data); assert.equal(changed, true); assert.equal(outsideOpens, 0); }
  finally { fs.openSync = open; }
});

test('existing roots and unknown formats are never adopted or silently repaired', t => {
  const f = fixture(t); fs.mkdirSync(f.pool); fs.writeFileSync(path.join(f.pool, 'owned-before'), 'retained');
  assert.throws(() => createInputSnapshots(f.pool)); assert.throws(() => openInputSnapshots(f.pool)); assert.equal(fs.readFileSync(path.join(f.pool, 'owned-before'), 'utf8'), 'retained');
  const valid = path.join(f.root, 'other'); createInputSnapshots(valid); fs.writeFileSync(path.join(valid, 'format'), 'x'.repeat(fs.statSync(path.join(valid, 'format')).size)); assert.throws(() => openInputSnapshots(valid));
});

test('relative, parent-traversing and network/device roots reject before creation', t => {
  const f = fixture(t);
  for (const root of ['relative-pool', path.join(f.root, 'not-created') + path.sep + '..' + path.sep + 'escaped', '//network/share/pool', '\\\\network\\share\\pool', '\\\\?\\C:\\pool']) assert.throws(() => createInputSnapshots(root));
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('junction ancestors and replaced object directories cannot redirect writes or reads', t => {
  const f = fixture(t), outside = path.join(f.root, 'outside'), alias = path.join(f.root, 'alias'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
  try { assert.throws(() => createInputSnapshots(path.join(alias, 'pool'))); assert.deepEqual(fs.readdirSync(outside), []); }
  finally { fs.unlinkSync(alias); }
  const store = createInputSnapshots(f.pool), ref = store.capture(input()), objects = path.join(f.pool, 'sha256'), retained = path.join(f.root, 'retained-objects'); fs.renameSync(objects, retained); fs.symlinkSync(outside, objects, process.platform === 'win32' ? 'junction' : 'dir');
  try { assert.throws(() => store.read(ref)); assert.throws(() => store.capture(input(Buffer.from('new bytes')))); assert.throws(() => openInputSnapshots(f.pool)); assert.deepEqual(fs.readdirSync(outside), []); }
  finally { fs.unlinkSync(objects); }
});

test('a directory replaced by another ordinary directory invalidates the existing writer before new writes', t => {
  const f = fixture(t), store = createInputSnapshots(f.pool), objects = path.join(f.pool, 'sha256'); fs.renameSync(objects, path.join(f.root, 'retained')); fs.mkdirSync(objects);
  assert.throws(() => store.capture(input())); assert.deepEqual(fs.readdirSync(objects), []);
});
