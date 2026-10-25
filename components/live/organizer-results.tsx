'use client';

import { useState } from 'react';
import type { LiveView, ReviewRequest } from '@/lib/live/types';
import { finalistCountIssues } from '@/lib/live/validation';
import RoundContext, { RoundOverview } from './round-context';
import SetupSection from './setup-section';
import type { NewCorrectionDraft } from './new-correction-draft';
import { NewCorrection, ReviewRequests } from './result-management';
import { ResultHighlights, AllRoundScorecards, ResultDecisions, ResultAudit, revealResult } from './result-details';
import ResultWithdrawals from './result-withdrawals';

type Action = (input: Record<string, unknown>) => Promise<boolean>;
export default function OrganizerResults({ data, action, selected, select, setupRoute, navigate, openHeadAccess, correctionDraft }: { correctionDraft: NewCorrectionDraft; data: LiveView; action: Action; selected: string; select: (id: string) => void; setupRoute?: (id?: string, section?: string) => void; navigate?: (page: number) => void; openHeadAccess?: () => void }) {
  const round = data.rounds.find((r) => r.id === selected), setup = data.setup.rounds.find((r) => r.id === selected), result = round?.standings;
  const competition = data.setup.competitions.find((c) => c.id === (setup?.competitionId ?? round?.definition.competitionId));
  const pending = (data.reviewRequests ?? []).filter((q) => !q.appliedAt && !q.cancelledAt);
  const selectedPending = pending.filter((q) => q.payload.roundKey === round?.key || q.payload.competitionId === competition?.id);
  const [revision, setRevision] = useState<ReviewRequest | undefined>();
  function openCorrectionDraft() {
    const target = document.getElementById('results-new-correction');
    if (!target) return;
    for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
    const editor = target.querySelector<HTMLDetailsElement>('[data-correction-editor]');
    if (editor) editor.open = true;
    const transfer = target.querySelector<HTMLDetailsElement>('[data-correction-transfer]');
    if (transfer) transfer.open = Boolean(transfer.querySelector('select')?.value);
    target.querySelectorAll<HTMLDetailsElement>('[data-correction-help]').forEach((help) => { help.open = false; });
    const heading = target.querySelector<HTMLElement>('h3');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  const limits = round?.definition.kind === 'prelims' && result ? finalistCountIssues(round.definition.format, result.finalistCount ?? 0, round.definition.subjects.filter((s) => !round.definition.withdrawnIds?.includes(s.id))) : [];
  const votes = result?.advancementTies?.filter((t) => !t.complete) ?? [];
  const placement = round?.definition.kind === 'finals' && result?.rows.some((r) => !r.decided);
  const head = data.setup.judges.find((j) => j.id === data.setup.headJudgeId)?.name ?? 'the head judge';
  const headLink = data.judgeLinks?.find((j) => j.id === data.setup.headJudgeId && !j.revoked);
  const otherReview = data.rounds.find((r) => r.id !== selected && r.phase === 'discussion' && !r.standings?.approved);
  const allFinals = data.setup.competitions.length > 0 && data.setup.competitions.every((c) => data.rounds.some((r) => r.definition.competitionId === c.id && r.definition.kind === 'finals' && r.standings?.approved));
  const allPrelims = data.setup.competitions.every((c) => data.rounds.some((r) => r.definition.competitionId === c.id && r.definition.kind === 'prelims' && r.standings?.approved));
  return <div className="page-stack organizer-results">
    <section className="hero-panel results-current" aria-label="Results status and next action"><div><p className="kicker">{competition || round ? `${competition?.format ?? round?.definition.format} · ${competition?.division ?? round?.definition.division} · ${setup?.kind ?? round?.definition.kind}` : 'Event records'}</p><h2>{data.status === 'archived' ? 'Archived results · read only' : !selected ? 'No current competition selected' : result?.approved ? 'Head-approved results' : result ? 'Results ready for review' : 'Judging not yet concluded'}</h2>
{correctionDraft.target && correctionDraft.fields && <div className="shared-inline"><button className="quiet-button" aria-describedby="results-correction-draft-context" onClick={openCorrectionDraft}>Open correction draft</button><small id="results-correction-draft-context">{correctionDraft.target.definition.format} · {correctionDraft.target.definition.division} · {correctionDraft.target.definition.kind}</small></div>}
<p>{data.status === 'archived' ? 'Inspect saved scores, approvals and history below. Use Events to return this event to active.' : !selected ? 'Add a competition in Set up, or open Audit trail below to review retained event records.' : !result ? 'Results for this round become available after the whole stage concludes. Complete judging and all required submissions in Score.' : result.approved ? `This competition and round have current head approval from ${head}.` : `These results are provisional. ${head} reviews and approves this exact round from their private judge page.`}</p>
      {data.status === 'active' && <>
      {limits.map((issue) => <p className="score-blocker" key={issue}>{issue}</p>)}
      {votes.length > 0 && <p className="score-blocker">{votes.some((t) => t.deadlocked) ? 'Head decision needed for the remaining cutoff vote tie.' : 'Panel votes needed at the advancement cutoff.'}</p>}
      {placement && <p className="score-blocker">Head placement decisions are needed for equal-average groups.</p>}
      {selectedPending.length > 0 && <p className="score-blocker">{selectedPending.length} pending correction/withdrawal requests affect this competition. Review each exact request before final approval.</p>}
      <div className="shared-inline">
        {selected && !result && <button className="primary-button" onClick={() => navigate?.(1)}>Go to Score</button>}
        {result && !result.approved && <>{headLink ? <a className="primary-button" href={headLink.path} target="_blank" rel="noreferrer">Open Head Judge — {head} ↗</a> : <button className="primary-button" onClick={openHeadAccess}>Open head judge access</button>}{(votes.length > 0 || placement || limits.length > 0) && <button className="quiet-button" onClick={() => revealResult('results-decisions')}>Review tie decisions &amp; approval</button>}</>}
        {result && !result.approved && setup?.kind === 'prelims' && limits.length > 0 && <button className="quiet-button" onClick={() => setupRoute?.(data.setup.rounds.find((r) => r.prelimRoundId === selected)?.id, 'Finalists & pairings')}>Review finalist count</button>}
        {result?.approved && otherReview && <button className="primary-button" onClick={() => select(otherReview.id)}>Review remaining competition</button>}
        {result?.approved && !otherReview && setup?.kind === 'prelims' && allPrelims && <button className="primary-button" onClick={() => { const finals = data.setup.rounds.find((r) => r.prelimRoundId === selected); if (finals) select(finals.id); navigate?.(1); }}>Continue to Finals</button>}
        {result?.approved && setup?.kind === 'finals' && <button className={allFinals ? 'primary-button' : 'quiet-button'} onClick={() => navigate?.(3)}>{allFinals ? 'Review event to publish' : 'Review remaining event requirements'}</button>}
      </div>
      {pending.length > 0 && <section className="results-pending" aria-label="Pending review duties"><h3>Pending requests · {pending.length}</h3>{pending.map((q) => { const r = data.rounds.find((r) => r.key === q.payload.roundKey), c = data.setup.competitions.find((c) => c.id === (r?.definition.competitionId ?? q.payload.competitionId)); return <div key={q.id}><span>{c?.format ?? 'Retained competition'} · {c?.division} · {q.kind === 'correction' ? 'Recording error' : 'Withdrawal'}<small>{!q.approvals.some((approval) => approval.role === 'organizer') ? 'Your approval needed' : 'Waiting for head approval'}</small></span><button className="quiet-button" onClick={() => revealResult(`review-request-${q.id}`)}>Review request · {c?.division ?? 'event'}{r ? ` · ${r.definition.kind}` : ''}</button></div>; })}</section>}
    </>}
    </div></section>
    <RoundContext data={data} selected={selected} select={select} compact />
    {result && round && <ResultHighlights round={round} />}
    <details id="results-supporting" className="supporting-drawer"><summary>Scorecards, corrections &amp; history <small>All rounds &amp; retained records</small></summary><div className="supporting-content page-stack">
    <RoundOverview data={data} selected={selected} select={select} />
    <AllRoundScorecards data={data} />
    <ResultDecisions data={data} round={round} openHeadAccess={openHeadAccess} reviewFinalistCount={limits.length ? undefined : () => setupRoute?.(data.setup.rounds.find((r) => r.prelimRoundId === selected)?.id, 'Finalists & pairings')} />
    <SetupSection title="Corrections & withdrawals" caption="Manage results" summaryText={`${pending.length} pending requests · ${pending.filter((q) => !q.approvals.some((a) => a.role === 'organizer')).length} awaiting your approval`} detailsRef={(n) => { if (n) n.id = 'results-management'; }}><div className="form-body page-stack">
      <ReviewRequests data={data} action={action} embedded pendingOnly onReviseWithdrawal={(q) => { setRevision(q); revealResult('results-withdrawals'); }} />
      <NewCorrection draft={correctionDraft} key={data.eventId} data={data} round={round} action={action} />
      <ResultWithdrawals data={data} action={action} selected={selected} revision={revision} />
      <button className="quiet-button" onClick={() => revealResult('results-audit')}>View completed requests in Audit trail</button>
    </div></SetupSection>
    <ResultAudit data={data} selected={selected} />
    </div></details>
  </div>;
}
