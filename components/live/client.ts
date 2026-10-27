'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveView } from '@/lib/live/types';
import { mergeLiveView } from '@/lib/live/merge';
import { isLiveView } from '@/lib/live/view-validation';

export class ApiError extends Error {
  status: number;
  details?: { cell?: import('@/lib/live/types').Cell };
  constructor(status: number, message: string, details?: { cell?: import('@/lib/live/types').Cell }) { super(message); this.status = status; this.details = details; }
}
async function requestLive<T>(token: string, input?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch('/api/live', { method: input ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) }, body: input ? JSON.stringify(input) : undefined, ...(signal ? { signal } : {}) }); }
  catch { throw new ApiError(0, 'Connection interrupted. Check your connection and retry.'); }
  let result: { error?: string; details?: { cell?: import('@/lib/live/types').Cell } };
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Unreadable response');
    result = parsed as typeof result;
  } catch { throw new ApiError(response.ok ? 502 : response.status, 'The shared event is temporarily unavailable. Retry the connection.'); }
  if (!response.ok) throw new ApiError(response.status, typeof result.error === 'string' ? result.error : 'The event could not be loaded.', result.details);
  if (!input && !isLiveView(result)) throw new ApiError(502, 'The shared event is temporarily unavailable. Retry the connection.');
  return result as T;
}
// A read must finish before polling can schedule its next check. Mutations keep their own timing.
const READ_DEADLINE_MS = 10000;
export async function liveApi<T>(token: string, input?: Record<string, unknown>): Promise<T> {
  if (input) return requestLive<T>(token, input);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ApiError(0, 'The shared event took too long to respond. Retry the connection.'));
      controller.abort();
    }, READ_DEADLINE_MS);
  });
  try { return await Promise.race([requestLive<T>(token, undefined, controller.signal), deadline]); }
  finally { clearTimeout(timer); }
}
export function useLive(token: string) {
  const [data, setData] = useState<LiveView | null>(null);
  const [error, setError] = useState('');
  const started = useRef(0), completed = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++started.current;
    try {
      const view = await liveApi<LiveView>(token);
      setData((current) => mergeLiveView(current, view));
      if (request > completed.current) { completed.current = request; setError(''); }
      return view;
    } catch (error) {
      if (request > completed.current) { completed.current = request; setError(error instanceof Error ? error.message : 'Shared event is unavailable.'); }
      return null;
    }
  }, [token]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { if (!alive) return; await refresh(); if (alive) timer = setTimeout(poll, 4000); };
    void poll();
    const online = () => { void refresh(); };
    window.addEventListener('online', online);
    return () => { alive = false; clearTimeout(timer); window.removeEventListener('online', online); };
  }, [refresh]);
  return { data, setData, error, refresh };
}
export function creationNonce() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''); }
export function download(filename: string, value: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
