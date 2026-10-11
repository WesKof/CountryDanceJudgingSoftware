'use client';

import type { ReactNode, Ref } from 'react';

export default function SetupSection({ title, caption, count, summaryText, children, detailsRef }: { title: string; caption?: string; count?: number; summaryText?: string; children: ReactNode; detailsRef?: Ref<HTMLDetailsElement> }) {
  return <details className="form-panel setup-section" ref={detailsRef} data-section={title}>
    <summary className="panel-heading compact"><div>{caption && <p className="kicker">{caption}</p>}<h2>{title}</h2>{summaryText && <p className="section-summary">{summaryText}</p>}</div>{count !== undefined && <span className="count-pill">{count}</span>}</summary>
    {children}
  </details>;
}
