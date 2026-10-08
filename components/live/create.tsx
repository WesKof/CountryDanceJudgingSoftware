'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { creationNonce, liveApi } from './client';
import { LiveShell } from './shell';

export default function CreateLive() {
  const nonce = useRef('');
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), 0); return () => clearTimeout(timer); }, []);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setError('');
    nonce.current ||= creationNonce();
    try { const result = await liveApi<{ path: string }>('', { action: 'create', requestId: nonce.current, name: form.get('name'), venue: form.get('venue'), date: form.get('date') }); window.location.assign(result.path); }
    catch (error) { setError((error as Error).message); setBusy(false); }
  }
  return <LiveShell title="Create a shared event" identity="Organizer desk" status="New event" items={['Set up', 'Score', 'Results', 'Publish']} current={0} navigate={() => {}}><div className="page-stack"><section className="form-panel"><div className="panel-heading"><h2>Event details</h2></div><form className="form-body" onSubmit={create}><label><span>Event name</span><input name="name" required maxLength={160} autoComplete="off" /></label><label><span>Venue</span><input name="venue" maxLength={160} /></label><label><span>Date</span><input name="date" type="date" /></label><p>The organizer link controls this event. Keep it private and save it somewhere you can find it.</p>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy || !ready}>Create shared event</button><Link href="/" prefetch={false}>Return to local demo</Link></form></section></div></LiveShell>;
}
