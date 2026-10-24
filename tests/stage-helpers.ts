import assert from 'node:assert/strict';
import { testEndpoint, testFetch } from './test-endpoints.ts';
import { cellKey, type Cell, type LiveView, type RoundView } from '../lib/live/types.ts';

export const base = testEndpoint('app');
export const nonce = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
export async function api<T = Record<string, unknown>>(token: string, input?: Record<string, unknown>, expected = 200): Promise<T> {
  if (input?.action === 'setup' && input.automaticStages === undefined) input = { automaticStages: false, ...input };
  if (input?.action === 'open-stage') input = { submissionMode: 'heat', ...input };
  const response = await testFetch('app', '/api/live', { method: input ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) }, body: input ? JSON.stringify(input) : undefined });
  const raw=await response.text();let data:Record<string,unknown>;try{data=JSON.parse(raw);}catch{assert.fail(`Non-JSON local API response (${response.status}): ${raw.slice(0,160).replace(/[a-f0-9]{64}/g,'[private identifier]')}`);}
  assert.equal(response.status, expected, `${input?.action ?? 'read'}: ${data.error ?? response.status}`);
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
  return data as T;
}
export async function command(token: string, input: Record<string, unknown>, expected = 200) {
  testEndpoint('app', true);
  const v = await api<LiveView>(token);
  return api(token, { ...input, expectedVersion: v.version, requestId: crypto.randomUUID() }, expected);
}
export async function save(token: string, r: RoundView, performanceId: string, subjectId: string, mark: Cell['mark'], note = '', expected = 200) {
  testEndpoint('app', true);
  const v = await api<LiveView>(token), b = v.ballots.find((b) => b.roundKey === r.key)!;
  return api(token, { action: 'save-cell', roundKey: r.key, performanceId, subjectId, mark, note, baseRevision: b.cells[cellKey(performanceId, subjectId)]?.revision ?? 0, requestId: crypto.randomUUID() }, expected);
}
export async function submitHeat(token: string, r: RoundView, heatId: string, expected = 200) {
  testEndpoint('app', true);
  const v = await api<LiveView>(token);
  return api(token, { action: 'submit-heat', roundKey: r.key, heatId, ballotVersion: v.ballots.find((b) => b.roundKey === r.key)!.version, acknowledged: true, expectedVersion: v.version, requestId: crypto.randomUUID() }, expected);
}
export function observedMark(r: RoundView, subjectId: string): Cell['mark'] {
  const index = r.definition.subjects.findIndex((s) => s.id === subjectId);
  if (r.definition.kind === 'finals') return index === 0 ? 'Yes' : 'A1';
  if (r.definition.format === 'Jack & Jill') return index % 3 === 0 ? 'Yes' : 'A1';
  return index === 0 ? 'Yes' : index <= 2 ? 'A1' : index === r.definition.subjects.length - 1 ? 'No' : 'A2';
}
