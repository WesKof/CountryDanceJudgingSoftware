import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const configFile = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const intended = ['.next/dev/types/validator.ts', '.next/types/routes.d.ts', 'app/page.tsx', 'lib/value.ts', 'next-env.d.ts', 'public-site/receiver.mts', 'tests/focused.test.ts'].sort();
const diagnostics = ['work/copy.ts', 'work/nested/copy.tsx', 'work/retained/tool.mts', 'work/owner-runtime-backups/vendor/template.ts', 'work/explicit.ts', 'work/referenced.d.ts'];

function fixture(t: { after: (cleanup: () => void) => void }) {
  const parent = fs.realpathSync(tmpdir()), root = fs.mkdtempSync(path.join(parent, 'typescript-discovery-'));
  t.after(() => { assert.equal(fs.realpathSync(root), root); assert.ok(root.startsWith(path.join(parent, 'typescript-discovery-'))); fs.rmSync(root, { recursive: true }); });
  const write = (file: string, source: string) => { const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, source); };
  write('tsconfig.json', fs.readFileSync(configFile, 'utf8'));
  for (const file of [...intended, ...diagnostics, 'node_modules/unused/source.ts']) write(file, 'export {};\n');
  const parse = () => {
    const read = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile); assert.equal(read.error, undefined);
    const result = ts.parseJsonConfigFileContent(read.config, ts.sys, root); assert.deepEqual(result.errors, []); return result;
  };
  const relative = (file: string) => path.relative(root, file).replaceAll('\\', '/');
  return { root, write, parse, relative };
}

test('real project discovery excludes diagnostic ts/tsx/mts copies and backups while preserving every intended root', t => {
  const f = fixture(t), result = f.parse();
  assert.deepEqual(result.fileNames.map(f.relative).sort(), intended);
  assert.ok(result.fileNames.some(file => f.relative(file) === '.next/types/routes.d.ts'));
  assert.ok(result.fileNames.some(file => f.relative(file) === '.next/dev/types/validator.ts'));
  for (const file of diagnostics) assert.equal(result.fileNames.some(actual => f.relative(actual) === file), false, file);
});

test('discovery exclusion remains distinct from imported declarations and explicitly referenced program sources', t => {
  const f = fixture(t);
  f.write('node_modules/fixture-types/package.json', JSON.stringify({ name: 'fixture-types', types: 'index.d.ts' }));
  f.write('node_modules/fixture-types/index.d.ts', 'export interface Normal { value: string }\n');
  f.write('node_modules/react/package.json', JSON.stringify({ name: 'react', exports: { './jsx-runtime': { types: './jsx-runtime.d.ts' } } }));
  f.write('node_modules/react/jsx-runtime.d.ts', 'export namespace JSX { type Element = object; type IntrinsicElements = Record<string, unknown>; }\n');
  f.write('work/explicit.ts', 'export const retained = 1;\n');
  f.write('work/referenced.d.ts', 'export interface Referenced { value: string }\n');
  f.write('app/page.tsx', 'import { retained } from "../work/explicit.ts"; export const current = retained;\n');
  f.write('lib/value.ts', 'import type { Normal } from "fixture-types"; export type Current = Normal;\n');
  f.write('tests/focused.test.ts', '/// <reference path="../work/referenced.d.ts" />\nexport {};\n');
  const parsed = f.parse(); assert.deepEqual(parsed.fileNames.map(f.relative).sort(), intended);
  // Fixture source-inclusion inspection only: do not load the real project's ambient
  // packages or standard libraries, compile the application, emit or execute fixtures.
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, types: [], noLib: true } });
  const files = program.getSourceFiles().map(file => f.relative(file.fileName)).sort();
  assert.deepEqual(files, [...intended, 'node_modules/fixture-types/index.d.ts', 'node_modules/react/jsx-runtime.d.ts', 'work/explicit.ts', 'work/referenced.d.ts'].sort());
  assert.equal(files.includes('node_modules/unused/source.ts'), false);
});
