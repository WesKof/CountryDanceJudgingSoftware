'use client';

import { useId, useState } from 'react';
import type { LiveRound, LiveSetup } from '@/lib/live/types';
import { setFinalsPair } from '@/lib/live/finalists';
import { finalsPairingBlocker } from '@/lib/live/finals-guidance';

type Props = { setup: LiveSetup; round: LiveRound; draft: LiveSetup | null; version: number; sourceVersion: number; disabled: boolean; update: (setup: LiveSetup) => void; save: () => Promise<boolean>; discard: () => void; reviewSetup: (roundId: string, section: string) => void };
export default function FinalsPairings({setup, round, draft, version, sourceVersion, disabled, update, save, discard, reviewSetup}: Props) {
  const [error, setError] = useState('');
  const statusId = useId();
  const shown = draft ?? setup, final = shown.rounds.find((r) => r.id === round.id)!;
  const prelim = shown.rounds.find((r) => r.id === final.prelimRoundId)!;
  const selected = prelim.subjects.filter((s) => final.finalistIds.includes(s.id)), leads = selected.filter((s) => s.role === 'Lead'), follows = selected.filter((s) => s.role === 'Follow');
  const competition = shown.competitions.find((c) => c.id === final.competitionId)!;
  const stale = Boolean(draft && sourceVersion !== version);
  const blocker = finalsPairingBlocker(shown, round.id), ready = !blocker;
  function revealPair(roundId: string, leadId: string) {
    const target = [...document.querySelectorAll<HTMLElement>('select[data-finals-round]')].find((s) => s.dataset.finalsRound === roundId && s.dataset.finalsLead === leadId);
    for (let parent: HTMLElement | null = target ?? null; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
    target?.scrollIntoView({ block: 'center' }); target?.focus({ preventScroll: true });
  }
  function pair(leadId: string, followId: string) {
    try { const next=setFinalsPair(shown, final.id, leadId, followId);update(next);setError(''); }
    catch (error) { setError((error as Error).message); }
  }
  return <details className="form-panel" open={round.subjects.length < round.finalistCount} aria-label={`${competition.format} · ${competition.division} · Finals pairing`}>
    <summary>{competition.format} · {competition.division} · Finals pairings ({round.subjects.length}/{round.finalistCount} saved)</summary>
    <div className="form-body"><p>Select the actual draw below. Each approved follow can pair with one lead.</p>
      <fieldset disabled={disabled || stale}><legend>Actual Finals draw</legend>{leads.map((lead) => {
        const assigned=final.subjects.find((s) => s.members?.[0] === lead.id)?.members?.[1] ?? '';
        return <label key={lead.id}><span>#{lead.number} {lead.primary} pairs with</span><select data-finals-round={round.id} data-finals-lead={lead.id} aria-label={`#${lead.number} ${lead.primary} pairs with`} value={assigned} onChange={(e) => pair(lead.id,e.target.value)}>
          <option value="">Choose assigned follow</option>{follows.map((follow) => <option key={follow.id} value={follow.id} disabled={final.subjects.some((s) => s.members?.[0] !== lead.id && s.members?.[1] === follow.id)}>#{follow.number} {follow.primary}</option>)}
        </select></label>;
      })}</fieldset>
      {error && <p role="alert">{error}</p>}
      <p id={statusId} role="status">{stale ? 'The event changed while you edited. Discard these pairing edits, review the current draw and try again.' : blocker?.kind === 'pair' ? `${blocker.roundId === round.id ? 'Choose a follow for' : `This draw is complete. Finish ${blocker.division}:`} ${blocker.lead}.` : blocker ? `${blocker.division} setup needs attention before saving.` : draft ? 'All pairs are ready to save.' : 'Saved draw. Changes need Save Finals pairings.'}</p>
      {!stale && blocker && (blocker.kind !== 'pair' || blocker.roundId !== round.id || leads.length > 1) && <div className="shared-inline">{blocker.kind === 'pair' ? <button className="primary-button" disabled={disabled} onClick={() => revealPair(blocker.roundId, blocker.leadId)}>{blocker.roundId === round.id ? 'Choose missing follow' : `Complete ${blocker.division} draw`}</button> : <button className="primary-button" disabled={disabled} onClick={() => reviewSetup(blocker.roundId, blocker.section)}>Review {blocker.division} setup</button>}</div>}
      {!stale && blocker?.kind === 'setup' && <details><summary>Preparation issue</summary><p>{blocker.detail}</p></details>}
      {draft && !stale && <p className="section-summary">Unsaved pairing edits · Save applies every division’s draw together.</p>}
      <div className="shared-inline"><button className="primary-button" aria-describedby={statusId} disabled={disabled || !draft || !ready || stale} onClick={async () => {if (draft && await save()) setError('');}}>Save Finals pairings</button>{draft && <button className="quiet-button" disabled={disabled} onClick={() => {discard();setError('');}}>Discard pairing edits</button>}</div>
      <details><summary>Selected dancers</summary><div className="shared-roster">{selected.map((s) => <p key={s.id}>#{s.number} {s.primary} · {s.role}</p>)}</div></details>
    </div>
  </details>;
}
