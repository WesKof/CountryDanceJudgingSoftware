'use client';
import Recovery, { useRecovery } from './recovery';
import Link from 'next/link';
import { useRememberedPage } from './remembered-page';

import { useState, type ReactNode } from 'react';
import type { LiveSetup, LiveView } from '@/lib/live/types';
import { freezeRound, roundOpeningIssues } from '@/lib/live/validation';
import { liveApi, useLive } from './client';
import { LiveShell } from './shell';
import SetupEditor from './setup';
import SetupPage from './setup-page';
import SetupSection from './setup-section';
import { LiveResults } from './results';
import StageDesk from './stage-desk';

export default function LiveDesk({ token, setupIntro, sampleHelp, recoveryExtra }: { token: string; setupIntro?: ReactNode; sampleHelp?: ReactNode; recoveryExtra?: ReactNode }) {
  const { data, error, refresh } = useLive(token);
  const [page, setPage] = useRememberedPage(data?.role === 'organizer' && data.setup.workflow !== 'stage-v1' ? data.eventId : undefined); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LiveSetup | null>(null); const [draftVersion, setDraftVersion] = useState(0);
  const [correction, setCorrection] = useState(false); const [reason, setReason] = useState('');
  const [setupSaveError, setSetupSaveError] = useState('');
  const recovery = useRecovery(token);
  async function action(input: Record<string, unknown>) {
    if (!data) return false; setBusy(true); setNotice('');
    try { await liveApi(token, { ...input, expectedVersion: data.version, requestId: crypto.randomUUID() }); await refresh(); if(input.action==='discussion') setPage(2); return true; }
    catch (error) { setNotice((error as Error).message); await refresh(); return false; }
    finally { setBusy(false); }
  }
  async function saveSetup() {
    if (!data || !draft) return;
    if (correction && (!reason.trim() || !window.confirm('Apply this versioned setup correction? Current submissions and approvals will be invalidated; previous work stays in history.'))) return;
    setBusy(true); setSetupSaveError(''); setNotice('');
    try { const saved = await liveApi<{ ok?: unknown }>(token, { action: 'setup', setup: draft, expectedVersion: draftVersion, correction, reason, requestId: crypto.randomUUID() }); if (saved.ok !== true) throw new Error('Setup save was not confirmed. Your edits are still here.'); setDraft(null); setCorrection(false); setReason(''); setSetupSaveError(''); await refresh(); setNotice('Setup saved to the shared event.'); }
    catch (error) { setSetupSaveError((error as Error).message); }
    finally { setBusy(false); }
  }
  if (data && data.role !== 'organizer') return <p role="alert">Organizer access required.</p>;
  if (!data) return <LiveShell navigationDisabled title="Shared event" identity="Organizer desk" status={error ? 'Unable to open event' : 'Connecting…'} items={['Set up', 'Score', 'Results', 'Publish']} current={0} navigate={setPage}><p role="status">{error || 'Loading the private event…'}</p>{error && <Link className="quiet-button" href="/#other-events" prefetch={false}>Open saved events</Link>}<button className="quiet-button" onClick={() => void refresh()}>Retry</button></LiveShell>;
  if (data.role !== 'organizer') return <p role="alert">Open the organizer link to use this desk.</p>;
  if (data.setup.workflow === 'stage-v1') return <StageDesk key={`${token}/${data.eventId}`} token={token} data={data} error={error} refresh={refresh} setupIntro={setupIntro} sampleHelp={sampleHelp} recoveryExtra={recoveryExtra} />;
  const activeRound = data.rounds.find((r) => r.definition.heats.some((h) => h.songs.some((p) => p.id === data.context.performanceId)));
  const activeHeat = activeRound?.definition.heats.find((h) => h.songs.some((p) => p.id === data.context.performanceId));
  const song = activeHeat?.songs.find((p) => p.id === data.context.performanceId);
  const canAct = !busy && !draft && data.status === 'active';
  const setup = draft ?? data.setup;
  const currentBlock = data.setup.blocks.find((b) => b.id === data.context.blockId);
  const blockPerformances = (currentBlock?.roundIds ?? []).flatMap((id) => data.rounds.find((r) => r.id === id)?.definition.heats.flatMap((h) => h.songs) ?? []);
  const currentIndex = blockPerformances.findIndex((p) => p.id === data.context.performanceId);
  const songsRemain = currentIndex >= 0 && currentIndex < blockPerformances.length - 1;
  const readyForDiscussion = currentIndex === blockPerformances.length - 1 && blockPerformances.length > 0 && blockPerformances.every((p) => data.context.visited.includes(p.id));
  function openingIssues(block: LiveSetup['blocks'][number], current: LiveView) {
    const issues = block.roundIds.flatMap((id) => {
      const round = setup.rounds.find((r) => r.id === id);
      if(!round) return ['Save the changed setup before running this competition.'];
      const basic = roundOpeningIssues(setup, round);
      if (basic.length) return basic;
      try { freezeRound(setup, round); return []; } catch (error) {
        const c = setup.competitions.find((c) => c.id === round.competitionId)!;
        return [`${c.format} · ${c.division} · ${round.kind}: ${(error as Error).message}`];
      }
    });
    if (!block.roundIds.length) issues.push('Add a competition to this block in Set up.');
    if (block.kind === 'finals' && block.roundIds.some((id) => !current.rounds.find((r) => r.id === setup.rounds.find((s) => s.id === id)?.prelimRoundId)?.standings?.approved)) issues.push('The head judge must approve the matching prelims before finals.');
    if (current.rounds.some((r) => r.definition.blockId !== block.id && ['dancing', 'discussion'].includes(r.phase))) issues.push('Finish judging, submissions and head approval for the current block first.');
    return issues;
  }
  return <LiveShell title={data.setup.name} identity={`Organizer · Head judge: ${data.setup.judges.find((j) => j.id === data.setup.headJudgeId)?.name ?? 'Choose in setup'}`} status={error ? 'Connection interrupted' : data.status === 'archived' ? 'Archived · read only' : busy ? 'Saving…' : 'Shared event connected'} items={['Set up', 'Score', 'Results', 'Publish']} current={page} navigate={setPage}>
    {(notice || error) && <p className="notice" role="status">{notice || error}</p>}
    {page === 0 && <SetupPage openScoring={()=>setPage(1)} token={token} competitionCount={setup.competitions.length} hasRounds={setup.rounds.length > 0} hasDraft={Boolean(draft)} sampleHelp={sampleHelp} otherEvents={setupIntro} toolbar={<><button className="primary-button" aria-describedby={setupSaveError ? 'legacy-setup-save-error' : undefined} disabled={!draft || busy || data.status !== 'active'} onClick={() => void saveSetup()}>Save setup</button>{setupSaveError && <span id="legacy-setup-save-error" role="status">{setupSaveError}</span>}{draft && <><span>Unsaved setup edits</span><button className="quiet-button" onClick={() => { if (window.confirm('Discard the unsaved setup edits?')) {setDraft(null);setSetupSaveError('');} }}>Discard edits</button></>}{!draft && <span className="setup-save-feedback">Saved setup · changes need Save setup</span>}</>}>
      {data.rounds.length > 0 && data.status === 'active' && <details><summary>Versioned setup correction</summary><label className="check-label"><input type="checkbox" checked={correction} onChange={(e) => setCorrection(e.target.checked)} />Unlock frozen setup for an explicit correction</label><label><span>Correction reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label><p>Saving a correction invalidates current submissions and approvals and returns affected rounds to setup. Prior versions are retained.</p></details>}
      <fieldset disabled={busy || data.status !== 'active'} className="shared-unframed"><SetupEditor setup={setup} update={(next) => { if (!draft) setDraftVersion(data.version); setDraft(next); }} frozenIds={data.rounds.filter((r) => r.phase !== 'setup').map((r) => r.id)} correction={correction} /></fieldset>

    </SetupPage>}


    {page === 1 && <section className="form-panel"><div className="panel-heading"><h2>Score the competition</h2></div><div className="form-body page-stack">
      {draft && <p className="notice" role="status">Save your setup edits in Set up before starting judging. <button className="quiet-button" onClick={() => setPage(0)}>Go to Set up</button></p>}
      <section className="hero-panel"><div><p className="kicker">Current room context</p><h2>{song?.title ?? 'Ready to start judging'}</h2><p>{song ? `${song.artist} · ${activeRound!.definition.format} · ${activeRound!.definition.division} · ${activeRound!.definition.kind} · ${activeHeat!.name}` : 'Prepare every division and heat, save setup, then start prelims judging.'}</p>{song && <p>Song {currentIndex + 1} of {blockPerformances.length} in this block. Discussion starts after all divisions, heats and songs.</p>}</div></section>
      <div className="shared-grid">{data.setup.blocks.map((b) => {
        const opened = data.rounds.filter((r) => b.roundIds.includes(r.id) && r.phase !== 'setup');
        const issues = opened.length ? [] : openingIssues(b, data);
        return <section className="form-panel" key={b.id}><div className="panel-heading"><h2>{b.label}</h2></div><div className="form-body">
          <p>Start the music and judging first. Open discussion after every scheduled heat and song in this block.</p>
          <button className="primary-button" disabled={!canAct || opened.length > 0 || issues.length > 0} onClick={() => void action({ action: 'open-block', blockId: b.id })}>Start {b.kind} judging</button>
          {opened.length > 0 && <p>{opened.every((r) => r.phase === 'approved') ? 'Head approved.' : opened.some((r) => r.phase === 'dancing') ? 'Judging in progress.' : 'Discussion and finalized submissions are open.'}</p>}
          {issues.length > 0 && <div role="status"><p>Before starting:</p><ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul><button className="quiet-button" onClick={() => setPage(0)}>Review setup</button></div>}
        </div></section>;
      })}</div>
      <div className="shared-inline"><button className="quiet-button" disabled={!canAct || activeRound?.phase !== 'dancing' || !songsRemain} onClick={() => void action({ action: 'next' })}>Next song / heat</button><button className="primary-button" disabled={!canAct || activeRound?.phase !== 'dancing' || !readyForDiscussion} onClick={() => void action({ action: 'discussion' })}>Start discussion after all songs</button></div>
      {activeRound?.phase === 'dancing' && <p>{readyForDiscussion ? 'Final song reached. When the music finishes, start discussion and let judges finalize this block.' : 'Use Next song / heat as the program progresses. Complete all scheduled songs before opening discussion.'}</p>}
      {data.rounds.map((r) => <section className="form-panel" key={r.key}><div className="panel-heading"><h2>{r.definition.format} · {r.definition.division} · {r.definition.kind}</h2><span>{r.phase}</span></div><div className="form-body">{r.definition.judges.map((j) => <p key={j.id}>{j.name}: {r.submissions?.some((s) => s.judgeId === j.id) ? 'Finalized submission received' : 'Awaiting finalized submission'} · {r.draftProgress?.find((p) => p.judgeId === j.id)?.filled ?? 0} / {r.draftProgress?.find((p) => p.judgeId === j.id)?.required ?? 0} marks saved to event</p>)}<p>{r.standings?.submitted ?? 0} / {r.standings?.required ?? r.definition.judgeIds.length} submitted · {r.standings?.approved ? 'Head approved' : 'Approval pending'}</p></div></section>)}</div></section>}
    {page === 1 && <SetupSection title="Event-long private judge links" caption="Access" count={data.judgeLinks?.length ?? 0}><div className="form-body">{data.judgeLinks?.map((link) => <div className="shared-inline" key={link.id}><strong>{link.name}{link.id === data.setup.headJudgeId ? ' · Head judge' : ''}</strong><span>{link.revoked ? 'Revoked' : 'Active'}</span><button className="quiet-button" disabled={link.revoked} onClick={() => void navigator.clipboard.writeText(new URL(link.path, window.location.origin).href).then(() => setNotice(`${link.name}’s link copied. Send it individually.`)).catch(() => setNotice('Clipboard unavailable. Use Open judge page and copy its address.'))}>Copy judge link</button><a className="quiet-button" href={link.path} target="_blank" rel="noreferrer">Open judge page</a><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Revoke ${link.name}’s current link?`)) void action({ action: 'revoke-link', judgeId: link.id }); }}>Revoke</button><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Replace ${link.name}’s link? The old link will stop working.`)) void action({ action: 'replace-link', judgeId: link.id }); }}>Replace link</button></div>)}</div></SetupSection>}
    {page === 2 && <><LiveResults data={data} action={action} />{data.rounds.length === 0 && <p>Open and complete a judging block to review results.</p>}</>}
    {page === 3 && <Recovery {...recovery} disabled={busy} extra={recoveryExtra} history={data.restoredHistory}><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm('Archive this shared event? All links become read only.')) void action({ action: 'archive' }); }}>Archive event</button><button className="quiet-button" disabled={busy || data.status !== 'archived'} onClick={async () => { if (!window.confirm('Permanently delete this archived event and all its shared ballots, notes, links and history?')) return; try { await liveApi(token, { action: 'delete', expectedVersion: data.version, requestId: crypto.randomUUID() }); window.location.assign('/'); } catch (error) { setNotice((error as Error).message); } }}>Delete archived event</button></Recovery>}
    {page === 3 && <p>New publication of legacy-only events is deferred. Use Data & recovery here to manage backups and retained history.</p>}
  </LiveShell>;
}
