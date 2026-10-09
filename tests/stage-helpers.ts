import assert from 'node:assert/strict';
import { cellKey, type Cell, type LiveView, type RoundView } from '../lib/live/types.ts';

export const base = process.env.LIVE_TEST_URL ?? 'http://127.0.0.1:3000';
export const nonce = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
export async function api<T = Record<string, unknown>>(token: string, input?: Record<string, unknown>, expected = 200): Promise<T> {
  const response = await fetch(`${base}/api/live`, { method: input ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) }, body: input ? JSON.stringify(input) : undefined });
  const data = await response.json() as Record<string, unknown>;
  assert.equal(response.status, expected, `${input?.action ?? 'read'}: ${data.error ?? response.status}`);
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
  return data as T;
}
export async function command(token: string, input: Record<string, unknown>, expected = 200) {
  const v = await api<LiveView>(token);
  return api(token, { ...input, expectedVersion: v.version, requestId: crypto.randomUUID() }, expected);
}
export async function save(token: string, r: RoundView, performanceId: string, subjectId: string, mark: Cell['mark'], note = '', expected = 200) {
  const v = await api<LiveView>(token), b = v.ballots.find((b) => b.roundKey === r.key)!;
  return api(token, { action: 'save-cell', roundKey: r.key, performanceId, subjectId, mark, note, baseRevision: b.cells[cellKey(performanceId, subjectId)]?.revision ?? 0, requestId: crypto.randomUUID() }, expected);
}
export async function submitHeat(token: string, r: RoundView, heatId: string, expected = 200) {
  const v = await api<LiveView>(token);
  return api(token, { action: 'submit-heat', roundKey: r.key, heatId, ballotVersion: v.ballots.find((b) => b.roundKey === r.key)!.version, acknowledged: true, expectedVersion: v.version, requestId: crypto.randomUUID() }, expected);
}
export function observedMark(r: RoundView, subjectId: string): Cell['mark'] {
  const index = r.definition.subjects.findIndex((s) => s.id === subjectId);
  if (r.definition.kind === 'finals') return index === 0 ? 'Yes' : 'A1';
  if (r.definition.format === 'Jack & Jill') return index % 3 === 0 ? 'Yes' : 'A1';
  return index === 0 ? 'Yes' : index <= 2 ? 'A1' : index === r.definition.subjects.length - 1 ? 'No' : 'A2';
}
