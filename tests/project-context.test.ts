import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceScript = fileURLToPath(new URL('../scripts/project-context.mjs', import.meta.url));
const bytesLimit = 12 * 1024;

function fixture(t: { after: (cleanup: () => void) => void }, spec: string | Buffer) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(path.join(parent, 'country-context-'));
  mkdirSync(path.join(root, 'scripts'));
  const script = path.join(root, 'scripts/project-context.mjs');
  copyFileSync(sourceScript, script);
  for (const name of ['AGENTS.md', 'LOCAL_TEST_REPORT.md']) writeFileSync(path.join(root, name), '# Fictional reference\n');
  writeFileSync(path.join(root, 'PROJECT_SPEC.md'), spec);
  t.after(() => {
    const resolved = realpathSync(root);
    assert.equal(resolved, root);
    assert.ok(resolved.startsWith(path.join(parent, 'country-context-')));
    rmSync(resolved, { recursive: true });
  });
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: parent, encoding: null, windowsHide: true, timeout: 5000 });
  return { root, script, run };
}

function page(output: Buffer) {
  assert.ok(output.length <= bytesLimit, `Output exceeded bound: ${output.length}`);
  const marker = /CONTENT (\d+) UTF-8 bytes\n/.exec(output.toString('utf8'));
  assert.ok(marker);
  const start = Buffer.byteLength(output.toString('utf8').slice(0, marker.index + marker[0].length));
  const payload = output.subarray(start, start + Number(marker[1]));
  const footer = output.subarray(start + payload.length).toString('utf8');
  assert.match(footer, /^\nEND CONTENT\nSTATUS (?:complete|truncated)\nNEXT /);
  const token = /--cursor '([A-Za-z0-9_-]+)'\n$/.exec(footer)?.[1];
  return { payload, token, footer };
}

test('context reader respects nesting, fences, closing hashes and source lines outside caller CWD', t => {
  const text = '# Title\r\nintro\r\n## Parent ##\r\nbody\r\n```md\r\n## Fake\r\n```\r\n### Child\r\nchild\r\n~~~~\r\n## Also fake\r\n~~~\r\nstill fenced\r\n~~~~\r\n    ## Indented example\r\n## Next\r\nnext\r\n# ##\r\n## #\r\n###\t####\t\r\n####   \r\n##\t \t\r\n## name#\r\n## # #\r\n';
  const { run } = fixture(t, text);
  const list = run('spec', 'list');
  assert.equal(list.status, 0, list.stderr.toString());
  assert.equal(page(list.stdout).payload.toString(), '1\tH1\tTitle\n3\tH2\tParent\n8\tH3\tChild\n16\tH2\tNext\n18\tH1\t\n19\tH2\t\n20\tH3\t\n21\tH4\t\n22\tH2\t\n23\tH2\tname#\n24\tH2\t#\n');
  const section = run('spec', 'read', '--heading', 'Parent');
  assert.equal(section.status, 0, section.stderr.toString());
  assert.equal(page(section.stdout).payload.toString(), text.slice(text.indexOf('## Parent'), text.indexOf('## Next')));
  assert.match(section.stdout.toString(), /SECTION lines=3-15/);
  const child = run('spec', 'read', '--line', '8');
  assert.equal(child.status, 0);
  assert.ok(page(child.stdout).payload.toString().startsWith('### Child\r\n'));
  assert.ok(page(run('spec', 'read', '--line', '19').stdout).payload.toString().startsWith('## #\r\n'));
});

test('duplicate headings require a line selector and search stays bounded', t => {
  const { run } = fixture(t, '# Root\n## Same\nfirst\n## Same\nsecond\n');
  const ambiguous = run('spec', 'read', '--heading', 'Same');
  assert.equal(ambiguous.status, 1);
  assert.equal(ambiguous.stdout.length, 0);
  assert.match(ambiguous.stderr.toString(), /Ambiguous/);
  const found = run('spec', 'list', '--search', 'same');
  assert.equal(page(found.stdout).payload.toString(), '2\tH2\tSame\n4\tH2\tSame\n');
  assert.equal(page(run('spec', 'read', '--line', '4').stdout).payload.toString(), '## Same\nsecond\n');
});

test('bounded pagination preserves exact UTF-8, CRLF and a long single line without loss or repetition', t => {
  const section = '## Unicode\r\n' + '舞💃e\u0301漢\"\\'.repeat(9000) + '\r\n### Nested\r\nlast';
  const text = '# Root\r\n' + section + '\r\n## Next\r\nexcluded';
  const { root, run } = fixture(t, text);
  const before = createHash('sha256').update(readFileSync(path.join(root, 'PROJECT_SPEC.md'))).digest('hex');
  const chunks: Buffer[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const result = run('spec', 'read', '--line', '2', ...(cursor ? ['--cursor', cursor] : []));
    assert.equal(result.status, 0, result.stderr.toString());
    const parsed = page(result.stdout);
    assert.equal(new TextDecoder('utf8', { fatal: true }).decode(parsed.payload), parsed.payload.toString('utf8'));
    chunks.push(parsed.payload);
    assert.notEqual(parsed.token, cursor ?? 'initial');
    cursor = parsed.token;
    assert.ok(++pages < 100);
  } while (cursor);
  assert.ok(pages > 2);
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(section + '\r\n'));
  assert.equal(createHash('sha256').update(readFileSync(path.join(root, 'PROJECT_SPEC.md'))).digest('hex'), before);
});

test('heading lists with very long Unicode headings paginate losslessly', t => {
  const heading = '💃舞'.repeat(4000);
  const { run } = fixture(t, '# Root\n## ' + heading + '\n');
  const pieces: Buffer[] = [];
  let cursor: string | undefined;
  do {
    const result = run('spec', 'list', ...(cursor ? ['--cursor', cursor] : []));
    assert.equal(result.status, 0);
    const parsed = page(result.stdout);
    pieces.push(parsed.payload);
    cursor = parsed.token;
  } while (cursor);
  assert.equal(Buffer.concat(pieces).toString(), '1\tH1\tRoot\n2\tH2\t' + heading + '\n');
});

test('invalid inputs never dump documents or read arbitrary paths', t => {
  const { run } = fixture(t, '# Root\n## Safe\nPRIVATE_FIXTURE_BODY\n');
  const cases = [[], ['../.dev.vars', 'list'], ['spec', 'read'], ['spec', 'read', '--heading', 'Missing'], ['spec', 'read', '--line', '3'], ['spec', 'read', '--line', '-1'], ['spec', 'read', '--line', '2', '--heading', 'Safe'], ['spec', 'list', '--line', '2'], ['spec', 'list', '--unknown', 'x'], ['spec', 'list', '--search'], ['spec', 'list', '--cursor', 'bad'], ['spec', 'list', '--search', 'x'.repeat(2000)]];
  for (const args of cases) {
    const result = run(...args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(result.stdout.length, 0);
    assert.ok(result.stderr.length < 2048);
    assert.doesNotMatch(result.stderr.toString(), /PRIVATE_FIXTURE_BODY/);
  }
});

test('continuation rejects stale documents and mismatched selections', t => {
  const { root, run } = fixture(t, '# Root\n## First\n' + '舞'.repeat(15000) + '\n## Second\nother');
  const first = run('spec', 'read', '--line', '2');
  const token = page(first.stdout).token;
  assert.ok(token);
  for (const args of [['spec', 'list'], ['spec', 'read', '--line', '4']]) {
    assert.equal(run(...args, '--cursor', token).status, 1);
  }
  writeFileSync(path.join(root, 'PROJECT_SPEC.md'), '# Changed\n');
  assert.equal(run('spec', 'read', '--line', '1', '--cursor', token).status, 1);
});

test('invalid UTF-8 and non-regular canonical files fail without content output', t => {
  const { root, run } = fixture(t, Buffer.from([35, 32, 0xff]));
  assert.equal(run('spec', 'list').status, 1);
  rmSync(path.join(root, 'LOCAL_TEST_REPORT.md'));
  mkdirSync(path.join(root, 'LOCAL_TEST_REPORT.md'));
  const result = run('report', 'list');
  assert.equal(result.status, 1);
  assert.equal(result.stdout.length, 0);
});
