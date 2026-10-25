'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { SetupTask } from '@/lib/live/setup-guidance';
import SetupSection, { revealSetupSection } from './setup-section';

export default function SetupPage({ automaticStages = false, tasks = [], openTask, archived = false, supporting = false, scoringStage, openScoring, token, toolbar, sampleHelp, otherEvents, children, hasRounds, hasDraft }: {
  automaticStages?: boolean; tasks?: SetupTask[]; openTask?: (task: SetupTask) => void; archived?: boolean; supporting?: boolean; scoringStage?: string; openScoring?: () => void; token: string; competitionCount: number; toolbar: ReactNode; sampleHelp?: ReactNode; otherEvents?: ReactNode; children: ReactNode; hasRounds: boolean; hasDraft: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDetailsElement>(null);
  const wasDraft = useRef(hasDraft);
  useEffect(() => { if (wasDraft.current && !hasDraft && tools.current) tools.current.open = false; wasDraft.current = hasDraft; }, [hasDraft]);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (window.location.hash === '#other-events' && root.current) revealSetupSection(root.current, 'Other events');
  }, []);
  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL(`/?event=${token}`, window.location.origin).href); setNotice('Organizer link copied. Keep it private.'); }
    catch { setNotice('Copy the organizer link from the address bar.'); }
  }
  const nextTask=tasks.find((t)=>!t.complete), readyCount=tasks.filter((t)=>t.complete).length;
  function guardSavedEventNavigation(event: MouseEvent<HTMLDivElement>) {
    if (!hasDraft || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-saved-event-link]') : null;
    if (!link || !event.currentTarget.contains(link) || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    if (!window.confirm('Open this saved event? Unsaved setup edits will be discarded. Saved setup and judging history stay intact.')) event.preventDefault();
  }
  return <div ref={root} className="page-stack setup-page" onClickCapture={guardSavedEventNavigation}>
    <section className="hero-panel setup-hero setup-action-first"><div><p className="kicker">{archived ? 'Saved record' : scoringStage && !hasDraft && !nextTask ? 'Setup saved · scoring is open' : nextTask ? 'Your next setup step' : hasDraft ? 'Ready to save' : 'Event foundation'}</p>
      <h2>{archived ? 'Archived event · read only' : nextTask ? nextTask.label : scoringStage && !hasDraft ? `${scoringStage === 'prelims' ? 'Prelims' : 'Finals'} is ready for judges` : hasDraft ? 'Review and save your setup' : 'Setup is saved'}</h2>
      <p>{archived ? 'Scores, results and history stay available. Use Events to return this event to active.' : nextTask ? nextTask.detail : scoringStage && !hasDraft ? 'Judges can score now. Open the judging desk for their links and progress.' : hasDraft ? 'Save when the preparation is ready.' : 'Open the judging desk for current progress and next steps.'}</p>
      {!archived && (nextTask ? <button className="primary-button" onClick={()=>openTask?.(nextTask)}>Open this step</button> : !hasDraft && <button className="primary-button" onClick={openScoring}>Open judging desk</button>)}
      {automaticStages && !archived && !supporting && hasDraft && !nextTask && <p className="setup-freeze-note">Saving complete preparation opens scoring automatically and freezes entries, heats, songs and judge assignments.</p>}
    </div></section>
    {hasDraft && <div className={`setup-toolbar${hasDraft ? ' has-draft' : ''}`}>
      <div className="setup-save-controls">{toolbar}</div>
    </div>}
    <details ref={tools} id="setup-saved-details" className="setup-navigation supporting-drawer"><summary>Setup details &amp; tools <small>Preparation, events &amp; help</small></summary><div className="supporting-content">
      {tasks.length>0 && !archived && <details className="setup-checklist"><summary>Preparation checklist · {readyCount} / {tasks.length} ready</summary><ol>{tasks.map((task)=><li key={task.id} className={task.complete?'is-complete':'needs-action'}><span aria-hidden="true">{task.complete?'✓':'!'}</span><div><strong>{task.label}</strong><small>{task.detail}</small></div><button className="quiet-button" onClick={()=>openTask?.(task)}>{task.complete?'Review':'Open'}<span className="sr-only"> · {task.label}</span></button></li>)}</ol></details>}
<div className="setup-navigation-controls">
      <label className="setup-section-picker"><span>Go to section</span><select aria-label="Go to section" defaultValue="" onChange={(event) => {
        if (root.current && event.target.value) revealSetupSection(root.current, event.target.value);
        event.target.value = '';
      }}><option value="">Choose a section</option><option value="Event details">Details</option><option value="Program & stages">Program</option><option value="Judges">Judges</option><option value="Roster" disabled={!hasRounds}>Couples / Contestants</option><option value="Round setup" disabled={!hasRounds}>Round settings</option></select></label>
      <div className="setup-event-tools setup-tool-actions"><button type="button" className="quiet-button" onClick={() => void copyLink()}>Copy organizer link</button><button type="button" className="quiet-button" onClick={() => {
        if (root.current) revealSetupSection(root.current, 'Other events');
      }}>Other events</button></div>
      {notice && <p className="setup-tool-notice" role="status">{notice}</p>}
    </div>
    {children}
    {sampleHelp}
    {otherEvents ?? <SetupSection title="Other events" caption="Workspace"><div className="form-body"><p>Open your saved events or start another event from the organizer home. This event and its judging history stay saved.</p><a className="quiet-button" href={`/?event=${token}#other-events`} onClick={(event) => {
      if (hasDraft && !window.confirm('Open Other events at the organizer home? Unsaved setup edits will be discarded. Saved setup and judging history stay intact.')) event.preventDefault();
    }}>Open event workspace</a></div></SetupSection>}
    </div></details>
  </div>;
}
