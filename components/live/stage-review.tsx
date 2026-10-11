'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import type { AdvancementTie, LiveView, ReviewRequest, RoundView } from '@/lib/live/types';
import { LiveResults } from './results';
import SetupSection from './setup-section';

type Action = (input: Record<string, unknown>) => Promise<boolean>;
function Vote({ data, round, tie, action }: { data: LiveView; round: RoundView; tie: AdvancementTie; action: Action }) {
  const [selected, setSelected] = useState<string[]>([]);
  const ownVote = tie.votes.find((v) => v.judgeId === data.judgeId);
  const voted = Boolean(ownVote);
  return <fieldset className="tie-editor"><legend>{round.definition.division} · {tie.group} advancement tie</legend><p>Choose exactly {tie.slots} of these tied entrants. {tie.votes.length} / {round.definition.judgeIds.length} panel votes received. Marks and numeric averages stay unchanged.</p>{tie.subjectIds.map((id) => { const s = round.definition.subjects.find((s) => s.id === id)!; return <label className="check-label" key={id}><input type="checkbox" checked={(ownVote?.selected ?? selected).includes(id)} disabled={voted || data.role === 'organizer' || data.status !== 'active'} onChange={(e) => setSelected(e.target.checked ? [...selected, id] : selected.filter((x) => x !== id))} />#{s.number} {s.primary}</label>; })}{data.role !== 'organizer' && round.definition.judgeIds.includes(data.judgeId!) && <button className="primary-button" disabled={voted || selected.length !== tie.slots || round.phase !== 'discussion' || data.status !== 'active'} onClick={() => void action({ action: 'vote', roundKey: round.key, roundVersion: round.version, fingerprint: round.standings!.fingerprint, tieKey: tie.key, selected })}>{voted ? 'Vote finalized' : 'Submit advancement vote'}</button>}<p>{tie.complete ? `Advancing: ${tie.selected.map((id) => '#' + round.definition.subjects.find((s) => s.id === id)!.number).join(', ')}` : tie.deadlocked ? 'Full panel is tied. The head judge must resolve the remaining vote tie.' : 'Every assigned judge, including the head, must vote.'}</p></fieldset>;
}

function Correction({ data, round, action, revise }: { data: LiveView; round: RoundView; action: Action; revise?: ReviewRequest }) {
  const [notice, setNotice] = useState('');
  const subs = data.heatSubmissions?.filter((s) => s.roundKey === round.key && (data.role === 'organizer' || s.judgeId === data.judgeId)) ?? [];
  const [source, setSource] = useState(revise?.payload.submissionId ?? subs[0]?.id ?? '');
  const sub = subs.find((s) => s.id === source), heat = round.definition.heats.find((h) => h.id === sub?.heatId);
  async function request(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!sub || !heat) return;
    const f = new FormData(e.currentTarget), performanceId = String(f.get('song')), subjectId = String(f.get('bib'));
    const recorded = round.submittedMarks?.find((c) => c.judgeId === sub.judgeId && c.performanceId === performanceId && c.subjectId === subjectId)?.mark ?? '';
    const intended = String(f.get('intended') ?? '');
    if (intended === subjectId) { setNotice('Wrong and intended bibs must be distinct.'); return; }
    const changes = [{ performanceId, subjectId, after: String(f.get('mark')) }, ...(intended ? [{ performanceId, subjectId: intended, after: recorded }] : [])];
    const ok = await action({ action: 'request-correction', roundKey: round.key, heatId: sub.heatId, judgeId: sub.judgeId, submissionId: sub.id, changes, reason: String(f.get('reason')), ...(revise ? { reviewRequestId: revise.id } : {}) });
    if (ok) setNotice('Correction requested. Neither approval alone changes a score.');
  }
  return <details><summary>{revise ? 'Revise this pending correction' : 'Request a genuine recording-error correction'}</summary><p>Identify the exact original observation and reason. Both distinct roles must approve this version. A mistaken-bib transfer identifies both entries; clear or correct the wrong cell and select the intended bib.</p>{notice && <p role="status">{notice}</p>}<form className="form-body" onSubmit={(e) => void request(e)}><label><span>Submitted heat / judge</span><select aria-label="Submitted heat / judge" value={source} onChange={(e) => setSource(e.target.value)}>{subs.map((s) => <option key={s.id} value={s.id}>{round.definition.heats.find((h) => h.id === s.heatId)?.name} · {round.definition.judges.find((j) => j.id === s.judgeId)?.name} · version {s.version}</option>)}</select></label>{heat && <><label><span>Correction song</span><select name="song" aria-label="Correction song" defaultValue={revise?.payload.changes?.[0]?.performanceId}>{heat.songs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label><span>Wrong or affected bib</span><select name="bib" aria-label="Wrong or affected bib" defaultValue={revise?.payload.changes?.[0]?.subjectId}>{round.definition.subjects.filter((s) => heat.subjectIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>#{s.number} {s.primary}</option>)}</select></label><label><span>Corrected mark for affected bib</span><select name="mark" aria-label="Corrected mark for affected bib" defaultValue={revise?.payload.changes?.[0]?.after}><option value="">Blank</option>{['Yes', 'A1', 'A2', 'No'].map((m) => <option key={m}>{m}</option>)}</select></label><label><span>Intended bib for mistaken-bib transfer (optional)</span><select name="intended" aria-label="Intended bib for mistaken-bib transfer (optional)" defaultValue={revise?.payload.changes?.[1]?.subjectId}><option value="">No transfer</option>{round.definition.subjects.filter((s) => heat.subjectIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>#{s.number} {s.primary}</option>)}</select></label><label><span>Correction reason</span><input name="reason" required maxLength={500} defaultValue={revise?.reason} /></label><button className="quiet-button">{revise ? 'Submit revised correction' : 'Request correction'}</button></>}</form></details>;
}

export function ReviewRequests({ data, action, embedded = false }: { data: LiveView; action: Action; embedded?: boolean }) {
  const requests = [...(data.reviewRequests ?? [])].sort((a, b) => Number(Boolean(a.appliedAt || a.cancelledAt)) - Number(Boolean(b.appliedAt || b.cancelledAt)));
  return <section className="form-panel"><div className="panel-heading">{embedded ? <h3>Request history</h3> : <h2>Amendments &amp; withdrawals</h2>}</div><div className="form-body review-request-list">
    {!requests.length && <p>No review requests.</p>}
    {requests.map((q) => {
      const round = data.rounds.find((r) => r.key === q.payload.roundKey);
      const subject = round?.definition.subjects.find((s) => s.id === q.payload.subjectId);
      const competition = data.setup.competitions.find((c) => c.id === (round?.definition.competitionId ?? q.payload.competitionId));
      const pending = !q.appliedAt && !q.cancelledAt;
      const approvedByRole = q.approvals.some((a) => a.role === data.role);
      const status = q.cancelledAt ? 'Cancelled; records retained' : q.appliedAt ? 'Applied with both distinct role approvals; affected results require renewed review.' : `${q.approvals.length} / 2 approvals · scores unchanged`;
      return <article className={`review-request${pending ? ' is-pending' : ''}`} id={`review-request-${q.id}`} tabIndex={-1} key={`${q.id}/${q.version}`}>
        <p className="review-step-label">{competition ? `${competition.format} · ${competition.division}` : 'Competition review'}{round ? ` · ${round.definition.kind}` : ''}</p>
        <h3>{q.kind === 'correction' ? 'Recording error' : q.payload.subjectId ? 'Entrant/couple withdrawal' : 'Competition withdrawal'}</h3>
        <p>{q.reason}</p>
        {subject && <p><strong>#{subject.number} {subject.primary}{subject.secondary ? ` & ${subject.secondary}` : ''}</strong></p>}
        {q.payload.changes?.map((c) => {
          const entrant = round?.definition.subjects.find((s) => s.id === c.subjectId);
          const song = round?.definition.heats.flatMap((h) => h.songs).find((p) => p.id === c.performanceId);
          return <p className="review-change" key={`${c.performanceId}/${c.subjectId}`}><strong>#{entrant?.number ?? c.subjectId} {entrant?.primary}{entrant?.secondary ? ` & ${entrant.secondary}` : ''}</strong><span>{song?.title ?? c.performanceId}: original {c.before || 'Blank'} → corrected {c.after || 'Blank'}</span></p>;
        })}
        <p className="review-request-status" role="status">{status}</p>
        {pending && <p>{q.approvals.length ? `Waiting for ${q.approvals.some((a) => a.role === 'head') ? 'the organizer' : 'the head judge'} to approve this same version.` : 'The organizer and head judge each review and approve this request.'}</p>}
        {pending && ['organizer', 'head'].includes(data.role) && <div className="shared-inline">
          <button className="quiet-button" disabled={approvedByRole || data.status !== 'active'} onClick={() => { if (window.confirm(`Approve this exact version ${q.version}: ${q.reason}? Both distinct roles are required.`)) void action({ action: 'approve-request', reviewRequestId: q.id, requestVersion: q.version }); }}>Approve request as {data.role}</button>
          {data.role === 'organizer' && <button className="quiet-button" disabled={data.status !== 'active'} onClick={() => void action({ action: 'cancel-request', reviewRequestId: q.id, requestVersion: q.version })}>Cancel request</button>}
        </div>}
        {q.payload.pairingPlan && <details><summary>Reviewed undanced pairings</summary><pre className="shared-json">{JSON.stringify(q.payload.pairingPlan, null, 2)}</pre></details>}
        <details><summary>Request version &amp; approval record</summary><p>Request version {q.version} · requested by {q.requester}</p>{q.approvals.map((a) => <p key={a.role}>{a.role} · {a.participantId} · exact version {a.version} · {new Date(a.at).toLocaleString()}</p>)}</details>
        {pending && q.kind === 'correction' && data.role === 'organizer' && data.status === 'active' && round && <Correction key={`${q.id}/${q.version}`} data={data} round={round} action={action} revise={q} />}
      </article>;
    })}
  </div></section>;
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
  const management = <>{reviewed.map((round) => <SubmittedReview key={round.key} data={data} round={round} action={action} />)}{managementExtra && <fieldset className="shared-unframed" disabled={data.status !== 'active'}>{managementExtra}</fieldset>}<ReviewRequests data={data} action={action} embedded={organizer} /></>;
  return <div className="page-stack">
    {pending.length > 0 && <section className="review-attention" aria-label="Pending review duties"><h2>Pending requests · {pending.length}</h2>{pending.map((q) => {const round = data.rounds.find((r) => r.key === q.payload.roundKey), competition = data.setup.competitions.find((c) => c.id === (round?.definition.competitionId ?? q.payload.competitionId));return <div key={q.id}><p><strong>{competition ? competition.format + ' · ' + competition.division : 'Competition review'}{round ? ' · ' + round.definition.kind : ''}</strong> · {q.kind === 'correction' ? 'Recording error' : 'Withdrawal'} · {q.reason}</p><button className="quiet-button" onClick={() => openRequest(q.id)}>Review request · {competition?.division ?? 'event'}{round ? ' · ' + round.definition.kind : ''}</button></div>;})}<p>The organizer and head each approve the exact request. Scores remain unchanged until both approvals apply it.</p></section>}
    {organizer && selectedRoundId && <section className="review-context-status" role="status"><p>{!selected?.standings ? 'Results for this round become available after the whole stage concludes. Complete judging and all required submissions in Run.' : selected.standings.approved ? 'This competition and round have current head approval.' : 'These results are provisional. The assigned panel handles cutoff votes; the head judge reviews and approves this exact competition and round from their private link.'}</p><div className="shared-inline">{!selected?.standings && navigate && <button className="quiet-button" onClick={() => navigate(1)}>Go to Run</button>}{selected?.definition.kind === 'prelims' && selected.standings?.approved && navigate && <button className="primary-button" onClick={() => {const finals = data.setup.rounds.find((r) => r.prelimRoundId === selected.id); if(finals) showRound?.(finals.id, 1);else navigate(1);}}>Continue to Finals</button>}{selected?.definition.kind === 'finals' && selected.standings?.approved && navigate && <button className="primary-button" onClick={() => navigate(3)}>Review event to publish</button>}{selectedSetup && selectedSetup.kind === 'prelims' && selected?.standings && !selected.standings.approved && setupRoute && <button className="quiet-button" onClick={() => setupRoute(data.setup.rounds.find((r) => r.prelimRoundId === selected.id)?.id, 'Finalists & pairings')}>Review finalist count</button>}{selected?.standings && !selected.standings.approved && openHeadAccess && <button className="quiet-button" onClick={openHeadAccess}>Open head judge access</button>}</div></section>}
    {!reviewed.length && <p role="status">Stage review opens after every scheduled heat/division and required submission finishes. Other judges’ scores stay private during judging.</p>}
    <LiveResults data={data} action={action} selectedRoundId={organizer ? selectedRoundId : undefined} head={data.role === 'head'} roundControls={(round) => round.standings?.advancementTies?.map((tie) => <Vote key={`${round.key}/${round.standings!.fingerprint}/${tie.key}`} data={data} round={round} tie={tie} action={action} />)} />
    {organizer ? <SetupSection title="Amendments & withdrawals" caption="Manage results" count={data.reviewRequests?.filter((q) => !q.appliedAt && !q.cancelledAt).length ?? 0}><div className="form-body page-stack">{management}</div></SetupSection> : management}
  </div>;
}
