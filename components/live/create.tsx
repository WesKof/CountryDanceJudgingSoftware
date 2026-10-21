'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { creationNonce, liveApi } from './client';
import { LiveShell } from './shell';

export default function CreateLive() {
  const nonce = useRef('');
  const creating = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), 0); return () => clearTimeout(timer); }, []);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!ready || creating.current) return;
    const form = new FormData(e.currentTarget); creating.current = true; setBusy(true); setError('');
    nonce.current ||= creationNonce();
    try { const result = await liveApi<{ path: string }>('', { action: 'create', requestId: nonce.current, name: form.get('name'), venue: form.get('venue'), date: form.get('date') }); window.location.assign(result.path); }
    catch (error) { setError((error as Error).message); creating.current = false; setBusy(false); }
  }
  return <LiveShell navigationDisabled title="New event" identity="Organizer desk" status="New event" items={['Set up', 'Score', 'Results', 'Publish']} current={0} navigate={() => {}}><div className="page-stack"><section className="form-panel"><div className="panel-heading"><h2>Event details</h2></div><form className="form-body" onSubmit={create} aria-busy={busy}><fieldset className="shared-unframed" disabled={busy} aria-label="Event details"><label><span>Event name</span><input name="name" required maxLength={160} autoComplete="off" /></label><details><summary>Venue &amp; date (optional)</summary><label><span>Venue</span><input name="venue" maxLength={160} /></label><label><span>Date</span><input name="date" type="date" /></label></details></fieldset><p>The organizer link controls this event. Keep it private and save it somewhere you can find it.</p>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy || !ready}>{busy ? 'Creating event…' : 'Create shared event'}</button><Link href="/" prefetch={false}>Return to event workspace</Link></form></section></div></LiveShell>;
}
