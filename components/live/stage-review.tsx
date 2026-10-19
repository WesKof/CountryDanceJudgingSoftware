'use client';

import { useState, type ReactNode } from 'react';
import type { AdvancementTie, LiveView, RoundView } from '@/lib/live/types';
import { LiveResults } from './results';
import SetupSection from './setup-section';
import { Correction, ReviewRequests } from './result-management';
import OrganizerResults from './organizer-results';

type Action = (input: Record<string, unknown>) => Promise<boolean>;
function Vote({ data, round, tie, action }: { data: LiveView; round: RoundView; tie: AdvancementTie; action: Action }) {
  const [selected, setSelected] = useState<string[]>([]);
  const ownVote = tie.votes.find((v) => v.judgeId === data.judgeId);
  const voted = Boolean(ownVote);
  return <fieldset className="tie-editor"><legend>{round.definition.division} · {tie.group} advancement tie</legend><p>Choose exactly {tie.slots} of these tied entrants. {tie.votes.length} / {round.definition.judgeIds.length} panel votes received. Marks and numeric averages stay unchanged.</p>{tie.subjectIds.map((id) => { const s = round.definition.subjects.find((s) => s.id === id)!; return <label className="check-label" key={id}><input type="checkbox" checked={(ownVote?.selected ?? selected).includes(id)} disabled={voted || data.role === 'organizer' || data.status !== 'active'} onChange={(e) => setSelected(e.target.checked ? [...selected, id] : selected.filter((x) => x !== id))} />#{s.number} {s.primary}</label>; })}{data.role !== 'organizer' && round.definition.judgeIds.includes(data.judgeId!) && <button className="primary-button" disabled={voted || selected.length !== tie.slots || round.phase !== 'discussion' || data.status !== 'active'} onClick={() => void action({ action: 'vote', roundKey: round.key, roundVersion: round.version, fingerprint: round.standings!.fingerprint, tieKey: tie.key, selected })}>{voted ? 'Vote finalized' : 'Submit advancement vote'}</button>}<p>{tie.complete ? `Advancing: ${tie.selected.map((id) => '#' + round.definition.subjects.find((s) => s.id === id)!.number).join(', ')}` : tie.deadlocked ? 'Full panel is tied. The head judge must resolve the remaining vote tie.' : 'Every assigned judge, including the head, must vote.'}</p></fieldset>;
}

function SubmittedReview({ data, round, action }: { data: LiveView; round: RoundView; action: Action }) {
  return <section className="form-panel"><div className="form-body"><h3>{round.definition.format} · {round.definition.division} · submitted scorecards are read only</h3>
    {data.role !== 'organizer' && <details><summary>My private submitted notes</summary>{data.ballots.filter((b) => b.roundKey === round.key).flatMap((b) => Object.entries(b.cells).filter(([, c]) => c.note).map(([key, c]) => <p key={key}>{round.definition.subjects.find((s) => s.id === key.split(':')[1])?.number} · {round.definition.heats.flatMap((h) => h.songs).find((p) => p.id === key.split(':')[0])?.title}: {c.note}</p>))}</details>}
    {data.role === 'organizer' && data.status === 'active' && <Correction data={data} round={round} action={action} />}
  </div></section>;
}

export function StageReview({ data, action, managementExtra, selectedRoundId, showRound, setupRoute, navigate, openHeadAccess }: { data: LiveView; action: Action; managementExtra?: ReactNode; selectedRoundId?: string; showRound?: (id: string, page?: number) => void; setupRoute?: (roundId?: string, section?: string) => void; navigate?: (page: number) => void; openHeadAccess?: () => void }) {
  const reviewed = data.rounds.filter((r) => r.standings);
  const selected = data.rounds.find((r) => r.id === selectedRoundId);
  const selectedSetup = data.setup.rounds.find((r) => r.id === selectedRoundId);
  const pending = data.reviewRequests?.filter((q) => !q.appliedAt && !q.cancelledAt) ?? [];
  function openRequest(id: string) {
    const request = document.getElementById('review-request-' + id);
    for (let parent = request?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
    request?.scrollIntoView({block:'center'});request?.focus({preventScroll:true});
  }
  const organizer = data.role === 'organizer';
  if (organizer) return <OrganizerResults data={data} action={action} selected={selectedRoundId ?? ''} select={(id) => showRound?.(id, 2)} setupRoute={setupRoute} navigate={navigate} openHeadAccess={openHeadAccess} />;
  const management = <>{reviewed.map((round) => <SubmittedReview key={round.key} data={data} round={round} action={action} />)}{managementExtra && <fieldset className="shared-unframed" disabled={data.status !== 'active'}>{managementExtra}</fieldset>}<ReviewRequests data={data} action={action} embedded={organizer} /></>;
  return <div className="page-stack">
    {pending.length > 0 && <section className="review-attention" aria-label="Pending review duties"><h2>Pending requests · {pending.length}</h2>{pending.map((q) => {const round = data.rounds.find((r) => r.key === q.payload.roundKey), competition = data.setup.competitions.find((c) => c.id === (round?.definition.competitionId ?? q.payload.competitionId));return <div key={q.id}><p><strong>{competition ? competition.format + ' · ' + competition.division : 'Competition review'}{round ? ' · ' + round.definition.kind : ''}</strong> · {q.kind === 'correction' ? 'Recording error' : 'Withdrawal'} · {q.reason}</p><button className="quiet-button" onClick={() => openRequest(q.id)}>Review request · {competition?.division ?? 'event'}{round ? ' · ' + round.definition.kind : ''}</button></div>;})}<p>The organizer and head each approve the exact request. Scores remain unchanged until both approvals apply it.</p></section>}
    {organizer && selectedRoundId && <section className="review-context-status" role="status"><p>{!selected?.standings ? 'Results for this round become available after the whole stage concludes. Complete judging and all required submissions in Run.' : selected.standings.approved ? 'This competition and round have current head approval.' : 'These results are provisional. The assigned panel handles cutoff votes; the head judge reviews and approves this exact competition and round from their private link.'}</p><div className="shared-inline">{!selected?.standings && navigate && <button className="quiet-button" onClick={() => navigate(1)}>Go to Run</button>}{selected?.definition.kind === 'prelims' && selected.standings?.approved && navigate && <button className="primary-button" onClick={() => {const finals = data.setup.rounds.find((r) => r.prelimRoundId === selected.id); if(finals) showRound?.(finals.id, 1);else navigate(1);}}>Continue to Finals</button>}{selected?.definition.kind === 'finals' && selected.standings?.approved && navigate && <button className="primary-button" onClick={() => navigate(3)}>Review event to publish</button>}{selectedSetup && selectedSetup.kind === 'prelims' && selected?.standings && !selected.standings.approved && setupRoute && <button className="quiet-button" onClick={() => setupRoute(data.setup.rounds.find((r) => r.prelimRoundId === selected.id)?.id, 'Finalists & pairings')}>Review finalist count</button>}{selected?.standings && !selected.standings.approved && openHeadAccess && <button className="quiet-button" onClick={openHeadAccess}>Open head judge access</button>}</div></section>}
    {!reviewed.length && <p role="status">Stage review opens after every scheduled heat/division and required submission finishes. Judges cannot see one another’s marks during judging.</p>}
    <LiveResults data={data} action={action} selectedRoundId={organizer ? selectedRoundId : undefined} head={data.role === 'head'} roundControls={(round) => round.standings?.advancementTies?.map((tie) => <Vote key={`${round.key}/${round.standings!.fingerprint}/${tie.key}`} data={data} round={round} tie={tie} action={action} />)} />
    {organizer ? <SetupSection title="Amendments & withdrawals" caption="Manage results" count={data.reviewRequests?.filter((q) => !q.appliedAt && !q.cancelledAt).length ?? 0}><div className="form-body page-stack">{management}</div></SetupSection> : management}
  </div>;
}
