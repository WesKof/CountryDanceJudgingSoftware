'use client';

import { useState } from 'react';
import type { LiveRound, LiveSetup } from '@/lib/live/types';
import { setFinalsPair } from '@/lib/live/finalists';
import { freezeRound } from '@/lib/live/validation';

type Props = { setup: LiveSetup; round: LiveRound; draft: LiveSetup | null; version: number; sourceVersion: number; disabled: boolean; update: (setup: LiveSetup) => void; save: () => Promise<boolean>; discard: () => void };
export default function FinalsPairings({setup, round, draft, version, sourceVersion, disabled, update, save, discard}: Props) {
  const [error, setError] = useState('');
  const shown = draft ?? setup, final = shown.rounds.find((r) => r.id === round.id)!;
  const prelim = shown.rounds.find((r) => r.id === final.prelimRoundId)!;
  const selected = prelim.subjects.filter((s) => final.finalistIds.includes(s.id)), leads = selected.filter((s) => s.role === 'Lead'), follows = selected.filter((s) => s.role === 'Follow');
  const competition = shown.competitions.find((c) => c.id === final.competitionId)!;
  const stale = Boolean(draft && sourceVersion !== version);
  let ready = true;
  try { for (const f of shown.rounds.filter((r) => r.kind === 'finals' && r.finalistIds.length && shown.competitions.find((c) => c.id === r.competitionId)?.format === 'Jack & Jill')) freezeRound(shown, f); } catch { ready = false; }
  function pair(leadId: string, followId: string) {
    try { const next=setFinalsPair(shown, final.id, leadId, followId);update(next);setError(''); }
    catch (error) { setError((error as Error).message); }
  }
  return <details className="form-panel" open={round.subjects.length < round.finalistCount} aria-label={`${competition.format} · ${competition.division} · Finals pairing`}>
    <summary>{competition.format} · {competition.division} · Finals pairings ({round.subjects.length}/{round.finalistCount} saved)</summary>
    <div className="form-body"><p>Select the actual draw below. Each approved follow can pair with one lead.</p>
      <fieldset disabled={disabled || stale}><legend>Actual Finals draw</legend>{leads.map((lead) => {
        const assigned=final.subjects.find((s) => s.members?.[0] === lead.id)?.members?.[1] ?? '';
        return <label key={lead.id}><span>#{lead.number} {lead.primary} pairs with</span><select aria-label={`#${lead.number} ${lead.primary} pairs with`} value={assigned} onChange={(e) => pair(lead.id,e.target.value)}>
          <option value="">Choose assigned follow</option>{follows.map((follow) => <option key={follow.id} value={follow.id} disabled={final.subjects.some((s) => s.members?.[0] !== lead.id && s.members?.[1] === follow.id)}>#{follow.number} {follow.primary}</option>)}
        </select></label>;
      })}</fieldset>
      {error && <p role="alert">{error}</p>}{stale && <p className="notice">The event changed while you edited. Discard these pairing edits, review the current draw and try again.</p>}
      {draft && <p role="status">Unsaved pairing edits. {ready ? 'All pairs are ready to save.' : 'Choose one follow for every lead before saving.'}</p>}
      <div className="shared-inline"><button className="primary-button" disabled={disabled || !draft || !ready || stale} onClick={async () => {if (draft && await save()) setError('');}}>Save Finals pairings</button>{draft && <button className="quiet-button" disabled={disabled} onClick={() => {discard();setError('');}}>Discard pairing edits</button>}</div>
      <details><summary>Selected dancers</summary><div className="shared-roster">{selected.map((s) => <p key={s.id}>#{s.number} {s.primary} · {s.role}</p>)}</div></details>
    </div>
  </details>;
}
