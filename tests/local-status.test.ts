import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { profiles, parseOptions, validateManifest, readManifest, probeHttp, inspectWindows, collectStatus, formatReport, assessService } from '../scripts/local-status.mjs';

const legacy = { organizer: 10001, receiver: 10002, operational: 'http://127.0.0.1:3001', port: 3110, organizerExecSession: null, receiverExecSession: null, store: 'PRIVATE_STORE_CANARY' };
const manifest = () => validateManifest(legacy, profiles.test);
const observed = (overrides = {}) => ({ state: 'observed', services: { organizer: { process: 'match', listener: 'loopback', listenerPids: [10001], ancestryMatches: true, ...overrides }, receiver: { process: 'match', listener: 'loopback', listenerPids: [10002], ancestryMatches: true } } });
const ready = async () => ({ state: 'response', status: 200 });

function tempRoot(t: { after: (cleanup: () => void) => void }) {
  const parent = realpathSync(tmpdir()), root = mkdtempSync(path.join(parent, 'country-status-'));
  mkdirSync(path.join(root, 'work'));
  t.after(() => { assert.equal(realpathSync(root), root); assert.ok(root.startsWith(path.join(parent, 'country-status-'))); rmSync(root, { recursive: true }); });
  return root;
}
async function listen(server: Server, port: number) {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
}
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }

test('status accepts only fixed profiles and flags; malformed CLI does not run a probe', () => {
  assert.deepEqual(parseOptions([]), { profile: 'owner', json: false, help: false });
  assert.equal(parseOptions(['--profile', 'test', '--json']).profile, 'test');
  for (const args of [['--url', 'https://example.invalid'], ['--manifest', '.dev.vars'], ['--profile', '__proto__'], ['--profile', 'test\n'], ['--json', '--json'], ['--start']]) assert.throws(() => parseOptions(args));
  const script = fileURLToPath(new URL('../scripts/local-status.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--manifest', '.dev.vars'], { encoding: 'utf8' });
  assert.equal(result.status, 64); assert.ok(!result.stderr.includes('PRIVATE_STORE_CANARY'));
});

test('legacy manifest validates exact endpoints/PIDs but never consumes store or sessions as identity', () => {
  assert.equal(manifest().state, 'legacy');
  assert.ok(!JSON.stringify(manifest()).includes('PRIVATE_STORE_CANARY'));
  for (const value of [null, [], { ...legacy, organizer: 0 }, { ...legacy, organizer: 1.5 }, { ...legacy, receiver: legacy.organizer }, { ...legacy, organizer: '10001' }, { ...legacy, port: 3100 }, { ...legacy, operational: 'http://localhost:3001' }, { ...legacy, operational: 'http://127.0.0.1:3001/?secret=CANARY' }, { ...legacy, operational: 'http://127.0.0.1:3001\n' }, { ...legacy, operational: 'http://user:secret@127.0.0.1:3001' }, { ...legacy, operational: 'https://example.invalid' }]) assert.equal(validateManifest(value, profiles.test).state, 'invalid');
  assert.equal(validateManifest({ ...legacy, store: { arbitrary: '.dev.vars' }, organizerExecSession: 'not identity', createdUtc: 'unrecognized-baseline' }, profiles.test).state, 'legacy');
});

test('fixed manifest reader handles missing, malformed, oversized and linked directories without exposing content', t => {
  const root = tempRoot(t), file = path.join(root, 'work', profiles.test.manifest);
  assert.equal(readManifest(root, profiles.test).state, 'missing');
  writeFileSync(file, JSON.stringify(legacy)); const before = readFileSync(file); assert.equal(readManifest(root, profiles.test).state, 'legacy'); assert.deepEqual(readFileSync(file), before);
  writeFileSync(file, '{PRIVATE_JSON_CANARY'); const invalid = readManifest(root, profiles.test); assert.equal(invalid.state, 'invalid'); assert.ok(!JSON.stringify(invalid).includes('PRIVATE_JSON_CANARY'));
  writeFileSync(file, 'x'.repeat(65537)); assert.equal(readManifest(root, profiles.test).state, 'invalid');
  const linkedRoot = path.join(root, 'linked-root'); mkdirSync(linkedRoot); symlinkSync(path.join(root, 'work'), path.join(linkedRoot, 'work'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(readManifest(linkedRoot, profiles.test).state, 'invalid');
});

test('HTTP200 and matching project shape remain explicitly unverified instance provenance', async () => {
  const report = await collectStatus({ profileName: 'test', load: manifest, inspect: async () => observed(), probe: ready });
  assert.equal(report.exitCode, 0); assert.equal(report.services.organizer.project, 'match'); assert.equal(report.services.organizer.recordedInstance, 'unverified');
  assert.match(formatReport(report), /no saved creation\/executable baseline/); assert.ok(!JSON.stringify(report).includes('PRIVATE_STORE_CANARY'));
  // Same-project PID reuse cannot be excluded by this legacy record, even if fresh command/listener shape matches.
  assert.match(report.recordedInstance, /^Unverified:/);
});

test('stale/reused/foreign PIDs, unrelated listeners and non-loopback bindings do not establish a project match', async () => {
  for (const value of [{ process: 'different' }, { process: 'absent' }, { ancestryMatches: false }, { listener: 'nonloopback' }]) {
    const report = await collectStatus({ profileName: 'test', load: manifest, inspect: async () => observed(value), probe: ready });
    assert.equal(report.exitCode, 1); assert.equal(report.services.organizer.project, 'mismatch');
  }
  const stale = assessService({ state: 'unreachable' }, { process: 'different', listener: 'absent', ancestryMatches: false }, true);
  assert.equal(stale.project, 'mismatch'); assert.match(stale.detail, /stale or PID reused/);
});

test('missing/invalid records and unavailable/unsupported inspection stay unknown while fixed HTTP probes still work', async () => {
  for (const record of [{ state: 'missing', reason: 'Absent.' }, { state: 'invalid', reason: 'Invalid.' }]) {
    const ports: number[] = []; const report = await collectStatus({ profileName: 'test', load: () => record, inspect: async () => observed(), probe: async (port: number) => { ports.push(port); return ready(); } });
    assert.deepEqual(ports, [3001, 3110]); assert.equal(report.exitCode, 2); assert.equal(report.services.organizer.project, 'unknown');
  }
  const unsupported = await inspectWindows('unused', 'test', manifest(), 'linux'); assert.equal(unsupported.state, 'unknown');
  const report = await collectStatus({ profileName: 'test', load: manifest, inspect: async () => unsupported, probe: ready }); assert.equal(report.exitCode, 2); assert.equal(report.services.receiver.project, 'unknown');
});

test('starting, absent, failed HTTP and observation races give recovery guidance without launching anything', async () => {
  const starting = await collectStatus({ profileName: 'test', load: manifest, inspect: async () => observed({ listener: 'absent', ancestryMatches: false }), probe: async () => ({ state: 'unreachable' }) });
  assert.equal(starting.exitCode, 1); assert.match(starting.next, /recheck before launching another copy/); assert.match(starting.services.organizer.detail, /not listening yet/);
  const race = assessService({ state: 'response', status: 200 }, { process: 'match', listener: 'absent', ancestryMatches: false }, true); assert.equal(race.project, 'unknown'); assert.match(race.detail, /state may have changed/);
  const absent = assessService({ state: 'unreachable' }, { process: 'absent', listener: 'absent', ancestryMatches: false }, true); assert.equal(absent.project, 'absent');
  const bad = await collectStatus({ profileName: 'test', load: manifest, inspect: async () => observed(), probe: async () => ({ state: 'response', status: 503 }) }); assert.equal(bad.exitCode, 1);
});

test('bounded HTTP uses only root GET without credentials, body reads or redirect following', async () => {
  const received: { method?: string; url?: string; authorization?: string; cookie?: string }[] = []; let mode = 'ready', trap = 0;
  const server = createServer((req, res) => { received.push({ method: req.method, url: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie }); if (mode === 'redirect') { res.writeHead(302, { Location: 'http://127.0.0.1:3110/PRIVATE_REDIRECT_CANARY' }); res.end(); } else if (mode === 'timeout') { /* no headers */ } else { res.end('PRIVATE_BODY_CANARY'); } });
  const receiver = createServer((_req, res) => { trap++; res.end(); });
  await listen(server, 3001);
  try {
    await listen(receiver, 3110);
    try {
      const readyResult = await probeHttp(3001); assert.deepEqual(readyResult, { state: 'response', status: 200 });
      mode = 'redirect'; const redirect = await probeHttp(3001); assert.deepEqual(redirect, { state: 'redirect-refused', status: 302 }); assert.equal(trap, 0); assert.ok(!JSON.stringify(redirect).includes('PRIVATE_REDIRECT_CANARY'));
      mode = 'timeout'; assert.deepEqual(await probeHttp(3001, 30), { state: 'timeout' });
      assert.ok(received.every(item => item.method === 'GET' && item.url === '/' && item.authorization === undefined && item.cookie === undefined));
      assert.throws(() => probeHttp(80)); assert.throws(() => probeHttp(443));
    } finally { await close(receiver); }
  } finally { await close(server); }
});

test('Windows command matching uses exact repo entrypoints/arguments without inspecting services', { skip: process.platform !== 'win32' }, () => {
  const helper = fileURLToPath(new URL('../scripts/local-status-windows.ps1', import.meta.url));
  const code = String.raw`$ErrorActionPreference='Stop'; . '${helper.replaceAll("'", "''")}' -ProjectRoot 'C:\Fictional Country App' -NodeExecutable 'C:\Runtime\node.exe' -Profile owner; `
    + String.raw`$org='"C:\Runtime\node.exe" "C:\Fictional Country App\node_modules\vinext\dist\cli.js" dev --hostname 127.0.0.1 --port 3000'; `
    + String.raw`$receiver='"C:\Runtime\node.exe" --env-file=.dev.vars --experimental-strip-types "C:\Fictional Country App\scripts\fake-publisher.mts"'; `
    + String.raw`$cases=@(); foreach($row in @(@($org,'organizer',3000),@($receiver,'receiver',3100),@($org.Replace('Country App','Country App-other'),'organizer',3000),@($org.Replace('--port','--PORT'),'organizer',3000),@($org.Replace('3000','3001'),'organizer',3000),@($org+' --extra','organizer',3000))){$p=[pscustomobject]@{ExecutablePath='C:\Runtime\node.exe';CommandLine=$row[0]};$cases+=,(Match-Process $p $row[1] $row[2])}; $cases|ConvertTo-Json -Compress`;
  const executable = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout.replace(/^\uFEFF/, '')), ['match', 'match', 'different', 'different', 'different', 'different']);
});

test('Windows ancestry rejects a stable reused parent PID and missing creation evidence', { skip: process.platform !== 'win32' }, () => {
  const helper = fileURLToPath(new URL('../scripts/local-status-windows.ps1', import.meta.url));
  const code = String.raw`$ErrorActionPreference='Stop'; . '${helper.replaceAll("'", "''")}' -ProjectRoot 'C:\Fictional Country App' -NodeExecutable 'C:\Runtime\node.exe' -Profile test; `
    + String.raw`$graph=@{'10'=[pscustomobject]@{ProcessId=10;ParentProcessId=20;CreationDate=[datetime]'2026-10-26T00:00:02Z'};'20'=[pscustomobject]@{ProcessId=20;ParentProcessId=0;CreationDate=[datetime]'2026-10-26T00:00:01Z'}}; `
    + String.raw`$good=Trace-Ancestry 10 20 {param($id) $graph[[string]$id]}; $graph['20'].CreationDate=[datetime]'2026-10-26T00:00:03Z'; $reused=Trace-Ancestry 10 20 {param($id) $graph[[string]$id]}; $graph['20'].CreationDate=$null; $missing=Trace-Ancestry 10 20 {param($id) $graph[[string]$id]}; @{good=@($good.matches,$good.stable);reused=@($reused.matches,$reused.stable);missing=@($missing.matches,$missing.stable)}|ConvertTo-Json -Compress`;
  const executable = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout.replace(/^\uFEFF/, '')), { good: [true, true], reused: [false, false], missing: [false, false] });
});

test('Windows listener snapshot comparison rejects a changed PID or address', { skip: process.platform !== 'win32' }, () => {
  const helper = fileURLToPath(new URL('../scripts/local-status-windows.ps1', import.meta.url));
  const code = String.raw`$ErrorActionPreference='Stop'; . '${helper.replaceAll("'", "''")}' -ProjectRoot 'C:\Fictional Country App' -NodeExecutable 'C:\Runtime\node.exe' -Profile test; `
    + String.raw`$a=[pscustomobject]@{LocalAddress='127.0.0.1';LocalPort=3001;OwningProcess=10};$b=[pscustomobject]@{LocalAddress='127.0.0.1';LocalPort=3001;OwningProcess=11};$c=[pscustomobject]@{LocalAddress='0.0.0.0';LocalPort=3001;OwningProcess=10};@{same=(Test-ListenerSnapshot @($a) @($a));pidChanged=(Test-ListenerSnapshot @($a) @($b));addressChanged=(Test-ListenerSnapshot @($a) @($c));empty=(Test-ListenerSnapshot @() @())}|ConvertTo-Json -Compress`;
  const executable = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout.replace(/^\uFEFF/, '')), { same: true, pidChanged: false, addressChanged: false, empty: true });
});
