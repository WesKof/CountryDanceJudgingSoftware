'use client';

import { Fragment, useId, useRef, useState, type ReactNode } from 'react';
import { finalistCountIssues } from '@/lib/live/validation';
import type { LiveView, RoundView, LiveStandings } from '@/lib/live/types';

type Action = (input: Record<string, unknown>) => Promise<boolean>;
function ExactApproval({ eventId, round, blocked, advancing, action }: { eventId: string; round: RoundView; blocked: boolean; advancing: boolean; action: Action }) {
  const [attempt, setAttempt] = useState<{ target: string; pending: boolean } | null>(null);
  const pending = useRef(false);
  const target = JSON.stringify([eventId, round.key, round.version, round.standings!.fingerprint]);
  const waiting = attempt?.pending === true, changed = Boolean(attempt && attempt.target !== target);
  async function approve() {
    if (pending.current || blocked) return;
    const input = { action: 'approve', roundKey: round.key, roundVersion: round.version, fingerprint: round.standings!.fingerprint };
    pending.current = true; setAttempt({ target, pending: true });
    try { await action(input); }
    catch { /* The current authoritative results, not a callback outcome, confirm approval. */ }
    finally { pending.current = false; setAttempt({ target, pending: false }); }
  }
  return <>
    <p className="review-step-label">{waiting ? changed ? 'Checking previous approval' : 'Approving these submissions…' : blocked ? 'Before approving' : attempt ? changed ? 'Review updated results' : 'Review approval status' : 'Ready for your review'}</p>
    <button className="primary-button" disabled={blocked || waiting} aria-busy={waiting} onClick={() => void approve()}>{waiting ? changed ? 'Checking previous approval…' : 'Approving…' : 'Approve these exact submissions'}</button>
    {(waiting || !blocked) && <p role="status">{waiting ? changed ? 'The results changed while the previous approval was pending. Wait for the current status, then review these submissions.' : 'Approval is in progress for these exact submitted scores.' : attempt ? changed ? 'Results changed. Review the current submissions before approving.' : 'Approval is not confirmed in these results yet. Check the current status before trying again.' : <>Check the places below. Approval confirms this competition’s submitted scores{advancing ? ' and advancing entrants' : ''}.</>}</p>}
  </>;
}
export function TieEditor({ eventId, judgeId, round, tie, action, allowShared = true, focusId }: { eventId: string; judgeId?: string | null; round: RoundView; tie: LiveStandings['ties'][number]; action: Action; allowShared?: boolean; focusId?: string }) {
  const saved = round.standings!.decisions.find((d) => d.key === tie.key);
  const target = JSON.stringify([eventId, judgeId, round.key, round.version, round.standings!.fingerprint, tie.key, tie.subjectIds, allowShared]);
  const freshDraft = () => ({ target, edited: false, fingerprint: round.standings!.fingerprint, order: [...(saved?.order ?? tie.subjectIds)], shared: saved?.shared ?? false, explanation: saved?.explanation ?? '', allowShared, subjects: tie.subjectIds.map((id) => ({ ...round.definition.subjects.find((s) => s.id === id)! })) });
  const [storedDraft, setDraft] = useState(freshDraft);
  const [saving, setSaving] = useState(false), [attempted, setAttempted] = useState(false);
  const draft = storedDraft.edited || attempted || saving ? storedDraft : freshDraft();
  const pending = useRef(false), changed = draft.target !== target, locked = saving || changed;
  const confirmed = saved?.fingerprint === draft.fingerprint && saved.fingerprint === round.standings!.fingerprint && saved.judgeId === judgeId && saved.shared === draft.shared && saved.explanation === draft.explanation && saved.order.length === draft.order.length && saved.order.every((id, i) => id === draft.order[i]);
  const statusId = useId();
  async function save() {
    if (pending.current || changed || confirmed) return;
    const input = { action: 'tie', roundKey: round.key, roundVersion: round.version, fingerprint: round.standings!.fingerprint, tieKey: tie.key, order: [...draft.order], shared: draft.shared, explanation: draft.explanation };
    pending.current = true; setDraft({ ...draft, edited: true }); setSaving(true); setAttempted(true);
    try { await action(input); }
    catch { /* Authoritative results confirm a decision; keep the exact draft. */ }
    finally { pending.current = false; setSaving(false); }
  }
  return <fieldset className="tie-editor"><legend id={focusId} tabIndex={focusId ? -1 : undefined} aria-describedby={focusId ? `round-result-context-${round.id} ${focusId}-duty` : undefined} style={focusId ? { scrollMarginBlock: 24 } : undefined}>{tie.group} · equal averages</legend>{draft.order.map((id, i) => { const subject = draft.subjects.find((s) => s.id === id)!; return <div key={id} className="shared-inline"><span>{i + 1}. #{subject.number} {subject.primary} {subject.secondary}</span><button className="quiet-button" disabled={i === 0 || draft.shared || locked} onClick={() => { if (pending.current || changed || draft.shared || i === 0) return; const next = [...draft.order]; [next[i], next[i - 1]] = [next[i - 1], next[i]]; setDraft({ ...draft, edited: true, order: next }); setAttempted(false); }}>Move up</button></div>; })}{draft.allowShared && <label className="check-label"><input type="checkbox" checked={draft.shared} disabled={locked} onChange={(e) => { if (!pending.current && !changed) { setDraft({ ...draft, edited: true, shared: e.target.checked }); setAttempted(false); } }} />Award an explicit shared place</label>}<label><span>Decision explanation (optional)</span><input value={draft.explanation} disabled={locked} maxLength={500} onChange={(e) => { if (!pending.current && !changed) { setDraft({ ...draft, edited: true, explanation: e.target.value }); setAttempted(false); } }} /></label>
    <p id={statusId} role="status">{confirmed ? 'Decision saved in current results.' : saving ? changed ? 'Saving the previous decision… Your draft is kept.' : 'Saving this head decision…' : changed ? 'Results changed. Your earlier decision draft is kept. Discard it to review current results.' : attempted ? 'Check current results for the saved decision before trying again. Your draft is kept.' : 'Review the order before saving this decision.'}</p>
    <button className="primary-button" aria-describedby={statusId} aria-busy={saving} disabled={locked || confirmed} onClick={() => void save()}>{confirmed ? 'Decision saved' : saving ? 'Saving decision…' : 'Save head judge decision'}</button>
    {changed && !saving && <button className="quiet-button" onClick={() => { if (pending.current) return; setDraft(freshDraft()); setAttempted(false); }}>{confirmed ? 'Review current saved decision' : 'Discard draft and review current results'}</button>}
  </fieldset>;
}

export function LiveResults({ data, action, head = false, roundControls, selectedRoundId }: { data: LiveView; action: Action; head?: boolean; selectedRoundId?: string; roundControls?: (round: RoundView) => ReactNode }) {
  return <div className="page-stack">{data.rounds.filter((r) => r.standings && (!selectedRoundId || r.id === selectedRoundId)).map((round) => {
    const result = round.standings!;
    const countIssues = data.setup.workflow && round.definition.kind === 'prelims' ? finalistCountIssues(round.definition.format, result.finalistCount ?? 0, round.definition.subjects.filter((s) => !round.definition.withdrawnIds?.includes(s.id))) : [];
    const pendingCorrections = data.setup.workflow ? data.reviewRequests?.filter((q) => q.kind === 'correction' && q.payload.roundKey === round.key && !q.appliedAt && !q.cancelledAt) ?? [] : [];
    const unresolvedVotes = data.setup.workflow && round.definition.kind === 'prelims' && result.advancementTies?.some((t) => !t.complete);
    const headTies = data.setup.workflow && round.definition.kind === 'prelims' ? result.advancementTies?.filter((tie) => !tie.complete && tie.deadlocked && tie.votes.length === round.definition.judgeIds.length) ?? [] : [];
    const awaitingPanelVotes = result.advancementTies?.some((tie) => !tie.complete && tie.votes.length < round.definition.judgeIds.length);
    const unresolvedPlaces = (!data.setup.workflow || round.definition.kind === 'finals') && result.rows.some((r) => !r.decided);
    const judges = new Map(round.definition.judges.map((j) => [j.id, j]));
    const subjects = new Map(round.definition.subjects.map((s) => [s.id, s]));
    const songs = new Map(round.definition.heats.flatMap((h) => h.songs).map((p) => [p.id, p]));
    const canReview = head && data.status === 'active' && round.phase === 'discussion' && result.complete;
    const blocked = countIssues.length > 0 || pendingCorrections.length > 0 || unresolvedVotes || unresolvedPlaces;
    return <section className="result-sheet" id={`round-result-${round.id}`} aria-labelledby={`round-result-context-${round.id} round-result-title-${round.id}`} tabIndex={-1} key={round.key}><div className="result-letterhead"><span id={`round-result-context-${round.id}`}>{round.definition.format} · {round.definition.division} · {round.definition.kind}</span><h2 id={`round-result-title-${round.id}`}>{result.approved ? 'Head-approved results' : 'Provisional results'}</h2><p>{result.submitted} / {result.required} {data.setup.workflow ? 'heat submissions acknowledged' : 'judges submitted'}{result.approvedAt ? ` · approved ${new Date(result.approvedAt).toLocaleString()}` : ''}</p></div>
      {canReview && <div className="review-next-step">
        <ExactApproval eventId={data.eventId} round={round} blocked={Boolean(blocked)} advancing={Boolean(data.setup.workflow && round.definition.kind === 'prelims')} action={action} />
        {countIssues.map((issue) => <p role="status" key={issue}>{issue} Ask the organizer to fix the finalist count in Set up.</p>)}
        {pendingCorrections.length > 0 && <><p role="status">Resolve the pending recording-error correction{pendingCorrections.length === 1 ? '' : 's'} before approving these results. The organizer and head must both approve each exact request, or the organizer can cancel it.</p><button className="quiet-button" onClick={() => { const request = document.getElementById(`review-request-${pendingCorrections[0].id}`); for (let parent = request?.parentElement; parent; parent = parent.parentElement) if(parent instanceof HTMLDetailsElement) parent.open = true; request?.scrollIntoView({ block: 'center' }); request?.focus({ preventScroll: true }); }}>Review pending corrections</button></>}
        {unresolvedVotes && (!headTies.length || awaitingPanelVotes) && <p role="status">Every assigned judge must vote below. A remaining vote tie needs the head judge’s decision before approval.</p>}
        {headTies.map((tie) => { const targetId = `head-tie-${round.key}-${tie.key}`; return <Fragment key={tie.key}><p id={`${targetId}-duty`} role="status">{tie.group} vote tied. Your head decision is needed.</p><button className="quiet-button" aria-controls={targetId} aria-describedby={`round-result-context-${round.id} ${targetId}-duty`} onClick={() => { const target = document.getElementById(targetId); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start', behavior: 'instant' }); }}>Open {tie.group} decision</button></Fragment>; })}
        {unresolvedPlaces && <p role="status">Save a head judge decision for each equal-average group below before approving the places.</p>}
      </div>}
      {roundControls?.(round)}
      {canReview && result.ties.filter((tie) => !data.setup.workflow || round.definition.kind === 'finals' || result.advancementTies?.some((t) => t.key === tie.key && t.deadlocked && t.votes.length === round.definition.judgeIds.length)).map((tie) => <TieEditor key={JSON.stringify([data.eventId, data.judgeId, round.key, tie.key])} eventId={data.eventId} judgeId={data.judgeId} round={round} tie={tie} action={action} allowShared={!data.setup.workflow || round.definition.kind === 'finals'} focusId={headTies.some((headTie) => headTie.key === tie.key) ? `head-tie-${round.key}-${tie.key}` : undefined} />)}
      {round.definition.withdrawnIds?.map((id) => { const subject=round.definition.subjects.find((s)=>s.id===id)!; return <p key={id}>#{subject.number} {subject.primary} {subject.secondary} · Withdrawn · recorded observations retained</p>; })}{result.rows.length === 0 && <p>Standings appear when every required judge has finalized the required songs. Drafts are excluded.</p>}
      {[...new Set(result.rows.map((r) => r.group))].map((group) => <div className="result-group" key={group}><h3>{group}</h3><div className="table-wrap"><table><thead><tr><th>Place</th><th>Bib / entrant</th><th>Average</th></tr></thead><tbody>{result.rows.filter((r) => r.group === group).map((row) => <tr key={row.subjectId}><td><span className="result-place-number">{row.place}</span>{row.tied && <small className="result-place-qualifier">{data.setup.workflow && round.definition.kind === 'prelims' ? ' · equal average' : row.decided ? ' · head decided' : ' · tie pending'}</small>}</td><td><strong>#{row.number} {row.primary}</strong><small>{row.secondary}</small></td><td>{row.average.toFixed(4)}</td></tr>)}</tbody></table></div></div>)}
      <details><summary>Per-song averages and submitted marks</summary><p>Result version {round.generation}. Blank means not observed; No is a recorded zero.</p>{result.rows.map((row) => <div key={row.subjectId}><h4>#{row.number} {row.primary}</h4>{row.judgeMeans?.map((j) => <p key={j.judgeId}>{judges.get(j.judgeId)?.name}: mean {j.average.toFixed(4)} · {j.observations} observations</p>)}{row.songs.map((song) => <p key={song.id}>{song.title}: {song.denominator ? song.average.toFixed(4) : 'Blank · no observations'} · {song.denominator} judges</p>)}</div>)}<ul className="submitted-marks">{round.submittedMarks?.map((cell) => { const judge = judges.get(cell.judgeId); const subject = subjects.get(cell.subjectId); const song = songs.get(cell.performanceId); return <li key={`${cell.judgeId}/${cell.performanceId}/${cell.subjectId}`}>{judge?.name} · #{subject?.number} · {song?.title}: <strong>{cell.mark || 'Blank'}</strong></li>; })}</ul></details>
      {result.decisions.length > 0 && <details><summary>Head judge decisions</summary>{result.decisions.map((d) => <p key={d.key}>{d.shared ? 'Shared place' : 'Ordered placement'} · {d.explanation || 'No explanation added'} · {new Date(d.decidedAt).toLocaleString()}</p>)}</details>}
      {!result.approved && !canReview && countIssues.map((issue) => <p className="notice" role="status" key={issue}>{issue}</p>)}
      {!data.setup.workflow && (head || data.role === 'organizer') && data.status === 'active' && ['discussion', 'approved'].includes(round.phase) && <button className="quiet-button" onClick={() => { const reason = window.prompt('Reason for reopening this round? Prior submissions and approvals stay in history. Reopening prelims also invalidates dependent finals.'); if (reason?.trim()) void action({ action: 'reopen', roundKey: round.key, reason }); }}>Reopen for a correction</button>}
    </section>;
  })}</div>;
}
