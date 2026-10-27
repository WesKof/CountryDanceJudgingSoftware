'use client';
import Recovery, { useRecovery } from './recovery';
import { setupTasks } from '@/lib/live/setup-guidance';
import { useRememberedPage } from './remembered-page';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LiveSetup, LiveView } from '@/lib/live/types';
import { finalistLimitIssues, freezeRound, roundOpeningIssues } from '@/lib/live/validation';
import { liveApi } from './client';
import { LiveShell } from './shell';
import SetupEditor from './setup';
import SetupPage from './setup-page';
import SetupSection, { revealSetupSection } from './setup-section';
import FinalsPairings from './finals-pairings';
import { PublicationPanel } from './publication';
import { useNewCorrectionDraft } from './new-correction-draft';
import { StageReview } from './stage-review';
import RoundContext from './round-context';
import ScoreProgress from './score-progress';
import LiveScores, { RoundScoreProgress } from './live-scores';

type Props = { token: string; data: LiveView; error: string; refresh: () => Promise<LiveView | null>; setupIntro?: ReactNode; sampleHelp?: ReactNode; recoveryExtra?: ReactNode };
export default function StageDesk({ token, data, error, refresh, setupIntro, sampleHelp, recoveryExtra }: Props) {
  const correctionDraft = useNewCorrectionDraft();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [page, rememberPage] = useRememberedPage(data.eventId), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  function setPage(next: number) { setNotice(''); rememberPage(next); window.scrollTo({ top: 0, behavior: 'instant' }); }
  const [setupRequest, setSetupRequest] = useState(0);
  const [eventsRequested, setEventsRequested] = useState(false);
  useEffect(() => {
    if(page!==0 || !eventsRequested) return;
    revealSetupSection(document.body, 'Other events');
    queueMicrotask(()=>setEventsRequested(false));
  },[page,eventsRequested]);
  const [setupRoundId, setSetupRoundId] = useState<string | undefined>();
  const [setupSection, setSetupSection] = useState<string | undefined>();
  const [accessRequested, setAccessRequested] = useState(false);
  useEffect(() => {
    if(page !== 1 || !accessRequested) return;
    const section = document.getElementById("run-judge-access");
    for (let parent: HTMLElement | null = section; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
    section?.scrollIntoView({block:"center"});section?.querySelector<HTMLElement>("summary")?.focus({preventScroll:true});
    queueMicrotask(() => setAccessRequested(false));
  }, [page, accessRequested]);
  useEffect(() => {
    if (data.context.automaticStages !== undefined || data.status !== 'active' || !data.setup.rounds.length) return;
    let mounted = true;
    void liveApi(token, { action: 'enable-auto-stages', expectedVersion: data.version, requestId: crypto.randomUUID() })
      .then(() => refresh()).catch((error) => { if (mounted) setNotice((error as Error).message); });
    return () => { mounted = false; };
  }, [data.context.automaticStages, data.status, data.version, data.setup.rounds.length, token, refresh]);
  const [selection, setSelection] = useState<string | null>(null);
  const selectionKey = 'country-dance-judging:view:' + data.eventId;
  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(selectionKey); } catch { /* View state can remain in memory. */ }
    const valid = saved && [...data.setup.rounds, ...data.rounds].some((r) => r.id === saved);
    const current = data.rounds.find((r) => r.definition.heats.some((h) => h.songs.some((p) => p.id === data.context.performanceId)));
    queueMicrotask(() => setSelection(valid ? saved : current?.id ?? data.setup.rounds[0]?.id ?? ''));
    // Restore this event's view once; polling must not move a review or an edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);
  function selectRound(id: string) { setSelection(id); try { sessionStorage.setItem(selectionKey, id); } catch { /* In-memory selection still works. */ } }
  function showRound(id: string, targetPage = 2) { selectRound(id); setPage(targetPage); }
  function selectResultsRound(id: string) { setNotice(''); selectRound(id); }
  function reviewStage(kind: 'prelims' | 'finals') {
    const rounds = data.rounds.filter((r) => r.definition.kind === kind);
    showRound((rounds.find((r) => !r.standings?.approved) ?? rounds[0])?.id ?? '');
  }
  function navigate(targetPage: number) { if(targetPage === 0) {setSetupRoundId(undefined);setSetupSection(undefined);} setPage(targetPage); }
  function setupRoute(roundId?: string, section = 'Round setup') { setSetupRequest((n)=>n+1); setSetupRoundId(roundId); setSetupSection(section); if (roundId) selectRound(roundId); setPage(0); }
  function openScoreSection(id: string) {
    const section = document.getElementById(id);
    for (let parent: HTMLElement | null = section; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
    section?.scrollIntoView({ block: 'center' });
    section?.querySelector<HTMLElement>(':scope > summary')?.focus({ preventScroll: true });
  }

  const [draft, setDraft] = useState<LiveSetup | null>(null), [draftVersion, setDraftVersion] = useState(0);
  const [setupSaveError, setSetupSaveError] = useState('');
  const [pairingDraft, setPairingDraft] = useState(false);
  const recovery = useRecovery(token, true);
  async function action(input: Record<string, unknown>) {
    setBusy(true); setNotice('');
    try { const current = await refresh(); if (!alive.current) return false; if (!current || current.eventId !== data.eventId) throw new Error('Reconnect to this event before applying a shared action.'); await liveApi(token, { ...input, expectedVersion: current.version, requestId: crypto.randomUUID() }); if (!alive.current) return false; await refresh(); if (!alive.current) return false; if(input.action==='conclude-stage') reviewStage(block?.kind ?? 'prelims'); return true; }
    catch (error) { if (alive.current) { setNotice((error as Error).message); await refresh(); } return false; } finally { if (alive.current) setBusy(false); }
  }
  async function saveSetup() {
    if (!draft) return false; setBusy(true);setSetupSaveError('');setNotice('');
    try { const saved = await liveApi<{ ok?: unknown }>(token, { action: 'setup', setup: draft, automaticStages: data.context.automaticStages !== false, expectedVersion: draftVersion, requestId: crypto.randomUUID() }); if (saved.ok !== true) throw new Error('Setup save was not confirmed. Your edits are still here.'); setDraft(null);setPairingDraft(false);setSetupRoundId(undefined);setSetupSection(undefined);setSetupSaveError(''); await refresh(); window.scrollTo({top:0,behavior:'instant'}); setNotice(pairingDraft ? 'Finals pairings saved. Scoring opens automatically when every division is ready.' : 'Setup saved to the shared event.');return true; }
    catch (error) { setSetupSaveError((error as Error).message);await refresh();return false; } finally { setBusy(false); }
  }
  const withdrawnIdsByRound = Object.fromEntries(data.rounds.map((r) => [r.id, r.definition.withdrawnIds ?? []]));
  const savedLimitIssues = finalistLimitIssues(data.setup, withdrawnIdsByRound);
  const countFixRound = data.setup.rounds.find((r) => r.kind === 'finals' && finalistLimitIssues({...data.setup, rounds: data.setup.rounds.filter((x) => x.kind !== 'finals' || x.id === r.id)}, withdrawnIdsByRound).length);
  const draftLimitIssues = draft ? finalistLimitIssues(draft, withdrawnIdsByRound) : [];
  const approvedPrelimIds = data.rounds.filter((r) => r.definition.kind === 'prelims' && r.standings?.approved && (!draft || draft.rounds.find((f) => f.prelimRoundId === r.id)?.finalistCount === data.setup.rounds.find((f) => f.prelimRoundId === r.id)?.finalistCount)).map((r) => r.id);
  const canAct = !busy && !draft && data.status === 'active';
  const block = data.setup.blocks.find((b) => b.id === data.context.blockId);
  const order = (block?.roundIds ?? []).flatMap((rid) => { const r = data.rounds.find((r) => r.id === rid); return r?.definition.heats.map((h) => ({ round: r, heat: h })) ?? []; });
  const room = order.find((x) => x.heat.songs.some((p) => p.id === data.context.performanceId));
  const currentRounds = data.rounds.filter((r) => block?.roundIds.includes(r.id));
  const reviewRounds = currentRounds.filter((r) => r.phase === 'discussion' && r.standings && !r.standings.approved);
  const pendingVoters = (round: (typeof reviewRounds)[number]) => (round.standings?.advancementTies ?? []).filter((tie) => !tie.complete).flatMap((tie) => round.definition.judgeIds.filter((id) => !tie.votes.some((vote) => vote.judgeId === id)));
  const voteJudgeIds = new Set(reviewRounds.flatMap(pendingVoters));
  const voteJudgeNames = [...voteJudgeIds].map((id) => reviewRounds.flatMap((r) => r.definition.judges).find((j) => j.id === id)?.name ?? 'an assigned judge');
  const headDecisionNeeded = reviewRounds.some((r) => r.standings?.complete && (r.definition.kind === 'prelims' && data.setup.workflow ? r.standings.advancementTies?.some((tie) => !tie.complete && tie.deadlocked && tie.votes.length === r.definition.judgeIds.length && r.definition.judgeIds.every((id) => tie.votes.some((vote) => vote.judgeId === id))) : r.definition.kind === 'finals' && r.standings.rows.some((row) => !row.decided)));
  const headReviewReady = headDecisionNeeded || reviewRounds.some((r) => pendingVoters(r).length === 0);
  const stageJudges = data.setup.judges.filter((j) => currentRounds.some((r) => r.definition.judgeIds.includes(j.id)));
  const submittedStage = (judgeId: string) => currentRounds.filter((r) => r.definition.judgeIds.includes(judgeId)).every((r) => r.definition.heats.every((h) => data.heatSubmissions?.some((s) => s.roundKey === r.key && s.heatId === h.id && s.judgeId === judgeId)));
  const awaiting = stageJudges.filter((j) => !submittedStage(j.id));
  const selectedRoundId = [...data.setup.rounds, ...data.rounds].some((r) => r.id === selection) ? selection! : data.setup.rounds[0]?.id ?? data.rounds[0]?.id ?? '';
  const headName = data.setup.judges.find((j) => j.id === data.setup.headJudgeId)?.name ?? 'the head judge';
  const allFinalsApproved = data.setup.competitions.length > 0 && data.setup.competitions.every((c) => data.rounds.some((r) => r.definition.competitionId === c.id && r.definition.kind === 'finals' && r.standings?.approved));
  const prelimsApproved = data.setup.blocks.find((b) => b.kind === 'prelims')?.roundIds.every((id) => data.rounds.find((r) => r.id === id)?.standings?.approved) && data.rounds.some((r) => r.definition.kind === 'prelims');
  const dancing = room?.round.phase === 'dancing';
  const waitingForVotes = !dancing && voteJudgeIds.size > 0;
  function issues(kind: 'prelims' | 'finals') {
    const stage = data.setup.blocks.find((b) => b.kind === kind);
    if (!stage?.roundIds.length) return ['Add competitions and save setup.'];
    if (kind === 'finals') {
      const pending = stage.roundIds.flatMap((rid) => { const f = data.setup.rounds.find((r) => r.id === rid)!; const pre = data.rounds.find((r) => r.id === f.prelimRoundId); const c = data.setup.competitions.find((c) => c.id === f.competitionId)!; if (pre?.standings?.approved) return []; return [`${c.format} · ${c.division} · Prelims: ${pre?.phase === 'discussion' ? `waiting for ${data.setup.judges.find((j) => j.id === data.setup.headJudgeId)?.name ?? 'the head judge'} to approve current submitted advancement. Review Results and the private head judge page.` : 'finish the Prelims stage and obtain head approval before starting Finals.'}`]; });
      if (pending.length) { const limits = finalistLimitIssues(data.setup, withdrawnIdsByRound); return limits.length ? limits : pending; }
    }
    const errors = stage.roundIds.flatMap((rid) => { const r = data.setup.rounds.find((r) => r.id === rid)!; const initial = roundOpeningIssues(data.setup, r); if (initial.length) return initial; try { freezeRound(data.setup, r); return []; } catch (error) { return [(error as Error).message]; } });
    if (data.rounds.some((r) => ['dancing', 'discussion'].includes(r.phase))) errors.push('Complete the current stage’s submissions, review and head approval.');
    if (kind === 'finals' && stage.roundIds.some((rid) => !data.rounds.find((r) => r.id === data.setup.rounds.find((s) => s.id === rid)?.prelimRoundId)?.standings?.approved)) errors.push('Approve current prelim advancement before starting finals.');
    return errors;
  }
  const nextStage = !data.rounds.some((r) => r.definition.kind === 'prelims') ? 'prelims' : prelimsApproved && !data.rounds.some((r) => r.definition.kind === 'finals') ? 'finals' : null;
  const startIssues = nextStage ? issues(nextStage) : [];
  const pairingNeeded = prelimsApproved && nextStage === 'finals' && data.setup.rounds.some((r) => r.kind === 'finals' && data.setup.competitions.find((c) => c.id === r.competitionId)?.format === 'Jack & Jill' && r.subjects.length < r.finalistCount);

  const inlinePairing = pairingNeeded && data.context.automaticStages !== false;
  function finalDrawForms() { return data.setup.rounds.filter((f) => f.kind === 'finals' && data.setup.competitions.find((c) => c.id === f.competitionId)?.format === 'Jack & Jill' && data.rounds.find((r) => r.id === f.prelimRoundId)?.standings?.approved).map((f) => <FinalsPairings key={f.id} reviewSetup={setupRoute} setup={data.setup} round={f} draft={pairingDraft ? draft : null} version={data.version} sourceVersion={draftVersion} disabled={busy || Boolean(draft && !pairingDraft) || data.status !== 'active'} update={(next) => {if (!draft) setDraftVersion(data.version);setDraft(next);setPairingDraft(true);}} saveError={setupSaveError} save={saveSetup} discard={() => {setDraft(null);setPairingDraft(false);setSetupSaveError('');}} />); }
  function reviewSetup(kind: 'prelims' | 'finals') {
    if (kind === 'prelims') {
      const task = setupTasks(draft ?? data.setup).find(task => !task.complete);
      if (task) { setupRoute(task.roundId, task.section); return; }
    }
    const stage = data.setup.blocks.find((b) => b.kind === kind);
    const target = data.setup.rounds.find((r) => stage?.roundIds.includes(r.id) && roundOpeningIssues(data.setup, r).length);
    setupRoute(target?.id ?? stage?.roundIds[0], !data.setup.competitions.length ? 'Program & stages' : !data.setup.headJudgeId || !data.setup.separationAttested ? 'Judges' : 'Round setup');
  }
  return <LiveShell title={data.setup.name} identity={`Organizer · Head: ${data.setup.judges.find((j) => j.id === data.setup.headJudgeId)?.name ?? 'Choose in setup'}`} status={busy ? 'Saving…' : error || (data.status === 'archived' ? 'Archived · read only' : 'Shared event connected')} onEvents={() => {if(setupIntro){setPage(0);setEventsRequested(true);}else if(!draft || window.confirm('Open the event workspace? Unsaved setup edits will be discarded.')) window.location.assign('/?event='+token+'#other-events');}} items={['Set up', 'Score', 'Results', 'Publish']} current={page} navigate={navigate}>
    {notice && <p className="notice" role="status">{notice}</p>}
    {page === 0 && draftLimitIssues.map((issue) => <p className="notice" role="status" key={issue}>{issue}</p>)}
    {page === 0 && <SetupPage tasks={setupTasks(draft ?? data.setup)} openTask={(task)=>setupRoute(task.roundId,task.section)} archived={data.status==='archived'} supporting={data.rounds.length>0} scoringStage={data.status==='active' && data.context.automaticStages !== false ? data.rounds.find((r) => r.phase === 'dancing')?.definition.kind : undefined} openScoring={() => navigate(1)} automaticStages={data.context.automaticStages !== false} token={token} competitionCount={(draft ?? data.setup).competitions.length} hasRounds={(draft ?? data.setup).rounds.length > 0} hasDraft={Boolean(draft)} sampleHelp={sampleHelp} otherEvents={setupIntro} toolbar={<><button className="primary-button" aria-describedby={setupSaveError ? 'setup-save-error' : undefined} disabled={!draft || draftLimitIssues.length > 0 || busy || data.status !== 'active'} onClick={() => void saveSetup()}>Save setup</button>{setupSaveError && <span id="setup-save-error" role="status">{setupSaveError}</span>}{!draft && <span className="setup-save-feedback">Saved setup · changes need Save setup</span>}{draft && <><span>Unsaved setup edits{draftVersion !== data.version ? " · Event changed; discard and review the saved version" : ""}</span><button className="quiet-button" onClick={() => { if (window.confirm('Discard the unsaved setup edits?')) {setDraft(null);setPairingDraft(false);setSetupSaveError('');} }}>Discard edits</button></>}</>}><fieldset className="shared-unframed" disabled={busy || data.status !== 'active'}><SetupEditor approvedPrelimIds={approvedPrelimIds} withdrawnIdsByRound={withdrawnIdsByRound} initialRoundId={setupRoundId} initialSection={setupSection} initialRequest={setupRequest} viewRoundId={selectedRoundId} onSelectRound={selectRound} setup={draft ?? data.setup} update={(s) => { if (!draft) setDraftVersion(data.version); setDraft(s); }} frozenIds={data.rounds.filter((r) => r.phase !== 'setup').map((r) => r.id)} correction={false} /></fieldset></SetupPage>}

    {page === 1 && <div className="score-work page-stack">
      <section className="hero-panel score-current" aria-label="Current stage and next action"><div>
      {data.status === 'active' && draft && !inlinePairing && <p className="score-blocker" role="status">{pairingDraft ? 'Save Finals pairings before starting judging.' : 'Save setup before starting judging.'} {pairingDraft ? <button className="quiet-button" onClick={() => openScoreSection('run-finals')}>Review Finals preparation</button> : <button className="quiet-button" onClick={()=>navigate(0)}>Go to Set up</button>}</p>}
      {data.status === 'active' && savedLimitIssues.length > 0 && <div className="score-blocker" role="status">{savedLimitIssues.map((issue) => <p key={issue}>{issue}</p>)}<button className="quiet-button" onClick={() => setupRoute(countFixRound?.id, 'Finalists & pairings')}>Fix finalist count</button></div>}
      <div className={'action-cue ' + (data.status === 'archived' || dancing ? 'is-waiting' : allFinalsApproved ? 'is-complete' : 'needs-action')}><span className="action-symbol" aria-hidden="true">{data.status === 'archived' ? '–' : dancing ? '◷' : allFinalsApproved ? '✓' : '!'}</span><span>{data.status === 'archived' ? 'Saved record' : dancing ? 'Judges are scoring' : waitingForVotes ? 'Waiting for panel votes' : headDecisionNeeded ? 'Waiting for head decision' : room && !pairingNeeded && !allFinalsApproved ? 'Waiting for head judge' : 'Your next step'}</span></div>
      <p className="kicker">{data.status === 'archived' ? 'Saved record' : pairingNeeded ? 'Finals preparation' : block ? `${block.kind} · ${currentRounds.length} competitions · ${order.length} heats` : 'Stage workspace'}</p>
        <h2>{data.status === 'archived' ? 'Archived event' : allFinalsApproved ? 'Event results approved' : pairingNeeded ? 'Set the Finals pairings' : dancing ? 'Judging in progress' : waitingForVotes ? headReviewReady ? 'Panel votes and head review needed' : 'Panel votes needed' : headDecisionNeeded ? 'Head tie decision needed' : room ? 'Head approval needed' : 'Preparing scoring'}</h2>
        {data.status === 'archived' ? <><p>Judging is read only. Submitted ballots, results and history remain available.</p><button className="quiet-button" onClick={() => showRound(selectedRoundId)}>View results &amp; history</button></> : allFinalsApproved ? <><p>All Finals are approved.</p><button className="primary-button" onClick={() => setPage(3)}>Review event to publish</button></> : room && !dancing && !pairingNeeded ? <><p>{waitingForVotes ? <>{voteJudgeNames.length > 3 ? `${voteJudgeNames.length} assigned judges` : voteJudgeNames.join(', ')} must submit advancement votes from their private judge pages.{headDecisionNeeded ? ' Head tie decisions can be recorded now from the private head judge page.' : headReviewReady && ' Head review can continue for competitions with all panel votes.'}</> : headDecisionNeeded ? `${headName} has tie decisions to record on their private judge page. Review each competition’s approval separately.` : prelimsApproved && room.round.definition.kind === 'prelims' ? 'Prelims approved. Choose and save the actual J&J couples to open Finals.' : `Waiting for ${headName} to approve the results.`}</p><button className="primary-button" onClick={() => reviewStage(room.round.definition.kind)}>Review {room.round.definition.kind} results</button></> : !room ? <p>Complete the setup items below to open scoring.</p> : null}
        {data.status === 'active' && dancing && <>{currentRounds.some((r) => r.draftProgress?.some((p) => p.missing?.some((h) => h.subjectIds.length))) && <details className="stage-missing"><summary>Scores still needed · see bibs</summary>{currentRounds.flatMap((r) => r.draftProgress?.flatMap((p) => p.missing?.filter((h) => h.subjectIds.length).map((h) => <p key={`${r.key}/${p.judgeId}/${h.heatId}`}><strong>{data.setup.judges.find((j) => j.id === p.judgeId)?.name}</strong> · {r.definition.format} · {r.definition.division} · {r.definition.heats.find((x) => x.id === h.heatId)?.name}: {h.subjectIds.map((id) => { const s = r.definition.subjects.find((s) => s.id === id)!; return `#${s.number} ${s.primary}`; }).join(', ')}</p>) ?? []) ?? [])}</details>}{!data.context.stageSubmission && <p>This stage started with the earlier heat controls. Open all stage heats and songs to continue; saved submissions stay locked.</p>}<p role="status">{stageJudges.length - awaiting.length} / {stageJudges.length} judges submitted the stage.{error ? ' Last connected status.' : ''}</p>
          <p className="stage-transition-hint">Results open when all judges submit.</p>
        </>}
      {pairingNeeded && data.status === 'active' && <><p>Choose the actual J&amp;J couples. Save to open Finals scoring.</p>{!inlinePairing && <button className="primary-button" onClick={() => openScoreSection('run-finals')}>Set Finals pairings</button>}</>}
      {nextStage && !pairingNeeded && data.status === 'active' && <div className="score-start-controls">{data.context.automaticStages === false && <button className="primary-button" disabled={!canAct || startIssues.length > 0} onClick={() => void action({ action: 'open-stage', kind: nextStage })}>Start {nextStage} stage</button>}<p>Scoring opens automatically after the saved setup and approvals are ready.</p>
        {startIssues.length > 0 && <div role="status"><p>{startIssues[0]}</p>{startIssues.length > 1 && <details className="stage-missing"><summary>{startIssues.length - 1} more setup items</summary><ul>{startIssues.slice(1).map((issue, i) => <li key={i}>{issue}</li>)}</ul></details>}{nextStage === 'finals' ? <button className="quiet-button" onClick={() => openScoreSection('run-finals')}>Review Finals preparation</button> : <button className="quiet-button" onClick={() => reviewSetup(nextStage)}>Review {nextStage} setup</button>}</div>}
      </div>}
      {!pairingNeeded && !allFinalsApproved && data.status === 'active' && <div className="stage-judge-links" aria-label="Direct judge pages"><p className="kicker">Judge pages</p>{data.judgeLinks?.filter((j) => dancing || !room || voteJudgeIds.has(j.id) || j.id === data.setup.headJudgeId).map((j) => { const assigned = stageJudges.some((s) => s.id === j.id); const submitted = assigned && submittedStage(j.id); const needsVote = !dancing && voteJudgeIds.has(j.id); const headWaiting = waitingForVotes && j.id === data.setup.headJudgeId; const needsDecision = !dancing && headDecisionNeeded && j.id === data.setup.headJudgeId; const needsApproval = !needsDecision && !dancing && reviewRounds.length > 0 && (!waitingForVotes || headReviewReady) && j.id === data.setup.headJudgeId; const missing = currentRounds.flatMap((r) => r.draftProgress?.filter((p) => p.judgeId === j.id).flatMap((p) => p.missing?.flatMap((h) => h.subjectIds) ?? []) ?? []).length; return <span className={'judge-status-card ' + (submitted && !needsVote && !needsDecision && !needsApproval && !headWaiting ? 'is-complete' : 'is-pending')} key={j.id}>{j.revoked ? <strong>{j.name} · Link revoked</strong> : <a href={j.path} target="_blank" rel="noreferrer">{j.id === data.setup.headJudgeId ? 'Head Judge — ' : ''}{j.name} ↗</a>}{(assigned || needsVote || needsDecision || needsApproval || headWaiting) && <small><span className="judge-state-symbol" aria-hidden="true">{needsVote || needsDecision || needsApproval ? '!' : headWaiting ? '◷' : submitted ? '✓' : missing ? '!' : '◷'}</span>{needsVote ? 'Advancement vote needed' : needsDecision ? 'Head tie decision needed' : needsApproval ? 'Head approval needed' : headWaiting ? 'Waiting for panel votes' : submitted ? 'Stage submitted' : missing ? missing + ' scores needed' : 'Awaiting submission'}</small>}{j.revoked && (needsVote || needsDecision || needsApproval || assigned && !submitted) && <button type="button" className="quiet-button judge-link-recovery" aria-label={'Manage link for ' + j.name} aria-controls={'judge-link-controls-' + j.id} onClick={() => openScoreSection('judge-link-controls-' + j.id)}>Manage link</button>}</span>;})}</div>}
      </div></section>
      {inlinePairing && data.status==='active' && <section id="pending-finals-draw" className="pending-finals-draw" aria-label="Actual Finals draw">{finalDrawForms()}</section>}
      <details id="score-supporting-details" className="score-supporting-details" open={data.context.automaticStages === false || undefined}><summary><span aria-hidden="true">▸</span> Competition details <small>Live scores, program &amp; records</small></summary><div className="page-stack score-supporting-content">
      <RoundContext data={data} selected={selectedRoundId} select={selectRound}><RoundScoreProgress data={data} selected={selectedRoundId} error={error} open={() => openScoreSection('run-live-scores')} /></RoundContext>
      <p className="score-view-hint">Choose a competition to inspect its scores.</p>
      <LiveScores data={data} selected={selectedRoundId} error={error} />
      <div className="stage-status-list">{(['prelims', 'finals'] as const).map((kind) => {
        const rounds = data.rounds.filter((r) => r.definition.kind === kind), opened = rounds.length > 0, approved = opened && rounds.every((r) => r.standings?.approved);
        const future = kind === 'finals' && !prelimsApproved;
        const errors = opened || future ? [] : issues(kind).map((issue) => issue.includes('actual Finals draw') ? issue.slice(0, issue.indexOf('Finalists are already selected.')) + 'Select and save the actual pairings below to open Finals scoring.' : issue);
        return <SetupSection key={kind} title={kind === 'prelims' ? 'Prelims' : 'Finals'} caption="Stage preparation" detailsRef={(node) => {if(node) node.id = `run-${kind}`;}} summaryText={approved ? 'Head approved' : opened ? rounds.some((r) => r.phase === 'dancing') ? 'In progress · all assigned songs available' : `Closed · waiting for ${headName} to approve` : future ? 'Not started · awaiting Prelims approval' : errors.length ? 'Not started · preparation needed' : 'Ready · scoring opens automatically'}><div className="form-body page-stack">
          {opened && <details><summary>Prepared heats &amp; songs</summary>{rounds.map((r) => <div key={r.key}><h3>{r.definition.format} · {r.definition.division}</h3>{r.definition.heats.map((h) => <div key={h.id}><h4>{h.name}</h4>{h.songs.map((p) => <p key={p.id}>{p.title} · {data.context.visited.includes(p.id) ? 'Performance recorded / pairings protected' : 'Prepared'}{data.context.stageSubmission && r.phase === 'dancing' && !data.context.stageReviewOpen && !data.context.visited.includes(p.id) && <button className="result-card-link" disabled={!canAct} onClick={() => { if(window.confirm('Record this song as performed? Its partnerships will be protected from replacement.')) void action({ action: 'record-performance', performanceId: p.id }); }}>Record as performed</button>}</p>)}</div>)}</div>)}<p>The first recorded mark protects a song’s pairings automatically. Before a withdrawal, record any performed song that has no marks yet.</p></details>}
          {opened ? <><p>{approved ? 'Stage approved.' : rounds.some((r) => r.phase === 'dancing') ? 'Stage started; judges navigate their assigned heats and songs independently.' : `Submissions complete. ${headName} must approve each current competition result.`}</p>{rounds.some((r) => r.standings) && !(room?.round.definition.kind === kind && !dancing && !allFinalsApproved) && <button className="quiet-button" onClick={() => reviewStage(kind)}>Review {kind} results</button>}</> : future ? <><p>Next stage · finish Prelims and obtain current head approval for every competition.</p>{data.rounds.some((r) => r.definition.kind === 'prelims' && r.standings) && !(room?.round.definition.kind === 'prelims' && !dancing) && <button className="quiet-button" onClick={() => reviewStage('prelims')}>Review prelims results</button>}</> : <>
            <p>{kind === 'prelims' ? 'Review the saved program, entries, heat assignments, songs and assigned judges.' : 'Current head-approved advancement supplies the finalists. Strictly uses the approved couples; J&J needs the actual draw saved below.'} Scoring opens automatically when the saved preparation is complete.</p>
            {errors.length > 0 && <div role="status"><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul><button className="quiet-button" onClick={() => reviewSetup(kind)}>Review {kind} setup</button></div>}
            {kind === 'finals' && !inlinePairing && finalDrawForms()}          </>}
        </div></SetupSection>;
      })}</div>
    {<SetupSection detailsRef={(node) => {if(node) node.id = "run-judge-access";}} title="Judge access" caption="Event-long private links" summaryText={`${data.judgeLinks?.length ?? 0} judges · Head: ${headName} · ${data.judgeLinks?.filter((j) => !j.revoked).length ?? 0} active / ${data.judgeLinks?.filter((j) => j.revoked).length ?? 0} revoked links`}><div className="form-body"><p>Each judge keeps one private link throughout the event. Active indicates access, not online presence or submission progress.</p>{data.judgeLinks?.map((j) => <div className="shared-inline score-judge-row" key={j.id}><strong>{j.name}{j.id === data.setup.headJudgeId ? ' · Head judge' : ''}</strong><span>{j.revoked ? 'Revoked' : 'Active'}</span><button className="quiet-button" disabled={j.revoked} onClick={() => void navigator.clipboard.writeText(new URL(j.path, window.location.origin).href).then(() => setNotice('Private judge link copied.')).catch(() => setNotice('Open the judge page and copy its address.'))}>Copy judge link</button><a className="quiet-button" href={j.path} target="_blank" rel="noreferrer">Open judge page</a><details id={'judge-link-controls-' + j.id} className="judge-link-maintenance"><summary aria-label={'Manage link for ' + j.name}>Manage link</summary><div className="shared-inline"><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Revoke ${j.name}’s link?`)) void action({ action: 'revoke-link', judgeId: j.id }); }}>Revoke</button><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Replace ${j.name}’s link?`)) void action({ action: 'replace-link', judgeId: j.id }); }}>Replace link</button></div></details></div>)}</div></SetupSection>}
    <ScoreProgress data={data} error={error} />
      </div></details>
    </div>}
    {page === 2 && <StageReview correctionDraft={correctionDraft} data={data} action={action} selectedRoundId={selectedRoundId} showRound={selectResultsRound} openHeadAccess={() => {setPage(1);setAccessRequested(true);}} setupRoute={setupRoute} navigate={setPage} />}
    {page === 3 && <PublicationPanel recovery={<Recovery {...recovery} disabled={busy} extra={recoveryExtra} history={data.restoredHistory}>{data.status==='archived' ? <button className="quiet-button" disabled={busy} onClick={()=>void action({action:'reactivate'})}>Return event to active</button> : <button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm('Archive this event and make all links read only? Scores and history stay saved; it can be returned to active later.')) void action({ action: 'archive' }); }}>Archive event</button>}<button className="quiet-button" disabled={busy || data.status !== 'archived'} onClick={async () => { if (!window.confirm('Permanently delete this archived test/event and all history?')) return; try { await liveApi(token, { action: 'delete', expectedVersion: data.version, requestId: crypto.randomUUID() }); window.location.assign('/'); } catch (error) { setNotice((error as Error).message); } }}>Delete archived event</button></Recovery>} data={data} action={action} navigate={setPage} route={(competitionId, targetPage, target) => { const round = data.setup.rounds.find((r) => r.competitionId === competitionId && (target?.roundId ? r.id === target.roundId : (!target?.kind || r.kind === target.kind) && (targetPage === 2 ? !data.rounds.find((v) => v.id === r.id)?.standings?.approved : true))); if(targetPage === 0) setupRoute(round?.id,target?.section); else { if(round) selectRound(round.id); setPage(targetPage); } }} />}


  </LiveShell>;
}
