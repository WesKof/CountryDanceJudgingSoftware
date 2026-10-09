'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { serializeCsv } from '@/lib/csv';
import type { LiveSetup, LiveView } from '@/lib/live/types';
import { freezeRound, roundOpeningIssues } from '@/lib/live/validation';
import { creationNonce, download, liveApi } from './client';
import { LiveShell } from './shell';
import SetupEditor from './setup';
import SetupSection from './setup-section';
import { ReviewRequests, StageReview } from './stage-review';

type Props = { token: string; data: LiveView; error: string; refresh: () => Promise<LiveView | null> };
const csvSafe = (value: string | number) => typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? `'${value}` : String(value);
export default function StageDesk({ token, data, error, refresh }: Props) {
  const [page, setPage] = useState(0), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LiveSetup | null>(null), [draftVersion, setDraftVersion] = useState(0);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [publisherUrl, setPublisherUrl] = useState(''), [publisherKey, setPublisherKey] = useState('');
  async function action(input: Record<string, unknown>) {
    setBusy(true); setNotice('');
    try { const current = await refresh(); if (!current) throw new Error('Reconnect before applying a shared action.'); await liveApi(token, { ...input, expectedVersion: current.version, requestId: crypto.randomUUID() }); await refresh(); return true; }
    catch (error) { setNotice((error as Error).message); await refresh(); return false; } finally { setBusy(false); }
  }
  async function saveSetup() {
    if (!draft) return; setBusy(true);
    try { await liveApi(token, { action: 'setup', setup: draft, expectedVersion: draftVersion, requestId: crypto.randomUUID() }); setDraft(null); await refresh(); setNotice('Setup saved to the shared event.'); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function backup() {
    try { const result = await liveApi(token, { action: 'backup', includeNotes, requestId: crypto.randomUUID() }); download('shared-stage-event-backup.json', JSON.stringify(result, null, 2)); } catch (error) { setNotice((error as Error).message); }
  }
  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file || !window.confirm('Restore into a new event with new links and inert historical records?')) return;
    try { if (file.size > 1500000) throw new Error('Backup is too large.'); const r = await liveApi<{ path: string }>('', { action: 'restore', requestId: creationNonce(), backup: JSON.parse(await file.text()) }); window.location.assign(r.path); } catch (error) { setNotice((error as Error).message); }
  }
  async function withdraw(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (!window.confirm('Request withdrawal? Both organizer and head approvals are required. All judging records remain in history.')) return;
    await action({ action: 'request-withdrawal', competitionId: String(f.get('competition')), reason: String(f.get('reason')) });
  }
  async function publish() {
    try {
      const url = new URL(publisherUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !url.pathname.startsWith('/macros/s/') || !url.pathname.endsWith('/exec')) throw new Error('Use the organizer’s Google Apps Script /exec URL.');
      const approved = data.rounds.filter((r) => r.standings?.approved);
      if (!approved.length || !publisherKey) throw new Error('Head-approved results and a publishing key are required.');
      const rows = [['Event', 'Format', 'Division', 'Stage', 'Status', 'Place', 'Bib', 'Primary', 'Secondary', 'Equal Judge Mean', 'Observed Marks'], ...approved.flatMap((r) => r.standings!.rows.map((row) => [data.setup.name, r.definition.format, r.definition.division, r.definition.kind, 'Head approved', row.place, row.number, row.primary, row.secondary, row.average, row.denominator].map(csvSafe)))];
      const response = await fetch(url, { method: 'POST', body: new URLSearchParams({ results: JSON.stringify(rows), publishingKey: publisherKey }) });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!result.success) throw new Error(result.error ?? 'Publishing failed.');
      setNotice('Approved results sent to the organizer’s Google Sheet.');
    } catch (error) { setNotice((error as Error).message); }
  }
  const canAct = !busy && !draft && data.status === 'active';
  const block = data.setup.blocks.find((b) => b.id === data.context.blockId);
  const order = (block?.roundIds ?? []).flatMap((rid) => { const r = data.rounds.find((r) => r.id === rid); return r?.definition.heats.map((h) => ({ round: r, heat: h })) ?? []; });
  const room = order.find((x) => x.heat.songs.some((p) => p.id === data.context.performanceId)), song = room?.heat.songs.find((p) => p.id === data.context.performanceId);
  const songIndex = room?.heat.songs.findIndex((p) => p.id === song?.id) ?? -1, heatIndex = order.findIndex((x) => x.heat.id === room?.heat.id);
  const lastSong = Boolean(room && songIndex === room.heat.songs.length - 1), lastHeat = room && heatIndex === order.length - 1;
  const missing = room?.round.definition.judgeIds.filter((j) => !data.heatSubmissions?.some((s) => s.roundKey === room.round.key && s.heatId === room.heat.id && s.judgeId === j)) ?? [];
  const dancing = room?.round.phase === 'dancing', lineup = data.context.lineupHeatId === room?.heat.id;
  function issues(kind: 'prelims' | 'finals') {
    const stage = data.setup.blocks.find((b) => b.kind === kind);
    if (!stage?.roundIds.length) return ['Add competitions and save setup.'];
    const errors = stage.roundIds.flatMap((rid) => { const r = data.setup.rounds.find((r) => r.id === rid)!; const initial = roundOpeningIssues(data.setup, r); if (initial.length) return initial; try { freezeRound(data.setup, r); return []; } catch (error) { return [(error as Error).message]; } });
    if (data.rounds.some((r) => ['dancing', 'discussion'].includes(r.phase))) errors.push('Complete the current stage’s submissions, review and head approval.');
    if (kind === 'finals' && stage.roundIds.some((rid) => !data.rounds.find((r) => r.id === data.setup.rounds.find((s) => s.id === rid)?.prelimRoundId)?.standings?.approved)) errors.push('Approve current prelim advancement before starting finals.');
    return errors;
  }
  function exportResults() {
    const rows = [['Event', 'Format', 'Division', 'Stage', 'Status', 'Place', 'Bib', 'Primary', 'Secondary', 'Equal Judge Mean', 'Observed Marks', 'Source Fingerprint'], ...data.rounds.flatMap((r) => r.standings?.rows.map((row) => [data.setup.name, r.definition.format, r.definition.division, r.definition.kind, r.standings!.approved ? 'Head approved' : 'Provisional', row.place, row.number, row.primary, row.secondary, row.average, row.denominator, r.standings!.fingerprint].map(csvSafe)) ?? [])];
    download('stage-average-results.csv', serializeCsv(rows), 'text/csv');
  }
  function exportCards() {
    const rows = [['Stage', 'Format', 'Division', 'Heat', 'Song', 'Judge', 'Bib', 'Mark', 'Status', 'Submission Version'], ...data.rounds.flatMap((r) => r.submittedMarks?.map((c) => { const h = r.definition.heats.find((h) => h.songs.some((p) => p.id === c.performanceId))!; const sub = data.heatSubmissions?.find((s) => s.roundKey === r.key && s.heatId === h.id && s.judgeId === c.judgeId); return [r.definition.kind, r.definition.format, r.definition.division, h.name, h.songs.find((p) => p.id === c.performanceId)!.title, r.definition.judges.find((j) => j.id === c.judgeId)!.name, r.definition.subjects.find((s) => s.id === c.subjectId)!.number, c.mark || 'Blank', r.standings?.approved ? 'Head approved' : 'Provisional', sub?.version ?? ''].map(csvSafe); }) ?? [])];
    download('stage-scorecards.csv', serializeCsv(rows), 'text/csv');
    download('stage-amendment-history.json', JSON.stringify(data.reviewRequests ?? [], null, 2));
  }
  return <LiveShell title={data.setup.name} identity={`Organizer · Head: ${data.setup.judges.find((j) => j.id === data.setup.headJudgeId)?.name ?? 'Choose in setup'}`} status={busy ? 'Saving…' : error || (data.status === 'archived' ? 'Archived · read only' : 'Shared event connected')} items={['Set up', 'Score', 'Results', 'Publish']} current={page} navigate={setPage}>
    {notice && <p className="notice" role="status">{notice}</p>}
    {page === 0 && <div className="page-stack"><div className="shared-inline"><button className="primary-button" disabled={!draft || busy || data.status !== 'active'} onClick={() => void saveSetup()}>Save setup</button>{draft && <><span>Unsaved setup edits</span><button className="quiet-button" onClick={() => { if (window.confirm('Discard the unsaved setup edits?')) setDraft(null); }}>Discard edits</button></>}<button className="quiet-button" onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setNotice('Organizer link copied. Keep it private.')).catch(() => setNotice('Copy the organizer link from the address bar.'))}>Copy organizer link</button></div><fieldset className="shared-unframed" disabled={data.status !== 'active'}><SetupEditor setup={draft ?? data.setup} update={(s) => { if (!draft) setDraftVersion(data.version); setDraft(s); }} frozenIds={data.rounds.filter((r) => r.phase !== 'setup').map((r) => r.id)} correction={false} /></fieldset><SetupSection title="Event-long private judge links" caption="Access" count={data.judgeLinks?.length ?? 0}><div className="form-body">{data.judgeLinks?.map((j) => <div className="shared-inline" key={j.id}><strong>{j.name}{j.id === data.setup.headJudgeId ? ' · Head judge' : ''}</strong><span>{j.revoked ? 'Revoked' : 'Active'}</span><button className="quiet-button" disabled={j.revoked} onClick={() => void navigator.clipboard.writeText(new URL(j.path, window.location.origin).href).then(() => setNotice('Private judge link copied.')).catch(() => setNotice('Open the judge page and copy its address.'))}>Copy judge link</button><a className="quiet-button" href={j.path} target="_blank" rel="noreferrer">Open judge page</a><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Revoke ${j.name}’s link?`)) void action({ action: 'revoke-link', judgeId: j.id }); }}>Revoke</button><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm(`Replace ${j.name}’s link?`)) void action({ action: 'replace-link', judgeId: j.id }); }}>Replace link</button></div>)}</div></SetupSection>{data.rounds.length > 0 && <section className="form-panel"><div className="form-body"><h2>Withdraw a started competition</h2><form onSubmit={(e) => void withdraw(e)}><label><span>Competition to withdraw</span><select name="competition" aria-label="Competition to withdraw">{data.setup.competitions.filter((c) => data.rounds.some((r) => r.definition.competitionId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.format} · {c.division}</option>)}</select></label><label><span>Withdrawal reason</span><input name="reason" required maxLength={500} /></label><button className="quiet-button" disabled={!canAct}>Request competition withdrawal</button></form><p>Both roles must approve. Scores, submissions, amendments and earlier approval snapshots remain in history.</p></div></section>}<ReviewRequests data={data} action={action} /></div>}
    {page === 1 && <div className="page-stack">{draft && <p className="notice">Save setup before starting judging.</p>}<section className="hero-panel"><div><p className="kicker">{room ? `${room.round.definition.kind} · ${room.round.definition.format} · ${room.round.definition.division} · ${room.heat.name}` : 'Room running order'}</p><h2>{song?.title ?? 'Ready to start a stage'}</h2>{room && <p>Heat {heatIndex + 1} of {order.length} · Song {songIndex + 1} of {room.heat.songs.length}. {lineup ? 'Heat-end lineup check.' : 'Judging in progress.'}</p>}</div></section><div className="shared-grid">{(['prelims', 'finals'] as const).map((kind) => { const opened = data.rounds.some((r) => r.definition.kind === kind); const errors = opened ? [] : issues(kind); return <section className="form-panel" key={kind}><div className="form-body"><h2>{kind === 'prelims' ? 'Prelims' : 'Finals'}</h2><button className="primary-button" disabled={!canAct || opened || errors.length > 0} onClick={() => void action({ action: 'open-stage', kind })}>Start {kind} stage</button>{errors.length > 0 && <ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}{opened && <p>{data.rounds.filter((r) => r.definition.kind === kind).every((r) => r.standings?.approved) ? 'Stage approved.' : 'Stage started; finish all heats before review.'}</p>}</div></section>; })}</div>{dancing && <><div className="shared-inline"><button className="quiet-button" disabled={!canAct || !lastSong || lineup} onClick={() => void action({ action: 'lineup' })}>Open heat-end lineup</button><button className="primary-button" disabled={!canAct || (lastSong && (!lineup || missing.length > 0 || Boolean(lastHeat)))} onClick={() => void action({ action: 'next' })}>{lastSong ? 'Next heat / division' : 'Next song'}</button><button className="primary-button" disabled={!canAct || !lastHeat || !lastSong || !lineup || missing.length > 0} onClick={() => void action({ action: 'conclude-stage' })}>Conclude stage &amp; open review</button></div><p role="status">{!lastSong ? 'Finish this heat’s songs before lineup and final submission.' : !lineup ? 'Open the lineup check for judges to verify bibs and finalize this heat.' : missing.length ? `Waiting for ${missing.length} required submission(s): ${missing.map((id) => data.setup.judges.find((j) => j.id === id)?.name).join(', ')}.` : lastHeat ? 'Every required heat submission is acknowledged. Conclude the stage for read-only review.' : 'All required submissions acknowledged. Advance to the next heat.'}</p></>}{order.map(({ round, heat }) => <section className="form-panel" key={heat.id}><div className="form-body"><h3>{round.definition.format} · {round.definition.division} · {heat.name}</h3>{round.definition.judges.map((j) => <p key={j.id}>{j.name}: {data.heatSubmissions?.some((s) => s.roundKey === round.key && s.heatId === heat.id && s.judgeId === j.id) ? 'Heat submission acknowledged' : 'Awaiting heat submission'}</p>)}</div></section>)}<p>Official averages and rankings appear only after the whole stage closes.</p></div>}
    {page === 2 && <StageReview data={data} action={action} />}
    {page === 3 && <div className="page-stack"><section className="form-panel"><div className="panel-heading"><h2>Optional Google Sheets publisher</h2></div><div className="form-body"><label><span>Apps Script URL</span><input value={publisherUrl} onChange={(e) => setPublisherUrl(e.target.value)} /></label><label><span>Publishing key</span><input type="password" value={publisherKey} onChange={(e) => setPublisherKey(e.target.value)} autoComplete="off" /></label><button className="primary-button" onClick={() => void publish()}>Send head-approved results</button><p>Optional; these credentials are excluded from event backups.</p></div></section><section className="form-panel"><div className="form-body"><h2>Results, scorecards &amp; backups</h2><button className="primary-button" onClick={exportResults}>Export averaged standings CSV</button><button className="quiet-button" onClick={exportCards}>Export scorecards &amp; amendment history</button><button className="quiet-button" onClick={() => { setPage(2); setTimeout(() => window.print(), 150); }}>Print results</button><label className="check-label"><input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />Include private notes in this backup (anyone with the file can read them)</label><p>Default exports disclose blanks and amendments and exclude private notes and access codes. A restore creates a fresh event with historical records.</p><button className="quiet-button" onClick={() => void backup()}>Download shared backup</button><label className="file-button secondary">Restore as a new shared event<input type="file" accept="application/json,.json" onChange={(e) => void restore(e)} /></label></div></section>{data.restoredHistory != null && <details><summary>Restored historical record</summary><pre className="shared-json">{JSON.stringify(data.restoredHistory, null, 2)}</pre></details>}<section className="form-panel"><div className="form-body"><button className="quiet-button" disabled={!canAct} onClick={() => { if (window.confirm('Archive this event and make all links read only?')) void action({ action: 'archive' }); }}>Archive event</button><button className="quiet-button" disabled={busy || data.status !== 'archived'} onClick={async () => { if (!window.confirm('Permanently delete this archived test/event and all history?')) return; try { await liveApi(token, { action: 'delete', expectedVersion: data.version, requestId: crypto.randomUUID() }); window.location.assign('/'); } catch (error) { setNotice((error as Error).message); } }}>Delete archived event</button></div></section></div>}
  </LiveShell>;
}
