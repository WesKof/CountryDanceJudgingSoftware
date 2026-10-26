import { openSync, closeSync, fstatSync, lstatSync, readSync, realpathSync } from 'node:fs';
import { request } from 'node:http';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const profiles = Object.freeze({
  owner: Object.freeze({ organizer: 3000, receiver: 3100, manifest: 'local-publication-preview-process.json' }),
  test: Object.freeze({ organizer: 3001, receiver: 3110, manifest: 'local-status-test-process.json' }),
});
const usage = 'Usage: pnpm local:status [--profile owner|test] [--json]\nRead-only root HTTP and Windows process/listener checks; no service or data changes.\n';
const pid = value => Number.isInteger(value) && value > 0 && value <= 0xffffffff;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseOptions(args) {
  const result = { profile: 'owner', json: false, help: false }, seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (seen.has(key)) throw new Error('Repeated option.');
    seen.add(key);
    if (key === '--json') result.json = true;
    else if (key === '--help') result.help = true;
    else if (key === '--profile' && Object.hasOwn(profiles, args[i + 1])) result.profile = args[++i];
    else throw new Error('Unknown option or profile; custom URLs and paths are not accepted.');
  }
  return result;
}

export function validateManifest(value, profile) {
  if (!record(value) || !pid(value.organizer) || !pid(value.receiver) || value.organizer === value.receiver)
    return { state: 'invalid', reason: 'Runtime record needs distinct positive organizer and receiver PIDs.' };
  const origin = `http://127.0.0.1:${profile.organizer}`;
  if (![origin, origin + '/'].includes(value.operational) || value.port !== profile.receiver)
    return { state: 'invalid', reason: 'Runtime record does not match the fixed loopback profile.' };
  // Legacy sessions and store are deliberately not consumed. There is no instance baseline in this schema.
  return { state: 'legacy', organizer: value.organizer, receiver: value.receiver, reason: 'PIDs only; no saved creation/executable baseline.' };
}

export function readManifest(projectRoot, profile) {
  let fd;
  try {
    const work = path.join(projectRoot, 'work'), file = path.join(work, profile.manifest);
    const directory = lstatSync(work);
    if (!directory.isDirectory() || directory.isSymbolicLink())
      return { state: 'invalid', reason: 'Runtime record must be a regular file in the project work directory.' };
    const before = lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink())
      return { state: 'invalid', reason: 'Runtime record must be a regular file in the project work directory.' };
    if (before.size > 65536) return { state: 'invalid', reason: 'Runtime record exceeds the 64 KiB limit.' };
    fd = openSync(file, 'r');
    const opened = fstatSync(fd), current = lstatSync(file);
    if (!opened.isFile() || current.isSymbolicLink() || opened.dev !== before.dev || opened.ino !== before.ino || current.ino !== before.ino)
      return { state: 'invalid', reason: 'Runtime record changed during inspection.' };
    const buffer = Buffer.alloc(65537), count = readSync(fd, buffer, 0, buffer.length, 0);
    if (count > 65536) return { state: 'invalid', reason: 'Runtime record exceeds the 64 KiB limit.' };
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count)).replace(/^\uFEFF/, '')); }
    catch { return { state: 'invalid', reason: 'Runtime record is not readable JSON.' }; }
    return validateManifest(value, profile);
  } catch (error) {
    return error?.code === 'ENOENT' ? { state: 'missing', reason: 'Runtime record is absent.' } : { state: 'unavailable', reason: 'Runtime record could not be inspected.' };
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function probeHttp(port, timeoutMs = 1500) {
  if (![3000, 3100, 3001, 3110].includes(port)) throw new Error('Only fixed preview ports may be probed.');
  return new Promise(resolve => {
    let done = false;
    const finish = result => { if (!done) { done = true; clearTimeout(deadline); resolve(result); } };
    const req = request({ hostname: '127.0.0.1', port, path: '/', method: 'GET', agent: false, maxHeaderSize: 8192, headers: { Connection: 'close' } });
    const deadline = setTimeout(() => { finish({ state: 'timeout' }); req.destroy(); }, timeoutMs);
    req.once('response', response => {
      const status = response.statusCode ?? 0;
      finish({ state: status >= 300 && status < 400 ? 'redirect-refused' : 'response', status });
      response.destroy(); req.destroy(); // Do not read bodies, credentials, redirect locations or event routes.
    });
    req.once('error', error => finish({ state: error.code === 'ECONNREFUSED' ? 'unreachable' : 'unavailable' }));
    req.end();
  });
}

function unknownInspection(reason) { return { state: 'unknown', reason }; }
export async function inspectWindows(projectRoot, profileName, manifest, platform = process.platform) {
  if (platform !== 'win32') return unknownInspection('Process/listener inspection is supported on Windows only.');
  const script = fileURLToPath(new URL('./local-status-windows.ps1', import.meta.url));
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const args = ['-NoProfile', '-NonInteractive', '-File', script, '-ProjectRoot', projectRoot, '-NodeExecutable', process.execPath, '-Profile', profileName,
    '-OrganizerPid', String(manifest.state === 'legacy' ? manifest.organizer : 0), '-ReceiverPid', String(manifest.state === 'legacy' ? manifest.receiver : 0)];
  return new Promise(resolve => execFile(executable, args, { windowsHide: true, timeout: 5000, maxBuffer: 65536, encoding: 'utf8' }, (error, stdout) => {
    if (error) return resolve(unknownInspection('Windows process/listener inspection did not complete.'));
    try {
      const parsed = JSON.parse(stdout.replace(/^\uFEFF/, ''));
      if (!record(parsed) || parsed.state !== 'observed' || !record(parsed.services)) throw new Error('No observation');
      const services = {};
      for (const name of ['organizer', 'receiver']) {
        const value = parsed.services[name];
        if (!record(value) || !['match', 'different', 'absent', 'unknown'].includes(value.process) || !['absent', 'loopback', 'nonloopback', 'unknown'].includes(value.listener)
          || !Array.isArray(value.listenerPids) || value.listenerPids.some(value => !pid(value)) || typeof value.ancestryMatches !== 'boolean') throw new Error('Invalid observation');
        services[name] = { process: value.process, listener: value.listener, listenerPids: value.listenerPids, ancestryMatches: value.ancestryMatches };
      }
      resolve({ state: 'observed', services });
    } catch { resolve(unknownInspection('Windows process/listener inspection is unavailable or incomplete.')); }
  }));
}

export function assessService(http, observed, hasManifest) {
  let project = 'unknown', detail = 'Process/listener evidence is unavailable.';
  if (observed) {
    if (observed.listener === 'nonloopback') { project = 'mismatch'; detail = 'Port listener is outside the fixed loopback bindings; project ownership is not confirmed.'; }
    else if (hasManifest && observed.process === 'different') { project = 'mismatch'; detail = 'Recorded PID is not the expected project command; record may be stale or PID reused.'; }
    else if (observed.listener === 'absent') {
      project = observed.process === 'absent' && hasManifest ? 'absent' : 'unknown';
      detail = observed.process === 'match' ? 'Expected command exists, but its profile port is not listening yet.' : 'No profile listener was observed.';
    } else if (observed.listener === 'loopback' && hasManifest) {
      if (observed.process === 'match' && observed.ancestryMatches) { project = 'match'; detail = 'Current executable, exact project command and listener ancestry match.'; }
      else if (observed.process === 'different' || observed.process === 'absent' || observed.process === 'match' && !observed.ancestryMatches) { project = 'mismatch'; detail = 'Recorded PID/command and listener do not match; record may be stale or PID reused.'; }
    }
  }
  const ready = http.state === 'response' && http.status === 200;
  if (ready && observed?.listener === 'absent') { project = 'unknown'; detail = 'HTTP responded but no matching listener was observed; state may have changed during checks.'; }
  return { http, project, detail, readiness: ready ? 'HTTP ready' : 'not HTTP ready', recordedInstance: 'unverified' };
}

export async function collectStatus({ profileName = 'owner', projectRoot = root, load = readManifest, inspect = inspectWindows, probe = probeHttp } = {}) {
  if (!Object.hasOwn(profiles, profileName)) throw new Error('Unknown fixed profile.');
  const profile = profiles[profileName], manifest = load(projectRoot, profile);
  const [organizer, receiver, inspection] = await Promise.all([probe(profile.organizer), probe(profile.receiver), inspect(projectRoot, profileName, manifest)]);
  const services = Object.fromEntries(['organizer', 'receiver'].map((name, index) => [name, { port: profile[name], ...assessService(index ? receiver : organizer, inspection.state === 'observed' ? inspection.services[name] : undefined, manifest.state === 'legacy') }]));
  const values = Object.values(services), failed = values.some(service => service.readiness !== 'HTTP ready' || service.project === 'mismatch' || service.project === 'absent');
  const exitCode = failed ? 1 : manifest.state !== 'legacy' || values.some(service => service.project !== 'match') ? 2 : 0;
  const next = values.some(service => service.project === 'mismatch')
    ? 'Ask Master Country Dancer to inspect port/process ownership. Do not stop or replace a listener from this report alone.'
    : failed ? 'Ask Master Country Dancer to inspect startup/readiness and recover only the intended services. If a process is starting, recheck before launching another copy.'
      : exitCode === 2 ? 'HTTP is reachable, but project evidence is incomplete. Ask Master Country Dancer to verify current process identities and the runtime record.'
        : 'Local HTTP and current project evidence match. If an existing browser tab still shows an error, reload it manually.';
  return { profile: profileName, readOnly: true, manifest: { state: manifest.state, reason: manifest.reason }, inspection: { state: inspection.state, ...(inspection.reason ? { reason: inspection.reason } : {}) }, services,
    recordedInstance: 'Unverified: the legacy runtime record has no saved creation/executable baseline. HTTP or a PID alone is not ownership proof.',
    next, limits: 'Separate point-in-time HTTP/process snapshots do not prove which process answered. Working directory, data/store identity or integrity, browser state and restart survival are not verified.', exitCode };
}

export function formatReport(report) {
  const rows = [`Local preview status (${report.profile}) — read only`, `Runtime record: ${report.manifest.state}. ${report.manifest.reason}`];
  for (const [name, service] of Object.entries(report.services)) {
    const http = service.http.state === 'response' ? `HTTP ${service.http.status}` : service.http.state === 'redirect-refused' ? `HTTP ${service.http.status}; redirect refused` : service.http.state;
    rows.push(`${name === 'organizer' ? 'Organizer' : 'Results receiver'} · 127.0.0.1:${service.port}: ${http}; command/listener ${service.project}.`, `  ${service.detail}`);
  }
  if (report.inspection.reason) rows.push(report.inspection.reason);
  rows.push(report.recordedInstance, `Next: ${report.next}`, report.limits);
  return rows.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) process.stdout.write(usage);
    else {
      const report = await collectStatus({ profileName: options.profile, projectRoot: realpathSync(root) });
      process.stdout.write(options.json ? JSON.stringify(report, null, 2) + '\n' : formatReport(report)); process.exitCode = report.exitCode;
    }
  } catch { process.stderr.write('Local status could not complete. No service or data changes were made.\n' + usage); process.exitCode = 64; }
}
