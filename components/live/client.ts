'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LiveView } from '@/lib/live/types';
import { mergeLiveView } from '@/lib/live/merge';

export class ApiError extends Error {
  status: number;
  details?: { cell?: import('@/lib/live/types').Cell };
  constructor(status: number, message: string, details?: { cell?: import('@/lib/live/types').Cell }) { super(message); this.status = status; this.details = details; }
}
export async function liveApi<T>(token: string, input?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/live', { method: input ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) }, body: input ? JSON.stringify(input) : undefined });
  const result = await response.json() as { error?: string; details?: { cell?: import('@/lib/live/types').Cell } };
  if (!response.ok) throw new ApiError(response.status, result.error ?? 'The event could not be loaded.', result.details);
  return result as T;
}
export function useLive(token: string) {
  const [data, setData] = useState<LiveView | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { const view = await liveApi<LiveView>(token); setData((current) => mergeLiveView(current, view)); setError(''); return view; }
    catch (error) { setError(error instanceof Error ? error.message : 'Shared event is unavailable.'); return null; }
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
