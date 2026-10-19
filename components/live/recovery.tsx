'use client';

import type { ChangeEvent, ReactNode } from 'react';
import SetupSection from './setup-section';

export default function Recovery({ includeNotes, setIncludeNotes, backup, restore, extra, history, children }: {
  includeNotes: boolean; setIncludeNotes: (value: boolean) => void; backup: () => Promise<void>;
  restore: (event: ChangeEvent<HTMLInputElement>) => Promise<void>; extra?: ReactNode; history?: unknown; children: ReactNode;
}) {
  return <SetupSection title="Data & recovery" caption="Data management" summaryText="Backups, restore and event management"><div className="form-body page-stack recovery-controls">
    <div><p>Save an event backup for recovery. Access credentials and private judge notes are excluded by default.</p><button className="quiet-button" onClick={() => void backup()}>Download event backup</button></div>
    <details><summary>Backup options</summary><label className="check-label"><input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />Include private judge notes in this backup (anyone with the file can read them)</label></details>
    <details><summary>Restore from backup</summary><p>Restore creates a new event and new private links. This event stays as it is. Previous results remain historical; the new event needs fresh judging and approvals.</p><label className="file-button secondary">Restore as a new shared event<input type="file" accept="application/json,.json" onChange={(e) => void restore(e)} /></label></details>
    {extra}
    {history != null && <details><summary>Restored historical record</summary><p>Historical results are retained for review; they are not active submissions or approvals.</p><pre className="shared-json">{JSON.stringify(history, null, 2)}</pre></details>}
    <details className="recovery-management"><summary>Archive or delete event</summary><p>Archiving makes the event and its links read only. Deletion is available only after archiving and permanently removes the event and its history.</p><div className="shared-inline">{children}</div></details>
  </div></SetupSection>;
}
