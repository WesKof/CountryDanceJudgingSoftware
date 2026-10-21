'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import SetupSection, { revealSetupSection } from './setup-section';

export default function SetupPage({ automaticStages = false, scoringStage, openScoring, token, competitionCount, toolbar, sampleHelp, otherEvents, children, hasRounds, hasDraft }: {
  automaticStages?: boolean; scoringStage?: string; openScoring?: () => void; token: string; competitionCount: number; toolbar: ReactNode; sampleHelp?: ReactNode; otherEvents?: ReactNode; children: ReactNode; hasRounds: boolean; hasDraft: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDetailsElement>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (window.location.hash === '#other-events' && root.current) revealSetupSection(root.current, 'Other events');
  }, []);
  async function copyLink() {
    if (tools.current) tools.current.open = false;
    try { await navigator.clipboard.writeText(new URL(`/?event=${token}`, window.location.origin).href); setNotice('Organizer link copied. Keep it private.'); }
    catch { setNotice('Copy the organizer link from the address bar.'); }
  }
  return <div ref={root} className="page-stack setup-page">
    <section className="hero-panel setup-hero"><div><p className="kicker">{scoringStage && !hasDraft ? 'Setup saved · scoring is open' : 'Event foundation'}</p><h2>{scoringStage && !hasDraft ? `${scoringStage === 'prelims' ? 'Prelims' : 'Finals'} is ready for judges` : 'Set up the desk once'}</h2>{scoringStage && !hasDraft ? <><p>Judges can score now. Open the judging desk for their links and progress.</p><button className="primary-button" onClick={openScoring}>Open judging desk</button></> : <p>Prepare event details, competitions, judges and entries. {automaticStages ? 'Saving a complete stage setup opens scoring automatically and freezes its entries, heats, songs and judge assignments. Results review follows judge submissions.' : 'Save setup before starting the stage.'}</p>}{sampleHelp}</div><span className="format-stamp">{competitionCount} competitions</span></section>
    <div className="setup-toolbar">
      <div className="setup-save-controls">{toolbar}</div>
      <label className="setup-section-picker"><span>Go to section</span><select aria-label="Go to section" defaultValue="" onChange={(event) => {
        if (root.current && event.target.value) revealSetupSection(root.current, event.target.value);
        event.target.value = '';
      }}><option value="">Choose a section</option><option value="Event details">Details</option><option value="Program & stages">Program</option><option value="Judges">Judges</option><option value="Roster" disabled={!hasRounds}>Couples / Contestants</option><option value="Round setup" disabled={!hasRounds}>Round settings</option></select></label>
      <details ref={tools} className="setup-event-tools"><summary>Event tools</summary><div className="setup-tool-actions"><button type="button" className="quiet-button" onClick={() => void copyLink()}>Copy organizer link</button><button type="button" className="quiet-button" onClick={() => {
        if (tools.current) tools.current.open = false;
        if (root.current) revealSetupSection(root.current, 'Other events');
      }}>Other events</button></div></details>
      {notice && <p className="setup-tool-notice" role="status">{notice}</p>}
    </div>
    {children}
    {otherEvents ?? <SetupSection title="Other events" caption="Workspace"><div className="form-body"><p>Open your saved events or start another event from the organizer home. This event and its judging history stay saved.</p><a className="quiet-button" href={`/?event=${token}#other-events`} onClick={(event) => {
      if (hasDraft && !window.confirm('Open Other events at the organizer home? Unsaved setup edits will be discarded. Saved setup and judging history stay intact.')) event.preventDefault();
    }}>Open event workspace</a></div></SetupSection>}
  </div>;
}
