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
  return <section id="results-new-correction" aria-label="New correction draft">
    <h3 tabIndex={-1} style={{ scrollMarginBlock: 24 }}>Correction · {retained.definition.format} · {retained.definition.division} · {retained.definition.kind}</h3>
    {target && <p role="status">Draft ends on reload or leaving this event.</p>}
    {!available && <p role="status">This correction target is unavailable or read only. Your draft is retained. Discard it or explicitly choose an available round.</p>}
    <fieldset className="shared-unframed" disabled={!available || pending}><Correction key={`${data.eventId}/${retained.key}/${generation}`} data={data} round={retained} action={action} draft={draft} /></fieldset>
    {target && <div className="shared-inline"><button className="quiet-button" disabled={pending} onClick={discard}>Discard correction draft</button>{round?.standings && round.key !== target.key && data.status === 'active' && <small>Discard returns to the selected round.</small>}</div>}
  </section>;
}

export function Correction({ data, round, action, revise, draft }: { data: LiveView; round: RoundView; action: Action; revise?: ReviewRequest; draft?: NewCorrectionDraft }) {
  const [localNotice, setLocalNotice] = useState('');
  const [revisionAttempt, setRevisionAttempt] = useState<{ target: string; pending: boolean } | null>(null);
  const revisionOwner = useRef<{ target: string; owner: symbol } | null>(null);
  const revision = Boolean(revise && !draft);
  const [localReason, setLocalReason] = useState(revise?.reason ?? '');
  const sourceHelpId = useId(), feedbackId = useId();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function canEditRevision() { return !revision || mounted.current && latestRevision.current.target === revisionTarget && latestRevision.current.eligible && revisionOwner.current?.target !== revisionTarget; }
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
  const participant = data.role === 'organizer' ? data.setup.organizerParticipantId : data.setup.judges.find((judge) => judge.id === data.judgeId)?.participantId;
  const revisionContextKey = JSON.stringify([data.eventId, data.role, data.judgeId, participant, round.key, revise?.id, revise?.version, source, sub?.id, sub?.version]);
  const [revisionContext, setRevisionContext] = useState({ key: revisionContextKey, generation: 0 });
  const revisionGeneration = revisionContext.generation + Number(revisionContext.key !== revisionContextKey);
  // A returned target starts a new lifetime; old handlers cannot become current again.
  if (revision && revisionContext.key !== revisionContextKey) setRevisionContext({ key: revisionContextKey, generation: revisionGeneration });
  const revisionTarget = JSON.stringify([revisionContextKey, revisionGeneration]);
  const currentRequest = data.reviewRequests?.find((request) => request.id === revise?.id);
  const revisionEligible = revision && data.role === 'organizer' && data.status === 'active' && currentRequest?.version === revise?.version && !currentRequest?.appliedAt && !currentRequest?.cancelledAt;
  const latestRevision = useRef({ target: revisionTarget, eligible: revisionEligible });
  useEffect(() => { latestRevision.current = { target: revisionTarget, eligible: revisionEligible }; }, [revisionTarget, revisionEligible]);
  const attempt = revisionAttempt?.target === revisionTarget ? revisionAttempt : null;
  const revisionPending = Boolean(revisionEligible && attempt?.pending);
  const revisionNotice = revisionPending ? 'Submitting this revised correction. Its fields are held until the request finishes.' : attempt ? 'Revision is not confirmed in the current request yet. Check its status before trying again. Your edits are retained.' : '';
  const notice = draft?.notice ?? (revision ? revisionNotice || localNotice : localNotice), setNotice = draft?.setNotice ?? setLocalNotice;
  const pending = draft?.pending ?? revisionPending;
  const setSong = (songId: string) => { if (canEditRevision()) { if (draft) draft.change(round, values, { songId }); else setLocalSong(songId); } };
  const setSubject = (subjectId: string) => { if (canEditRevision()) { if (draft) draft.change(round, values, { subjectId }); else setLocalSubject(subjectId); } };
  const setMark = (mark: CorrectionFields['mark']) => { if (canEditRevision()) { if (draft) draft.change(round, values, { mark }); else setLocalMark(mark); } };
  const setIntended = (intended: string) => { if (canEditRevision()) { if (draft) draft.change(round, values, { intended }); else setLocalIntended(intended); } };
  const setReason = (reason: string) => { if (canEditRevision()) { if (draft) draft.change(round, values, { reason }); else setLocalReason(reason); } };
  function setSource(source: string) {
    if (!canEditRevision()) return;
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
    if (revision && !canEditRevision()) return;
    const f = new FormData(e.currentTarget);
    if (draft && (pending || data.status !== 'active' || !data.rounds.some((item) => item.key === round.key && item.standings))) return;
    if (intended === subjectId) { setNotice('Wrong and intended bibs must be distinct.'); return; }
    const changes = [{ performanceId: songId, subjectId, after: mark }, ...(intended ? [{ performanceId: songId, subjectId: intended, after: recorded }] : [])];
    const input = { action: 'request-correction', roundKey: round.key, heatId: sub.heatId, judgeId: sub.judgeId, submissionId: sub.id, changes, reason: String(f.get('reason')), ...(revise ? { reviewRequestId: revise.id } : {}) };
    if (draft) await draft.request(round, values, input, action);
    else if (revision) {
      const owner = Symbol();
      revisionOwner.current = { target: revisionTarget, owner };
      setLocalNotice(''); setRevisionAttempt({ target: revisionTarget, pending: true });
      try { await action(input); }
      catch { /* Only the current request establishes a saved revision. */ }
      finally {
        if (revisionOwner.current?.owner === owner) {
          revisionOwner.current = null;
          if (mounted.current && latestRevision.current.target === revisionTarget && latestRevision.current.eligible) setRevisionAttempt({ target: revisionTarget, pending: false });
        }
      }
    }
    else if (await action(input) && mounted.current) setNotice('Correction requested. Neither approval alone changes a score.');
  }
  return <details data-correction-editor={draft ? '' : undefined}><summary>{revise ? 'Revise this pending correction' : 'Request a score correction'}</summary><p>{draft ? 'Recording errors only. Organizer and head approval required.' : 'For a genuine recording error in submitted marks. Both organizer and head must approve this exact request. This does not unlock the ballot.'}</p>{notice && !draft && <p id={revision ? feedbackId : undefined} role="status">{notice}</p>}<form className="form-body" onSubmit={(e) => void request(e)}><label><span>Submitted heat / judge</span><select aria-label="Submitted heat / judge" value={sub ? source : ''} disabled={!subs.length || revision && (pending || !revisionEligible)} aria-invalid={!sub || undefined} aria-describedby={!sub ? sourceHelpId : undefined} onChange={(e) => setSource(e.target.value)}>{!sub && <option value="" disabled>{subs.length ? 'Choose a current submitted heat' : 'No submitted heats available'}</option>}{subs.map((s) => <option key={s.id} value={s.id}>{round.definition.heats.find((h) => h.id === s.heatId)?.name} · {round.definition.judges.find((j) => j.id === s.judgeId)?.name} · version {s.version}</option>)}</select></label>{heat ? <><label><span>Correction song</span><select disabled={revision ? pending || !revisionEligible : undefined} name="song" aria-label="Correction song" value={songId} onChange={(e) => setSong(e.target.value)}>{heat.songs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label><span>Wrong or affected bib</span><select disabled={revision ? pending || !revisionEligible : undefined} name="bib" aria-label="Wrong or affected bib" value={subjectId} onChange={(e) => setSubject(e.target.value)}>{round.definition.subjects.filter((s) => heat.subjectIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{label(s.id)}</option>)}</select></label><label><span>Corrected mark for affected bib</span><select disabled={revision ? pending || !revisionEligible : undefined} name="mark" aria-label="Corrected mark for affected bib" value={mark} onChange={(e) => setMark(e.target.value as typeof mark)}><option value="">Blank</option>{['Yes', 'A1', 'A2', 'No'].map((m) => <option key={m}>{m}</option>)}</select></label>
    <details data-correction-transfer={draft ? '' : undefined} open={Boolean(revise?.payload.changes?.[1]) || Boolean(draft && intended)}><summary>Mark entered against the wrong bib</summary><p>Identify the intended entry. The recorded mark transfers to that entry; the affected entry gets the corrected mark selected above.</p><label><span>Intended bib for mistaken-bib transfer (optional)</span><select disabled={revision ? pending || !revisionEligible : undefined} name="intended" aria-label="Intended bib for mistaken-bib transfer (optional)" value={intended} onChange={(e) => setIntended(e.target.value)}><option value="">No transfer</option>{round.definition.subjects.filter((s) => heat.subjectIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{label(s.id)}</option>)}</select></label></details>
    <div className="correction-preview" aria-label="Correction preview"><strong>Requested change</strong><p>{label(subjectId)}: {recorded || 'Blank'} → {mark || 'Blank'}</p>{intended && <p>{label(intended)}: {targetMark || 'Blank'} → {recorded || 'Blank'}</p>}<p>Scores remain unchanged until both approvals apply this request.</p></div>
    <label><span>Correction reason</span><input disabled={revision ? pending || !revisionEligible : undefined} name="reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{draft && notice && <p id={feedbackId} role="status">{notice}</p>}<button className="quiet-button" aria-busy={revision ? pending : undefined} aria-describedby={(draft || revision) && notice ? feedbackId : undefined} disabled={Boolean((draft || revision) && pending || revision && !revisionEligible)}>{revision && pending ? 'Submitting revised correction…' : draft && pending ? 'Requesting correction…' : revise ? 'Submit revised correction' : 'Request correction'}</button></> : <p id={sourceHelpId} role="status">{source ? 'The selected submitted heat was replaced. Choose a current version above and review the correction again. Your draft reason is retained.' : subs.length ? 'Choose a current submitted heat above to review a correction.' : 'No submitted heat is available for a correction yet.'}</p>}{draft && !heat && reason && <p><strong>Draft reason:</strong> {reason}</p>}</form>{draft && <details data-correction-help><summary>Correction rules &amp; draft recovery</summary><p>For a genuine recording error in submitted marks. Both organizer and head must approve this exact request. This does not unlock the ballot.</p><p>This draft stays with this round across Score, Results and Publish. Reloading or leaving this event ends the draft. Discarding it returns the editor to the selected round.</p></details>}</details>;
}

function RequestApproval({ data, request, target, action }: { data: LiveView; request: ReviewRequest; target: string; action: Action }) {
  const [attempt, setAttempt] = useState<{ pending: boolean } | null>(null);
  const pending = useRef<symbol | null>(null), alive = useRef(true);
  const approved = request.approvals.some((approval) => approval.role === data.role);
  const eligible = !approved && data.status === 'active' && !request.appliedAt && !request.cancelledAt && ['organizer', 'head'].includes(data.role);
  const latest = useRef({ target, eligible });
  useEffect(() => { latest.current = { target, eligible }; }, [target, eligible]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const statusId = useId();
  const waiting = attempt?.pending === true && !approved && data.status === 'active';
  const status = approved ? '' : data.status !== 'active' ? attempt ? 'This event is read only. Check the request’s current status.' : '' : waiting ? 'Approval is in progress for this exact request version.' : attempt ? 'Approval is not confirmed in the current request yet. Check its status before trying again.' : '';
  async function approve() {
    if (pending.current || !alive.current || latest.current.target !== target || !latest.current.eligible) return;
    const owner = Symbol(), input = { action: 'approve-request', reviewRequestId: request.id, requestVersion: request.version };
    pending.current = owner;
    let sent = false;
    try {
      if (!window.confirm(`Approve this exact version ${request.version}: ${request.reason}? Both distinct roles are required.`)) return;
      if (!alive.current || latest.current.target !== target || !latest.current.eligible) return;
      sent = true; setAttempt({ pending: true });
      await action(input);
    } catch { /* Only the authoritative request establishes approval or application. */ }
    finally {
      if (pending.current === owner) {
        pending.current = null;
        if (sent && alive.current) setAttempt({ pending: false });
      }
    }
  }
  return <><button className="quiet-button" disabled={!eligible || waiting} aria-busy={waiting} aria-describedby={status ? statusId : undefined} onClick={() => void approve()}>{waiting ? 'Approving request…' : `Approve request as ${data.role}`}</button>{status && <p id={statusId} role="status">{status}</p>}</>;
}

function RequestCancellation({ data, request, target, action }: { data: LiveView; request: ReviewRequest; target: string; action: Action }) {
  const [attempt, setAttempt] = useState<{ pending: boolean } | null>(null);
  const pending = useRef<symbol | null>(null), alive = useRef(true);
  const resolved = Boolean(request.cancelledAt || request.appliedAt);
  const eligible = data.role === 'organizer' && data.status === 'active' && !resolved;
  const latest = useRef({ target, eligible });
  useEffect(() => { latest.current = { target, eligible }; }, [target, eligible]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const statusId = useId();
  const waiting = attempt?.pending === true && !resolved && data.status === 'active';
  const status = resolved ? '' : data.status !== 'active' ? attempt ? 'This event is read only. Check the request’s current status.' : '' : waiting ? 'Cancellation is in progress for this exact request version.' : attempt ? 'Cancellation is not confirmed in the current request yet. Check its status before trying again.' : '';
  async function cancel() {
    if (pending.current || !alive.current || latest.current.target !== target || !latest.current.eligible) return;
    const owner = Symbol(), input = { action: 'cancel-request', reviewRequestId: request.id, requestVersion: request.version };
    pending.current = owner; setAttempt({ pending: true });
    try { await action(input); }
    catch { /* Current request data, not the callback result, establishes cancellation. */ }
    finally {
      if (pending.current === owner) {
        pending.current = null;
        if (alive.current) setAttempt({ pending: false });
      }
    }
  }
  return <><button className="quiet-button" disabled={!eligible || waiting} aria-busy={waiting} aria-describedby={status ? statusId : undefined} onClick={() => void cancel()}>{waiting ? 'Cancelling request…' : 'Cancel request'}</button>{status && <p id={statusId} role="status">{status}</p>}</>;
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
      const participantId = data.role === 'organizer' ? data.setup.organizerParticipantId : data.setup.judges.find((judge) => judge.id === data.judgeId)?.participantId;
      const approvalTarget = JSON.stringify([data.eventId, data.role, data.judgeId, participantId, q.id, q.version]);
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
          <RequestApproval key={approvalTarget} data={data} request={q} target={approvalTarget} action={action} />
          {data.role === 'organizer' && q.kind === 'withdrawal' && onReviseWithdrawal && <button className="quiet-button" disabled={data.status !== 'active'} onClick={() => onReviseWithdrawal(q)}>Revise withdrawal request</button>}
          {data.role === 'organizer' && <RequestCancellation key={'cancel/' + approvalTarget} data={data} request={q} target={approvalTarget} action={action} />}
        </div>}
        {q.payload.pairingPlan && <details><summary>Reviewed undanced pairings</summary>{q.payload.pairingPlan.map((plan) => <div key={plan.performanceId}><h4>{round?.definition.heats.flatMap((h) => h.songs).find((s) => s.id === plan.performanceId)?.title ?? 'Recorded song'}</h4>{plan.partners.map((pair, index) => <p key={index}>{pair.map((id) => { const s = round?.definition.subjects.find((s) => s.id === id); return s ? `#${s.number} ${s.primary}` : 'Recorded entrant'; }).join(' & ')}</p>)}</div>)}</details>}
        <details><summary>Request version &amp; approval record</summary><p>Request version {q.version} · requested by {q.requester}</p>{q.approvals.map((a) => <p key={a.role}>{a.role} · {a.participantId} · exact version {a.version} · {new Date(a.at).toLocaleString()}</p>)}</details>
        {pending && q.kind === 'correction' && data.role === 'organizer' && data.status === 'active' && round && <Correction key={`${q.id}/${q.version}`} data={data} round={round} action={action} revise={q} />}
      </article>;
    })}
  </div></section>;
}

