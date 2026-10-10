'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { isAppState, type AppState } from '@/lib/domain';
import { localSetup } from '@/lib/demo-setup';
import { sampleSetup, blankSetup, isolateSetup } from '@/lib/sample-setup';
import { validateSetup } from '@/lib/live/validation';
import type { LiveView, LiveSetup } from '@/lib/live/types';
import LiveDesk from './desk';
import SetupSection from './setup-section';
import { LiveShell } from './shell';
import { creationNonce, download, liveApi } from './client';

const BINDING_KEY = 'country-dance-judging:rehearsal';
const HISTORY_KEY = 'country-dance-judging:organizer-history';
const LEGACY_KEY = 'country-dance-judging:v2';
type Binding = { nonce: string; path?: string; configured?: boolean; sample?: boolean; source?: 'sample' | 'blank' | 'legacy' };
type SavedEvent = { path: string; name: string; sample?: boolean };
const validPath = (path: unknown): path is string => typeof path === 'string' && /^\/live\/[a-zA-Z0-9_-]+$/.test(path);
const inFlight = new Map<string, Promise<Binding>>();

function history(): SavedEvent[] {
  const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  if (!Array.isArray(value)) throw new Error('Saved event links could not be read. They remain untouched.');
  return value.filter((v): v is SavedEvent => v && validPath(v.path) && typeof v.name === 'string');
}
function remember(binding: Binding, view: LiveView) {
  const events = history();
  const existing=events.find((e)=>e.path===binding.path);
  if(existing) {existing.name=view.setup.name; existing.sample=binding.sample;}
  else events.push({ path: binding.path!, name: view.setup.name, sample: binding.sample });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(events));
  localStorage.setItem(BINDING_KEY, JSON.stringify(binding));
}
async function configure(binding: Binding, setup: LiveSetup): Promise<Binding> {
  const running = inFlight.get(binding.nonce); if (running) return running;
  const pending = (async () => {
    let current = binding;
    if (!current.path) {
      const created = await liveApi<{ path: string }>('', { action: 'create', requestId: current.nonce, name: setup.name, venue: setup.venue, date: setup.date });
      current = { ...current, path: created.path }; localStorage.setItem(BINDING_KEY, JSON.stringify(current));
    }
    const token = current.path!.split('/').at(-1)!;
    let view = await liveApi<LiveView>(token);
    if (view.role !== 'organizer') throw new Error('Organizer access required. Use your individual judge link for scoring.');
    // A lost setup response can be recovered without replacing an already configured event.
    if (!current.configured && view.version === 1 && !view.setup.rounds.length && !view.setup.judges.length) {
      await liveApi(token, { action: 'setup', setup: validateSetup(setup), expectedVersion: view.version, requestId: current.nonce.slice(0,32)+'-setup' });
      view = await liveApi<LiveView>(token);
    }
    current = { ...current, configured: true }; remember(current, view); return current;
  })();
  inFlight.set(binding.nonce,pending);
  try { return await pending; } finally { inFlight.delete(binding.nonce); }
}

export default function OrganizerHome() {
  const [binding,setBinding] = useState<Binding|null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(true);
  const [legacy,setLegacy] = useState<AppState|null>(null), [legacyError,setLegacyError] = useState('');
  const [events,setEvents] = useState<SavedEvent[]>([]);
  const started = useRef<Promise<Binding>|null>(null);
  function loadLegacy() {
    const raw=localStorage.getItem(LEGACY_KEY); if (!raw) return null;
    const parsed: unknown=JSON.parse(raw);
    if (!isAppState(parsed)) throw new Error('Legacy device data could not be read. It remains untouched; restore a known backup to use its setup.');
    setLegacy(parsed); return parsed;
  }
  async function initialize() {
    history(); // Validate retained links before any new event or storage writes.
    let savedLegacy: AppState|null=null;
    try { savedLegacy=loadLegacy(); } catch (e) { setLegacyError((e as Error).message); }
    const supplied = new URLSearchParams(window.location.search).get('event');
    if (supplied) {
      if (!/^[a-zA-Z0-9_-]+$/.test(supplied)) throw new Error('Invalid organizer link.');
      const view=await liveApi<LiveView>(supplied);
      if(view.role!=='organizer') throw new Error('Organizer access required. Use your individual judge link for scoring.');
      const current={nonce:creationNonce(),path:`/live/${supplied}`,configured:true,sample:history().find((e)=>e.path===`/live/${supplied}`)?.sample}; remember(current,view); return current;
    }
    const raw=localStorage.getItem(BINDING_KEY);
    let current: Binding;
    if (raw) {
      current=JSON.parse(raw) as Binding;
      if (!/^[a-f0-9]{64}$/.test(current.nonce) || (current.path && !validPath(current.path))) throw new Error('The saved organizer link could not be read. It remains untouched.');
    } else {
      // Existing legacy data is retained byte-for-byte and contributes setup only.
      if (localStorage.getItem(LEGACY_KEY) && !savedLegacy) throw new Error('Restore the unreadable device backup before opening its setup.');
      current={nonce:creationNonce(),source:savedLegacy ? 'legacy':'sample',sample:!savedLegacy};
      localStorage.setItem(BINDING_KEY,JSON.stringify(current));
    }
    const setup=current.source==='blank' ? blankSetup() : savedLegacy && !current.sample ? isolateSetup(localSetup(savedLegacy)) : sampleSetup();
    return configure(current,setup);
  }
  useEffect(()=>{
    let alive=true;
    const timer=setTimeout(()=>{
      started.current ??= initialize();
      void started.current.then((value)=>{if(alive){setBinding(value);setEvents(history());setBusy(false);}}).catch((e)=>{if(alive){setError((e as Error).message);setBusy(false);}});
    },0);
    return()=>{alive=false;clearTimeout(timer);};
    // Bootstrap once; subsequent event changes are explicit actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function create(source:'sample'|'blank') {
    if (busy || !window.confirm(source==='sample' ? 'Open a fresh sample event? Your current event, scores and links will remain saved. Unsaved setup edits will be discarded.' : 'Open a new event? Your current event, scores and links will remain saved. Unsaved setup edits will be discarded.')) return;
    setBusy(true);setError('');setBinding(null);
    try {
      const current:Binding={nonce:creationNonce(),source,sample:source==='sample'};
      localStorage.setItem(BINDING_KEY,JSON.stringify(current));window.history.replaceState(null,'','/');
      const saved=await configure(current,source==='sample' ? sampleSetup():blankSetup());
      setBinding(saved);setEvents(history());
    } catch(e){setError((e as Error).message);} finally{setBusy(false);}
  }
  async function restoreLegacy(e:ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0];e.target.value='';
    if(!file || !window.confirm('Restore legacy device data and open its setup as a fresh event? Current stage events remain saved. Keep a backup of the device history first.')) return;
    setBusy(true);setError('');
    try {
      if(file.size>1500000) throw new Error('Backup is too large.');
      const raw=JSON.parse(await file.text()), value:unknown=raw.format==='country-dance-judging-backup' ? raw.event:raw;
      if(!isAppState(value)) throw new Error('Use a wrapped or plain v2 operational backup.');
      const setup=validateSetup(isolateSetup(localSetup(value)));
      // Save only on this explicit restore action; existing scores/revisions keep their legacy meaning.
      localStorage.setItem(LEGACY_KEY,JSON.stringify(value));setLegacy(value);setLegacyError('');
      const current:Binding={nonce:creationNonce(),source:'legacy',sample:false};
      localStorage.setItem(BINDING_KEY,JSON.stringify(current));window.history.replaceState(null,'','/');
      setBinding(await configure(current,setup));setEvents(history());
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const recovery=<details className="legacy-recovery"><summary>Legacy device backup &amp; history</summary>{legacyError&&<p role="alert">{legacyError}</p>}{legacy&&<><p>{legacy.event.name} · original v2 scores, sums and revisions retained separately from stage judging.</p><button className="quiet-button" onClick={()=>download('device-operational-backup.json',JSON.stringify({format:'country-dance-judging-backup',backupVersion:1,exportedAt:new Date().toISOString(),event:{...legacy,publisherUrl:''}},null,2))}>Download JSON</button><details><summary>Original scores and revision history</summary><pre className="shared-json">{JSON.stringify({competitions:legacy.competitions,removedCompetitions:legacy.removedCompetitions},null,2)}</pre></details></>}<label className="file-button secondary">Restore JSON<input type="file" accept="application/json,.json" disabled={busy} onChange={(e)=>void restoreLegacy(e)}/></label></details>;
  const intro=<div className="page-stack organizer-home-intro">{binding?.sample&&<section className="sample-guide"><p className="kicker">Sample event · fictional people</p><h2>Try the competition flow</h2><p>Open Run and start Prelims, then open each judge link to score and submit. Use Results for approved advancement; Finals entrants populate automatically. For J&J, enter the actual Finals pairing draw, then Save setup.</p><p>For a real competition, start blank or replace the sample setup; verify the actual organizer and judges.</p></section>}{error&&<p role="alert" className="notice">{error}</p>}<SetupSection title="Other events" caption="Workspace"><div className="form-body"><p>Each event keeps its own setup, scores and private judge links.</p><div className="shared-inline"><button className="quiet-button" disabled={busy} onClick={()=>void create('sample')}>Try a fresh sample</button><button className="quiet-button" disabled={busy} onClick={()=>void create('blank')}>Start a blank event</button></div>{events.length>0&&<label><span>Saved event</span><select aria-label="Saved event" value={binding?.path ?? ''} disabled={busy} onChange={(e)=>{window.location.assign('/?event='+encodeURIComponent(e.target.value.split('/').at(-1)!));}}><option value="" disabled>Choose an event</option>{events.map((e,index)=><option key={e.path} value={e.path}>{index+1}. {e.name}{e.sample?' · Sample':''}</option>)}</select></label>}</div></SetupSection></div>;
  if(!binding || busy) return <LiveShell title="Country Dance Judging" identity="Organizer" status={busy?'Opening your event…':'Event unavailable'} items={['Set up','Run','Results','Publish']} current={0} navigate={()=>{}} navigationDisabled>{intro}{!busy&&<button className="quiet-button" onClick={()=>window.location.reload()}>Retry</button>}{recovery}</LiveShell>;
  return <LiveDesk key={binding.path} token={binding.path!.split('/').at(-1)!} setupIntro={intro} recoveryExtra={recovery}/>;
}
