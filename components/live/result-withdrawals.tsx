'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { LiveView, ReviewRequest, RoundView } from '@/lib/live/types';
import { validatePairingPlan } from '@/lib/live/eligibility';
import SetupSection from './setup-section';
import { revealResult } from './result-details';

export default function ResultWithdrawals({ data, action, selected, revision }: { data: LiveView; action: (input: Record<string, unknown>) => Promise<boolean>; selected: string; revision?: ReviewRequest }) {
  const [chosenRound, setRound] = useState<string | null>(null), [subject, setSubject] = useState(''), [reason, setReason] = useState(''), [reviseId, setRevise] = useState(''), [notice, setNotice] = useState('');
  const [plans, setPlans] = useState<Record<string, [string, string][]>>({});
  const [retainedRound, setRetainedRound] = useState<RoundView>();
  const [chosenCompetition, setCompetition] = useState<string | null>(null), [competitionReason, setCompetitionReason] = useState(''), [competitionRevision, setCompetitionRevision] = useState('');
  const pending = (data.reviewRequests ?? []).filter((q) => q.kind === 'withdrawal' && !q.appliedAt && !q.cancelledAt);
  const r = chosenRound ? data.rounds.find((r) => r.key === chosenRound) : data.rounds.find((r) => r.id === selected) ?? data.rounds[0];
  const draftRound = r ?? retainedRound;
  useEffect(() => { if (chosenRound && r) queueMicrotask(() => setRetainedRound(r)); }, [chosenRound, r]);
  const eligible = r?.definition.subjects.filter((s) => !r.definition.withdrawnIds?.includes(s.id)) ?? [];
  const subjectId = subject || eligible[0]?.id || '';
  const subjectAvailable = eligible.some((s) => s.id === subjectId);
  const retainedSubject = draftRound?.definition.subjects.find((s) => s.id === subjectId);
  function retainTarget() { if (!subject) setSubject(subjectId); if (r) { setRetainedRound(r); if (!chosenRound) setRound(r.key); } }
  const competitionId = chosenCompetition ?? draftRound?.definition.competitionId ?? '';
  function loadRevision(q?: ReviewRequest) {
    if (!q) { setRevise(''); return; }
    if (q.payload.subjectId) {
      setRound(q.payload.roundKey!); setSubject(q.payload.subjectId); setReason(q.reason); setRevise(q.id);
      setPlans(Object.fromEntries((q.payload.pairingPlan ?? []).map((p) => [p.performanceId, p.partners])));
      revealResult('results-entrant-withdrawal');
    } else { setCompetition(q.payload.competitionId!); setCompetitionReason(q.reason); setCompetitionRevision(q.id); revealResult('results-competition-withdrawal'); }
  }
  useEffect(() => { if (revision) queueMicrotask(() => loadRevision(revision)); }, [revision]);
  const undanced = draftRound?.definition.format === 'Jack & Jill' && draftRound.definition.kind === 'prelims' ? draftRound.definition.heats.flatMap((h) => h.songs.filter((s) => !data.context.visited.includes(s.id)).map((song) => ({ heat: h, song }))) : [];
  function setPair(songId: string, pairs: [string, string][]) { retainTarget(); setPlans((current) => ({ ...current, [songId]: pairs })); }
  async function request(e: FormEvent) {
    e.preventDefault(); if (!r || !subjectAvailable) return;
    try {
      const plan = undanced.map(({ song }) => ({ performanceId: song.id, partners: plans[song.id] ?? song.partners }));
      validatePairingPlan(r.definition, subjectId, data.context, plan);
      const ok = await action({ action: 'request-withdrawal', roundKey: r.key, competitionId: r.definition.competitionId, subjectId, reason, pairingPlan: plan, ...(reviseId ? { reviewRequestId: reviseId } : {}) });
      if (ok) { setNotice('Withdrawal requested. Both organizer and head must approve this exact version.'); setRevise(''); }
    } catch (error) { setNotice((error as Error).message); }
  }
  return <fieldset className="shared-unframed page-stack" disabled={data.status !== 'active'} id="results-withdrawals">
    <SetupSection title="Withdraw a started entrant/couple" caption="Request a withdrawal" detailsRef={(n) => { if (n) n.id = 'results-entrant-withdrawal'; }}><div className="form-body"><p>Fixed partners withdraw together. Recorded marks and history remain. Both organizer and head must approve the same request; affected results may need renewed approval.</p>{notice && <p role="status">{notice}</p>}<form className="form-body" onFocusCapture={retainTarget} onSubmit={(e) => void request(e)}>
      <label>Withdrawal round<select value={r?.key ?? chosenRound ?? ''} aria-describedby={!r ? 'withdrawal-target-help' : undefined} onChange={(e) => { setRound(e.target.value); setRetainedRound(data.rounds.find((r) => r.key === e.target.value)); setSubject(''); setPlans({}); setRevise(''); }}>{chosenRound && !r && <option value={chosenRound} disabled>{retainedRound ? retainedRound.definition.format + ' · ' + retainedRound.definition.division + ' · ' + retainedRound.definition.kind : 'Selected round'} · Unavailable</option>}{data.rounds.map((r) => <option key={r.key} value={r.key}>{r.definition.format} · {r.definition.division} · {r.definition.kind}</option>)}</select></label>
      <label>Withdrawal entrant/couple<select name="subject" value={subjectId} aria-describedby={!subjectAvailable ? 'withdrawal-target-help' : undefined} onChange={(e) => { retainTarget(); setSubject(e.target.value); }}>{!subjectAvailable && <option value={subjectId} disabled>{retainedSubject ? `#${retainedSubject.number} ${retainedSubject.primary} ${retainedSubject.secondary}` : 'Selected entrant'} · Unavailable</option>}{eligible.map((s) => <option key={s.id} value={s.id}>#{s.number} {s.primary} {s.secondary}</option>)}</select></label>
      {!subjectAvailable && <p id="withdrawal-target-help" role="status">{!r ? 'Choose an available round, then an eligible entrant.' : eligible.length ? 'Choose an eligible entrant.' : 'No eligible entrants remain in this round. Choose another available round.'} Your reason and pairings are kept.</p>}<label>Withdrawal reason<input required maxLength={500} value={reason} onChange={(e) => { retainTarget(); setReason(e.target.value); }} /></label>
      <details><summary>Revise a pending withdrawal</summary><label>Revise pending withdrawal (optional)<select aria-label="Revise pending withdrawal (optional)" value={reviseId} onChange={(e) => loadRevision(pending.find((q) => q.id === e.target.value))}><option value="">New request</option>{pending.filter((q) => q.payload.subjectId).map((q) => <option key={q.id} value={q.id}>Request version {q.version}: {q.reason}</option>)}</select></label><p>Both roles must approve the revised version again.</p></details>
      {undanced.length > 0 && <details><summary>Review remaining pairings · {undanced.length} undanced songs</summary><p>Review each undanced song after removing the withdrawn dancer. Choose the actual pairings; no replacement partners are assigned automatically. Every remaining dancer needs a valid pairing somewhere in this remaining work.</p>{undanced.map(({ heat, song }) => {
        const pairs = plans[song.id] ?? song.partners;
        return <section className="score-detail-group" key={song.id}><h4>{heat.name} · {song.title}</h4>{pairs.map((pair, index) => <div className="withdrawal-pair" key={index}>{(['Lead', 'Follow'] as const).map((role, side) => <label key={role}>{role}<select aria-label={`${song.title} pair ${index + 1} ${role}`} value={pair[side]} onChange={(e) => setPair(song.id, pairs.map((p, i) => i === index ? side === 0 ? [e.target.value, p[1]] : [p[0], e.target.value] : p))}><option value="">Choose {role.toLowerCase()}</option>{draftRound!.definition.subjects.filter((s) => heat.subjectIds.includes(s.id) && s.role === role).map((s) => <option value={s.id} key={s.id} disabled={s.id === subjectId || draftRound!.definition.withdrawnIds?.includes(s.id)}>#{s.number} {s.primary}{s.id === subjectId ? ' · withdrawing' : draftRound!.definition.withdrawnIds?.includes(s.id) ? ' · withdrawn' : ''}</option>)}</select></label>)}<button type="button" className="quiet-button" onClick={() => setPair(song.id, pairs.filter((_, i) => i !== index))}>Remove pair</button></div>)}<button type="button" className="quiet-button" onClick={() => setPair(song.id, [...pairs, ['', '']])}>Add pairing</button></section>;
      })}</details>}
      <p>Requesting does not remove scores or apply a withdrawal. Existing eligibility and pairing checks must pass before both approvals can apply it.</p><button className="quiet-button" disabled={!r || !subjectAvailable}>Request entrant withdrawal</button>
    </form></div></SetupSection>
    <SetupSection title="Withdraw a started competition" caption="Whole competition" detailsRef={(n) => { if (n) n.id = 'results-competition-withdrawal'; }}><div className="form-body"><form className="form-body" onSubmit={(e) => { e.preventDefault(); if (window.confirm('Request withdrawal of this entire competition? Both roles must approve. Scores and history remain.')) void action({ action: 'request-withdrawal', competitionId, reason: competitionReason, ...(competitionRevision ? { reviewRequestId: competitionRevision } : {}) }); }}>
      <label>Competition to withdraw<select name="competition" aria-label="Competition to withdraw" value={competitionId} onChange={(e) => { setCompetition(e.target.value); setCompetitionRevision(''); }}>{data.setup.competitions.filter((c) => data.rounds.some((r) => r.definition.competitionId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.format} · {c.division}</option>)}</select></label><label>Withdrawal reason<input name="reason" required maxLength={500} value={competitionReason} onChange={(e) => setCompetitionReason(e.target.value)} /></label><p>This affects the entire competition. Both roles must approve; previous scores, submissions and approval snapshots remain in history.</p><button className="quiet-button" disabled={!competitionId}>Request competition withdrawal</button>
    </form></div></SetupSection>
  </fieldset>;
}
