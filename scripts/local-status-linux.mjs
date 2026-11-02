import { openSync, closeSync, readSync, readlinkSync, opendirSync } from 'node:fs';
import path from 'node:path';

const unknown = () => ({ state: 'unknown', reason: 'Linux process/listener evidence is incomplete or changed during inspection.' });
const positive = value => /^[1-9][0-9]*$/.test(value);
const processId = value => positive(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 0xffffffff;
const limits = Object.freeze({ reads: 100000, pids: 4096, entries: 65536, bytes: 1048576 });

// No /proc access occurs at import. The complete reader is injectable for synthetic tests.
export const procReader = Object.freeze({
  read(file) {
    const fd = openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(limits.bytes + 1);
      let size = 0, count;
      do { count = readSync(fd, buffer, size, buffer.length - size, null); size += count; } while (count && size < buffer.length);
      if (size > limits.bytes) throw new Error('Read budget');
      return buffer.subarray(0, size);
    } finally { closeSync(fd); }
  },
  link: readlinkSync,
  list(directory) {
    const dir = opendirSync(directory), result = [];
    try {
      let entry;
      while ((entry = dir.readSync())) {
        if (result.length >= limits.entries) throw new Error('Directory budget');
        result.push(entry.name);
      }
    } finally { dir.closeSync(); }
    return result;
  },
});

export function parseStat(buffer, expectedPid) {
  const text = buffer.toString('utf8'), end = text.lastIndexOf(')');
  if (!text.startsWith(`${expectedPid} (`) || end < 0) throw new Error('Invalid stat');
  const fields = text.slice(end + 1).trim().split(/\s+/);
  if (!/^[A-Za-z]$/.test(fields[0]) || !/^(0|[1-9][0-9]*)$/.test(fields[1]) || !positive(fields[19] ?? '')) throw new Error('Invalid stat');
  if (fields[1] !== '0' && !processId(fields[1])) throw new Error('Invalid parent');
  return { ppid: Number(fields[1]), start: fields[19] };
}

export function parseTcp(buffer, family, ports) {
  const lines = buffer.toString('ascii').trim().split('\n');
  if (!/^\s*sl\s+local_address\s+rem_address\s+st\b/.test(lines.shift() ?? '')) throw new Error('Invalid socket table');
  const result = [];
  for (const line of lines) {
    const f = line.trim().split(/\s+/), addressLength = family === 4 ? 8 : 32;
    if (f.length < 10 || !/^\d+:$/.test(f[0]) || !new RegExp(`^[0-9A-Fa-f]{${addressLength}}:[0-9A-Fa-f]{4}$`).test(f[1]) || !/^[0-9A-Fa-f]{2}$/.test(f[3])) throw new Error('Invalid socket row');
    const [address, portHex] = f[1].toUpperCase().split(':'), port = parseInt(portHex, 16);
    if (f[3].toUpperCase() !== '0A' || !ports.includes(port)) continue;
    if (!positive(f[9])) throw new Error('Missing socket identity');
    const loopback = family === 4 ? address === '0100007F' : address === '00000000000000000000000001000000';
    result.push({ family, address, port, inode: f[9], loopback });
  }
  return result;
}

export function expectedArguments(projectRoot, profile, role, port) {
  if (profile === 'test') return [path.join(projectRoot, 'work/local-status-fixtures', `${role}.mjs`)];
  return role === 'organizer'
    ? [path.join(projectRoot, 'node_modules/vinext/dist/cli.js'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)]
    : ['--env-file=.dev.vars', '--experimental-strip-types', path.join(projectRoot, 'scripts/fake-publisher.mts')];
}

export function inspectLinux(projectRoot, profileName, manifest, { reader = procReader, executable = process.execPath, budget = limits.reads } = {}) {
  try {
    if (!['owner', 'test'].includes(profileName) || !path.isAbsolute(projectRoot)) return unknown();
    const ports = profileName === 'owner' ? [3000, 3100] : [3001, 3110];
    let remainingBytes = 16 * 1048576;
    const deadline = performance.now() + 3000;
    const call = (method, file) => {
      if (--budget < 0 || performance.now() > deadline) throw new Error('Inspection budget');
      return reader[method](file);
    };
    const read = file => {
      const result = call('read', file);
      if (!Buffer.isBuffer(result) || result.length > limits.bytes) throw new Error('Invalid read');
      remainingBytes -= result.length;
      if (remainingBytes < 0) throw new Error('Byte budget');
      return result;
    };
    const list = directory => {
      const result = call('list', directory);
      if (!Array.isArray(result) || result.length > limits.entries || result.some(n => typeof n !== 'string' || n.includes('/') || n === '..' || n === '.')) throw new Error('Invalid directory');
      return result;
    };
    const net = call('link', '/proc/self/ns/net');
    if (!/^net:\[[0-9]+\]$/.test(net)) throw new Error('Invalid namespace');
    const sockets = () => [...parseTcp(read('/proc/net/tcp'), 4, ports), ...parseTcp(read('/proc/net/tcp6'), 6, ports)].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const before = sockets(), nodes = new Map(), owners = new Map(before.map(s => [s.inode, new Set()]));
    const snapshot = id => {
      const base = `/proc/${id}`, first = parseStat(read(`${base}/stat`), id);
      const exe = call('link', `${base}/exe`), argv = read(`${base}/cmdline`);
      if (!argv.length || argv.at(-1) !== 0 || argv.includes(0xff)) throw new Error('Invalid argv');
      const args = new TextDecoder('utf-8', { fatal: true }).decode(argv).slice(0, -1).split('\0');
      if (args.some(a => !a)) throw new Error('Invalid argv');
      const last = parseStat(read(`${base}/stat`), id);
      if (JSON.stringify(first) !== JSON.stringify(last)) throw new Error('Changed process');
      return { ...first, exe, args };
    };
    const ids = list('/proc').filter(processId);
    if (ids.length > limits.pids) throw new Error('Process budget');
    // Visibility is deliberately conservative: an unreadable process/fd or namespace
    // makes ownership incomplete, rather than silently treating its sockets as absent.
    const scanOwners = () => {
      const found = new Map(before.map(s => [s.inode, new Set()]));
      const currentIds = list('/proc').filter(processId);
      if (currentIds.length > limits.pids) throw new Error('Process budget');
      if (JSON.stringify([...currentIds].sort()) !== JSON.stringify([...ids].sort())) throw new Error('Changed process set');
      for (const id of currentIds) {
        if (call('link', `/proc/${id}/ns/net`) !== net) continue;
        for (const fd of list(`/proc/${id}/fd`)) {
          if (!/^[0-9]+$/.test(fd)) throw new Error('Invalid descriptor');
          const match = /^socket:\[([0-9]+)\]$/.exec(call('link', `/proc/${id}/fd/${fd}`));
          if (match && found.has(match[1])) found.get(match[1]).add(Number(id));
        }
      }
      return found;
    };
    const firstOwners = scanOwners();
    for (const [inode, pids] of firstOwners) { if (!pids.size) throw new Error('Unattributed socket'); owners.set(inode, pids); }
    const getNode = id => {
      if (!nodes.has(id)) nodes.set(id, snapshot(id));
      return nodes.get(id);
    };
    const services = {};
    for (const [i, role] of ['organizer', 'receiver'].entries()) {
      const saved = manifest.state === 'legacy' ? manifest[role] : 0;
      if (saved && !processId(String(saved))) throw new Error('Invalid saved PID');
      let node, state = 'unknown';
      if (saved) {
        if (!ids.includes(String(saved))) state = 'absent';
        else {
          node = getNode(saved);
          const expected = [executable, ...expectedArguments(projectRoot, profileName, role, ports[i])];
          state = node.exe === executable && JSON.stringify(node.args) === JSON.stringify(expected) ? 'match' : 'different';
        }
      }
      const selected = before.filter(s => s.port === ports[i]);
      const pids = [...new Set(selected.flatMap(s => [...owners.get(s.inode)]))].sort((a, b) => a - b);
      let ancestry = state === 'match' && pids.length > 0;
      for (const owner of pids) {
        let cursor = owner, child, found = false;
        const seen = new Set();
        for (let step = 0; cursor && step < 64; step++) {
          if (seen.has(cursor)) throw new Error('Ancestry cycle');
          seen.add(cursor);
          const current = getNode(cursor);
          if (child && BigInt(current.start) > BigInt(child.start)) throw new Error('Reused parent');
          if (cursor === saved) { found = true; break; }
          child = current; cursor = current.ppid;
        }
        ancestry &&= found;
      }
      services[role] = { process: state, listener: selected.length ? selected.every(s => s.loopback) ? 'loopback' : 'nonloopback' : 'absent', listenerPids: pids, ancestryMatches: ancestry };
    }
    for (const [id, first] of nodes) if (JSON.stringify(first) !== JSON.stringify(snapshot(id))) throw new Error('Changed identity');
    const lastOwners = scanOwners();
    for (const [inode, pids] of owners) if (JSON.stringify([...pids].sort()) !== JSON.stringify([...lastOwners.get(inode)].sort())) throw new Error('Changed ownership');
    if (call('link', '/proc/self/ns/net') !== net || JSON.stringify(before) !== JSON.stringify(sockets())) throw new Error('Changed listeners');
    for (const [id, first] of nodes) if (JSON.stringify(first) !== JSON.stringify(snapshot(id))) throw new Error('Changed final identity');
    // A legacy PID can still be a new instance of the same command. Never upgrade
    // recordedInstance provenance from these current snapshots.
    return { state: 'observed', services };
  } catch { return unknown(); }
}
