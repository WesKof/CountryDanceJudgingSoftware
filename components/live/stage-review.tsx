'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import type { AdvancementTie, LiveView, RoundView } from '@/lib/live/types';
import { LiveResults } from './results';
import SetupSection from './setup-section';
import { Correction, ReviewRequests } from './result-management';
import type { NewCorrectionDraft } from './new-correction-draft';
import OrganizerResults from './organizer-results';

type Action = (input: Record<string, unknown>) => Promise<boolean>;
function Vote({ data, round, tie, action }: { data: LiveView; round: RoundView; tie: AdvancementTie; action: Action }) {
  const target = JSON.stringify([data.eventId, data.judgeId, round.key, round.version, round.standings!.fingerprint, tie.key, tie.subjectIds, tie.slots]);
  const freshDraft = () => ({ target, edited: false, selected: [] as string[], subjects: tie.subjectIds.map((id) => ({ ...round.definition.subjects.find((subject) => subject.id === id)! })), slots: tie.slots });
  const [storedDraft, setDraft] = useState(freshDraft);
  const [saving, setSaving] = useState(false), [attempted, setAttempted] = useState(false);
  const draft = storedDraft.edited || attempted || saving ? storedDraft : freshDraft();
  const pending = useRef(false), changed = draft.target !== target;
  const statusId = useId();
  const ownVote = tie.votes.find((vote) => vote.judgeId === data.judgeId), voted = Boolean(ownVote);
  const choices = ownVote?.selected ?? draft.selected, slots = voted ? tie.slots : draft.slots, remaining = slots - choices.length;
  const canChoose = round.phase === 'discussion' && !voted && data.role !== 'organizer' && data.status === 'active' && round.definition.judgeIds.includes(data.judgeId!);
  const selectionStatus = `${choices.length} / ${slots} selected · ${voted ? 'Vote finalized.' : saving ? changed ? 'Submitting previous vote…' : 'Submitting vote…' : changed ? 'Results changed. Your earlier vote draft is kept. Discard it to review current results.' : !canChoose ? 'Read only · voting is closed.' : attempted ? 'Check current results for your vote before trying again. Your choices are kept.' : remaining > 0 ? `Choose ${remaining} more.` : remaining < 0 ? `Remove ${-remaining} ${remaining === -1 ? 'choice' : 'choices'}.` : 'Ready to submit.'}`;
  const waiting = round.definition.judgeIds.filter((id) => !tie.votes.some((vote) => vote.judgeId === id)).map((id) => round.definition.judges.find((judge) => judge.id === id)?.name ?? 'an assigned judge');
  async function submit() {
    if (pending.current || changed || !canChoose || remaining !== 0) return;
    const input = { action: 'vote', roundKey: round.key, roundVersion: round.version, fingerprint: round.standings!.fingerprint, tieKey: tie.key, selected: [...draft.selected] };
    pending.current = true; setDraft({ ...draft, edited: true }); setSaving(true); setAttempted(true);
    try { await action(input); }
    catch { /* Authoritative votes confirm finalization; the draft remains available. */ }
    finally { pending.current = false; setSaving(false); }
  }
  return <fieldset className="tie-editor"><legend>{round.definition.division} · {tie.group} advancement tie</legend>
    <p>Choose exactly {slots} of these tied entrants. {tie.votes.length} / {round.definition.judgeIds.length} panel votes received. Marks and numeric averages stay unchanged.</p>
    {(voted ? tie.subjectIds.map((id) => round.definition.subjects.find((subject) => subject.id === id)!) : draft.subjects).map((subject) => {
      const id = subject.id;
      return <label className="check-label" key={id}><input type="checkbox" checked={choices.includes(id)} disabled={!canChoose || saving || changed} onChange={(event) => { if (pending.current || changed || !canChoose) return; setDraft({ ...draft, edited: true, selected: event.target.checked ? [...draft.selected, id] : draft.selected.filter((choice) => choice !== id) }); setAttempted(false); }} />#{subject.number} {subject.primary}{subject.secondary ? ` & ${subject.secondary}` : ''}</label>;
    })}
    <p id={statusId} role="status">{selectionStatus}</p>
    {data.role !== 'organizer' && round.definition.judgeIds.includes(data.judgeId!) && <button className="primary-button" aria-describedby={statusId} aria-busy={saving} disabled={!canChoose || remaining !== 0 || saving || changed} onClick={() => void submit()}>{voted ? 'Vote finalized' : saving ? 'Submitting vote…' : 'Submit advancement vote'}</button>}
    {changed && canChoose && !saving && <button className="quiet-button" onClick={() => { if (pending.current) return; setDraft(freshDraft()); setAttempted(false); }}>Discard draft and review current results</button>}
    <p>{tie.complete ? `Advancing: ${tie.selected.map((id) => '#' + round.definition.subjects.find((subject) => subject.id === id)!.number).join(', ')}` : tie.deadlocked ? 'Full panel is tied. The head judge must resolve the remaining vote tie.' : `Waiting for ${waiting.length > 3 ? waiting.length + ' judges' : waiting.join(', ')} to submit advancement votes.`}</p>
  </fieldset>;
}

function SubmittedReview({ data, round, action }: { data: LiveView; round: RoundView; action: Action }) {
  return <section className="form-panel"><div className="form-body"><h3>{round.definition.format} · {round.definition.division} · submitted scorecards are read only</h3>
    {data.role !== 'organizer' && <details><summary>My private submitted notes</summary>{data.ballots.filter((b) => b.roundKey === round.key).flatMap((b) => Object.entries(b.cells).filter(([, c]) => c.note).map(([key, c]) => <p key={key}>{round.definition.subjects.find((s) => s.id === key.split(':')[1])?.number} · {round.definition.heats.flatMap((h) => h.songs).find((p) => p.id === key.split(':')[0])?.title}: {c.note}</p>))}</details>}
    {data.role === 'organizer' && data.status === 'active' && <Correction data={data} round={round} action={action} />}
  </div></section>;
}

export function StageReview({ data, action, selectedRoundId, showRound, setupRoute, navigate, openHeadAccess, correctionDraft, part = 'all' }: { correctionDraft?: NewCorrectionDraft; part?: 'pending' | 'history' | 'all'; data: LiveView; action: Action; managementExtra?: ReactNode; selectedRoundId?: string; showRound?: (id: string, page?: number) => void; setupRoute?: (roundId?: string, section?: string) => void; navigate?: (page: number) => void; openHeadAccess?: () => void }) {
  const reviewed = data.rounds.filter((r) => r.standings);
  const pending = data.role === 'head' ? data.reviewRequests?.filter((q) => !q.appliedAt && !q.cancelledAt) ?? [] : [];
  const organizer = data.role === 'organizer';
  if (organizer) return <OrganizerResults correctionDraft={correctionDraft!} data={data} action={action} selected={selectedRoundId ?? ''} select={(id) => showRound?.(id, 2)} setupRoute={setupRoute} navigate={navigate} openHeadAccess={openHeadAccess} />;
  const actionable = data.status === 'active' ? reviewed.filter((r) => !r.standings?.approved && (data.role === 'head' || r.standings?.advancementTies?.some((t) => !t.complete && r.definition.judgeIds.includes(data.judgeId!) && !t.votes.some((v) => v.judgeId === data.judgeId)))) : [];
  const contextResults = reviewed.filter((r) => !actionable.includes(r));
  const completed = reviewed.filter((r) => r.standings?.approved);
  if (part === 'history' && !reviewed.length && !data.ballots.length && !data.reviewRequests?.some((q)=>q.appliedAt || q.cancelledAt)) return null;
  if (part === 'pending' && !pending.length && !actionable.length) return null;
  const controls = (round: RoundView) => round.standings?.advancementTies?.map((tie) => <Vote key={JSON.stringify([data.eventId, data.role, data.judgeId, round.key, tie.key])} data={data} round={round} tie={tie} action={action} />);
  return <div className="page-stack">
    {part !== 'history' && pending.length > 0 && <ReviewRequests data={data} action={action} pendingOnly />}
    {part !== 'history' && <LiveResults data={{ ...data, rounds: actionable }} action={action} head={data.role === 'head'} roundControls={controls} />}
    {part !== 'pending' && <SetupSection title="Completed judging & history" caption="Retained records" summaryText={`${completed.length} approved rounds · scores, notes and request history`}>
      <div className="form-body page-stack"><LiveResults data={{ ...data, rounds: contextResults }} action={action} head={false} roundControls={controls} />{reviewed.map((round) => <SubmittedReview key={round.key} data={data} round={round} action={action} />)}
        <ReviewRequests data={{ ...data, reviewRequests: data.reviewRequests?.filter((q) => data.status !== 'active' || data.role !== 'head' || q.appliedAt || q.cancelledAt) }} action={action} />
        {data.ballots.filter((b) => !reviewed.some((r) => r.key === b.roundKey)).map((b) => { const round = data.rounds.find((r) => r.key === b.roundKey); return round && <details key={b.roundKey}><summary>{round.definition.format} · {round.definition.division} · {round.definition.kind} · My saved records</summary>{round.definition.heats.map((h) => <details key={h.id}><summary>{h.name}</summary>{h.songs.map((p) => <div key={p.id}><h4>{p.title}</h4>{round.definition.subjects.filter((s) => h.subjectIds.includes(s.id)).map((s) => {const c = b.cells[`${p.id}:${s.id}`];return <p key={s.id}>#{s.number} {s.primary}: {c?.mark || 'Blank'}{c?.note && ` · ${c.note}`}</p>;})}</div>)}</details>)}</details>;})}
      </div>
    </SetupSection>}

  </div>;
}
