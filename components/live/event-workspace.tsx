'use client';

import { useEffect, useRef, useState } from 'react';
import type { EventSummary } from '@/lib/live/types';
import { liveApi } from './client';

export type SavedEvent = { path: string; name: string; sample?: boolean; status?: 'active' | 'archived'; date?: string; venue?: string };
type Entry = SavedEvent & { summary?: EventSummary; error?: string };
export default function EventWorkspace({ events, current, busy, ready, create, remember }: { events: SavedEvent[]; current?: string; busy: boolean; ready: boolean; create: (source: 'sample' | 'blank') => void; remember: (events: SavedEvent[]) => void }) {
  const [entries, setEntries] = useState<Entry[]>(events), [loading, setLoading] = useState(false), [pending, setPending] = useState(''), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [activeLimit, setActiveLimit] = useState(8), [archiveLimit, setArchiveLimit] = useState(8);
  const running = useRef(false);
  const workspace = useRef<HTMLDetailsElement>(null);
  const focusAfterChange = useRef<{ path: string; source: Element | null; current?: string; action: 'archive' | 'reactivate'; moved: boolean; ready: boolean } | null>(null);
  const stopFocusTracking = useRef<(() => void) | null>(null);
  useEffect(() => () => { stopFocusTracking.current?.(); focusAfterChange.current = null; }, []);
  async function refresh() {
    if (!ready || running.current) return; running.current = true; setLoading(true);
    const next: Entry[] = [];
    // Limit concurrent reads and request only the organizer's lightweight summary.
    for (let start = 0; start < events.length; start += 4) {
      next.push(...await Promise.all(events.slice(start, start + 4).map(async (event): Promise<Entry> => {
        try {
          const response = await fetch('/api/live?summary=1', { cache: 'no-store', headers: { Authorization: 'Bearer ' + event.path.split('/').at(-1) } });
          const summary = await response.json() as EventSummary & { error?: string };
          if (!response.ok) throw new Error(summary.error ?? 'Event unavailable');
          return { ...event, name: summary.name, status: summary.status, date: summary.date, venue: summary.venue, summary };
        } catch { return { ...event, error: 'Link unavailable. Your saved link is retained.' }; }
      })));
    }
    setEntries(next); setLoading(false); running.current = false;
    try { remember(next.map(({ path, name, sample, status, date, venue }) => ({ path, name, sample, status, date, venue }))); }
    catch { setNotice('The list could not be saved on this device. Event records are unchanged.'); }
  }
  async function change(entry: Entry, action: 'archive' | 'reactivate') {
    if (!ready || !entry.summary || pending) return;
    if (action === 'archive' && !window.confirm(`Archive “${entry.name}”? Scores, links and history stay saved; judging becomes read only. You can return the event to active later. Unsaved setup edits are not saved by archiving.`)) return;
    const request = { path: entry.path, source: document.activeElement, current, action, moved: false, ready: false };
    focusAfterChange.current = request;
    const trackFocus = (event: FocusEvent) => { if (event.target !== request.source && event.target !== document.body) request.moved = true; };
    document.addEventListener('focusin', trackFocus);
    const stopTracking = () => document.removeEventListener('focusin', trackFocus); stopFocusTracking.current = stopTracking;
    setPending(entry.path); setNotice('');
    try {
      await liveApi(entry.path.split('/').at(-1)!, { action, expectedVersion: entry.summary.version, requestId: crypto.randomUUID() });
      if (entry.path === current) { window.location.reload(); return; }
      await refresh(); request.ready = true; setNotice(action === 'archive' ? 'Event archived. Its records remain available below.' : 'Event returned to active. Submitted ballots and approvals are unchanged.');
    } catch (error) { focusAfterChange.current = null; setNotice((error as Error).message); await refresh(); }
    finally { stopTracking(); if (stopFocusTracking.current === stopTracking) stopFocusTracking.current = null; setPending(''); }
  }
  const matches = (entry: Entry) => [entry.name, entry.venue, entry.date, entry.sample ? 'sample' : ''].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  // The parent catalog can gain links while a summary request is pending.
  // Keep those links visible even when this refresh did not check them yet.
  const checked = new Map(entries.map((entry) => [entry.path, entry]));
  const ordered = events.map((event) => ({ ...event, ...checked.get(event.path) })).reverse().sort((a,b)=>Number(b.path===current)-Number(a.path===current));
  const active = ordered.filter((e) => e.status !== 'archived' && matches(e)), archived = ordered.filter((e) => e.status === 'archived' && matches(e));
  useEffect(() => {
    const request = focusAfterChange.current;
    if (pending || !request?.ready) return;
    if (request.current !== current || request.moved || !workspace.current?.open || (document.activeElement !== request.source && document.activeElement !== document.body)) { focusAfterChange.current = null; return; }
    const list = request.action === 'archive' ? archived : active, index = list.findIndex((entry) => entry.path === request.path);
    if (index < 0) { focusAfterChange.current = null; return; }
    if (request.action === 'archive' && index >= archiveLimit) { setArchiveLimit(index + 1); return; }
    if (request.action === 'reactivate' && index >= activeLimit) { setActiveLimit(index + 1); return; }
    const card = [...workspace.current.querySelectorAll<HTMLElement>('.event-card')].find((card) => card.dataset.eventPath === request.path);
    focusAfterChange.current = null;
    if (!card) return;
    const archive = card.closest<HTMLDetailsElement>('.event-archive'); if (archive) archive.open = true;
    card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }, [active, archived, activeLimit, archiveLimit, current, pending]);
  function cards(list: Entry[], limit: number) { return list.slice(0, limit).map((entry) => <article className="event-card" key={entry.path} data-event-path={entry.path} tabIndex={-1}>
    <div><div className="event-card-title"><strong>{entry.name}</strong>{entry.path === current && <span className="event-badge">Current</span>}{entry.sample && <span className="event-badge">Sample</span>}{entry.status === 'archived' && <span className="event-badge archived">Read only</span>}</div><p>{entry.date ? new Date(entry.date + 'T12:00:00').toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'}) : 'Date not set'}{entry.venue ? ' · ' + entry.venue : ''}</p>{entry.error && <p role="status">{entry.error}</p>}</div>
    <div className="event-card-actions"><a className="quiet-button" href={'/?event=' + encodeURIComponent(entry.path.split('/').at(-1)!)}>{entry.status === 'archived' ? 'Open records' : 'Open event'}<span className="sr-only"> · {entry.name}</span></a><button className="quiet-button" disabled={!ready || busy || loading || Boolean(pending) || !entry.summary} onClick={() => void change(entry, entry.status === 'archived' ? 'reactivate' : 'archive')}>{pending === entry.path ? 'Saving…' : entry.status === 'archived' ? 'Return to active' : 'Archive'}<span className="sr-only"> · {entry.name}</span></button></div>
  </article>); }
  return <details ref={workspace} className="form-panel setup-section event-workspace" data-section="Other events" onToggle={(e) => { if(e.target === e.currentTarget && e.currentTarget.open) void refresh(); }}>
    <summary className="panel-heading compact"><div><p className="kicker">Workspace</p><h2>Other events</h2><p className="section-summary">Active events &amp; searchable archive</p></div></summary>
    <div className="form-body page-stack"><div className="event-workspace-start"><div><h3>Your events</h3><p>Keep today’s work in view. Old events stay in the archive.</p></div><div className="shared-inline"><button className="primary-button" disabled={busy || !ready} onClick={() => create('blank')}>Start a blank event</button><button className="quiet-button" disabled={busy || !ready} onClick={() => create('sample')}>Try a fresh sample</button></div></div>
      {!ready && <p role="status">Saved event links could not be read. They remain untouched. Retry after restoring this device’s saved links.</p>}
      <div className="event-workspace-filter"><label><span>Find an event</span><input type="search" value={query} placeholder="Name, venue or date" onChange={(e) => {setQuery(e.target.value);setActiveLimit(8);setArchiveLimit(8);}} /></label><button className="quiet-button" disabled={!ready || busy || loading || Boolean(pending)} onClick={() => void refresh()}>Refresh events</button></div>
      {notice && <p className="notice" role="status">{notice}</p>}{loading && <p role="status">Checking saved events…</p>}
      <section aria-label="Active events"><h3>Active events · {active.length}</h3>{cards(active,activeLimit)}{ready && !active.length && <p>{query ? 'No active events match your search.' : 'No active events. Start a new event, or open the archive.'}</p>}{active.length>activeLimit && <button className="quiet-button" onClick={() => setActiveLimit((n)=>n+8)}>Show more active events</button>}</section>
      <details className="event-archive" open={query.trim() && archived.length ? true : undefined}><summary>Archived events · {archived.length}</summary><p>Scores and history are saved. Return an event to active to resume its existing workflow; submitted ballots stay locked.</p>{cards(archived,archiveLimit)}{!archived.length && <p>{query ? 'No archived events match your search.' : 'No archived events yet.'}</p>}{archived.length>archiveLimit && <button className="quiet-button" onClick={() => setArchiveLimit((n)=>n+8)}>Show more archived events</button>}</details>
    </div>
  </details>;
}
