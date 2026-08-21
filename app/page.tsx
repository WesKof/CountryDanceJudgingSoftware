'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { normalizeHeader, parseCsv, serializeCsv } from '@/lib/csv';
import {
  createDefaultState,
  createId,
  isAppState,
  type AppState,
  type Competition,
  type Entry,
  type Mark,
} from '@/lib/domain';
import { ballotProgress, calculateResults, hasTies, MARKS, MARK_VALUES, scoreTotal } from '@/lib/scoring';

const STORAGE_KEY = 'country-dance-judging:v2';
type View = 'event' | 'scoring' | 'results' | 'data';

const navigation: Array<{ id: View; number: string; label: string }> = [
  { id: 'event', number: '01', label: 'Event' },
  { id: 'scoring', number: '02', label: 'Scoring' },
  { id: 'results', number: '03', label: 'Results' },
  { id: 'data', number: '04', label: 'Data' },
];

function downloadText(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function entryPrimary(entry: Entry, competition: Competition) {
  return competition.format === 'Strictly' ? entry.lead ?? 'Unnamed lead' : entry.name ?? 'Unnamed dancer';
}

function entrySecondary(entry: Entry, competition: Competition) {
  return competition.format === 'Strictly' ? entry.follow ?? 'Unnamed follow' : entry.role ?? 'Unassigned';
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'results';
}

export default function Home() {
  const [state, setState] = useState<AppState>(createDefaultState);
  const [view, setView] = useState<View>('scoring');
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading local event…');
  const [notice, setNotice] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [newJudge, setNewJudge] = useState('');
  const [entryDraft, setEntryDraft] = useState({ number: '', first: '', second: '', role: 'Lead' as 'Lead' | 'Follow' });
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (isAppState(parsed)) setState(parsed);
        }
      } catch {
        setNotice('The saved event could not be read, so a safe starter event was opened.');
      } finally {
        setHydrated(true);
        setSaveStatus('Saved on this device');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const statusTimer = window.setTimeout(() => setSaveStatus('Saving…'), 0);
    const saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaveStatus(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
      } catch {
        setSaveStatus('Local save unavailable');
      }
    }, 250);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(saveTimer);
    };
  }, [state, hydrated]);

  const competition = state.competitions.find((item) => item.id === state.activeCompetitionId) ?? state.competitions[0];
  const progress = useMemo(() => ballotProgress(competition, state.judges), [competition, state.judges]);
  const results = useMemo(() => calculateResults(competition, state.judges), [competition, state.judges]);
  const resultGroups = useMemo(() => Array.from(new Set(results.map((row) => row.group))), [results]);
  const incompleteEntries = useMemo(
    () => competition.entries.filter((entry) => state.judges.some((judge) => !competition.scores[entry.id]?.[judge.id])),
    [competition, state.judges],
  );

  function updateCompetition(updater: (current: Competition) => Competition) {
    setState((current) => ({
      ...current,
      competitions: current.competitions.map((item) => item.id === competition.id ? updater(item) : item),
    }));
  }

  function switchCompetition(id: string) {
    setState((current) => ({ ...current, activeCompetitionId: id }));
  }

  function setMark(entryId: string, judgeId: string, mark: Mark) {
    updateCompetition((current) => ({
      ...current,
      scores: {
        ...current.scores,
        [entryId]: {
          ...current.scores[entryId],
          [judgeId]: current.scores[entryId]?.[judgeId] === mark ? '' : mark,
        },
      },
    }));
  }

  function resetEntry(entryId: string) {
    updateCompetition((current) => ({ ...current, scores: { ...current.scores, [entryId]: {} } }));
  }

  function clearBallot() {
    if (!window.confirm(`Clear every mark for ${competition.name} · ${competition.division}?`)) return;
    updateCompetition((current) => ({ ...current, scores: {} }));
    setNotice('The active ballot was cleared. Existing result revisions were preserved.');
  }

  function addJudge(event: FormEvent) {
    event.preventDefault();
    const name = newJudge.trim();
    if (!name) return;
    setState((current) => ({ ...current, judges: [...current.judges, { id: createId('judge'), name }] }));
    setNewJudge('');
  }

  function removeJudge(id: string) {
    if (!window.confirm('Remove this judge and their marks from every active ballot?')) return;
    setState((current) => ({
      ...current,
      judges: current.judges.filter((judge) => judge.id !== id),
      competitions: current.competitions.map((item) => ({
        ...item,
        scores: Object.fromEntries(Object.entries(item.scores).map(([entryId, marks]) => {
          const nextMarks = { ...marks };
          delete nextMarks[id];
          return [entryId, nextMarks];
        })),
      })),
    }));
  }

  function addEntry(event: FormEvent) {
    event.preventDefault();
    const number = Number(entryDraft.number);
    const first = entryDraft.first.trim();
    const second = entryDraft.second.trim();
    if (!Number.isFinite(number) || !first || (competition.format === 'Strictly' && !second)) {
      setNotice('Add a valid contestant number and all required names.');
      return;
    }
    if (competition.entries.some((entry) => entry.number === number)) {
      setNotice(`Contestant number ${number} is already in this competition.`);
      return;
    }
    const entry: Entry = competition.format === 'Strictly'
      ? { id: createId('entry'), number, lead: first, follow: second }
      : { id: createId('entry'), number, name: first, role: entryDraft.role };
    updateCompetition((current) => ({ ...current, entries: [...current.entries, entry].sort((a, b) => a.number - b.number) }));
    setEntryDraft({ number: '', first: '', second: '', role: entryDraft.role });
  }

  function removeEntry(id: string) {
    if (!window.confirm('Remove this contestant from the active competition?')) return;
    updateCompetition((current) => {
      const scores = { ...current.scores };
      delete scores[id];
      return { ...current, entries: current.entries.filter((entry) => entry.id !== id), scores };
    });
  }

  function addCompetition(format: Competition['format']) {
    const id = createId('competition');
    const next: Competition = {
      id,
      name: format,
      format,
      division: 'Open',
      round: 'Finals',
      entries: [],
      scores: {},
      revisions: [],
    };
    setState((current) => ({ ...current, competitions: [...current.competitions, next], activeCompetitionId: id }));
    setNotice(`${format} competition added. Add its contestants below or import a CSV.`);
  }

  function finalizeResults() {
    if (!progress.complete) {
      setNotice('Complete every judge mark before saving a result revision.');
      return;
    }
    const revisionNumber = competition.revisions.length + 1;
    updateCompetition((current) => ({
      ...current,
      revisions: [...current.revisions, {
        id: createId('revision'),
        createdAt: new Date().toISOString(),
        label: `Revision ${revisionNumber}`,
        rows: results,
      }],
    }));
    setNotice(`Revision ${revisionNumber} saved locally. The ballot remains editable.`);
  }

  function exportResults() {
    const rows: Array<Array<string | number>> = [
      ['Event', 'Competition', 'Division', 'Round', 'Group', 'Place', 'Tie', 'Number', 'Primary', 'Secondary', 'Total Score'],
      ...results.map((row) => [state.event.name, competition.name, competition.division, competition.round, row.group, row.place, row.tied ? 'Yes' : 'No', row.number, row.primary, row.secondary, row.total.toFixed(1)]),
    ];
    downloadText(`${safeFilename(state.event.name)}-${safeFilename(competition.division)}-results.csv`, serializeCsv(rows), 'text/csv;charset=utf-8');
  }

  function exportBackup() {
    downloadText(`${safeFilename(state.event.name)}-backup.json`, JSON.stringify(state, null, 2), 'application/json');
  }

  function downloadEntrantTemplate() {
    const rows = competition.format === 'Strictly'
      ? [['Number', 'Lead', 'Follow'], ['128', 'Lead name', 'Follow name']]
      : [['Number', 'Name', 'Role'], ['204', 'Dancer name', 'Lead']];
    downloadText(`${safeFilename(competition.format)}-entrant-template.csv`, serializeCsv(rows), 'text/csv;charset=utf-8');
  }

  function downloadJudgeTemplate() {
    downloadText('judge-template.csv', serializeCsv([['Name'], ['Judge name']]), 'text/csv;charset=utf-8');
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isAppState(parsed)) throw new Error('This is not a Country Dance Judging v2 backup.');
      if (!window.confirm(`Replace the current local event with “${parsed.event.name}”?`)) return;
      setState(parsed);
      setNotice('Backup restored and saved on this device.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The backup could not be restored.');
    }
  }

  async function importEntrants(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The entrant CSV needs a header row and at least one contestant.');
      const headers = rows[0].map(normalizeHeader);
      const findColumn = (...names: string[]) => headers.findIndex((header) => names.includes(header));
      const numberColumn = findColumn('number', 'contestantnumber', 'bib');
      const firstColumn = competition.format === 'Strictly' ? findColumn('lead', 'leadname', 'leader') : findColumn('name', 'dancer', 'contestant');
      const secondColumn = competition.format === 'Strictly' ? findColumn('follow', 'followname', 'follower') : findColumn('role');
      if (numberColumn < 0 || firstColumn < 0 || secondColumn < 0) {
        throw new Error(competition.format === 'Strictly' ? 'Use CSV headers Number, Lead, Follow.' : 'Use CSV headers Number, Name, Role.');
      }
      const parsedEntries: Array<Entry | null> = rows.slice(1).map((row): Entry | null => {
        const number = Number(row[numberColumn]);
        const first = row[firstColumn]?.trim();
        const second = row[secondColumn]?.trim();
        if (!Number.isFinite(number) || !first || !second) return null;
        if (competition.format === 'Strictly') return { id: createId('entry'), number, lead: first, follow: second } satisfies Entry;
        const role = second.toLowerCase().startsWith('l') ? 'Lead' : second.toLowerCase().startsWith('f') ? 'Follow' : null;
        return role ? { id: createId('entry'), number, name: first, role } satisfies Entry : null;
      });
      const entries = parsedEntries.filter((entry): entry is Entry => entry !== null);
      if (!entries.length) throw new Error('No valid contestant rows were found.');
      if (competition.entries.length && !window.confirm(`Replace ${competition.entries.length} current contestants with ${entries.length} imported contestants?`)) return;
      updateCompetition((current) => ({ ...current, entries: entries.sort((a, b) => a.number - b.number), scores: {} }));
      setNotice(`${entries.length} contestants imported. The active ballot was reset; result revisions were preserved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The entrants could not be imported.');
    }
  }

  async function importJudges(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      const startsWithHeader = ['name', 'judge', 'judgename'].includes(normalizeHeader(rows[0]?.[0] ?? ''));
      const names = rows.slice(startsWithHeader ? 1 : 0).map((row) => row[0]?.trim()).filter(Boolean);
      const judges = Array.from(new Set(names)).map((name) => ({ id: createId('judge'), name }));
      if (!judges.length) throw new Error('No judge names were found in the first CSV column.');
      if (state.judges.length && !window.confirm(`Replace ${state.judges.length} judges with ${judges.length} imported judges and reset active ballots?`)) return;
      setState((current) => ({ ...current, judges, competitions: current.competitions.map((item) => ({ ...item, scores: {} })) }));
      setNotice(`${judges.length} judges imported. Active ballots were reset; result revisions were preserved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The judges could not be imported.');
    }
  }

  async function publishResults() {
    if (!progress.complete || !results.length) {
      setNotice('Complete the ballot before sending results.');
      return;
    }
    let endpoint: URL;
    try {
      endpoint = new URL(state.publisherUrl);
      if (endpoint.protocol !== 'https:') throw new Error();
    } catch {
      setNotice('Enter a valid HTTPS Google Apps Script web-app URL.');
      return;
    }
    const rows: Array<Array<string | number>> = [
      ['Event', 'Competition', 'Division', 'Round', 'Place', 'Tie', 'Number', 'Lead / Dancer', 'Follow / Role', 'Total Score', ...state.judges.map((judge) => judge.name)],
      ...results.map((row) => [state.event.name, competition.name, competition.division, competition.round, row.place, row.tied ? 'Yes' : 'No', row.number, row.primary, row.secondary, row.total.toFixed(1), ...state.judges.map((judge) => competition.scores[row.entryId]?.[judge.id] ?? '')]),
    ];
    setPublishing(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ results: JSON.stringify(rows) }),
      });
      if (!response.ok) throw new Error(`The endpoint returned ${response.status}.`);
      const text = await response.text();
      if (text) {
        try {
          const payload = JSON.parse(text) as { success?: boolean; error?: string };
          if (payload.success === false) throw new Error(payload.error || 'The connector rejected the results.');
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      setNotice('Results were accepted by the configured publishing endpoint.');
    } catch (error) {
      setNotice(error instanceof Error ? `Publishing failed: ${error.message}` : 'Publishing failed.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="side-rail" aria-label="Primary navigation">
        <button className="brand-mark" type="button" onClick={() => setView('event')} aria-label="Country Dance Judging home">CDJ</button>
        <nav className="rail-nav">
          {navigation.map((item) => <button key={item.id} type="button" className={`rail-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}><span>{item.number}</span>{item.label}</button>)}
        </nav>
        <div className="rail-footer"><span className="connection-dot" /> Local-first mode</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Event desk · {competition.round}</p><h1>{state.event.name}</h1></div>
          <div className="save-state" role="status"><span className="save-check">✓</span><span><strong>{saveStatus}</strong><small>No account or connection required</small></span></div>
        </header>

        {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}

        {view === 'event' && (
          <div className="page-stack">
            <section className="hero-panel"><div><p className="kicker">Event foundation</p><h2>Set up the desk once</h2><p>Event details, competitions, judges, and contestants stay on this device and feed every ballot.</p></div><span className="format-stamp">{state.competitions.length} competitions</span></section>

            <div className="setup-grid">
              <section className="form-panel">
                <div className="panel-heading compact"><div><p className="kicker">Event</p><h2>Details</h2></div></div>
                <div className="form-body three-fields">
                  <label><span>Event name</span><input value={state.event.name} onChange={(event) => setState((current) => ({ ...current, event: { ...current.event, name: event.target.value } }))} /></label>
                  <label><span>Venue</span><input value={state.event.venue} onChange={(event) => setState((current) => ({ ...current, event: { ...current.event, venue: event.target.value } }))} /></label>
                  <label><span>Date</span><input type="date" value={state.event.date} onChange={(event) => setState((current) => ({ ...current, event: { ...current.event, date: event.target.value } }))} /></label>
                </div>
              </section>

              <section className="form-panel">
                <div className="panel-heading compact"><div><p className="kicker">Competitions</p><h2>Program</h2></div><div className="button-pair"><button type="button" className="quiet-button" onClick={() => addCompetition('Strictly')}>+ Strictly</button><button type="button" className="quiet-button" onClick={() => addCompetition('Jack & Jill')}>+ J&amp;J</button></div></div>
                <div className="competition-list">
                  {state.competitions.map((item) => <button type="button" key={item.id} className={`competition-card ${item.id === competition.id ? 'selected' : ''}`} onClick={() => switchCompetition(item.id)}><span className="competition-monogram">{item.format === 'Strictly' ? 'ST' : 'J&J'}</span><span><strong>{item.name}</strong><small>{item.division} · {item.round} · {item.entries.length} entries</small></span><b>→</b></button>)}
                </div>
                <div className="form-body four-fields inset-form">
                  <label><span>Name</span><input value={competition.name} onChange={(event) => updateCompetition((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label><span>Format</span><input value={competition.format} disabled /></label>
                  <label><span>Division</span><input value={competition.division} onChange={(event) => updateCompetition((current) => ({ ...current, division: event.target.value }))} /></label>
                  <label><span>Round</span><input value={competition.round} onChange={(event) => updateCompetition((current) => ({ ...current, round: event.target.value }))} /></label>
                </div>
              </section>
            </div>

            <div className="setup-grid lower-grid">
              <section className="form-panel">
                <div className="panel-heading compact"><div><p className="kicker">Officials</p><h2>Judges</h2></div><span className="count-pill">{state.judges.length}</span></div>
                <form className="inline-form" onSubmit={addJudge}><label className="sr-only" htmlFor="judge-name">Judge name</label><input id="judge-name" placeholder="Judge name" value={newJudge} onChange={(event) => setNewJudge(event.target.value)} /><button className="primary-button" type="submit">Add judge</button></form>
                <ul className="manage-list">{state.judges.map((judge, index) => <li key={judge.id}><span className="list-index">{String(index + 1).padStart(2, '0')}</span><strong>{judge.name}</strong><button type="button" onClick={() => removeJudge(judge.id)}>Remove</button></li>)}</ul>
              </section>

              <section className="form-panel">
                <div className="panel-heading compact"><div><p className="kicker">Active competition</p><h2>{competition.format === 'Strictly' ? 'Couples' : 'Dancers'}</h2></div><span className="count-pill">{competition.entries.length}</span></div>
                <form className={`entry-form ${competition.format === 'Strictly' ? 'strictly' : ''}`} onSubmit={addEntry}>
                  <label><span>Number</span><input inputMode="numeric" placeholder="128" value={entryDraft.number} onChange={(event) => setEntryDraft((current) => ({ ...current, number: event.target.value }))} /></label>
                  <label><span>{competition.format === 'Strictly' ? 'Lead' : 'Name'}</span><input placeholder="Full name" value={entryDraft.first} onChange={(event) => setEntryDraft((current) => ({ ...current, first: event.target.value }))} /></label>
                  {competition.format === 'Strictly' ? <label><span>Follow</span><input placeholder="Full name" value={entryDraft.second} onChange={(event) => setEntryDraft((current) => ({ ...current, second: event.target.value }))} /></label> : <label><span>Role</span><select value={entryDraft.role} onChange={(event) => setEntryDraft((current) => ({ ...current, role: event.target.value as 'Lead' | 'Follow' }))}><option>Lead</option><option>Follow</option></select></label>}
                  <button className="primary-button" type="submit">Add</button>
                </form>
                <ul className="manage-list entrant-list">{competition.entries.map((entry) => <li key={entry.id}><span className="number-badge small">{entry.number}</span><span><strong>{entryPrimary(entry, competition)}</strong><small>{entrySecondary(entry, competition)}</small></span><button type="button" onClick={() => removeEntry(entry.id)}>Remove</button></li>)}</ul>
              </section>
            </div>
          </div>
        )}

        {view === 'scoring' && (
          <>
            <div className="control-strip">
              <label className="control-block"><span className="control-label">Competition</span><select value={competition.id} onChange={(event) => switchCompetition(event.target.value)}>{state.competitions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.format}</option>)}</select></label>
              <div className="control-block"><span className="control-label">Division / round</span><strong>{competition.division} · {competition.round}</strong></div>
              <div className="progress-block"><div className="progress-copy"><span>Ballot progress</span><strong>{progress.selected} / {progress.total}</strong></div><div className="progress-track"><span style={{ width: `${progress.total ? (progress.selected / progress.total) * 100 : 0}%` }} /></div></div>
              <button className="review-button" type="button" onClick={() => setReviewOpen(true)}>Review ballot <span>→</span></button>
            </div>

            <div className="content-grid">
              <section className="score-panel" aria-labelledby="score-heading">
                <div className="panel-heading"><div><p className="kicker">Active ballot</p><h2 id="score-heading">Score the {competition.format === 'Strictly' ? 'couples' : 'dancers'}</h2></div><div className="heading-actions"><div className="score-key" aria-label="Score key">{MARKS.map((mark) => <span key={mark}><b>{mark.toUpperCase()}</b> {MARK_VALUES[mark]}</span>)}</div><button className="text-button danger" type="button" onClick={clearBallot}>Clear ballot</button></div></div>

                {state.judges.length === 0 || competition.entries.length === 0 ? <div className="empty-state"><span>02</span><h3>This ballot needs {state.judges.length === 0 ? 'judges' : 'contestants'}.</h3><p>Add them in Event setup or import a CSV in Data.</p><button type="button" className="primary-button" onClick={() => setView('event')}>Open event setup</button></div> : (
                  <div className="table-wrap"><table className="score-table"><thead><tr><th scope="col">{competition.format === 'Strictly' ? 'Couple' : 'Dancer'}</th>{state.judges.map((judge) => <th scope="col" key={judge.id}>{judge.name}</th>)}<th scope="col">Total</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
                    {competition.entries.map((entry) => {
                      const entryMarks = state.judges.map((judge) => competition.scores[entry.id]?.[judge.id] ?? '');
                      const complete = entryMarks.every(Boolean);
                      const total = scoreTotal(entryMarks);
                      return <tr key={entry.id} className={complete ? 'complete-row' : ''}><th scope="row"><span className="number-badge">{entry.number}</span><span className="couple-name"><strong>{entryPrimary(entry, competition)}</strong><small>{entrySecondary(entry, competition)}</small></span></th>{state.judges.map((judge) => <td key={judge.id}><div className="mark-group" role="group" aria-label={`${judge.name} score for contestant ${entry.number}`}>{MARKS.map((mark) => <button type="button" key={mark} className={`mark-button mark-${mark.toLowerCase()} ${competition.scores[entry.id]?.[judge.id] === mark ? 'selected' : ''}`} aria-pressed={competition.scores[entry.id]?.[judge.id] === mark} onClick={() => setMark(entry.id, judge.id, mark)}>{mark}</button>)}</div></td>)}<td className="total-cell">{complete ? total.toFixed(1) : '—'}</td><td><button className="row-reset" type="button" onClick={() => resetEntry(entry.id)} aria-label={`Reset marks for contestant ${entry.number}`}>Reset</button></td></tr>;
                    })}
                  </tbody></table></div>
                )}
              </section>

              <aside className="standings-panel" aria-labelledby="standings-heading">
                <div className="panel-heading compact"><div><p className="kicker">Calculated live</p><h2 id="standings-heading">Standings</h2></div><span className="live-pill"><i /> Live</span></div>
                {resultGroups.map((group) => <div key={group} className="standing-group"><h3>{group}</h3><ol className="standings-list">{results.filter((row) => row.group === group).map((row) => <li key={row.entryId}><span className="place">{row.tied ? 'T' : ''}{String(row.place).padStart(2, '0')}</span><span><strong>#{row.number} · {row.primary}</strong><small>{row.secondary}</small></span><b>{row.total.toFixed(1)}</b></li>)}</ol></div>)}
                {!results.length && <div className="aside-empty">Completed entries will appear here.</div>}
                <div className={`readiness-card ${progress.complete ? 'ready' : ''}`}><span className="readiness-icon">{progress.complete ? '✓' : '!'}</span><div><strong>{progress.complete ? 'Ballot ready to finalize' : `${incompleteEntries.length} entries need attention`}</strong><p>{progress.complete ? 'Review the ballot, then save a result revision.' : 'Complete every judge mark before finalizing this round.'}</p></div></div>
              </aside>
            </div>
          </>
        )}

        {view === 'results' && (
          <div className="page-stack">
            <section className="hero-panel results-hero"><div><p className="kicker">Result control</p><h2>{competition.division} · {competition.round}</h2><p>Current standings stay live. Finalizing creates an immutable local revision without locking the ballot.</p></div><div className="hero-actions"><button type="button" className="quiet-button" onClick={exportResults} disabled={!results.length}>Export CSV</button><button type="button" className="quiet-button" onClick={() => window.print()} disabled={!results.length}>Print</button><button type="button" className="primary-button" onClick={finalizeResults} disabled={!progress.complete}>Save revision</button></div></section>
            {!progress.complete && <div className="status-card warning"><strong>Results are provisional.</strong><span>{progress.total - progress.selected} marks are still missing.</span><button type="button" onClick={() => setView('scoring')}>Return to ballot</button></div>}
            {progress.complete && hasTies(results) && <div className="status-card tie"><strong>Shared-place policy applied.</strong><span>Equal totals are shown as ties; no contestant is advanced by an arbitrary tiebreak.</span></div>}
            <div className="results-layout">
              <section className="result-sheet"><div className="result-letterhead"><span>Official desk copy</span><h2>{state.event.name}</h2><p>{competition.name} · {competition.division} · {competition.round}</p></div>{resultGroups.map((group) => <div className="result-group" key={group}><h3>{group}</h3><table><thead><tr><th>Place</th><th>Number</th><th>Contestant</th><th>Total</th></tr></thead><tbody>{results.filter((row) => row.group === group).map((row) => <tr key={row.entryId}><td><span className="result-place">{row.tied ? 'T' : ''}{row.place}</span></td><td>#{row.number}</td><td><strong>{row.primary}</strong><small>{row.secondary}</small></td><td>{row.total.toFixed(1)}</td></tr>)}</tbody></table></div>)}{!results.length && <div className="empty-state compact"><h3>No complete results yet.</h3><p>Complete at least one contestant’s marks to calculate a standing.</p></div>}</section>
              <aside className="revision-panel"><div className="panel-heading compact"><div><p className="kicker">Audit trail</p><h2>Revisions</h2></div><span className="count-pill">{competition.revisions.length}</span></div><div className="revision-list">{[...competition.revisions].reverse().map((revision) => <article key={revision.id}><div><strong>{revision.label}</strong><time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></div><span>{revision.rows.length} placed</span></article>)}{!competition.revisions.length && <div className="aside-empty">Saved revisions will appear here with their timestamp.</div>}</div></aside>
            </div>
          </div>
        )}

        {view === 'data' && (
          <div className="page-stack">
            <section className="hero-panel"><div><p className="kicker">Portable by design</p><h2>Own the event data</h2><p>Import rosters, keep a full local backup, export result files, or connect your existing Apps Script only when you choose.</p></div><span className="format-stamp">JSON + CSV</span></section>
            <div className="data-grid">
              <section className="data-card"><span className="data-number">01</span><h3>Contestants</h3><p>Replace the active {competition.format === 'Strictly' ? 'couple roster with Number, Lead, Follow.' : 'dancer roster with Number, Name, Role.'}</p><div className="card-actions"><label className="file-button">Import entrant CSV<input type="file" accept=".csv,text/csv" onChange={importEntrants} /></label><button type="button" className="quiet-button" onClick={downloadEntrantTemplate}>Template</button></div><small>Active: {competition.name} · {competition.division}</small></section>
              <section className="data-card"><span className="data-number">02</span><h3>Judges</h3><p>Import a Name column, or a one-column list. Replacing judges resets active ballots.</p><div className="card-actions"><label className="file-button">Import judge CSV<input type="file" accept=".csv,text/csv" onChange={importJudges} /></label><button type="button" className="quiet-button" onClick={downloadJudgeTemplate}>Template</button></div><small>{state.judges.length} judges across the event</small></section>
              <section className="data-card"><span className="data-number">03</span><h3>Event backup</h3><p>Download everything—including ballots and revisions—or restore it on another device.</p><div className="card-actions"><button type="button" className="quiet-button" onClick={exportBackup}>Download JSON</button><label className="file-button secondary">Restore JSON<input type="file" accept=".json,application/json" onChange={restoreBackup} /></label></div><small>Schema v{state.version} · stored locally</small></section>
            </div>
            <section className="publisher-panel"><div className="publisher-copy"><p className="kicker">Optional publisher</p><h2>Google Apps Script endpoint</h2><p>The connector is not required for judging. Add a deployed web-app URL only if you want to send completed results to a Google Sheet you control.</p></div><div className="publisher-form"><label><span>Web-app URL</span><input type="url" placeholder="https://script.google.com/macros/s/…/exec" value={state.publisherUrl} onChange={(event) => setState((current) => ({ ...current, publisherUrl: event.target.value }))} /></label><button type="button" className="primary-button" onClick={publishResults} disabled={publishing || !state.publisherUrl}>{publishing ? 'Sending…' : 'Send completed results'}</button><small>This sends the current results and judge marks. Use only an endpoint you own and have deployed intentionally.</small></div></section>
          </div>
        )}
      </section>

      {reviewOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setReviewOpen(false); }}><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><button className="modal-close" type="button" onClick={() => setReviewOpen(false)} aria-label="Close review">×</button><p className="kicker">Ballot review</p><h2 id="review-title">{progress.complete ? 'Everything is marked.' : `${incompleteEntries.length} entries need attention.`}</h2><div className="review-meter"><div><span>Completed marks</span><strong>{progress.selected} / {progress.total}</strong></div><div className="progress-track"><span style={{ width: `${progress.total ? (progress.selected / progress.total) * 100 : 0}%` }} /></div></div>{incompleteEntries.length > 0 && <ul className="review-list">{incompleteEntries.map((entry) => <li key={entry.id}><span className="number-badge small">{entry.number}</span><span><strong>{entryPrimary(entry, competition)}</strong><small>{state.judges.filter((judge) => !competition.scores[entry.id]?.[judge.id]).map((judge) => judge.name).join(', ')} missing</small></span></li>)}</ul>}{progress.complete && hasTies(results) && <div className="modal-note"><strong>Ties detected.</strong> Shared placements will be preserved in the result revision.</div>}<div className="modal-actions"><button type="button" className="quiet-button" onClick={() => setReviewOpen(false)}>Keep editing</button><button type="button" className="primary-button" disabled={!progress.complete} onClick={() => { setReviewOpen(false); setView('results'); }}>Review results</button></div></section></div>}
    </main>
  );
}
