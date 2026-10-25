import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const documents = { agents: 'AGENTS.md', spec: 'PROJECT_SPEC.md', report: 'LOCAL_TEST_REPORT.md' };
const maxOutputBytes = 12 * 1024;
const script = fileURLToPath(import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const usage = 'Usage: node scripts/project-context.mjs <agents|spec|report> list [--search TEXT] [--cursor TOKEN]\n'
  + '       node scripts/project-context.mjs <agents|spec|report> read <--line N|--heading TEXT> [--cursor TOKEN]\n'
  + 'Lists canonical ATX headings (# through ######), ignoring fenced examples. Read includes nested subsections.\n'
  + 'Output is at most 12 KiB. CONTENT declares exact UTF-8 payload bytes; follow NEXT for lossless continuation.\n';

function fail(message) { throw new Error(message); }

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--search', '--line', '--heading', '--cursor'].includes(key) || args[i + 1] === undefined || key in result) fail('Invalid, missing or repeated option.');
    const value = args[i + 1];
    if (!value || Buffer.byteLength(value) > 1024) fail('Option values must be nonempty and at most 1024 UTF-8 bytes. Use --line for a long heading.');
    result[key] = value;
  }
  return result;
}

function headings(source) {
  const result = [];
  let fence, byte = 0, line = 0;
  for (const match of source.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    if (!match[0]) continue;
    line++;
    const text = match[0].replace(/(?:\r\n|\n|\r)$/, '').replace(line === 1 ? /^\uFEFF/ : /$^/, '');
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && /^[ \t]*$/.test(marker[2])) fence = undefined;
    } else if (marker && (marker[1][0] !== '`' || !marker[2].includes('`'))) {
      fence = { character: marker[1][0], length: marker[1].length };
    } else {
      const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/.exec(text);
      if (heading) result.push({ line, byte, level: heading[1].length, text: (heading[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim() });
    }
    byte += Buffer.byteLength(match[0]);
  }
  return { entries: result, lines: line };
}

function quote(value) {
  return process.platform === 'win32' ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`;
}

function printPage(buffer, identity, scope, baseArgs, description, cursor) {
  let start = 0;
  if (cursor) {
    let decoded;
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(cursor)) fail('Malformed cursor.');
      decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch { fail('Malformed cursor. Restart from the section or heading list.'); }
    if (!Array.isArray(decoded) || decoded.length !== 4 || decoded[0] !== 1 || decoded[1] !== identity || decoded[2] !== scope) fail('Cursor belongs to a changed document or different selection. Restart that selection.');
    start = decoded[3];
    if (!Number.isSafeInteger(start) || start < 0 || start >= buffer.length || (buffer[start] & 0xc0) === 0x80) fail('Cursor is not a valid UTF-8 page boundary.');
  }
  let capacity = Math.min(maxOutputBytes, buffer.length - start);
  for (;;) {
    let end = start + capacity;
    while (end < buffer.length && (buffer[end] & 0xc0) === 0x80) end--;
    const truncated = end < buffer.length;
    const next = truncated ? Buffer.from(JSON.stringify([1, identity, scope, end])).toString('base64url') : undefined;
    const command = ['node', quote(script), ...baseArgs.map(quote), ...(next ? ['--cursor', quote(next)] : [])].join(' ');
    const payload = buffer.subarray(start, end);
    const output = `SOURCE ${documents[baseArgs[0]]} sha256=${identity}\n${description}\nPAGE bytes=${start}-${end}/${buffer.length} (end exclusive)\nCONTENT ${payload.length} UTF-8 bytes\n`
      + payload.toString('utf8') + `\nEND CONTENT\nSTATUS ${truncated ? 'truncated' : 'complete'}\nNEXT ${next ? command : 'none (selection complete)'}\n`;
    const excess = Buffer.byteLength(output) - maxOutputBytes;
    if (excess <= 0) { process.stdout.write(output); return; }
    capacity -= excess;
    if (capacity <= 0) fail('Command metadata exceeds the output bound. Use a shorter heading selector or search.');
  }
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(usage); return; }
  const [document, action, ...rest] = args;
  if (!Object.hasOwn(documents, document) || !['list', 'read'].includes(action)) fail('Choose an allowlisted document and list or read.');
  const opts = options(rest);
  if (action === 'list' && ('--line' in opts || '--heading' in opts)) fail('Heading selectors are only valid for read.');
  if (action === 'read' && ('--search' in opts || Number('--line' in opts) + Number('--heading' in opts) !== 1)) fail('Read requires exactly one --line or --heading selector.');
  const path = new URL('../' + documents[document], import.meta.url);
  if (!lstatSync(path).isFile()) fail('Canonical document must be a regular file.');
  const bytes = readFileSync(path);
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const parsed = headings(source);
  const identity = hash(bytes);
  let content, description, baseArgs;
  if (action === 'list') {
    const search = opts['--search'];
    const found = parsed.entries.filter(item => !search || item.text.toLowerCase().includes(search.toLowerCase()));
    content = Buffer.from(found.map(item => `${item.line}\tH${item.level}\t${item.text}\n`).join(''));
    description = `HEADINGS matched=${found.length}`;
    baseArgs = [document, action, ...(search ? ['--search', search] : [])];
  } else {
    const line = opts['--line'];
    if (line && (!/^[1-9]\d*$/.test(line) || !Number.isSafeInteger(Number(line)))) fail('--line must be a positive heading line number.');
    const found = parsed.entries.filter(item => line ? item.line === Number(line) : item.text === opts['--heading']);
    if (found.length === 0) fail('No exact heading found. Use list or list --search first.');
    if (found.length > 1) fail('Ambiguous heading. Use list --search, then read --line with the exact heading line.');
    const selected = found[0];
    const following = parsed.entries.find(item => item.byte > selected.byte && item.level <= selected.level);
    const end = following?.byte ?? bytes.length;
    content = bytes.subarray(selected.byte, end);
    description = `SECTION lines=${selected.line}-${following ? following.line - 1 : parsed.lines} source-bytes=${selected.byte}-${end} (end exclusive)`;
    baseArgs = [document, action, '--line', String(selected.line)];
  }
  printPage(content, identity, hash(JSON.stringify(baseArgs)), baseArgs, description, opts['--cursor']);
}

try { main(process.argv.slice(2)); }
catch (error) {
  const known = error instanceof Error && !('code' in error) && error.name !== 'TypeError';
  process.stderr.write(`Context reader: ${known ? error.message : 'Cannot read this canonical document as UTF-8 text.'}\n${usage}`);
  process.exitCode = 1;
}
