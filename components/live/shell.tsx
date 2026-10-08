'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
export function LiveShell({ title, identity, status, items, current, navigate, children }: { title: string; identity: string; status: string; items: string[]; current: number; navigate: (n: number) => void; children: ReactNode }) {
  return <main className="app-shell shared-shell">
    <aside className="side-rail" aria-label="Competition navigation"><Link className="brand-mark" href="/" prefetch={false} aria-label="Local demo">CDJ</Link><nav className="rail-nav"><p className="rail-kicker">Competition flow</p>{items.map((label, i) => <button key={label} type="button" className={`rail-item ${i === current ? 'active' : ''}`} onClick={() => navigate(i)} aria-current={i === current ? 'step' : undefined}><span className="rail-step">{String(i + 1).padStart(2, '0')}</span><span className="rail-copy"><strong>{label}</strong></span></button>)}</nav><div className="rail-footer">Private event</div></aside>
    <section className="workspace"><header className="topbar"><div><p className="eyebrow">{identity}</p><h1>{title}</h1></div><div className="save-state" role="status">{status}</div></header>{children}</section>
  </main>;
}
