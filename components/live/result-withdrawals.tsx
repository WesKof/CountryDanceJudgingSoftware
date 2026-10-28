'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { LiveView, ReviewRequest, RoundView } from '@/lib/live/types';
import { validatePairingPlan } from '@/lib/live/eligibility';
import SetupSection from './setup-section';
import { revealResult } from './result-details';

export default function ResultWithdrawals({ data, action, selected, revision }: { data: LiveView; action: (input: Record<string, unknown>) => Promise<boolean>; selected: string; revision?: ReviewRequest }) {
  const [chosenRound, setRound] = useState<string | null>(null), [subject, setSubject] = useState(''), [reason, setReason] = useState(''), [reviseId, setRevise] = useState('');
  const [loadedRevision, setLoadedRevision] = useState<{ id: string; version: number; generation: number }>({ id: '', version: 0, generation: 0 });
  const [attempt, setAttempt] = useState<{ target: string; pending: boolean; notice?: string } | null>(null);
  const owner = useRef<{ target: string; token: symbol } | null>(null), mounted = useRef(true);
  const feedbackId = useId(), revisionHelpId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [plans, setPlans] = useState<Record<string, [string, string][]>>({});
  const [retainedRound, setRetainedRound] = useState<RoundView>();
  const [chosenCompetition, setCompetition] = useState<string | null>(null), [competitionReason, setCompetitionReason] = useState(''), [competitionRevision, setCompetitionRevision] = useState('');
  const [retainedCompetition, setRetainedCompetition] = useState<LiveView['setup']['competitions'][number]>();
  const pending = (data.reviewRequests ?? []).filter((q) => q.kind === 'withdrawal' && !q.appliedAt && !q.cancelledAt);
  const r = chosenRound ? data.rounds.find((r) => r.key === chosenRound) : data.rounds.find((r) => r.id === selected) ?? data.rounds[0];
  const draftRound = r ?? retainedRound;
  useEffect(() => { if (chosenRound && r) queueMicrotask(() => setRetainedRound(r)); }, [chosenRound, r]);
  const eligible = r?.definition.subjects.filter((s) => !r.definition.withdrawnIds?.includes(s.id)) ?? [];
  const subjectId = subject || eligible[0]?.id || '';
  const subjectAvailable = eligible.some((s) => s.id === subjectId);
  const retainedSubject = draftRound?.definition.subjects.find((s) => s.id === subjectId);
  const currentRevision = pending.find((q) => q.id === reviseId && q.payload.subjectId);
  const revisionAvailable = !reviseId || Boolean(currentRevision);
  const entrantCompetitionAvailable = Boolean(r && data.setup.competitions.some((c) => c.id === r.definition.competitionId));
  const participant = data.role === 'organizer' ? data.setup.organizerParticipantId : data.setup.judges.find((judge) => judge.id === data.judgeId)?.participantId;
  const contextKey = JSON.stringify([data.eventId, data.status, data.role, data.judgeId, participant, chosenRound ?? r?.key, subjectId, reviseId, loadedRevision.generation, currentRevision?.version, Boolean(r), subjectAvailable, entrantCompetitionAvailable, r?.definition.withdrawnIds, r?.definition.heats, [...data.context.visited].sort()]);
  const [entrantContext, setEntrantContext] = useState({ key: contextKey, generation: 0 });
  const generation = entrantContext.generation + Number(entrantContext.key !== contextKey);
  if (entrantContext.key !== contextKey) setEntrantContext({ key: contextKey, generation });
  const target = JSON.stringify([contextKey, generation]);
  const canSubmit = data.role === 'organizer' && data.status === 'active' && Boolean(r) && subjectAvailable && entrantCompetitionAvailable && revisionAvailable;
  const latest = useRef({ target, editable: data.role === 'organizer' && data.status === 'active', canSubmit });
  useEffect(() => { latest.current = { target, editable: data.role === 'organizer' && data.status === 'active', canSubmit }; }, [target, canSubmit, data.role, data.status]);
  const currentAttempt = attempt?.target === target ? attempt : null;
  const waiting = Boolean(currentAttempt?.pending && canSubmit);
  const notice = waiting ? 'Sending withdrawal request. Your draft is kept.' : currentAttempt?.notice ?? '';
  function canEditEntrant() { return mounted.current && latest.current.target === target && latest.current.editable && owner.current?.target !== target; }
  function retainTarget() { if (!canEditEntrant()) return; if (!subject) setSubject(subjectId); if (r) { setRetainedRound(r); if (!chosenRound) setRound(r.key); } }
  const competitionId = chosenCompetition ?? draftRound?.definition.competitionId ?? '';
  const competitions = data.setup.competitions.filter((c) => data.rounds.some((r) => r.definition.competitionId === c.id));
  const competition = competitions.find((c) => c.id === competitionId), competitionAvailable = Boolean(competition);
  const competitionName = competition ?? retainedCompetition;
  const competitionLabel = competitionName ? competitionName.format + ' · ' + competitionName.division : 'Selected competition';
  const [loadedCompetitionRevision, setLoadedCompetitionRevision] = useState({ id: '', version: 0, generation: 0 });
  const [competitionAttempt, setCompetitionAttempt] = useState<{ target: string; pending: boolean } | null>(null);
  const competitionOwner = useRef<{ target: string; token: symbol } | null>(null);
  const competitionFeedbackId = useId(), competitionRevisionHelpId = useId();
  const currentCompetitionRevision = pending.find((q) => q.id === competitionRevision && !q.payload.subjectId);
  const competitionRevisionAvailable = !competitionRevision || Boolean(currentCompetitionRevision);
  const competitionContextKey = JSON.stringify([data.eventId, data.status, data.role, data.judgeId, participant, competitionId, competitionLabel, competitionAvailable, data.rounds.filter((round) => round.definition.competitionId === competitionId).map((round) => round.key).sort(), competitionRevision, currentCompetitionRevision?.version, loadedCompetitionRevision.generation]);
  const [competitionContext, setCompetitionContext] = useState({ key: competitionContextKey, generation: 0 });
  const competitionGeneration = competitionContext.generation + Number(competitionContext.key !== competitionContextKey);
  if (competitionContext.key !== competitionContextKey) setCompetitionContext({ key: competitionContextKey, generation: competitionGeneration });
  const competitionTarget = JSON.stringify([competitionContextKey, competitionGeneration]);
  const canSubmitCompetition = data.role === 'organizer' && data.status === 'active' && competitionAvailable && competitionRevisionAvailable;
  const latestCompetition = useRef({ target: competitionTarget, editable: data.role === 'organizer' && data.status === 'active', canSubmit: canSubmitCompetition });
  useEffect(() => { latestCompetition.current = { target: competitionTarget, editable: data.role === 'organizer' && data.status === 'active', canSubmit: canSubmitCompetition }; }, [competitionTarget, canSubmitCompetition, data.role, data.status]);
  const currentCompetitionAttempt = competitionAttempt?.target === competitionTarget ? competitionAttempt : null;
  const competitionWaiting = Boolean(currentCompetitionAttempt?.pending && canSubmitCompetition);
  const competitionNotice = competitionWaiting ? 'Sending competition withdrawal. Your draft is kept.' : currentCompetitionAttempt ? 'Request not confirmed. Check Pending requests before retrying. Your draft is kept.' : '';
  function canEditCompetition() { return mounted.current && latestCompetition.current.target === competitionTarget && latestCompetition.current.editable && competitionOwner.current?.target !== competitionTarget; }
  function retainCompetitionTarget() { if (!canEditCompetition()) return; if (chosenCompetition === null) setCompetition(competitionId); if (competition) setRetainedCompetition(competition); }
  useEffect(() => { if (chosenCompetition && competition) queueMicrotask(() => setRetainedCompetition(competition)); }, [chosenCompetition, competition]);
  function loadRevision(q?: ReviewRequest, external = false) {
    if ((!q || q.payload.subjectId) && (!mounted.current || !external && !canEditEntrant())) return;
    if (!q) { setRevise(''); setLoadedRevision((old) => ({ id: '', version: 0, generation: old.generation + 1 })); return; }
    if (q.payload.subjectId) {
      setRound(q.payload.roundKey!); setSubject(q.payload.subjectId); setReason(q.reason); setRevise(q.id);
      setLoadedRevision((old) => ({ id: q.id, version: q.version, generation: old.generation + 1 }));
      setPlans(Object.fromEntries((q.payload.pairingPlan ?? []).map((p) => [p.performanceId, p.partners])));
      revealResult('results-entrant-withdrawal');
    } else { if (!mounted.current) return; setCompetition(q.payload.competitionId!); setCompetitionReason(q.reason); setCompetitionRevision(q.id); setLoadedCompetitionRevision((old) => ({ id: q.id, version: q.version, generation: old.generation + 1 })); revealResult('results-competition-withdrawal'); }
  }
  const revisionLoader = useRef({ revision, load: loadRevision });
  useEffect(() => { revisionLoader.current = { revision, load: loadRevision }; });
  useEffect(() => { if (revision) queueMicrotask(() => { if (revisionLoader.current.revision === revision) revisionLoader.current.load(revision, true); }); }, [revision]);
  const undanced = draftRound?.definition.format === 'Jack & Jill' && draftRound.definition.kind === 'prelims' ? draftRound.definition.heats.flatMap((h) => h.songs.filter((s) => !data.context.visited.includes(s.id)).map((song) => ({ heat: h, song }))) : [];
  function setPair(songId: string, pairs: [string, string][]) { if (!canEditEntrant()) return; retainTarget(); setPlans((current) => ({ ...current, [songId]: pairs })); }
  async function request(e: FormEvent) {
    e.preventDefault(); if (!r || !canSubmit || !canEditEntrant() || !latest.current.canSubmit) return;
    retainTarget();
    const token = Symbol(); owner.current = { target, token }; setAttempt({ target, pending: true });
    let sent = false, validationNotice = '';
    try {
      const plan = undanced.map(({ song }) => ({ performanceId: song.id, partners: plans[song.id] ?? song.partners }));
      validatePairingPlan(r.definition, subjectId, data.context, plan);
      const input = { action: 'request-withdrawal', roundKey: r.key, competitionId: r.definition.competitionId, subjectId, reason, pairingPlan: plan, ...(reviseId ? { reviewRequestId: reviseId } : {}) };
      sent = true; await action(input);
    } catch (error) { if (!sent) validationNotice = (error as Error).message; }
    finally {
      if (owner.current?.token === token) {
        owner.current = null;
        if (mounted.current && latest.current.target === target && latest.current.canSubmit) setAttempt({ target, pending: false, notice: sent ? 'Request not confirmed. Check Pending requests before retrying. Your draft and revision choice are kept.' : validationNotice });
      }
    }
  }
  async function requestCompetition(e: FormEvent) {
    e.preventDefault(); if (!canSubmitCompetition || !canEditCompetition() || !latestCompetition.current.canSubmit) return;
    retainCompetitionTarget();
    const token = Symbol(), input = { action: 'request-withdrawal', competitionId, reason: competitionReason, ...(competitionRevision ? { reviewRequestId: competitionRevision } : {}) };
    competitionOwner.current = { target: competitionTarget, token };
    let sent = false;
    try {
      if (!window.confirm(`Request withdrawal of the entire competition “${competitionLabel}”? Both roles must approve. Scores and history remain.`)) return;
      if (!mounted.current || latestCompetition.current.target !== competitionTarget || !latestCompetition.current.canSubmit) return;
      sent = true; setCompetitionAttempt({ target: competitionTarget, pending: true });
      await action(input);
    } catch { /* Only current requests establish a saved withdrawal. */ }
    finally {
      if (competitionOwner.current?.token === token) {
        competitionOwner.current = null;
        if (sent && mounted.current && latestCompetition.current.target === competitionTarget && latestCompetition.current.canSubmit) setCompetitionAttempt({ target: competitionTarget, pending: false });
      }
    }
  }
  return <fieldset className="shared-unframed page-stack" disabled={data.status !== 'active'} id="results-withdrawals">
    <SetupSection title="Withdraw a started entrant/couple" caption="Request a withdrawal" detailsRef={(n) => { if (n) n.id = 'results-entrant-withdrawal'; }}><div className="form-body"><p>Fixed partners withdraw together. Recorded marks and history remain. Both organizer and head must approve the same request; affected results may need renewed approval.</p>{notice && <p id={feedbackId} role="status">{notice}</p>}{!revisionAvailable ? <p id={revisionHelpId} role="status">This revision is no longer pending. Choose New request or another pending withdrawal. Your draft is kept.</p> : reviseId && loadedRevision.id === reviseId && currentRevision && currentRevision.version !== loadedRevision.version ? <p id={revisionHelpId} role="status">Request now version {currentRevision.version}. Your draft is kept; review it before revising.</p> : !entrantCompetitionAvailable && r ? <p id={revisionHelpId} role="status">This competition is unavailable. Choose an available withdrawal round. Your draft is kept.</p> : null}<form className="form-body" onFocusCapture={retainTarget} onSubmit={(e) => void request(e)}><fieldset className="shared-unframed" disabled={waiting}>
      <label>Withdrawal round<select value={r?.key ?? chosenRound ?? ''} aria-describedby={!r ? 'withdrawal-target-help' : undefined} onChange={(e) => { if (!canEditEntrant()) return; setRound(e.target.value); setRetainedRound(data.rounds.find((r) => r.key === e.target.value)); setSubject(''); setPlans({}); setRevise(''); }}>{chosenRound && !r && <option value={chosenRound} disabled>{retainedRound ? retainedRound.definition.format + ' · ' + retainedRound.definition.division + ' · ' + retainedRound.definition.kind : 'Selected round'} · Unavailable</option>}{data.rounds.map((r) => <option key={r.key} value={r.key}>{r.definition.format} · {r.definition.division} · {r.definition.kind}</option>)}</select></label>
      <label>Withdrawal entrant/couple<select name="subject" value={subjectId} aria-describedby={!subjectAvailable ? 'withdrawal-target-help' : undefined} onChange={(e) => { if (!canEditEntrant()) return; retainTarget(); setSubject(e.target.value); }}>{!subjectAvailable && <option value={subjectId} disabled>{retainedSubject ? `#${retainedSubject.number} ${retainedSubject.primary} ${retainedSubject.secondary}` : 'Selected entrant'} · Unavailable</option>}{eligible.map((s) => <option key={s.id} value={s.id}>#{s.number} {s.primary} {s.secondary}</option>)}</select></label>
      {!subjectAvailable && <p id="withdrawal-target-help" role="status">{!r ? 'The selected round is no longer available. Choose an available round, then an eligible entrant.' : eligible.length ? (retainedSubject ? 'Bib #' + retainedSubject.number + ' is no longer eligible. Choose an eligible entrant.' : 'This entrant is no longer eligible. Choose an eligible entrant.') : 'No eligible entrants remain in this round. Choose another available round.'} Your reason and pairings are kept.</p>}<label>Withdrawal reason<input required maxLength={500} value={reason} onChange={(e) => { if (!canEditEntrant()) return; retainTarget(); setReason(e.target.value); }} /></label>
      <details><summary>Revise a pending withdrawal</summary><label>Revise pending withdrawal (optional)<select aria-label="Revise pending withdrawal (optional)" value={reviseId} aria-describedby={!revisionAvailable || currentRevision && loadedRevision.id === reviseId && currentRevision.version !== loadedRevision.version ? revisionHelpId : undefined} onChange={(e) => loadRevision(pending.find((q) => q.id === e.target.value))}><option value="">New request</option>{!revisionAvailable && <option value={reviseId} disabled>Selected withdrawal revision · Unavailable</option>}{pending.filter((q) => q.payload.subjectId).map((q) => <option key={q.id} value={q.id}>Request version {q.version}: {q.reason}</option>)}</select></label><p>Both roles must approve the revised version again.</p></details>
      {undanced.length > 0 && <details><summary>Review remaining pairings · {undanced.length} undanced songs</summary><p>Review each undanced song after removing the withdrawn dancer. Choose the actual pairings; no replacement partners are assigned automatically. Every remaining dancer needs a valid pairing somewhere in this remaining work.</p>{undanced.map(({ heat, song }) => {
        const pairs = plans[song.id] ?? song.partners;
        return <section className="score-detail-group" key={song.id}><h4>{heat.name} · {song.title}</h4>{pairs.map((pair, index) => <div className="withdrawal-pair" key={index}>{(['Lead', 'Follow'] as const).map((role, side) => <label key={role}>{role}<select aria-label={`${song.title} pair ${index + 1} ${role}`} value={pair[side]} onChange={(e) => setPair(song.id, pairs.map((p, i) => i === index ? side === 0 ? [e.target.value, p[1]] : [p[0], e.target.value] : p))}><option value="">Choose {role.toLowerCase()}</option>{draftRound!.definition.subjects.filter((s) => heat.subjectIds.includes(s.id) && s.role === role).map((s) => <option value={s.id} key={s.id} disabled={s.id === subjectId || draftRound!.definition.withdrawnIds?.includes(s.id)}>#{s.number} {s.primary}{s.id === subjectId ? ' · withdrawing' : draftRound!.definition.withdrawnIds?.includes(s.id) ? ' · withdrawn' : ''}</option>)}</select></label>)}<button type="button" className="quiet-button" onClick={() => setPair(song.id, pairs.filter((_, i) => i !== index))}>Remove pair</button></div>)}<button type="button" className="quiet-button" onClick={() => setPair(song.id, [...pairs, ['', '']])}>Add pairing</button></section>;
      })}</details>}
      <p>Requesting does not remove scores or apply a withdrawal. Existing eligibility and pairing checks must pass before both approvals can apply it.</p><button className="quiet-button" disabled={!canSubmit || waiting} aria-busy={waiting} aria-describedby={[notice ? feedbackId : '', !revisionAvailable || !entrantCompetitionAvailable && r || currentRevision && loadedRevision.id === reviseId && currentRevision.version !== loadedRevision.version ? revisionHelpId : '', !r || !subjectAvailable ? 'withdrawal-target-help' : ''].filter(Boolean).join(' ') || undefined}>{waiting ? 'Requesting entrant withdrawal…' : 'Request entrant withdrawal'}</button>
    </fieldset></form></div></SetupSection>
    <SetupSection title="Withdraw a started competition" caption="Whole competition" detailsRef={(n) => { if (n) n.id = 'results-competition-withdrawal'; }}><div className="form-body">{competitionNotice && <p id={competitionFeedbackId} role="status">{competitionNotice}</p>}{!competitionRevisionAvailable ? <p id={competitionRevisionHelpId} role="status">This revision is no longer pending. Use new request or open another pending withdrawal. Your draft is kept.</p> : competitionRevision && loadedCompetitionRevision.id === competitionRevision && currentCompetitionRevision && currentCompetitionRevision.version !== loadedCompetitionRevision.version ? <p id={competitionRevisionHelpId} role="status">Request now version {currentCompetitionRevision.version}. Your draft is kept; review it before revising.</p> : null}<form className="form-body" onFocusCapture={retainCompetitionTarget} onSubmit={(e) => void requestCompetition(e)}><fieldset className="shared-unframed" disabled={competitionWaiting}>
      <label>Competition to withdraw<select name="competition" aria-label="Competition to withdraw" value={competitionId} aria-describedby={!competitionAvailable ? 'competition-target-help' : undefined} onChange={(e) => { if (!canEditCompetition()) return; setCompetition(e.target.value); setRetainedCompetition(competitions.find((c) => c.id === e.target.value)); setCompetitionRevision(''); setLoadedCompetitionRevision((old) => ({ id: '', version: 0, generation: old.generation + 1 })); }}>{!competitionAvailable && <option value={competitionId} disabled>{competitionLabel} · Unavailable</option>}{competitions.map((c) => <option key={c.id} value={c.id}>{c.format} · {c.division}</option>)}</select></label>{!competitionAvailable && <p id="competition-target-help" role="status">{competitionLabel} is no longer available. Choose an available competition. Your reason is kept.</p>}<label>Withdrawal reason<input name="reason" required maxLength={500} value={competitionReason} onChange={(e) => { if (!canEditCompetition()) return; retainCompetitionTarget(); setCompetitionReason(e.target.value); }} /></label>{!competitionRevisionAvailable && <button type="button" className="quiet-button" onClick={() => { if (!canEditCompetition()) return; setCompetitionRevision(''); setLoadedCompetitionRevision((old) => ({ id: '', version: 0, generation: old.generation + 1 })); }}>Use new request</button>}<p>This affects the entire competition. Both roles must approve; previous scores, submissions and approval snapshots remain in history.</p><button className="quiet-button" disabled={!canSubmitCompetition || competitionWaiting} aria-busy={competitionWaiting} aria-describedby={[competitionNotice ? competitionFeedbackId : '', !competitionRevisionAvailable || competitionRevision && loadedCompetitionRevision.id === competitionRevision && currentCompetitionRevision && currentCompetitionRevision.version !== loadedCompetitionRevision.version ? competitionRevisionHelpId : '', !competitionAvailable ? 'competition-target-help' : ''].filter(Boolean).join(' ') || undefined}>{competitionWaiting ? 'Requesting competition withdrawal…' : 'Request competition withdrawal'}</button>
    </fieldset></form></div></SetupSection>
  </fieldset>;
}
