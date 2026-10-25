'use client';

import { useEffect, useRef, useState } from 'react';
import type { LiveMark, RoundView } from '@/lib/live/types';

export type CorrectionFields = { source: string; songId: string; subjectId: string; mark: LiveMark; intended: string; reason: string };
type Draft = { target?: RoundView; fields?: CorrectionFields; generation: number; pending: boolean; notice: string };
type Action = (input: Record<string, unknown>) => Promise<boolean>;

// Owned by the event desk, not the conditionally mounted Results form. Nothing is persisted.
export function useNewCorrectionDraft() {
  const [draft, setDraft] = useState<Draft>({ generation: 0, pending: false, notice: '' });
  const current = useRef(draft), mounted = useRef(true), attempt = useRef<symbol | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; attempt.current = null; }; }, []);
  function update(next: Draft) { current.current = next; if (mounted.current) setDraft(next); }
  function change(round: RoundView, initial: CorrectionFields, patch: Partial<CorrectionFields>) {
    if (current.current.pending) return;
    update({ ...current.current, target: current.current.target ?? round, fields: { ...initial, ...current.current.fields, ...patch } });
  }
  function discard() {
    if (current.current.pending) return;
    attempt.current = null;
    update({ generation: current.current.generation + 1, pending: false, notice: '' });
  }
  async function request(round: RoundView, initial: CorrectionFields, input: Record<string, unknown>, action: Action) {
    if (!mounted.current || current.current.pending) return;
    const id = Symbol('correction attempt'), generation = current.current.generation;
    attempt.current = id;
    update({ ...current.current, target: current.current.target ?? round, fields: current.current.fields ?? initial, pending: true, notice: '' });
    let confirmed = false;
    try { confirmed = await action(input); }
    finally {
      if (mounted.current && attempt.current === id && current.current.generation === generation) {
        attempt.current = null;
        update({ ...current.current, pending: false, notice: confirmed ? 'Draft retained. Check Pending requests for confirmation.' : 'Request not confirmed. Draft retained; review the event notice.' });
      }
    }
  }
  return { ...draft, change, discard, request, setNotice: (notice: string) => update({ ...current.current, notice }) };
}
export type NewCorrectionDraft = ReturnType<typeof useNewCorrectionDraft>;
