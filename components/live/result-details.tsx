'use client';

import { useState } from 'react';
import type { LiveResult, LiveView, RoundView } from '@/lib/live/types';
import SetupSection from './setup-section';

export function revealResult(id: string) {
  const target = document.getElementById(id);
  for (let node = target; node; node = node.parentElement) if (node instanceof HTMLDetailsElement) node.open = true;
  target?.scrollIntoView({ block: 'center' });
  (target?.querySelector<HTMLElement>(':scope > summary') ?? target)?.focus({ preventScroll: true });
}

function status(round: RoundView, id: string) {
  const result = round.standings!, row = result.rows.find((r) => r.subjectId === id);
  if (round.definition.kind === 'prelims') {
    if (result.approved && result.advancingIds?.includes(id)) return 'Advancing';
    if (result.advancementTies?.some((t) => t.subjectIds.includes(id) && !t.complete)) return 'Cutoff decision needed';
    return row?.tied ? 'Equal average' : '';
  }
  if (!row?.tied) return '';
  return !row.decided ? 'Tie pending' : result.decisions.some((d) => d.order.includes(id) && d.shared) ? 'Shared place' : 'Head-decided placement';
}

function ResultsTable({ round, rows }: { round: RoundView; rows: LiveResult[] }) {
  return <div className="table-wrap"><table className="results-places"><thead><tr><th scope="col">Place</th><th scope="col" className="results-bib-column">Number</th><th scope="col">Contestant</th><th scope="col">Average</th></tr></thead><tbody>{rows.map((r) => <tr key={r.subjectId}>
    <td><span className="result-place-badge">{r.place}</span></td><td className="results-bib-column">#{r.number}</td>
    <td><span className="results-mobile-bib">#{r.number}</span><strong>{r.primary}</strong>{r.secondary && <small>{r.secondary}</small>}{status(round, r.subjectId) && <small className="result-entry-status">{status(round, r.subjectId)}</small>}{<button className="result-card-link" onClick={() => revealResult(`result-card-${round.key}-${r.subjectId}`)}>View scorecard<span className="sr-only"> for #{r.number}</span></button>}</td>
    <td>{r.average.toFixed(4)}</td>
  </tr>)}</tbody></table></div>;
}

export function ResultHighlights({ round }: { round: RoundView }) {
  const [limit, setLimit] = useState('3');
  const result = round.standings!, groups = [...new Set(result.rows.map((r) => r.group))];
  return <section className="result-sheet results-highlights" id={`round-result-${round.id}`} tabIndex={-1} aria-label="Results summary">
    <div className="results-highlight-heading"><div><p className="kicker">{result.approved ? 'Head approved' : 'Provisional · awaiting approval'}</p><h2>{round.definition.kind === 'finals' ? 'Finals results' : 'Prelims results'}</h2><p>{round.definition.format} · {round.definition.division}</p></div><label>Show results<select value={limit} onChange={(e) => setLimit(e.target.value)}><option value="3">Top 3</option><option value="5">Top 5</option><option value="all">All</option></select></label></div>
    {groups.map((group) => {
      const rows = result.rows.filter((r) => r.group === group);
      const cutoff = limit === 'all' ? Infinity : rows[Math.min(Number(limit), rows.length) - 1]?.place ?? Infinity;
      return <div className="result-group" key={group}><h3>{group}</h3><ResultsTable round={round} rows={rows.filter((r) => r.place <= cutoff)} /></div>;
    })}
    {!result.rows.length && <p>No eligible ranked entries. Retained withdrawn records are available in Scorecards.</p>}
    <div className="results-highlight-footer"><p>{limit === 'all' ? 'All ranked entries' : `Top ${limit}${groups.length > 1 ? ' in each role' : ''} · includes shared cutoff places`}{!result.approved && ' · provisional results'}</p><button className="quiet-button" onClick={() => revealResult('results-scorecards')}>View scorecards</button>{!!round.definition.withdrawnIds?.length && <button className="quiet-button" onClick={() => revealResult(`result-card-${round.key}-${round.definition.withdrawnIds![0]}`)}>View withdrawn records · {round.definition.withdrawnIds.length}</button>}</div>
  </section>;
}

export function ResultScorecards({ round, headId }: { round?: RoundView; headId: string }) {
  const marks = round?.submittedMarks ?? [];
  const order = round?.standings?.rows.map((r) => r.subjectId) ?? [];
  const subjects = round ? [...order.map((id) => round.definition.subjects.find((s) => s.id === id)!), ...round.definition.subjects.filter((s) => !order.includes(s.id))] : [];
  return <SetupSection title="Scorecards" caption="Submitted marks" summaryText={round?.standings ? `${round.definition.subjects.length} entrant/couple records${round.definition.withdrawnIds?.length ? ` · ${round.definition.withdrawnIds.length} withdrawn` : ''} · Read only` : 'Available after stage review opens'} detailsRef={(n) => { if (n) n.id = 'results-scorecards'; }}>
    <div className="form-body page-stack">{!round?.standings ? <p>Complete the whole stage and all required heat submissions to review scorecards.</p> : subjects.map((s) => {
      const row = round.standings!.rows.find((r) => r.subjectId === s.id), withdrawn = round.definition.withdrawnIds?.includes(s.id);
      const heats = round.definition.heats.filter((h) => h.subjectIds.includes(s.id));
      return <details className="publication-scorecard" id={`result-card-${round.key}-${s.id}`} key={s.id}>
        <summary><span className={withdrawn ? 'scorecard-place' : 'result-place-badge'}>{withdrawn ? 'Withdrawn' : <><span className="sr-only">Place </span>{row?.place ?? '—'}</>}</span><span className="scorecard-entrant"><strong>#{s.number} {s.primary}{s.secondary && ` & ${s.secondary}`}</strong><small>{s.role && `${s.role} · `}{row ? `Average ${row.average.toFixed(4)}${status(round, s.id) ? ` · ${status(round, s.id)}` : ''}` : 'Recorded marks retained; excluded from rankings'}</small></span></summary>
        <div className="scorecard-body"><p>{heats.map((h) => h.name).join(' · ')} · Submitted marks</p><div className="table-wrap scorecard-table" tabIndex={0} role="region" aria-label={`Submitted scorecard for #${s.number}`}><table><thead><tr><th scope="col">Song</th>{round.definition.judgeIds.map((id) => <th scope="col" key={id}>{round.definition.judges.find((j) => j.id === id)?.name}{id === headId && <small>Head judge</small>}</th>)}</tr></thead><tbody>{heats.flatMap((h) => h.songs).map((song) => <tr key={song.id}><th scope="row">{song.title}</th>{round.definition.judgeIds.map((id) => { const mark = marks.find((m) => m.judgeId === id && m.subjectId === s.id && m.performanceId === song.id)?.mark; return <td key={id}>{mark ? mark === 'No' ? 'No · 0' : mark : <span className="scorecard-blank">Blank<small>Not observed</small></span>}</td>; })}</tr>)}</tbody>{row && <tfoot><tr><th scope="row">Judge average</th>{round.definition.judgeIds.map((id) => { const mean = row.judgeMeans?.find((j) => j.judgeId === id); return <td key={id}>{mean?.average.toFixed(4) ?? '—'}<small>{mean ? `${mean.observations} recorded ${mean.observations === 1 ? 'mark' : 'marks'}` : 'No recorded marks'}</small></td>; })}</tr></tfoot>}</table></div>
          <p>Blank marks are excluded. Each judge’s average has equal weight in the overall average.</p>
          <details><summary>Calculation details</summary><p>Yes = 10 · A1 = 4.5 · A2 = 4.3 · No = 0. Blank is not a zero.</p>{row?.songs.map((song) => <p key={song.id}>{song.title}: {song.denominator ? song.average.toFixed(4) : 'Blank · no observations'} · {song.denominator} recorded judge marks</p>)}{withdrawn && <p>This entry is withdrawn; retained marks are shown without a current ranking or result average.</p>}</details>
        </div>
      </details>;
    })}</div>
  </SetupSection>;
}

export function ResultDecisions({ data, round, openHeadAccess }: { data: LiveView; round?: RoundView; openHeadAccess?: () => void }) {
  const result = round?.standings, ties = result?.advancementTies ?? [];
  const missing = ties.filter((t) => !t.complete).length + (round?.definition.kind === 'finals' ? result?.ties.filter((t) => !result.decisions.some((d) => d.key === t.key)).length ?? 0 : 0);
  const head = data.setup.judges.find((j) => j.id === data.setup.headJudgeId)?.name ?? 'Head judge';
  return <SetupSection title="Tie decisions & approval" caption="Round review" summaryText={!result ? 'Review has not opened' : result.approved ? `Current head approval · ${head}` : `${missing} pending tie decisions · Awaiting head approval`} detailsRef={(n) => { if (n) n.id = 'results-decisions'; }}><div className="form-body page-stack">
    {!round || !result ? <p>Review opens after the whole stage concludes.</p> : <><h3>{round.definition.format} · {round.definition.division} · {round.definition.kind}</h3><p className="results-approval-detail">{result.submitted} / {result.required} heat submissions acknowledged</p><p>{result.approved ? `Approved by ${head}${result.approvedAt ? ` · ${new Date(result.approvedAt).toLocaleString()}` : ''}.` : `Awaiting current approval from ${head}. Changed results require renewed approval.`}</p>
      {ties.map((t) => <section className="score-detail-group" key={t.key}><h4>{t.group} · {t.slots} advancement {t.slots === 1 ? 'spot' : 'spots'}</h4><p>{t.subjectIds.map((id) => { const s = round.definition.subjects.find((s) => s.id === id); return `#${s?.number} ${s?.primary}`; }).join(' · ')}</p><p>{t.votes.length} / {round.definition.judgeIds.length} panel votes received · {t.complete ? 'Decision recorded' : t.deadlocked ? 'Head decision needed' : 'Panel votes needed'}</p>{!t.complete && !t.deadlocked && <p>Waiting for {round.definition.judgeIds.filter((id) => !t.votes.some((v) => v.judgeId === id)).map((id) => round.definition.judges.find((j) => j.id === id)?.name).join(', ')}.</p>}</section>)}
      {round.definition.kind === 'finals' && result.ties.map((t) => <p key={t.key}>{t.subjectIds.map((id) => { const s = round.definition.subjects.find((s) => s.id === id); return `#${s?.number} ${s?.primary} ${s?.secondary}`; }).join(' · ')} · {result.decisions.some((d) => d.key === t.key) ? 'Decision recorded' : 'Head placement decision needed'}</p>)}
      {result.decisions.map((d) => <section className="score-detail-group" key={d.key}><h4>{d.shared ? 'Shared place' : 'Ordered placement'}</h4><p>{d.order.map((id) => { const s = round.definition.subjects.find((s) => s.id === id); return `#${s?.number} ${s?.primary}`; }).join(' → ')}</p><p>{d.explanation || 'No explanation recorded'} · {new Date(d.decidedAt).toLocaleString()}</p></section>)}
      {!ties.length && !result.ties.length && <p>No tie decisions required.</p>}
      {!result.approved && <button className="quiet-button" onClick={openHeadAccess}>Open head judge access</button>}<p>Panel votes, head decisions and approval take place on the authorized private judge pages. Numeric averages stay unchanged by placement decisions.</p>
    </>}
  </div></SetupSection>;
}

export function ResultAudit({ data, selected }: { data: LiveView; selected: string }) {
  const [showAll, setAll] = useState(false);
  const all = showAll || !selected;
  const competitionId = data.setup.rounds.find((r) => r.id === selected)?.competitionId ?? data.rounds.find((r) => r.id === selected)?.definition.competitionId;
  const entries = (data.resultAudit ?? []).filter((e) => all || e.roundId === selected || !e.roundId && e.competitionId === competitionId);
  return <SetupSection title="Audit trail" caption="Recorded history" summaryText={`${entries.length} recorded activities · ${all ? 'All competitions' : 'Selected round'}`} detailsRef={(n) => { if (n) n.id = 'results-audit'; }}><div className="form-body page-stack"><label>History view<select value={all ? 'all' : 'selected'} onChange={(e) => setAll(e.target.value === 'all')}><option value="selected">Selected competition / round</option><option value="all">All competitions</option></select></label><p>Newest recorded activity first. Historical records do not replace current standings. Private notes are excluded.</p>{!entries.length && <p>No recorded activity for this view.</p>}{entries.map((e) => <details className="result-audit-entry" key={e.id}><summary><strong>{e.title}</strong><span>{e.context} · {e.actor}</span><time dateTime={e.at}>{e.at ? new Date(e.at).toLocaleString() : 'Time not recorded'}</time><span>{e.outcome}</span></summary><div>{e.details.map((d, i) => <p key={i}>{d}</p>)}{e.rows && <div className="table-wrap"><table><caption>Historical approved standings</caption><thead><tr><th>Place</th><th>Entrant / couple</th><th>Average</th></tr></thead><tbody>{e.rows.map((r, i) => <tr key={i}><td>{r.place}</td><td>#{r.number} {r.primary} {r.secondary}{r.advancing && <small>Advancing in this snapshot</small>}</td><td>{r.average.toFixed(4)}</td></tr>)}</tbody></table></div>}{e.marks?.map((m, i) => <p key={i}>{m.entrant} · {m.song}: <strong>{m.mark || 'Blank'}</strong></p>)}</div></details>)}</div></SetupSection>;
}
