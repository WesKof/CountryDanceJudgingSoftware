'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { LiveSetup, LiveView } from '@/lib/live/types';
import { finalistLimitIssues, freezeRound, roundOpeningIssues } from '@/lib/live/validation';
import { creationNonce, download, liveApi } from './client';
import { LiveShell } from './shell';
import SetupEditor from './setup';
import SetupPage from './setup-page';
import SetupSection from './setup-section';
import FinalsPairings from './finals-pairings';
import { PublicationPanel } from './publication';
import { StageReview } from './stage-review';
import RoundContext from './round-context';
import ScoreProgress from './score-progress';
import LiveScores, { RoundScoreProgress } from './live-scores';

type Props = { token: string; data: LiveView; error: string; refresh: () => Promise<LiveView | null>; setupIntro?: ReactNode; sampleHelp?: ReactNode; recoveryExtra?: ReactNode };
export default function StageDesk({ token, data, error, refresh, setupIntro, sampleHelp, recoveryExtra }: Props) {
  const [page, setPage] = useState(0), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [setupRoundId, setSetupRoundId] = useState<string | undefined>();
  const [setupSection, setSetupSection] = useState<string | undefined>();
  const [accessRequested, setAccessRequested] = useState(false);
  useEffect(() => {
    if(page !== 1 || !accessRequested) return;
    const section = document.getElementById("run-judge-access");
    if(section instanceof HTMLDetailsElement) section.open = true;
    section?.scrollIntoView({block:"center"});section?.querySelector<HTMLElement>("summary")?.focus({preventScroll:true});
    queueMicrotask(() => setAccessRequested(false));
  }, [page, accessRequested]);
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
  function reviewStage(kind: 'prelims' | 'finals') {
    const rounds = data.rounds.filter((r) => r.definition.kind === kind);
    showRound((rounds.find((r) => !r.standings?.approved) ?? rounds[0])?.id ?? '');
  }
  function navigate(targetPage: number) { if(targetPage === 0) {setSetupRoundId(undefined);setSetupSection(undefined);} setPage(targetPage); }
  function setupRoute(roundId?: string, section = 'Round setup') { setSetupRoundId(roundId); setSetupSection(section); if (roundId) selectRound(roundId); setPage(0); }
  function openScoreSection(id: string) {
    const section = document.getElementById(id);
    if (section instanceof HTMLDetailsElement) section.open = true;
    section?.scrollIntoView({ block: 'center' });
    section?.querySelector<HTMLElement>(':scope > summary')?.focus({ preventScroll: true });
  }

  const [draft, setDraft] = useState<LiveSetup | null>(null), [draftVersion, setDraftVersion] = useState(0);
  const [pairingDraft, setPairingDraft] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  async function action(input: Record<string, unknown>) {
    setBusy(true); setNotice('');
    try { const current = await refresh(); if (!current) throw new Error('Reconnect before applying a shared action.'); await liveApi(token, { ...input, expectedVersion: current.version, requestId: crypto.randomUUID() }); await refresh(); if(input.action==='conclude-stage') reviewStage(block?.kind ?? 'prelims'); return true; }
    catch (error) { setNotice((error as Error).message); await refresh(); return false; } finally { setBusy(false); }
  }
  async function saveSetup() {
    if (!draft) return false; setBusy(true);
    try { await liveApi(token, { action: 'setup', setup: draft, expectedVersion: draftVersion, requestId: crypto.randomUUID() }); setDraft(null);setPairingDraft(false); await refresh(); setNotice(pairingDraft ? 'Finals pairings saved. Start Finals when all divisions are ready.' : 'Setup saved to the shared event.');return true; }
    catch (error) { setNotice((error as Error).message);await refresh();return false; } finally { setBusy(false); }
  }
  async function backup() {
    try { const result = await liveApi(token, { action: 'backup', includeNotes, requestId: crypto.randomUUID() }); download('shared-stage-event-backup.json', JSON.stringify(result, null, 2)); } catch (error) { setNotice((error as Error).message); }
  }
  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file || !window.confirm('Restore into a new event with new links and inert historical records?')) return;
    try { if (file.size > 1500000) throw new Error('Backup is too large.'); const r = await liveApi<{ path: string }>('', { action: 'restore', requestId: creationNonce(), backup: JSON.parse(await file.text()) }); window.location.assign(`/?event=${r.path.split('/').at(-1)}`); } catch (error) { setNotice((error as Error).message); }
  }
  async function withdraw(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (!window.confirm('Request withdrawal? Both organizer and head approvals are required. All judging records remain in history.')) return;
    await action({ action: 'request-withdrawal', competitionId: String(f.get('competition')), reason: String(f.get('reason')) });
  }
  const withdrawnIdsByRound = Object.fromEntries(data.rounds.map((r) => [r.id, r.definition.withdrawnIds ?? []]));
  const savedLimitIssues = finalistLimitIssues(data.setup, withdrawnIdsByRound);
  const countFixRound = data.setup.rounds.find((r) => r.kind === 'finals' && finalistLimitIssues({...data.setup, rounds: data.setup.rounds.filter((x) => x.kind !== 'finals' || x.id === r.id)}, withdrawnIdsByRound).length);
  const draftLimitIssues = draft ? finalistLimitIssues(draft, withdrawnIdsByRound) : [];
  const approvedPrelimIds = data.rounds.filter((r) => r.definition.kind === 'prelims' && r.standings?.approved && (!draft || draft.rounds.find((f) => f.prelimRoundId === r.id)?.finalistCount === data.setup.rounds.find((f) => f.prelimRoundId === r.id)?.finalistCount)).map((r) => r.id);
  const canAct = !busy && !draft && data.status === 'active';
  const block = data.setup.blocks.find((b) => b.id === data.context.blockId);
  const order = (block?.roundIds ?? []).flatMap((rid) => { const r = data.rounds.find((r) => r.id === rid); return r?.definition.heats.map((h) => ({ round: r, heat: h })) ?? []; });
  const room = order.find((x) => x.heat.songs.some((p) => p.id === data.context.performanceId)), song = room?.heat.songs.find((p) => p.id === data.context.performanceId);
  const songIndex = room?.heat.songs.findIndex((p) => p.id === song?.id) ?? -1, heatIndex = order.findIndex((x) => x.heat.id === room?.heat.id);
  const lastSong = Boolean(room && songIndex === room.heat.songs.length - 1), lastHeat = room && heatIndex === order.length - 1;
  const missing = room?.round.definition.judgeIds.filter((j) => !data.heatSubmissions?.some((s) => s.roundKey === room.round.key && s.heatId === room.heat.id && s.judgeId === j)) ?? [];
  const selectedRoundId = [...data.setup.rounds, ...data.rounds].some((r) => r.id === selection) ? selection! : data.setup.rounds[0]?.id ?? data.rounds[0]?.id ?? '';
  const headName = data.setup.judges.find((j) => j.id === data.setup.headJudgeId)?.name ?? 'the head judge';
  const allFinalsApproved = data.setup.competitions.length > 0 && data.setup.competitions.every((c) => data.rounds.some((r) => r.definition.competitionId === c.id && r.definition.kind === 'finals' && r.standings?.approved));
  const prelimsApproved = data.setup.blocks.find((b) => b.kind === 'prelims')?.roundIds.every((id) => data.rounds.find((r) => r.id === id)?.standings?.approved) && data.rounds.some((r) => r.definition.kind === 'prelims');
  const dancing = room?.round.phase === 'dancing', lineup = data.context.lineupHeatId === room?.heat.id;
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
  function reviewSetup(kind: 'prelims' | 'finals') {
    const stage = data.setup.blocks.find((b) => b.kind === kind);
    const target = data.setup.rounds.find((r) => stage?.roundIds.includes(r.id) && roundOpeningIssues(data.setup, r).length);
    setupRoute(target?.id ?? stage?.roundIds[0], !data.setup.competitions.length ? 'Program & stages' : !data.setup.headJudgeId || !data.setup.separationAttested ? 'Judges' : 'Round setup');
  }
  return <LiveShell title={data.setup.name} identity={`Organizer · Head: ${data.setup.judges.find((j) => j.id === data.setup.headJudgeId)?.name ?? 'Choose in setup'}`} status={busy ? 'Saving…' : error || (data.status === 'archived' ? 'Archived · read only' : 'Shared event connected')} items={['Set up', 'Score', 'Results', 'Publish']} current={page} navigate={navigate}>
    {notice && <p className="notice" role="status">{notice}</p>}
    {page === 0 && draftLimitIssues.map((issue) => <p className="notice" role="status" key={issue}>{issue}</p>)}
    {page === 0 && <SetupPage token={token} competitionCount={(draft ?? data.setup).competitions.length} hasRounds={(draft ?? data.setup).rounds.length > 0} hasDraft={Boolean(draft)} sampleHelp={sampleHelp} otherEvents={setupIntro} toolbar={<><button className="primary-button" disabled={!draft || draftLimitIssues.length > 0 || busy || data.status !== 'active'} onClick={() => void saveSetup()}>Save setup</button>{!draft && <span className="setup-save-feedback">Saved setup · changes need Save setup</span>}{draft && <><span>Unsaved setup edits{draftVersion !== data.version ? " · Event changed; discard and review the saved version" : ""}</span><button className="quiet-button" onClick={() => { if (window.confirm('Discard the unsaved setup edits?')) {setDraft(null);setPairingDraft(false);} }}>Discard edits</button></>}</>}><fieldset className="shared-unframed" disabled={data.status !== 'active'}><SetupEditor approvedPrelimIds={approvedPrelimIds} withdrawnIdsByRound={withdrawnIdsByRound} initialRoundId={setupRoundId} initialSection={setupSection} viewRoundId={selectedRoundId} onSelectRound={selectRound} setup={draft ?? data.setup} update={(s) => { if (!draft) setDraftVersion(data.version); setDraft(s); }} frozenIds={data.rounds.filter((r) => r.phase !== 'setup').map((r) => r.id)} correction={false} /></fieldset></SetupPage>}

    {page === 2 && <RoundContext data={data} selected={selectedRoundId} select={selectRound} overview />}
    {page === 1 && <div className="score-work page-stack">
      <section className="hero-panel score-current" aria-label="Current stage and next action"><div>
      {draft && <p className="score-blocker" role="status">{pairingDraft ? 'Save Finals pairings before starting judging.' : 'Save setup before starting judging.'} {pairingDraft ? <button className="quiet-button" onClick={() => openScoreSection('run-finals')}>Review Finals preparation</button> : <button className="quiet-button" onClick={()=>navigate(0)}>Go to Set up</button>}</p>}
      {savedLimitIssues.length > 0 && <div className="score-blocker" role="status">{savedLimitIssues.map((issue) => <p key={issue}>{issue}</p>)}<button className="quiet-button" onClick={() => setupRoute(countFixRound?.id, 'Finalists & pairings')}>Fix finalist count</button></div>}
      <p className="kicker">{room ? `${room.round.definition.kind} · ${room.round.definition.format} · ${room.round.definition.division} · ${room.heat.name}` : 'Room running order'}</p>
        <h2>{data.status === 'archived' ? 'Archived event' : allFinalsApproved ? 'Event results approved' : room && !dancing ? `${room.round.definition.kind === 'prelims' ? 'Prelims' : 'Finals'} review` : song?.title ?? 'Ready to start a stage'}</h2>
        {data.status === 'archived' ? <><p>Judging is read only. Submitted ballots, results and history remain available.</p><button className="quiet-button" onClick={() => showRound(selectedRoundId)}>View results &amp; history</button></> : allFinalsApproved ? <><p>Every competition has head-approved Finals. Review the complete event before sending it for website-admin approval.</p><button className="primary-button" onClick={() => setPage(3)}>Review event to publish</button></> : room && !dancing ? <><p>{prelimsApproved && room.round.definition.kind === 'prelims' ? 'Prelims approved. Prepare the actual Finals draw and save it before starting Finals.' : `Submitted scores are ready for review. ${headName} reviews each competition from their private judge page.`}</p><button className="quiet-button" onClick={() => reviewStage(room.round.definition.kind)}>Review {room.round.definition.kind} results</button></> : !room ? <p>Start Prelims for every competition in the saved program. The view selector does not change the running order.</p> : null}
        {room && dancing && <><p>Heat {heatIndex + 1} of {order.length} · Song {songIndex + 1} of {room.heat.songs.length}. {lineup ? 'Heat-end lineup check.' : 'Judging in progress.'}</p><p role="status">{room.round.definition.judgeIds.length - missing.length} of {room.round.definition.judgeIds.length} required judges submitted this heat{error ? ' · Last connected status; reconnect to confirm' : ' · acknowledged by the event'}.{missing.length > 0 && ` Waiting for ${missing.map((id) => room.round.definition.judges.find((j) => j.id === id)?.name ?? 'assigned judge').join(', ')}.`}</p></>}
      {dancing && <div className="score-live-controls"><div className="shared-inline">
        <button className={lastSong && !lineup ? 'primary-button' : 'quiet-button'} disabled={!canAct || !lastSong || lineup} onClick={() => void action({ action: 'lineup' })}>Open heat-end lineup</button>
        <button className={!lastSong || (lineup && !missing.length && !lastHeat) ? 'primary-button' : 'quiet-button'} disabled={!canAct || (lastSong && (!lineup || missing.length > 0 || Boolean(lastHeat)))} onClick={() => void action({ action: 'next' })}>{lastSong ? 'Next heat / division' : 'Next song'}</button>
        <button className={lastHeat && lastSong && lineup && !missing.length ? 'primary-button' : 'quiet-button'} disabled={!canAct || !lastHeat || !lastSong || !lineup || missing.length > 0} onClick={() => void action({ action: 'conclude-stage' })}>Conclude stage &amp; open review</button>
      </div><p role="status">{!lastSong ? 'Finish this heat’s songs before lineup and final submission.' : !lineup ? 'Open the lineup check for judges to verify bibs and finalize this heat.' : missing.length ? `Waiting for ${missing.length} required submission${missing.length === 1 ? '' : 's'}: ${missing.map((id) => data.setup.judges.find((j) => j.id === id)?.name).join(', ')}.` : lastHeat ? 'Every required heat submission is acknowledged. Conclude the stage for read-only review.' : 'All required submissions acknowledged. Advance to the next heat.'}</p></div>}
      {nextStage && data.status === 'active' && <div className="score-start-controls"><button className="primary-button" disabled={!canAct || startIssues.length > 0} onClick={() => void action({ action: 'open-stage', kind: nextStage })}>Start {nextStage} stage</button>
        {startIssues.length > 0 && <div role="status"><ul>{startIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>{nextStage === 'finals' ? <button className="quiet-button" onClick={() => openScoreSection('run-finals')}>Review Finals preparation</button> : <button className="quiet-button" onClick={() => reviewSetup(nextStage)}>Review {nextStage} setup</button>}</div>}
      </div>}
      <div className="shared-inline score-shortcuts"><button className="quiet-button" onClick={() => openScoreSection('run-judge-access')}>Judge access</button><button className="quiet-button" onClick={() => openScoreSection('run-submissions')}>View submission details</button></div>
      </div></section>
      <RoundContext data={data} selected={selectedRoundId} select={selectRound}><RoundScoreProgress data={data} selected={selectedRoundId} error={error} open={() => openScoreSection('run-live-scores')} /></RoundContext>
      <p className="score-view-hint">The competition/round selector changes your view only. The current stage and floor controls above follow the saved event running order.</p>
      <LiveScores data={data} selected={selectedRoundId} error={error} />
      <div className="stage-status-list">{(['prelims', 'finals'] as const).map((kind) => {
        const rounds = data.rounds.filter((r) => r.definition.kind === kind), opened = rounds.length > 0, approved = opened && rounds.every((r) => r.standings?.approved);
        const future = kind === 'finals' && !prelimsApproved;
        const errors = opened || future ? [] : issues(kind).map((issue) => issue.includes('actual Finals draw') ? issue.slice(0, issue.indexOf('Finalists are already selected.')) + 'Select and save the actual pairings below before starting Finals.' : issue);
        return <SetupSection key={kind} title={kind === 'prelims' ? 'Prelims' : 'Finals'} caption="Stage preparation" detailsRef={(node) => {if(node) node.id = `run-${kind}`;}} summaryText={approved ? 'Head approved' : opened ? rounds.some((r) => r.phase === 'dancing') ? 'In progress · follow the current heat above' : `Closed · waiting for ${headName} to approve` : future ? 'Not started · awaiting Prelims approval' : errors.length ? 'Not started · preparation needed' : 'Ready to start'}><div className="form-body page-stack">
          {opened ? <><p>{approved ? 'Stage approved.' : rounds.some((r) => r.phase === 'dancing') ? 'Stage started; finish all heats before review.' : `Submissions complete. ${headName} must approve each current competition result.`}</p>{rounds.some((r) => r.standings) && !(room?.round.definition.kind === kind && !dancing && !allFinalsApproved) && <button className="quiet-button" onClick={() => reviewStage(kind)}>Review {kind} results</button>}</> : future ? <><p>Next stage · finish Prelims and obtain current head approval for every competition.</p>{data.rounds.some((r) => r.definition.kind === 'prelims' && r.standings) && !(room?.round.definition.kind === 'prelims' && !dancing) && <button className="quiet-button" onClick={() => reviewStage('prelims')}>Review prelims results</button>}</> : <>
            <p>{kind === 'prelims' ? 'Review the saved program, entries, heat assignments, songs and assigned judges.' : 'Current head-approved advancement supplies the finalists. Strictly uses the approved couples; J&J needs the actual draw saved below.'} Start the stage using the controls at the top.</p>
            {errors.length > 0 && <div role="status"><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul><button className="quiet-button" onClick={() => reviewSetup(kind)}>Review {kind} setup</button></div>}
            {kind === 'finals' && data.setup.rounds.filter((f) => f.kind === 'finals' && data.setup.competitions.find((c) => c.id === f.competitionId)?.format === 'Jack & Jill' && data.rounds.find((r) => r.id === f.prelimRoundId)?.standings?.approved).map((f) => <FinalsPairings key={f.id} setup={data.setup} round={f} draft={pairingDraft ? draft : null} version={data.version} sourceVersion={draftVersion} disabled={busy || Boolean(draft && !pairingDraft) || data.status !== 'active'} update={(s) => {if (!draft) setDraftVersion(data.version);setDraft(s);setPairingDraft(true);}} save={saveSetup} discard={() => {setDraft(null);setPairingDraft(false);}} />)}
          </>}
        </div></SetupSection>;
      })}</div>
    </div>}
    {page === 1 && <SetupSection detailsRef={(node) => {if(node) node.id = "run-judge-access";}} title="Judge access" caption="Event-long private links" summaryText={`${data.judgeLinks?.length ?? 0} judges · Head: ${headName} · ${data.judgeLinks?.filter((j) => !j.revoked).length ?? 0} active / ${data.judgeLinks?.filter((j) => j.revoked).length ?? 0} revoked links`}><div className="form-body"><p>Each judge keeps one private link throughout the event. Active indicates access, not online presence or submission progress.</p>{data.judgeLinks?.map((j) => <div className="shared-inline score-judge-row" key={j.id}><strong>{j.name}{j.id === data.setup.headJudgeId ? ' · Head judge' : ''}</strong><span>{j.revoked ? 'Revoked' : 'Active'}</span><button className="quiet-button" disabled={j.revoked} onClick={() => void navigator.clipboard.writeText(new URL(j.path, window.location.origin).href).then(() => setNotice('Private judge link copied.')).catch(() => setNotice('Open the judge page and copy its address.'))}>Copy judge link</button><a className="quiet-button" href={j.path} target="_blank" rel="noreferrer">Open judge page</a><details className="judge-link-maintenance"><summary>Manage link</summary><div className="shared-inline"><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Revoke ${j.name}’s link?`)) void action({ action: 'revoke-link', judgeId: j.id }); }}>Revoke</button><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Replace ${j.name}’s link?`)) void action({ action: 'replace-link', judgeId: j.id }); }}>Replace link</button></div></details></div>)}</div></SetupSection>}
    {page === 1 && <ScoreProgress data={data} error={error} />}
    {page === 2 && <StageReview data={data} action={action} selectedRoundId={selectedRoundId} showRound={showRound} openHeadAccess={() => {setPage(1);setAccessRequested(true);}} setupRoute={setupRoute} navigate={setPage} managementExtra={<> {data.rounds.length > 0 && <SetupSection title="Withdraw a started competition" caption="Eligibility"><div className="form-body"><form onSubmit={(e) => void withdraw(e)}><label><span>Competition to withdraw</span><select name="competition" aria-label="Competition to withdraw">{data.setup.competitions.filter((c) => data.rounds.some((r) => r.definition.competitionId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.format} · {c.division}</option>)}</select></label><label><span>Withdrawal reason</span><input name="reason" required maxLength={500} /></label><button className="quiet-button" disabled={!canAct}>Request competition withdrawal</button></form><p>Both roles must approve. Scores, submissions, amendments and earlier approval snapshots remain in history.</p></div></SetupSection>}{data.rounds.length > 0 && <EntrantWithdrawal data={data} action={action} />} </>} />}
    {page === 3 && <PublicationPanel data={data} action={action} navigate={setPage} route={(competitionId, targetPage, kind) => { const round = data.setup.rounds.find((r) => r.competitionId === competitionId && (!kind || r.kind === kind) && (targetPage === 2 ? !data.rounds.find((v) => v.id === r.id)?.standings?.approved : true)); if(targetPage === 0) setupRoute(round?.id); else { if(round) selectRound(round.id); setPage(targetPage); } }} />}
    {page === 3 && <SetupSection title="Data & recovery" caption="Data management"><div className="form-body">{recoveryExtra}<label className="check-label"><input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />Include private notes in this backup (anyone with the file can read them)</label><p>Operational JSON recovery excludes credentials and private notes by default. A restore creates a fresh event with historical records.</p><button className="quiet-button" onClick={() => void backup()}>Download shared backup</button><label className="file-button secondary">Restore as a new shared event<input type="file" accept="application/json,.json" onChange={(e) => void restore(e)} /></label>{data.restoredHistory != null && <details><summary>Restored historical record</summary><pre className="shared-json">{JSON.stringify(data.restoredHistory, null, 2)}</pre></details>}<section className="form-panel"><div className="form-body"><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm('Archive this event and make all links read only?')) void action({ action: 'archive' }); }}>Archive event</button><button className="quiet-button" disabled={busy || data.status !== 'archived'} onClick={async () => { if (!window.confirm('Permanently delete this archived test/event and all history?')) return; try { await liveApi(token, { action: 'delete', expectedVersion: data.version, requestId: crypto.randomUUID() }); window.location.assign('/'); } catch (error) { setNotice((error as Error).message); } }}>Delete archived event</button></div></section></div></SetupSection>}

  </LiveShell>;
}

function EntrantWithdrawal({data,action}:{data:LiveView;action:(input:Record<string,unknown>)=>Promise<boolean>}) {
  const [selected,setSelected]=useState(''),[plan,setPlan]=useState('[]'),[planError,setPlanError]=useState('');
  const r=data.rounds.find((r)=>r.key===selected) ?? data.rounds[0];
  const pending=data.reviewRequests?.filter((q)=>q.kind==='withdrawal' && q.payload.subjectId && !q.appliedAt && !q.cancelledAt) ?? [];
  return <SetupSection title="Withdraw a started entrant/couple" caption="Eligibility"><div className="form-body"><p>Both organizer and head explicitly approve the exact request. Fixed partners withdraw together. Marks remain. J&amp;J requires a reviewed plan for every undanced song.</p><form onSubmit={(e)=>{e.preventDefault(); const f=new FormData(e.currentTarget); if(!r) return; let pairingPlan; try{pairingPlan=JSON.parse(plan);setPlanError('');}catch{setPlanError('Enter a valid JSON pairing plan.');return;} void action({action:'request-withdrawal',roundKey:r.key,competitionId:r.definition.competitionId,subjectId:String(f.get('subject')),reason:String(f.get('reason')),pairingPlan, ...(f.get('revise') ? {reviewRequestId:String(f.get('revise'))} : {})});}}><label><span>Withdrawal round</span><select value={r?.key ?? ''} onChange={(e)=>setSelected(e.target.value)}>{data.rounds.map((r)=><option key={r.key} value={r.key}>{r.definition.format} · {r.definition.division} · {r.definition.kind}</option>)}</select></label><label><span>Withdrawal entrant/couple</span><select name="subject">{r?.definition.subjects.filter((s)=>!r.definition.withdrawnIds?.includes(s.id)).map((s)=><option key={s.id} value={s.id}>#{s.number} {s.primary} {s.secondary}</option>)}</select></label><label><span>Withdrawal reason</span><input name="reason" required maxLength={500}/></label><label><span>Revise pending withdrawal (optional)</span><select name="revise" aria-label="Revise pending withdrawal (optional)"><option value="">New request</option>{pending.map((q)=><option key={q.id} value={q.id}>Request version {q.version}: {q.reason}</option>)}</select></label>{r?.definition.format==='Jack & Jill' && r.definition.kind==='prelims' && <><label><span>Exact undanced pairing plan JSON</span><textarea value={plan} onChange={(e)=>setPlan(e.target.value)} rows={5}/></label><details><summary>Undanced song and entrant identities</summary><pre className="shared-json">{JSON.stringify({songs:r.definition.heats.flatMap((h)=>h.songs.filter((p)=>!data.context.visited.includes(p.id)).map((p)=>({performanceId:p.id,partners:p.partners}))),entrants:r.definition.subjects.map((s)=>({id:s.id,bib:s.number,role:s.role}))},null,2)}</pre></details></>}{planError&&<p role="alert">{planError}</p>}<button className="quiet-button" disabled={!r}>Request entrant withdrawal</button></form></div></SetupSection>;
}
