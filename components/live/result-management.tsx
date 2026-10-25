'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { LiveView, ReviewRequest, RoundView } from '@/lib/live/types';

import type { CorrectionFields, NewCorrectionDraft } from './new-correction-draft';

type Action = (input: Record<string, unknown>) => Promise<boolean>;
export function NewCorrection({ data, round, action, draft }: { data: LiveView; round?: RoundView; action: Action; draft: NewCorrectionDraft }) {
  const { target, generation, pending, discard } = draft;
  const current = target ? data.rounds.find((item) => item.key === target.key) : round;
  const retained = current?.standings ? current : target ?? current;
  const available = Boolean(current?.standings && data.status === 'active');
  if (!retained?.standings) return <p>Score corrections are available after the selected stage concludes.</p>;
  return <section aria-label="New correction draft">
    <h3>Correction · {retained.definition.format} · {retained.definition.division} · {retained.definition.kind}</h3>
    {target && <><p role="status">This draft stays with this round across Score, Results and Publish. Reloading or leaving this event ends the draft.</p><div className="shared-inline"><button className="quiet-button" disabled={pending} onClick={discard}>Discard correction draft</button>{round?.standings && round.key !== target.key && data.status === 'active' && <button className="quiet-button" disabled={pending} onClick={discard}>Discard draft and use selected round</button>}</div></>}
    {!available && <p role="status">This correction target is unavailable or read only. Your draft is retained. Discard it or explicitly choose an available round.</p>}
    <fieldset className="shared-unframed" disabled={!available || pending}><Correction key={`${data.eventId}/${retained.key}/${generation}`} data={data} round={retained} action={action} draft={draft} /></fieldset>
  </section>;
}

export function Correction({ data, round, action, revise, draft }: { data: LiveView; round: RoundView; action: Action; revise?: ReviewRequest; draft?: NewCorrectionDraft }) {
  const [localNotice, setLocalNotice] = useState('');
  const notice = draft?.notice ?? localNotice, setNotice = draft?.setNotice ?? setLocalNotice;
  const [localReason, setLocalReason] = useState(revise?.reason ?? '');
  const sourceHelpId = useId(), feedbackId = useId();
  const mounted = useRef(true);
  const pending = draft?.pending ?? false;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const subs = data.heatSubmissions?.filter((s) => s.roundKey === round.key && (data.role === 'organizer' || s.judgeId === data.judgeId)) ?? [];
  const [localSource, setLocalSource] = useState(revise?.payload.submissionId ?? subs[0]?.id ?? '');
  const source = draft?.fields?.source ?? localSource;
  const sub = subs.find((s) => s.id === source), heat = round.definition.heats.find((h) => h.id === sub?.heatId);
  const [localSong, setLocalSong] = useState(revise?.payload.changes?.[0]?.performanceId ?? heat?.songs[0]?.id ?? '');
  const [localSubject, setLocalSubject] = useState(revise?.payload.changes?.[0]?.subjectId ?? heat?.subjectIds[0] ?? '');
  const [localMark, setLocalMark] = useState(revise?.payload.changes?.[0]?.after ?? '');
  const [localIntended, setLocalIntended] = useState(revise?.payload.changes?.[1]?.subjectId ?? '');
  const values: CorrectionFields = draft?.fields ?? { source, songId: localSong, subjectId: localSubject, mark: localMark, intended: localIntended, reason: localReason };
  const { songId, subjectId, mark, intended, reason } = values;
  const setSong = (songId: string) => draft ? draft.change(round, values, { songId }) : setLocalSong(songId);
  const setSubject = (subjectId: string) => draft ? draft.change(round, values, { subjectId }) : setLocalSubject(subjectId);
  const setMark = (mark: CorrectionFields['mark']) => draft ? draft.change(round, values, { mark }) : setLocalMark(mark);
  const setIntended = (intended: string) => draft ? draft.change(round, values, { intended }) : setLocalIntended(intended);
  const setReason = (reason: string) => draft ? draft.change(round, values, { reason }) : setLocalReason(reason);
  function setSource(source: string) {
    const next = round.definition.heats.find((h) => h.id === subs.find((s) => s.id === source)?.heatId);
    const patch = { source, songId: next?.songs[0]?.id ?? '', subjectId: next?.subjectIds[0] ?? '', intended: '' };
    if (draft) draft.change(round, values, patch);
    else { setLocalSource(source); setLocalSong(patch.songId); setLocalSubject(patch.subjectId); setLocalIntended(''); }
  }
  const recorded = round.submittedMarks?.find((c) => c.judgeId === sub?.judgeId && c.performanceId === songId && c.subjectId === subjectId)?.mark ?? '';
  const targetMark = round.submittedMarks?.find((c) => c.judgeId === sub?.judgeId && c.performanceId === songId && c.subjectId === intended)?.mark ?? '';
  const label = (id: string) => { const s = round.definition.subjects.find((s) => s.id === id); return `#${s?.number} ${s?.primary} ${s?.secondary ?? ''}`; };
  async function request(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!sub || !heat) return;
    const f = new FormData(e.currentTarget);
    if (draft && (pending || data.status !== 'active' || !data.rounds.some((item) => item.key === round.key && item.standings))) return;
    if (intended === subjectId) { setNotice('Wrong and intended bibs must be distinct.'); return; }
    const changes = [{ performanceId: songId, subjectId, after: mark }, ...(intended ? [{ performanceId: songId, subjectId: intended, after: recorded }] : [])];
    const input = { action: 'request-correction', roundKey: round.key, heatId: sub.heatId, judgeId: sub.judgeId, submissionId: sub.id, changes, reason: String(f.get('reason')), ...(revise ? { reviewRequestId: revise.id } : {}) };
    if (draft) await draft.request(round, values, input, action);
    else if (await action(input) && mounted.current) setNotice('Correction requested. Neither approval alone changes a score.');
  }
  return <details><summary>{revise ? 'Revise this pending correction' : 'Request a score correction'}</summary><p>For a genuine recording error in submitted marks. Both organizer and head must approve this exact request. This does not unlock the ballot.</p>{notice && !draft && <p role="status">{notice}</p>}<form className="form-body" onSubmit={(e) => void request(e)}><label><span>Submitted heat / judge</span><select aria-label="Submitted heat / judge" value={sub ? source : ''} disabled={!subs.length} aria-invalid={!sub || undefined} aria-describedby={!sub ? sourceHelpId : undefined} onChange={(e) => setSource(e.target.value)}>{!sub && <option value="" disabled>{subs.length ? 'Choose a current submitted heat' : 'No submitted heats available'}</option>}{subs.map((s) => <option key={s.id} value={s.id}>{round.definition.heats.find((h) => h.id === s.heatId)?.name} · {round.definition.judges.find((j) => j.id === s.judgeId)?.name} · version {s.version}</option>)}</select></label>{heat ? <><label><span>Correction song</span><select name="song" aria-label="Correction song" value={songId} onChange={(e) => setSong(e.target.value)}>{heat.songs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label><span>Wrong or affected bib</span><select name="bib" aria-label="Wrong or affected bib" value={subjectId} onChange={(e) => setSubject(e.target.value)}>{round.definition.subjects.filter((s) => heat.subjectIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{label(s.id)}</option>)}</select></label><label><span>Corrected mark for affected bib</span><select name="mark" aria-label="Corrected mark for affected bib" value={mark} onChange={(e) => setMark(e.target.value as typeof mark)}><option value="">Blank</option>{['Yes', 'A1', 'A2', 'No'].map((m) => <option key={m}>{m}</option>)}</select></label>
    <details open={Boolean(revise?.payload.changes?.[1])}><summary>Mark entered against the wrong bib</summary><p>Identify the intended entry. The recorded mark transfers to that entry; the affected entry gets the corrected mark selected above.</p><label><span>Intended bib for mistaken-bib transfer (optional)</span><select name="intended" aria-label="Intended bib for mistaken-bib transfer (optional)" value={intended} onChange={(e) => setIntended(e.target.value)}><option value="">No transfer</option>{round.definition.subjects.filter((s) => heat.subjectIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{label(s.id)}</option>)}</select></label></details>
    <div className="correction-preview" aria-label="Correction preview"><strong>Requested change</strong><p>{label(subjectId)}: {recorded || 'Blank'} → {mark || 'Blank'}</p>{intended && <p>{label(intended)}: {targetMark || 'Blank'} → {recorded || 'Blank'}</p>}<p>Scores remain unchanged until both approvals apply this request.</p></div>
    <label><span>Correction reason</span><input name="reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{draft && notice && <p id={feedbackId} role="status">{notice}</p>}<button className="quiet-button" aria-describedby={draft && notice ? feedbackId : undefined} disabled={Boolean(draft && pending)}>{draft && pending ? 'Requesting correction…' : revise ? 'Submit revised correction' : 'Request correction'}</button></> : <p id={sourceHelpId} role="status">{source ? 'The selected submitted heat was replaced. Choose a current version above and review the correction again. Your draft reason is retained.' : subs.length ? 'Choose a current submitted heat above to review a correction.' : 'No submitted heat is available for a correction yet.'}</p>}{draft && !heat && reason && <p><strong>Draft reason:</strong> {reason}</p>}</form></details>;
}

export function ReviewRequests({ data, action, embedded = false, pendingOnly = false, onReviseWithdrawal }: { data: LiveView; action: Action; embedded?: boolean; pendingOnly?: boolean; onReviseWithdrawal?: (q: ReviewRequest) => void }) {
  const requests = [...(data.reviewRequests ?? [])].filter((q) => !pendingOnly || !q.appliedAt && !q.cancelledAt).sort((a, b) => Number(Boolean(a.appliedAt || a.cancelledAt)) - Number(Boolean(b.appliedAt || b.cancelledAt)));
  return <section className="form-panel"><div className="panel-heading">{embedded ? <h3>{pendingOnly ? 'Pending requests' : 'Request history'}</h3> : <h2>{pendingOnly ? 'Pending requests' : 'Amendments & withdrawals'}</h2>}</div><div className="form-body review-request-list">
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
          {data.role === 'organizer' && q.kind === 'withdrawal' && onReviseWithdrawal && <button className="quiet-button" disabled={data.status !== 'active'} onClick={() => onReviseWithdrawal(q)}>Revise withdrawal request</button>}
          {data.role === 'organizer' && <button className="quiet-button" disabled={data.status !== 'active'} onClick={() => void action({ action: 'cancel-request', reviewRequestId: q.id, requestVersion: q.version })}>Cancel request</button>}
        </div>}
        {q.payload.pairingPlan && <details><summary>Reviewed undanced pairings</summary>{q.payload.pairingPlan.map((plan) => <div key={plan.performanceId}><h4>{round?.definition.heats.flatMap((h) => h.songs).find((s) => s.id === plan.performanceId)?.title ?? 'Recorded song'}</h4>{plan.partners.map((pair, index) => <p key={index}>{pair.map((id) => { const s = round?.definition.subjects.find((s) => s.id === id); return s ? `#${s.number} ${s.primary}` : 'Recorded entrant'; }).join(' & ')}</p>)}</div>)}</details>}
        <details><summary>Request version &amp; approval record</summary><p>Request version {q.version} · requested by {q.requester}</p>{q.approvals.map((a) => <p key={a.role}>{a.role} · {a.participantId} · exact version {a.version} · {new Date(a.at).toLocaleString()}</p>)}</details>
        {pending && q.kind === 'correction' && data.role === 'organizer' && data.status === 'active' && round && <Correction key={`${q.id}/${q.version}`} data={data} round={round} action={action} revise={q} />}
      </article>;
    })}
  </div></section>;
}

