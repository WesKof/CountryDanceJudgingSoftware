'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AppState } from '@/lib/domain';
import { applyLocalSetup, localSetup } from '@/lib/demo-setup';
import { validateSetup } from '@/lib/live/validation';
import type { LiveSetup, LiveView } from '@/lib/live/types';
import { creationNonce, liveApi } from './client';
import SetupEditor from './setup';
import SetupSection from './setup-section';

// Access links belong to this browser/server origin, never to a v2 event backup.
const REHEARSAL_KEY = 'country-dance-judging:rehearsal';
type Rehearsal = { nonce: string; path?: string; configured?: boolean };

export default function LocalSetup({ state, save }: { state: AppState; save: (state: AppState) => void }) {
  const [draft, setDraft] = useState<LiveSetup | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasBinding, setHasBinding] = useState(false);
  const [data, setData] = useState<LiveView | null>(null);
  const binding = useRef<Rehearsal | null>(null);
  const setup = draft ?? localSetup(state);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(REHEARSAL_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as Rehearsal;
        if (!/^[a-f0-9]{64}$/.test(saved.nonce) || (saved.path && !/^\/live\/[a-zA-Z0-9_-]+$/.test(saved.path))) return;
        binding.current = saved; setHasBinding(true);
        if (saved.path && saved.configured) void liveApi<LiveView>(saved.path.split('/').at(-1)!).then((view) => { if (alive) setData(view); }).catch(() => { if (alive) setNotice('The saved rehearsal is unavailable. Keep its organizer link, or create another rehearsal below.'); });
      } catch { if (alive) setNotice('Rehearsal links could not be read from browser storage.'); }
      finally { if (alive) setReady(true); }
    }, 0);
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  function remember(value: Rehearsal) {
    localStorage.setItem(REHEARSAL_KEY, JSON.stringify(value));
    binding.current = value; setHasBinding(true);
  }
  async function rehearsal() {
    let current = binding.current;
    if (!current) { current = { nonce: creationNonce() }; remember(current); }
    if (!current.path) {
      const created = await liveApi<{ path: string }>('', { action: 'create', requestId: current.nonce, name: setup.name, venue: setup.venue, date: setup.date });
      current = { ...current, path: created.path }; remember(current);
    }
    const token = current.path!.split('/').at(-1)!;
    let view = await liveApi<LiveView>(token);
    if (!current.configured) {
      await liveApi(token, { action: 'setup', setup: validateSetup(setup), expectedVersion: view.version, requestId: crypto.randomUUID() });
      remember({ ...current, configured: true });
      view = await liveApi<LiveView>(token);
    }
    setData(view);
    return { view, path: current.path! };
  }
  async function access(kind: 'organizer' | 'judge', id: string | undefined, copy: boolean) {
    if (!ready || busy || draft) return;
    // Reserve the window during the click so a slow local API cannot trigger popup blocking.
    const popup = copy ? null : window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setBusy(true);
    try {
      const { view, path } = await rehearsal();
      const link = kind === 'organizer' ? path : view.judgeLinks?.find((j) => j.id === id && !j.revoked)?.path;
      if (!link) throw new Error('This judge link is unavailable. Use the organizer desk to replace revoked links.');
      const url = new URL(link, window.location.origin).href;
      if (copy) { await navigator.clipboard.writeText(url); setNotice(`Private ${kind} link copied.`); }
      else if (popup) popup.location.replace(url);
      else { window.location.assign(url); }
    } catch (error) { popup?.close(); setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  const judges = data?.judgeLinks ?? setup.judges.map((j) => ({ ...j, revoked: false }));
  return <div className="shared-shell local-setup page-stack">
    <div className="shared-inline"><button className="primary-button" disabled={!draft || busy} onClick={() => {
      try { save(applyLocalSetup(state, validateSetup(draft))); setDraft(null); setNotice('Setup saved on this device. Legacy scores and revisions retain their original meaning.'); }
      catch (error) { setNotice((error as Error).message); }
    }}>Save setup</button>{draft && <><span>Unsaved setup edits</span><button className="quiet-button" onClick={() => { if (window.confirm('Discard the unsaved setup edits?')) setDraft(null); }}>Discard edits</button></>}<button className="quiet-button" disabled={!ready || busy || !!draft} onClick={() => void access('organizer', undefined, true)}>Copy organizer link</button><button className="primary-button" disabled={!ready || busy || !!draft} onClick={() => void access('organizer', undefined, false)}>Open organizer page</button><Link className="quiet-button" href="/live/new" prefetch={false}>Create a shared live event</Link></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    <SetupEditor setup={setup} update={setDraft} frozenIds={[]} correction={false} />
    <SetupSection title="Event-long private judge links" caption="Access" count={judges.length}><div className="form-body"><p>{data ? `Rehearsal: ${data.setup.name}. Continue setup, run heats and review results on its organizer page. These links reopen the same saved event.` : 'Open or copy a link to start a rehearsal from your saved setup on this server. Judge pages and the organizer desk use the same stage workflow as shared events.'}</p><p>The organizer can open and distribute every judge link. Each link opens that judge’s role; keep it private. The single-ballot Score and Results tabs retain your legacy scores.</p>{judges.map((j) => <div className="shared-inline" key={j.id}><strong>{j.name}{j.id === (data?.setup.headJudgeId ?? setup.headJudgeId) ? ' · Head judge' : ''}</strong>{j.revoked && <span>Revoked</span>}<button className="quiet-button" disabled={!ready || busy || !!draft || j.revoked} onClick={() => void access('judge', j.id, true)}>Copy judge link</button><button className="quiet-button" disabled={!ready || busy || !!draft || j.revoked} onClick={() => void access('judge', j.id, false)}>Open judge page</button></div>)}{hasBinding && <button className="quiet-button" disabled={!ready || busy || !!draft} onClick={() => { if (window.confirm('Create another rehearsal from the currently saved setup? The earlier event and its scores remain available through its organizer link.')) { try { remember({ nonce: creationNonce() }); setData(null); setNotice('New rehearsal selected. Open or copy a link to create it from the saved setup.'); } catch (error) { setNotice((error as Error).message); } } }}>Create another rehearsal</button>}</div></SetupSection>

  </div>;
}
