'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
const subtitles: Record<string, string> = { 'Set up': 'Event & entries', Results: 'Review & finalize', Publish: 'Send approved results', Score: 'Your assigned ballot' };
export function LiveShell({ title, identity, status, items, current, navigate, children, navigationDisabled = false, compact = false }: { title: string; identity: string; status: string; items: string[]; current: number; navigate: (n: number) => void; children: ReactNode; navigationDisabled?: boolean; compact?: boolean }) {
  const organizer = items.length > 1;
  return <main className={`app-shell shared-shell ${organizer ? 'organizer-shell' : 'judge-shell'} ${compact ? 'judge-focused-shell' : ''}`}>
    {!compact && <aside className="side-rail" aria-label="Competition navigation"><Link className="brand-mark" href="/" prefetch={false} aria-label="Organizer home">CDJ</Link><nav className="rail-nav"><p className="rail-kicker">Competition flow</p>{items.map((label, i) => <button key={label} aria-label={String(i+1).padStart(2,'0')+' '+label} aria-describedby={`navigation-description-${i}`} type="button" disabled={navigationDisabled} className={`rail-item ${i === current ? 'active' : ''}`} onClick={() => navigate(i)} aria-current={i === current ? 'step' : undefined}><span className="rail-step">{String(i + 1).padStart(2, '0')}</span><span className="rail-copy"><strong>{label}</strong><small id={`navigation-description-${i}`}>{organizer && label === 'Score' ? 'Judges & rounds' : subtitles[label]}</small></span></button>)}</nav><div className="rail-footer"><span className="connection-dot" aria-hidden="true" />Private event</div></aside>}
    <section className="workspace"><header className="topbar">{compact && <Link className="brand-mark judge-brand" href="/" prefetch={false} aria-label="Organizer home">CDJ</Link>}<div><p className="eyebrow">{identity}</p><h1>{title}</h1></div><div className="save-state" role="status">{organizer ? <><span className="save-check" aria-hidden="true">{navigationDisabled ? '…' : '•'}</span><span><strong>{status}</strong><small>Private organizer desk</small></span></> : status}</div></header>{children}</section>
  </main>;
}
