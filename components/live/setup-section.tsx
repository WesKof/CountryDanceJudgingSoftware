'use client';

import type { ReactNode, Ref } from 'react';

export function revealSetupSection(root: HTMLElement, name: string) {
  const target = [...root.querySelectorAll<HTMLDetailsElement>('details[data-section]')].find((section) => section.dataset.section === name);
  if (!target) return false;
  for (let parent: HTMLElement | null = target; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  target.scrollIntoView({ block: 'center' });
  target.querySelector<HTMLElement>(':scope > summary')?.focus({ preventScroll: true });
  return true;
}

export default function SetupSection({ title, caption, count, summaryText, children, detailsRef, sectionId, main = false, initiallyOpen = false, attention = false }: { title: string; caption?: string; count?: number; summaryText?: string; children: ReactNode; detailsRef?: Ref<HTMLDetailsElement>; sectionId?: string; main?: boolean; initiallyOpen?: boolean; attention?: boolean }) {
  return <details className={`form-panel setup-section${main ? ' setup-main-card' : ''}${attention ? ' setup-needs-attention' : ''}`} ref={detailsRef} data-section={sectionId ?? title} open={initiallyOpen}>
    <summary className="panel-heading compact"><div>{caption && <p className="kicker">{caption}</p>}<h2>{title}</h2>{summaryText && <p className="section-summary">{summaryText}</p>}</div>{count !== undefined && <span className="count-pill">{count}</span>}</summary>
    {children}
  </details>;
}
