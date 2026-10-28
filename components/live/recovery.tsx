'use client';

import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { creationNonce, download, liveApi } from './client';
import SetupSection from './setup-section';

export function useRecovery(token: string, stage = false) {
  const [includeNotes, setIncludeNotes] = useState(false);
  const [task, setTask] = useState<'backup' | 'restore' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'backup' | 'restore'; message: string; error?: boolean } | null>(null);
  const running = useRef(false);
  const attempt = useRef<{ contents: string; requestId: string } | null>(null);
  async function backup() {
    if (running.current) return;
    running.current = true; setTask('backup'); setFeedback({ kind: 'backup', message: 'Preparing backup…' });
    const notes = includeNotes;
    try {
      const result = await liveApi<{ format: string; backupVersion: number; includesPrivateNotes: boolean }>(token, { action: 'backup', includeNotes: notes, requestId: crypto.randomUUID() });
      if (result.format !== 'country-dance-live-backup' || result.backupVersion !== 1 || result.includesPrivateNotes !== notes) throw new Error('The backup response could not be verified.');
      download(stage ? 'shared-stage-event-backup.json' : 'shared-event-backup.json', JSON.stringify(result, null, 2));
      setFeedback({ kind: 'backup', message: `Backup download started. Private judge notes ${notes ? 'included' : 'excluded'}.` });
    } catch (error) { setFeedback({ kind: 'backup', error: true, message: `Backup failed. ${(error as Error).message} Retry Download event backup.` }); }
    finally { running.current = false; setTask(null); }
  }
  async function restore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file || running.current) return;
    if (!window.confirm('Restore this backup into a new event with new private links? This event stays as it is. Previous results remain historical.')) {
      setFeedback({ kind: 'restore', message: 'Restore canceled. No restore request was sent.' }); return;
    }
    running.current = true; setTask('restore'); setFeedback({ kind: 'restore', message: 'Restoring as a new event… Keep this page open.' });
    let navigating = false;
    try {
      if (file.size > 1500000) throw new Error('Backup is too large.');
      const contents = await file.text(), value: unknown = JSON.parse(contents);
      // Reuse the server receipt after an interrupted response for this exact file.
      if (attempt.current?.contents !== contents) attempt.current = { contents, requestId: creationNonce() };
      const result = await liveApi<{ path: string }>('', { action: 'restore', requestId: attempt.current.requestId, backup: value });
      if (typeof result.path !== 'string' || !/^\/live\/[a-f0-9]{64}$/.test(result.path)) throw new Error('The restored event link could not be verified.');
      setFeedback({ kind: 'restore', message: 'Restore ready. Opening the new event…' });
      window.location.assign(stage ? `/?event=${result.path.split('/').at(-1)}` : result.path); navigating = true;
    } catch (error) { setFeedback({ kind: 'restore', error: true, message: `Restore did not finish here. ${(error as Error).message} Choose the same file to retry; your source event stays unchanged.` }); }
    finally { if (!navigating) { running.current = false; setTask(null); } }
  }
  return { includeNotes, setIncludeNotes, task, feedback, backup, restore };
}

export default function Recovery({ includeNotes, setIncludeNotes, task, feedback, backup, restore, disabled = false, extra, history, children }: ReturnType<typeof useRecovery> & {
  disabled?: boolean; extra?: ReactNode; history?: unknown; children: ReactNode;
}) {
  const busy = task !== null;
  const needsAttention = !busy && Boolean(feedback?.error);
  const summary = busy ? task === 'backup' ? 'Preparing backup…' : 'Restoring a new event…' : needsAttention ? feedback?.kind === 'backup' ? 'Backup failed. Open for retry details.' : 'Restore did not finish here. Open for retry details.' : 'Backups, restore and event management';
  const message = (kind: 'backup' | 'restore') => feedback?.kind === kind && <p className={feedback.error ? 'notice recovery-feedback' : 'recovery-feedback'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>;
  return <SetupSection title="Data & recovery" caption="Data management" summaryText={summary} attention={needsAttention}><div className="form-body page-stack">
    <fieldset className="shared-unframed page-stack recovery-controls" disabled={busy || disabled}>
    <div><p>Save an event backup for recovery.</p><p className="recovery-backup-privacy">{includeNotes ? 'Private judge notes will be included; anyone with the file can read them.' : 'Private judge notes are excluded.'} Access credentials are always excluded.</p><button className="quiet-button" aria-busy={task === 'backup'} onClick={() => { if (!disabled) void backup(); }}>Download event backup</button>{message('backup')}</div>
    <details><summary>Backup options</summary><label className="check-label"><input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />Include private judge notes in this backup (anyone with the file can read them)</label></details>
    <details><summary>Restore from backup</summary>{message('restore')}<p>Restore creates a new event and new private links. This event stays as it is. Previous results remain historical; the new event needs fresh judging and approvals.</p><label className={'file-button secondary' + (busy || disabled ? ' is-disabled' : '')}>Restore as a new shared event<input type="file" accept="application/json,.json" onChange={(e) => { if (!disabled) void restore(e); }} /></label></details>
    {extra}
    {history != null && <details><summary>Restored historical record</summary><p>Historical results are retained for review; they are not active submissions or approvals.</p><pre className="shared-json">{JSON.stringify(history, null, 2)}</pre></details>}
    <details className="recovery-management"><summary>Archive or delete event</summary><p>Archiving makes the event and its links read only. Deletion is available only after archiving and permanently removes the event and its history.</p><div className="shared-inline">{children}</div></details>
    </fieldset>
  </div></SetupSection>;
}
