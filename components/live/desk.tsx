'use client';

import { useState, type ChangeEvent } from 'react';
import { serializeCsv } from '@/lib/csv';
import type { LiveSetup, LiveView, RoundView } from '@/lib/live/types';
import { freezeRound, roundOpeningIssues } from '@/lib/live/validation';
import { creationNonce, download, liveApi, useLive } from './client';
import { LiveShell } from './shell';
import SetupEditor from './setup';
import { LiveResults } from './results';

function exportRows(data: LiveView, rounds: RoundView[]) {
  const safe = (value: string | number) => typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? `'${value}` : String(value);
  return [['Event', 'Format', 'Division', 'Round', 'Group', 'Status', 'Approved Place', 'Provisional Place', 'Bib', 'Primary', 'Secondary', 'Average Score', 'Sum in Tenths', 'Required Marks', 'Submission Fingerprint'], ...rounds.flatMap((r) => r.standings!.rows.map((row) => [data.setup.name, r.definition.format, r.definition.division, r.definition.kind, row.group, r.standings!.approved ? 'Head approved' : 'Provisional', r.standings!.approved ? row.place : '', row.place, row.number, row.primary, row.secondary, row.average, row.sumTenths, row.denominator, r.standings!.fingerprint].map(safe)))];
}
export default function LiveDesk({ token }: { token: string }) {
  const { data, error, refresh } = useLive(token);
  const [page, setPage] = useState(0); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LiveSetup | null>(null); const [draftVersion, setDraftVersion] = useState(0);
  const [correction, setCorrection] = useState(false); const [reason, setReason] = useState('');
  const [includeNotes, setIncludeNotes] = useState(false); const [publisherUrl, setPublisherUrl] = useState(''); const [publisherKey, setPublisherKey] = useState('');
  async function action(input: Record<string, unknown>) {
    if (!data) return false; setBusy(true); setNotice('');
    try { await liveApi(token, { ...input, expectedVersion: data.version, requestId: crypto.randomUUID() }); await refresh(); return true; }
    catch (error) { setNotice((error as Error).message); await refresh(); return false; }
    finally { setBusy(false); }
  }
  async function saveSetup() {
    if (!data || !draft) return;
    if (correction && (!reason.trim() || !window.confirm('Apply this versioned setup correction? Current submissions and approvals will be invalidated; previous work stays in history.'))) return;
    setBusy(true);
    try { await liveApi(token, { action: 'setup', setup: draft, expectedVersion: draftVersion, correction, reason, requestId: crypto.randomUUID() }); setDraft(null); setCorrection(false); setReason(''); await refresh(); setNotice('Setup saved to the shared event.'); }
    catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function backup() {
    try { const result = await liveApi(token, { action: 'backup', includeNotes, requestId: crypto.randomUUID() }); download('shared-event-backup.json', JSON.stringify(result, null, 2)); }
    catch (error) { setNotice((error as Error).message); }
  }
  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    if (!window.confirm('Restore this backup into a new event with new private links? This event will stay as it is. Historical results remain historical.')) return;
    try { if (file.size > 1500000) throw new Error('Backup is too large.'); const result = await liveApi<{ path: string }>('', { action: 'restore', requestId: creationNonce(), backup: JSON.parse(await file.text()) }); window.location.assign(result.path); }
    catch (error) { setNotice((error as Error).message); }
  }
  async function publish() {
    if (!data) return;
    try {
      const url = new URL(publisherUrl); if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !url.pathname.startsWith('/macros/s/') || !url.pathname.endsWith('/exec')) throw new Error('Use the organizer’s Google Apps Script /exec URL.');
      const approved = data.rounds.filter((r) => r.standings?.approved); if (!approved.length || !publisherKey) throw new Error('Head-approved results and a publishing key are required.');
      const body = new URLSearchParams({ results: JSON.stringify(exportRows(data, approved)), publishingKey: publisherKey });
      const response = await fetch(url, { method: 'POST', body }); const result = await response.json() as { success?: boolean; error?: string }; if (!result.success) throw new Error(result.error ?? 'Publishing failed.'); setNotice('Approved results sent to the organizer’s Google Sheet.');
    } catch (error) { setNotice((error as Error).message); }
  }
  if (!data) return <LiveShell title="Shared event" identity="Organizer desk" status="Connecting…" items={['Set up', 'Score', 'Results', 'Publish']} current={0} navigate={setPage}><p role="status">{error || 'Loading the private event…'}</p><button className="quiet-button" onClick={() => void refresh()}>Retry</button></LiveShell>;
  if (data.role !== 'organizer') return <p role="alert">Open the organizer link to use this desk.</p>;
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
      const round = setup.rounds.find((r) => r.id === id)!;
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
    {page === 0 && <div className="page-stack"><div className="shared-inline"><button className="primary-button" disabled={!draft || busy || data.status !== 'active'} onClick={() => void saveSetup()}>Save setup</button>{draft && <><span>Unsaved setup edits</span><button className="quiet-button" onClick={() => { if (window.confirm('Discard the unsaved setup edits?')) setDraft(null); }}>Discard edits</button></>}<button className="quiet-button" onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setNotice('Organizer link copied. Keep it private.')).catch(() => setNotice('Copy the organizer link from your browser address bar.'))}>Copy organizer link</button></div>
      {data.rounds.length > 0 && data.status === 'active' && <details><summary>Versioned setup correction</summary><label className="check-label"><input type="checkbox" checked={correction} onChange={(e) => setCorrection(e.target.checked)} />Unlock frozen setup for an explicit correction</label><label><span>Correction reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label><p>Saving a correction invalidates current submissions and approvals and returns affected rounds to setup. Prior versions are retained.</p></details>}
      <fieldset disabled={data.status !== 'active'} className="shared-unframed"><SetupEditor setup={setup} update={(next) => { if (!draft) setDraftVersion(data.version); setDraft(next); }} frozenIds={data.rounds.filter((r) => r.phase !== 'setup').map((r) => r.id)} correction={correction} /></fieldset>
      <section className="form-panel"><div className="panel-heading"><h2>Event-long private judge links</h2></div><div className="form-body">{data.judgeLinks?.map((link) => <div className="shared-inline" key={link.id}><strong>{link.name}{link.id === data.setup.headJudgeId ? ' · Head judge' : ''}</strong><span>{link.revoked ? 'Revoked' : 'Active'}</span><button className="quiet-button" disabled={link.revoked} onClick={() => void navigator.clipboard.writeText(new URL(link.path, window.location.origin).href).then(() => setNotice(`${link.name}’s link copied. Send it individually.`)).catch(() => setNotice('Clipboard unavailable. Use Open judge page and copy its address.'))}>Copy judge link</button><a className="quiet-button" href={link.path} target="_blank" rel="noreferrer">Open judge page</a><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Revoke ${link.name}’s current link?`)) void action({ action: 'revoke-link', judgeId: link.id }); }}>Revoke</button><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Replace ${link.name}’s link? The old link will stop working.`)) void action({ action: 'replace-link', judgeId: link.id }); }}>Replace link</button></div>)}</div></section>
    </div>}
    {page === 1 && <div className="page-stack">
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
      {data.rounds.map((r) => <section className="form-panel" key={r.key}><div className="panel-heading"><h2>{r.definition.format} · {r.definition.division} · {r.definition.kind}</h2><span>{r.phase}</span></div><div className="form-body">{r.definition.judges.map((j) => <p key={j.id}>{j.name}: {r.submissions?.some((s) => s.judgeId === j.id) ? 'Finalized submission received' : 'Awaiting finalized submission'} · {r.draftProgress?.find((p) => p.judgeId === j.id)?.filled ?? 0} / {r.draftProgress?.find((p) => p.judgeId === j.id)?.required ?? 0} marks saved to event</p>)}<p>{r.standings?.submitted ?? 0} / {r.standings?.required ?? r.definition.judgeIds.length} submitted · {r.standings?.approved ? 'Head approved' : 'Approval pending'}</p></div></section>)}<LiveResults data={data} action={action} /></div>}
    {page === 2 && <><LiveResults data={data} action={action} />{data.rounds.length === 0 && <p>Open and complete a judging block to review results.</p>}</>}
    {page === 3 && <div className="page-stack"><section className="form-panel"><div className="panel-heading"><h2>Results &amp; shared backups</h2></div><div className="form-body"><div className="shared-inline"><button className="primary-button" onClick={() => download('shared-average-results.csv', serializeCsv(exportRows(data, data.rounds.filter((r) => r.standings))), 'text/csv')}>Export averaged standings CSV</button><button className="quiet-button" onClick={() => { setPage(2); setTimeout(() => window.print(), 150); }}>Print results</button></div><label className="check-label"><input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />Include private judge notes in this backup (anyone with the file can read them)</label><p>Backups exclude access codes. Restoring creates a new event and new links; current submissions and approval are never imported as active.</p><button className="quiet-button" onClick={() => void backup()}>Download shared backup</button><label className="file-button secondary">Restore as a new shared event<input type="file" accept="application/json,.json" onChange={(e) => void restore(e)} /></label></div></section>
      <section className="form-panel"><div className="panel-heading"><h2>Optional Google Sheets publisher</h2></div><div className="form-body"><label><span>Apps Script URL</span><input value={publisherUrl} onChange={(e) => setPublisherUrl(e.target.value)} /></label><label><span>Publishing key</span><input type="password" value={publisherKey} onChange={(e) => setPublisherKey(e.target.value)} autoComplete="off" /></label><button className="primary-button" onClick={() => void publish()}>Send head-approved results</button></div></section>
      {data.restoredHistory != null && <details><summary>Restored historical record</summary><p>Historical results are preserved for review. This event needs fresh ballots and approval.</p><pre className="shared-json">{JSON.stringify(data.restoredHistory, null, 2)}</pre></details>}
      <section className="form-panel"><div className="form-body"><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm('Archive this shared event? All links become read only.')) void action({ action: 'archive' }); }}>Archive event</button><button className="quiet-button" disabled={busy || data.status !== 'archived'} onClick={async () => { if (!window.confirm('Permanently delete this archived event and all its shared ballots, notes, links and history?')) return; try { await liveApi(token, { action: 'delete', expectedVersion: data.version, requestId: crypto.randomUUID() }); window.location.assign('/'); } catch (error) { setNotice((error as Error).message); } }}>Delete archived event</button></div></section>
    </div>}
  </LiveShell>;
}
