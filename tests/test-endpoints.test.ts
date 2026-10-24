import test from 'node:test';
import assert from 'node:assert/strict';
import { api, command, save, submitHeat } from './stage-helpers.ts';
import { exact, fault, owner } from './publication-helpers.ts';
import { requireBrowserTestEndpoints, testEndpoint, testFetch } from './test-endpoints.ts';
import type { RoundView } from '../lib/live/types.ts';

test('missing mutation endpoint refuses fixture creation before fetch is invoked', async (context) => {
  const original = process.env.LIVE_TEST_URL;
  delete process.env.LIVE_TEST_URL;
  context.after(() => { if (original === undefined) delete process.env.LIVE_TEST_URL; else process.env.LIVE_TEST_URL = original; });
  let requests = 0;
  context.mock.method(globalThis, 'fetch', async () => { requests++; return new Response('{}', { headers: { 'cache-control': 'no-store, private' } }); });
  let failure: unknown;
  try { await api('', { action: 'create', requestId: 'synthetic-endpoint-policy', name: 'Never sent' }); } catch (error) { failure = error; }
  assert.equal(requests, 0, 'fixture creation must validate explicit isolation before any fetch');
  assert.match(String(failure), /LIVE_TEST_URL/);
});

test('shared helpers refuse unsafe app and receiver configuration without preliminary reads', async (context) => {
  const original = { LIVE_TEST_URL: process.env.LIVE_TEST_URL, LOCAL_TEST_RECEIVER_URL: process.env.LOCAL_TEST_RECEIVER_URL };
  context.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let calls: { url: string; input: RequestInit }[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string, input: RequestInit) => { calls.push({ url, input }); return new Response('{}', { headers: { 'cache-control': 'no-store, private' } }); });
  const refused = async (operation: () => Promise<unknown>, variable: string) => {
    calls = [];
    await assert.rejects(operation, (error: Error) => { assert.match(error.message, new RegExp(variable)); assert.doesNotMatch(error.message, /secret|example\.com/); return true; });
    assert.equal(calls.length, 0, 'rejected configuration must not make even a preliminary read');
  };
  process.env.LOCAL_TEST_RECEIVER_URL = 'http://127.0.0.1:3110';
  process.env.LIVE_TEST_URL = 'http://127.0.0.1:3001\n';
  await refused(() => api('', { action: 'create' }), 'LIVE_TEST_URL');
  for (const url of [undefined, '', 'http://127.0.0.1:3000', 'http://localhost:3100', 'https://127.0.0.1:3001', 'http://example.com:3001', 'http://secret@localhost:3001', 'http://@localhost:3001', 'http://localhost:3001/path', 'http://localhost:3001/../', 'http://localhost:3001/%2e/', 'http://localhost:3001?secret', 'http://localhost:3001/#secret', ' localhost:3001 ']) {
    if (url === undefined) delete process.env.LIVE_TEST_URL; else process.env.LIVE_TEST_URL = url;
    await refused(() => api('', { action: 'create', name: 'Never sent' }), 'LIVE_TEST_URL');
    await refused(() => command('', { action: 'setup' }), 'LIVE_TEST_URL');
    await refused(() => save('', {} as RoundView, '', '', 'No'), 'LIVE_TEST_URL');
    await refused(() => submitHeat('', {} as RoundView, ''), 'LIVE_TEST_URL');
    await refused(() => exact('', '', 'approve'), 'LIVE_TEST_URL');
    await refused(() => owner({ action: 'release-event' }, 200, 'synthetic-key'), 'LIVE_TEST_URL');
  }
  process.env.LIVE_TEST_URL = 'http://127.0.0.1:3001';
  for (const url of [undefined, '', 'http://127.0.0.1:3100', 'http://example.com:3110', 'http://secret@localhost:3110', 'http://localhost:3110/?secret']) {
    if (url === undefined) delete process.env.LOCAL_TEST_RECEIVER_URL; else process.env.LOCAL_TEST_RECEIVER_URL = url;
    await refused(() => owner({ action: 'release-event' }, 200, 'synthetic-key'), 'LOCAL_TEST_RECEIVER_URL');
    await refused(() => fault(true), 'LOCAL_TEST_RECEIVER_URL');
    await refused(() => testFetch('receiver', '/receive', { method: 'POST' }), 'LOCAL_TEST_RECEIVER_URL');
  }
  process.env.LOCAL_TEST_RECEIVER_URL = 'http://localhost:3110/';
  calls = [];
  await api('', { action: 'create', name: 'Mock only' });
  await testFetch('receiver', '/admin/release', { method: 'POST', redirect: 'manual' });
  await testFetch('receiver', '/receive', { method: 'POST', redirect: 'follow' });
  assert.deepEqual(calls.map(({ url, input }) => [url, input.method, input.redirect]), [
    ['http://127.0.0.1:3001/api/live', 'POST', 'error'],
    ['http://localhost:3110/admin/release', 'POST', 'manual'],
    ['http://localhost:3110/receive', 'POST', 'error'],
  ]);
  for (const path of ['//example.com/secret', 'http://example.com', '/\\example.com']) {
    calls = []; await assert.rejects(() => testFetch('app', path, { method: 'POST' }), /isolated service/); assert.equal(calls.length, 0);
  }
  delete process.env.LIVE_TEST_URL; delete process.env.LOCAL_TEST_RECEIVER_URL;
  calls = []; await testFetch('app', '/api/live'); await testFetch('receiver', '/api/public');
  assert.deepEqual(calls.map(({ url }) => url), ['http://127.0.0.1:3001/api/live', 'http://127.0.0.1:3110/api/public']);
});

test('browser launch requires both explicit isolated origins and loopback variants normalize', () => {
  assert.throws(() => requireBrowserTestEndpoints({}), /LIVE_TEST_URL/);
  assert.throws(() => requireBrowserTestEndpoints({ LIVE_TEST_URL: 'http://localhost:3001' }), /LOCAL_TEST_RECEIVER_URL/);
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const environment = { LIVE_TEST_URL: `http://${host}:3001/`, LOCAL_TEST_RECEIVER_URL: `http://${host}:3110/` };
    assert.equal(requireBrowserTestEndpoints(environment), `http://${host}:3001`);
    assert.equal(testEndpoint('receiver', true, environment), `http://${host}:3110`);
  }
  assert.throws(() => requireBrowserTestEndpoints({ LIVE_TEST_URL: 'http://localhost:3001', LOCAL_TEST_RECEIVER_URL: 'http://localhost:3100' }), /LOCAL_TEST_RECEIVER_URL/);
});
