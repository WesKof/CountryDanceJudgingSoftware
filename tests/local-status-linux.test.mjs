import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectLinux, parseStat, parseTcp, expectedArguments } from '../scripts/local-status-linux.mjs';
import { collectStatus, inspectWindows, inspectPlatform } from '../scripts/local-status.mjs';

const root = '/fictional country/app', exe = '/runtime/node';
const manifest = { state: 'legacy', organizer: 10, receiver: 20 };
const header = '  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n';
const row = (port, inode, address = '0100007F') => `0: ${address}:${port.toString(16).toUpperCase().padStart(4, '0')} ${'0'.repeat(address.length)}:0000 0A 0:0 00:0 0 1000 0 ${inode}\n`;
const stat = (pid, parent = 0, start = '100', name = 'worker ) tricky (name)') => Buffer.from(`${pid} (${name}) S ${parent} ${Array(17).fill('0').join(' ')} ${start} 0 0\n`);
function fixture() {
  const files = new Map(), links = new Map(), directories = new Map();
  files.set('/proc/net/tcp', Buffer.from(header + row(3001, 111) + row(3110, 222)));
  files.set('/proc/net/tcp6', Buffer.from(header));
  links.set('/proc/self/ns/net', 'net:[7]');
  directories.set('/proc', ['10', '20', 'self', 'net']);
  function process(pid, parent, start, role, fds = []) {
    files.set(`/proc/${pid}/stat`, stat(pid, parent, start));
    files.set(`/proc/${pid}/cmdline`, Buffer.from(`${exe}\0${root}/work/local-status-fixtures/${role}.mjs\0`));
    links.set(`/proc/${pid}/exe`, exe); links.set(`/proc/${pid}/ns/net`, 'net:[7]');
    directories.set(`/proc/${pid}/fd`, fds.map((_, i) => String(i)));
    fds.forEach((inode, i) => links.set(`/proc/${pid}/fd/${i}`, `socket:[${inode}]`));
  }
  process(10, 0, '100', 'organizer', [111]); process(20, 0, '100', 'receiver', [222]);
  const missing = () => { throw new Error('PRIVATE_ERROR_CANARY'); };
  const reader = { read: file => files.get(file) ?? missing(), link: file => links.get(file) ?? missing(), list: file => directories.get(file) ?? missing() };
  return { files, links, directories, reader, process, run: (options = {}) => inspectLinux(root, 'test', manifest, { reader, executable: exe, ...options }) };
}

test('synthetic Linux direct owners and child ancestry match, while legacy instance stays unverified', async () => {
  const f = fixture(); const good = f.run();
  assert.equal(good.state, 'observed'); assert.equal(good.services.organizer.process, 'match'); assert.equal(good.services.organizer.ancestryMatches, true);
  f.directories.set('/proc', ['10', '20', '30']); f.process(30, 10, '101', 'child', [111]); f.directories.set('/proc/10/fd', []);
  assert.equal(f.run().services.organizer.ancestryMatches, true);
  const report = await collectStatus({ profileName: 'test', load: () => manifest, inspect: async () => f.run(), probe: async () => ({ state: 'response', status: 200 }) });
  assert.equal(report.exitCode, 0); assert.equal(report.services.organizer.recordedInstance, 'unverified'); assert.match(report.recordedInstance, /no saved creation/);
  assert.equal((await inspectWindows(root, 'test', manifest, 'linux')).state, 'unknown');
  assert.equal((await inspectPlatform(root, 'test', manifest, 'fictional')).state, 'unknown');
});

test('IPv6 loopback, wildcard bindings and unrelated listener ownership remain distinct', () => {
  const f = fixture(); f.files.set('/proc/net/tcp', Buffer.from(header + row(3110, 222)));
  f.files.set('/proc/net/tcp6', Buffer.from(header + row(3001, 111, '00000000000000000000000001000000')));
  assert.equal(f.run().services.organizer.listener, 'loopback');
  for (const address of ['00000000', '00000000000000000000000000000000']) {
    const x = fixture(); x.files.set('/proc/net/tcp', Buffer.from(header + row(3001, 111, address.length === 8 ? address : '0100007F') + row(3110, 222)));
    if (address.length === 32) x.files.set('/proc/net/tcp6', Buffer.from(header + row(3001, 111, address)));
    assert.equal(x.run().services.organizer.listener, 'nonloopback');
  }
  f.directories.set('/proc', ['10', '20', '30']); f.process(30, 0, '101', 'foreign', [111]); f.directories.set('/proc/10/fd', []);
  assert.equal(f.run().services.organizer.ancestryMatches, false);
});

test('exact commands reject extra arguments, foreign executable and custom launcher without leaking them', () => {
  for (const change of [f => f.files.set('/proc/10/cmdline', Buffer.from(`${exe}\0PRIVATE_ARGV_CANARY\0`)), f => f.links.set('/proc/10/exe', '/PRIVATE_EXE_CANARY')]) {
    const f = fixture(); change(f); const result = f.run();
    assert.equal(result.services.organizer.process, 'different'); assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
  }
  const f = fixture(); assert.equal(f.run({ executable: '/another-node' }).services.organizer.process, 'different');
  const noRecord = inspectLinux(root, 'test', { state: 'missing' }, { reader: f.reader, executable: exe });
  assert.equal(noRecord.services.organizer.process, 'unknown'); assert.equal(noRecord.services.organizer.ancestryMatches, false);
});

test('fixed owner profile accepts only exact approved entrypoints and arguments', () => {
  const f = fixture(); f.files.set('/proc/net/tcp', Buffer.from(header + row(3000, 111) + row(3100, 222)));
  for (const [id, role, port] of [[10, 'organizer', 3000], [20, 'receiver', 3100]]) {
    f.files.set(`/proc/${id}/cmdline`, Buffer.from([exe, ...expectedArguments(root, 'owner', role, port), ''].join('\0')));
  }
  const run = () => inspectLinux(root, 'owner', manifest, { reader: f.reader, executable: exe });
  assert.equal(run().services.organizer.process, 'match'); assert.equal(run().services.receiver.process, 'match');
  const approved = f.files.get('/proc/10/cmdline');
  f.files.set('/proc/10/cmdline', Buffer.concat([approved, Buffer.from('--extra\0')])); assert.equal(run().services.organizer.process, 'different');
  f.files.set('/proc/10/cmdline', Buffer.from(`${exe}\0/private/custom-launcher.mjs\0`)); assert.equal(run().services.organizer.process, 'different');
  assert.equal(inspectLinux(root, 'invalid', manifest, { reader: f.reader }).state, 'unknown');
});

test('PID set changes cannot turn a newly present or disappearing recorded PID into absence evidence', () => {
  const f = fixture(); let count = 0; const original = f.reader.list;
  f.reader.list = directory => directory === '/proc' && ++count > 1 ? ['10', '20', '30'] : original(directory);
  assert.equal(f.run().state, 'unknown');
});

test('ancestry cycles, newer reused parent and missing creation evidence fail closed', () => {
  for (const kind of ['newer', 'cycle', 'missing']) {
    const f = fixture(); f.directories.set('/proc', ['10', '20', '30']); f.process(30, kind === 'cycle' ? 30 : 10, '90', 'child', [111]); f.directories.set('/proc/10/fd', []);
    if (kind === 'missing') f.files.set('/proc/30/stat', Buffer.from('30 (x) S 10'));
    assert.equal(f.run().state, 'unknown', kind);
  }
});

test('permission denial, process/fd disappearance, namespace failure and bounded budgets never imply absence', () => {
  for (const change of [f => f.links.delete('/proc/10/fd/0'), f => f.files.delete('/proc/10/stat'), f => f.links.delete('/proc/10/ns/net'), f => f.links.set('/proc/self/ns/net', 'bad'), f => f.directories.set('/proc/10/fd', Array(65537).fill('1')), f => f.directories.set('/proc', Array.from({ length: 4097 }, (_, i) => String(i + 1)))]) {
    const f = fixture(); change(f); const result = f.run(); assert.equal(result.state, 'unknown'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
  assert.equal(fixture().run({ budget: 1 }).state, 'unknown');
  const oversized = fixture(); oversized.files.set('/proc/net/tcp', Buffer.alloc(1048577)); assert.equal(oversized.run().state, 'unknown');
  const f = fixture(); f.directories.set('/proc/10/fd', []); assert.equal(f.run().state, 'unknown');
});

test('identity, listener addresses, socket owner and namespace changes invalidate snapshots', () => {
  for (const kind of ['stat', 'exe', 'cmdline', 'tcp', 'owner', 'namespace']) {
    const f = fixture(); let count = 0; const base = kind === 'exe' || kind === 'namespace' || kind === 'owner' ? 'link' : 'read';
    const target = { stat: '/proc/10/stat', exe: '/proc/10/exe', cmdline: '/proc/10/cmdline', tcp: '/proc/net/tcp', owner: '/proc/10/fd/0', namespace: '/proc/self/ns/net' }[kind];
    const original = f.reader[base];
    f.reader[base] = file => {
      if (file === target && ++count > (kind === 'stat' ? 2 : 1)) {
        if (kind === 'stat') return stat(10, 0, '999');
        if (kind === 'exe') return '/PRIVATE_CHANGED_EXE';
        if (kind === 'cmdline') return Buffer.from(`${exe}\0PRIVATE_CHANGED_ARGV\0`);
        if (kind === 'tcp') return Buffer.from(header + row(3001, 111, '00000000') + row(3110, 222));
        if (kind === 'owner') return 'socket:[999]';
        return 'net:[8]';
      }
      return original(file);
    };
    assert.equal(f.run().state, 'unknown', kind);
  }
});

test('defensive parsers handle comm parentheses and reject truncated/malformed proc input', () => {
  assert.deepEqual(parseStat(stat(10), 10), { ppid: 0, start: '100' });
  for (const input of ['10 (x) S 0', '11 (x) S 0', 'garbage']) assert.throws(() => parseStat(Buffer.from(input), 10));
  for (const input of ['garbage', header + 'broken', header + row(3001, 0)]) assert.throws(() => parseTcp(Buffer.from(input), 4, [3001]));
  const f = fixture(); f.files.set('/proc/10/cmdline', Buffer.from('unterminated PRIVATE_CANARY')); assert.equal(f.run().state, 'unknown');
});
