'use client';

import { useState, type ReactNode } from 'react';
import { finalistCountIssues } from '@/lib/live/validation';
import type { LiveView, RoundView, LiveStandings } from '@/lib/live/types';

type Action = (input: Record<string, unknown>) => Promise<boolean>;
export function TieEditor({ round, tie, action, allowShared = true }: { round: RoundView; tie: LiveStandings['ties'][number]; action: Action; allowShared?: boolean }) {
  const saved = round.standings!.decisions.find((d) => d.key === tie.key);
  const [order, setOrder] = useState(saved?.order ?? tie.subjectIds);
  const [shared, setShared] = useState(saved?.shared ?? false);
  const [explanation, setExplanation] = useState(saved?.explanation ?? '');
  return <fieldset className="tie-editor"><legend>{tie.group} · equal averages</legend>{order.map((id, i) => { const subject = round.definition.subjects.find((s) => s.id === id)!; return <div key={id} className="shared-inline"><span>{i + 1}. #{subject.number} {subject.primary} {subject.secondary}</span><button className="quiet-button" disabled={i === 0 || shared} onClick={() => { const next = [...order]; [next[i], next[i - 1]] = [next[i - 1], next[i]]; setOrder(next); }}>Move up</button></div>; })}{allowShared && <label className="check-label"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Award an explicit shared place</label>}<label><span>Decision explanation (optional)</span><input value={explanation} maxLength={500} onChange={(e) => setExplanation(e.target.value)} /></label><button className="primary-button" onClick={() => void action({ action: 'tie', roundKey: round.key, roundVersion: round.version, fingerprint: round.standings!.fingerprint, tieKey: tie.key, order, shared, explanation })}>Save head judge decision</button></fieldset>;
}

export function LiveResults({ data, action, head = false, roundControls, selectedRoundId }: { data: LiveView; action: Action; head?: boolean; selectedRoundId?: string; roundControls?: (round: RoundView) => ReactNode }) {
  return <div className="page-stack">{data.rounds.filter((r) => r.standings && (!selectedRoundId || r.id === selectedRoundId)).map((round) => {
    const result = round.standings!;
    const countIssues = data.setup.workflow && round.definition.kind === 'prelims' ? finalistCountIssues(round.definition.format, result.finalistCount ?? 0, round.definition.subjects.filter((s) => !round.definition.withdrawnIds?.includes(s.id))) : [];
    const pendingCorrections = data.setup.workflow ? data.reviewRequests?.filter((q) => q.kind === 'correction' && q.payload.roundKey === round.key && !q.appliedAt && !q.cancelledAt) ?? [] : [];
    const unresolvedVotes = data.setup.workflow && round.definition.kind === 'prelims' && result.advancementTies?.some((t) => !t.complete);
    const unresolvedPlaces = (!data.setup.workflow || round.definition.kind === 'finals') && result.rows.some((r) => !r.decided);
    const judges = new Map(round.definition.judges.map((j) => [j.id, j]));
    const subjects = new Map(round.definition.subjects.map((s) => [s.id, s]));
    const songs = new Map(round.definition.heats.flatMap((h) => h.songs).map((p) => [p.id, p]));
    const canReview = head && data.status === 'active' && round.phase === 'discussion' && result.complete;
    const blocked = countIssues.length > 0 || pendingCorrections.length > 0 || unresolvedVotes || unresolvedPlaces;
    return <section className="result-sheet" id={`round-result-${round.id}`} aria-labelledby={`round-result-context-${round.id} round-result-title-${round.id}`} tabIndex={-1} key={round.key}><div className="result-letterhead"><span id={`round-result-context-${round.id}`}>{round.definition.format} · {round.definition.division} · {round.definition.kind}</span><h2 id={`round-result-title-${round.id}`}>{result.approved ? 'Head-approved results' : 'Provisional results'}</h2><p>{result.submitted} / {result.required} {data.setup.workflow ? 'heat submissions acknowledged' : 'judges submitted'}{result.approvedAt ? ` · approved ${new Date(result.approvedAt).toLocaleString()}` : ''}</p></div>
      {canReview && <div className="review-next-step">
        <p className="review-step-label">{blocked ? 'Before approving' : 'Ready for your review'}</p>
        <button className="primary-button" disabled={Boolean(blocked)} onClick={() => void action({ action: 'approve', roundKey: round.key, roundVersion: round.version, fingerprint: result.fingerprint })}>Approve these exact submissions</button>
        {!blocked && <p>Check the places below. Approval confirms this competition’s submitted scores{data.setup.workflow && round.definition.kind === 'prelims' ? ' and advancing entrants' : ''}.</p>}
        {countIssues.map((issue) => <p role="status" key={issue}>{issue} Ask the organizer to fix the finalist count in Set up.</p>)}
        {pendingCorrections.length > 0 && <><p role="status">Resolve the pending recording-error correction{pendingCorrections.length === 1 ? '' : 's'} before approving these results. The organizer and head must both approve each exact request, or the organizer can cancel it.</p><button className="quiet-button" onClick={() => { const request = document.getElementById(`review-request-${pendingCorrections[0].id}`); for (let parent = request?.parentElement; parent; parent = parent.parentElement) if(parent instanceof HTMLDetailsElement) parent.open = true; request?.scrollIntoView({ block: 'center' }); request?.focus({ preventScroll: true }); }}>Review pending corrections</button></>}
        {unresolvedVotes && <p role="status">Every assigned judge must vote below. A remaining vote tie needs the head judge’s decision before approval.</p>}
        {unresolvedPlaces && <p role="status">Save a head judge decision for each equal-average group below before approving the places.</p>}
      </div>}
      {roundControls?.(round)}
      {canReview && result.ties.filter((tie) => !data.setup.workflow || round.definition.kind === 'finals' || result.advancementTies?.some((t) => t.key === tie.key && t.deadlocked && t.votes.length === round.definition.judgeIds.length)).map((tie) => <TieEditor key={`${round.key}/${result.fingerprint}/${tie.key}`} round={round} tie={tie} action={action} allowShared={!data.setup.workflow || round.definition.kind === 'finals'} />)}
      {round.definition.withdrawnIds?.map((id) => { const subject=round.definition.subjects.find((s)=>s.id===id)!; return <p key={id}>#{subject.number} {subject.primary} {subject.secondary} · Withdrawn · recorded observations retained</p>; })}{result.rows.length === 0 && <p>Standings appear when every required judge has finalized the required songs. Drafts are excluded.</p>}
      {[...new Set(result.rows.map((r) => r.group))].map((group) => <div className="result-group" key={group}><h3>{group}</h3><div className="table-wrap"><table><thead><tr><th>Place</th><th>Bib / entrant</th><th>Average</th></tr></thead><tbody>{result.rows.filter((r) => r.group === group).map((row) => <tr key={row.subjectId}><td>{row.place}{row.tied ? data.setup.workflow && round.definition.kind === 'prelims' ? ' · equal average' : row.decided ? ' · head decided' : ' · tie pending' : ''}</td><td><strong>#{row.number} {row.primary}</strong><small>{row.secondary}</small></td><td>{row.average.toFixed(4)}</td></tr>)}</tbody></table></div></div>)}
      <details><summary>Per-song averages and submitted marks</summary><p>Result version {round.generation}. Blank means not observed; No is a recorded zero.</p>{result.rows.map((row) => <div key={row.subjectId}><h4>#{row.number} {row.primary}</h4>{row.judgeMeans?.map((j) => <p key={j.judgeId}>{judges.get(j.judgeId)?.name}: mean {j.average.toFixed(4)} · {j.observations} observations</p>)}{row.songs.map((song) => <p key={song.id}>{song.title}: {song.denominator ? song.average.toFixed(4) : 'Blank · no observations'} · {song.denominator} judges</p>)}</div>)}<ul className="submitted-marks">{round.submittedMarks?.map((cell) => { const judge = judges.get(cell.judgeId); const subject = subjects.get(cell.subjectId); const song = songs.get(cell.performanceId); return <li key={`${cell.judgeId}/${cell.performanceId}/${cell.subjectId}`}>{judge?.name} · #{subject?.number} · {song?.title}: <strong>{cell.mark || 'Blank'}</strong></li>; })}</ul></details>
      {result.decisions.length > 0 && <details><summary>Head judge decisions</summary>{result.decisions.map((d) => <p key={d.key}>{d.shared ? 'Shared place' : 'Ordered placement'} · {d.explanation || 'No explanation added'} · {new Date(d.decidedAt).toLocaleString()}</p>)}</details>}
      {!result.approved && !canReview && countIssues.map((issue) => <p className="notice" role="status" key={issue}>{issue}</p>)}
      {!data.setup.workflow && (head || data.role === 'organizer') && data.status === 'active' && ['discussion', 'approved'].includes(round.phase) && <button className="quiet-button" onClick={() => { const reason = window.prompt('Reason for reopening this round? Prior submissions and approvals stay in history. Reopening prelims also invalidates dependent finals.'); if (reason?.trim()) void action({ action: 'reopen', roundKey: round.key, reason }); }}>Reopen for a correction</button>}
    </section>;
  })}</div>;
}
