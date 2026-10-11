'use client';
import type { LiveView } from '@/lib/live/types';
import { publicationPreparationIssues } from '@/lib/live/publication-readiness';
import { latestPublications, type PublicSnapshot, type PublicationRecord } from '@/lib/live/publication';

type Stage = PublicSnapshot['stages'][number];
type Entrant = Stage['entrants'][number];
const entrantName = (e: Entrant) => e.primary + (e.secondary ? ` & ${e.secondary}` : '');
const stageName = (kind: string) => kind === 'prelims' ? 'Prelims' : kind === 'finals' ? 'Finals' : kind;

function SnapshotScorecard({ stage, entrant }: { stage: Stage; entrant: Entrant }) {
  const heat = stage.heats.find((h) => h.entrants.includes(entrant.id));
  const marks = new Map(stage.marks.filter((m) => m.entrantId === entrant.id).map((m) => [`${m.judgeId}/${m.songId}`, m.mark]));
  return <details className="publication-scorecard">
    <summary><span className="scorecard-place">{entrant.withdrawn ? 'Withdrawn' : `Place ${entrant.place ?? '—'}`}</span><span className="scorecard-entrant"><strong>#{entrant.number} {entrantName(entrant)}</strong><small>{entrant.withdrawn ? 'Recorded observations retained' : `Average ${entrant.average?.toFixed(4) ?? '—'}`}</small></span></summary>
    <div className="scorecard-body"><p>Recorded marks · {heat?.name ?? 'Assigned heat'}</p>
      <div className="table-wrap scorecard-table" tabIndex={0} role="region" aria-label={`Song marks and judge averages for #${entrant.number} ${entrantName(entrant)}`}>
        <table><caption className="sr-only">{stageName(stage.kind)} scorecard for #{entrant.number} {entrantName(entrant)}</caption><thead><tr><th scope="col">Song</th>{stage.judges.map((j) => <th scope="col" key={j.id}>{j.name}{j.head && <small>Head judge</small>}</th>)}</tr></thead>
          <tbody>{heat?.songs.map((song) => <tr key={song.id}><th scope="row">{song.title}</th>{stage.judges.map((judge) => { const mark = marks.get(`${judge.id}/${song.id}`); return <td key={judge.id}>{mark || <span className="scorecard-blank">Blank<small>Not observed</small></span>}</td>; })}</tr>)}</tbody>
          <tfoot><tr><th scope="row">Judge average</th>{stage.judges.map((judge) => { const mean = entrant.judgeMeans.find((m) => m.judgeId === judge.id); return <td key={judge.id}>{mean?.average.toFixed(4) ?? '—'}<small>{mean ? `${mean.observations} recorded ${mean.observations === 1 ? 'mark' : 'marks'}` : 'No recorded marks'}</small></td>; })}</tr></tfoot>
        </table>
      </div><p className="scorecard-help">Blank marks are excluded. Each judge’s average has equal weight in the final average.</p>
    </div>
  </details>;
}

export function SnapshotPreview({ snapshot }: { snapshot: PublicSnapshot }) {
  return <section className="result-sheet publication-preview"><h2>{snapshot.competition.format} · {snapshot.competition.division}</h2><p>Public results · revision {snapshot.revision}</p>
    {snapshot.stages.filter((s) => s.kind === 'finals').map((stage) => <div className="result-group" key={stage.id}><h3>Final places</h3><div className="table-wrap"><table><thead><tr><th scope="col">Place</th><th scope="col">Entrant</th><th scope="col">Average</th></tr></thead><tbody>{stage.entrants.filter((e) => !e.withdrawn).sort((a, b) => (a.place ?? 999) - (b.place ?? 999)).map((e) => <tr key={e.id}><td>{e.place ?? '—'}</td><td><strong>#{e.number} {e.primary}</strong>{e.secondary && <small>{e.secondary}</small>}</td><td>{e.average?.toFixed(4) ?? '—'}</td></tr>)}</tbody></table></div></div>)}
    <details className="publication-scorecards"><summary>Prelims, scorecards &amp; scoring details</summary><p>{snapshot.changeSummary}</p>
      {snapshot.stages.map((stage) => <section className="snapshot-stage" key={stage.id}><h3>{stageName(stage.kind)}</h3>{[...new Set(stage.entrants.map((e) => e.role || 'Couple'))].map((role) => <div className="snapshot-role" key={role}><h4>{role === 'Lead' ? 'Leads' : role === 'Follow' ? 'Follows' : 'Couples'}</h4>{stage.entrants.filter((e) => (e.role || 'Couple') === role).sort((a, b) => (a.place ?? 999) - (b.place ?? 999) || a.number - b.number).map((entrant) => <SnapshotScorecard key={entrant.id} stage={stage} entrant={entrant} />)}</div>)}</section>)}
      <details className="scoring-explanation"><summary>How averages and places work</summary><dl className="score-values"><div><dt>Yes</dt><dd>10</dd></div><div><dt>A1</dt><dd>4.5</dd></div><div><dt>A2</dt><dd>4.3</dd></div><div><dt>No</dt><dd>0</dd></div></dl><p>Blank means not observed and is excluded from averages. No is a recorded zero. Each judge’s average carries equal weight. Advancement and head placement decisions do not change scores.</p></details>
    </details>
  </section>;
}

function PublicationTime({ value, empty }: { value?: string; empty: string }) {
  if (!value) return <>{empty}</>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>Date unavailable</>;
  return <time dateTime={value}>{new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date)}</time>;
}
function publicationStatus(record: PublicationRecord) {
  if (record.underReview) return 'Under review';
  return { prepared: 'Ready to send for approval', requested: 'Awaiting website admin', queued: 'Finishing publication', released: 'Published', stale: 'Needs renewed review' }[record.status];
}
function PublicationHistoryCard({ record }: { record: PublicationRecord }) {
  return <article className="publication-record"><div className="publication-record-heading"><h3>{record.snapshot.competition.format} · {record.snapshot.competition.division}</h3><span className="publication-status-label">{publicationStatus(record)}</span></div><dl className="publication-record-facts"><div><dt>Result version</dt><dd>{record.revision}</dd></div><div><dt>Published</dt><dd><PublicationTime value={record.releasedAt} empty="Not published" /></dd></div><div><dt>Last sent</dt><dd><PublicationTime value={record.lastSynchronizedAt} empty="Not yet sent" /></dd></div></dl></article>;
}
const manifest = (records: PublicationRecord[]) => records.map((p) => ({ publicationId: p.id, sourceFingerprint: p.sourceFingerprint }));
export function PublicationPanel({ data, action, navigate, route }: { data: LiveView; action: (input: Record<string, unknown>) => Promise<boolean>; navigate?: (page: number) => void; route?: (competitionId: string, page: 0 | 1 | 2, kind?: 'prelims' | 'finals') => void }) {
  const latest = latestPublications(data.publications ?? []), records = data.setup.competitions.flatMap((c) => latest.filter((p) => p.competitionId === c.id));
  const issues = data.setup.competitions.flatMap((c) => publicationPreparationIssues(data, c.id).map((issue) => ({ ...issue, competitionId: c.id, competition: `${c.format} · ${c.division}` })));
  const ready = data.status === 'active' && data.setup.competitions.length > 0 && issues.length === 0;
  const complete = records.length === data.setup.competitions.length && records.length > 0;
  const canSend = ready && complete && records.some((p) => p.status === 'prepared') && records.every((p) => ['prepared', 'requested', 'released'].includes(p.status) && !p.underReview);
  const waiting = complete && records.some((p) => p.status === 'requested') && records.every((p) => ['requested', 'released'].includes(p.status) && !p.underReview);
  const published = complete && records.every((p) => p.status === 'released' && !p.underReview);
  const pending = records.some((p) => p.status === 'queued');
  const history = (data.publications ?? []).filter((p) => !records.some((r) => r.id === p.id));
  const status = canSend ? 'Ready to send' : waiting ? 'Waiting for website approval' : published ? 'Already published' : pending ? 'Publication in progress' : ready ? 'Ready for your review' : data.status !== 'active' ? 'Archived · read only' : 'Judging and head approval needed';
  function issueRow(issue: typeof issues[number], index: number) { return <li key={index}><p><strong>{issue.competition}</strong><br />{issue.message}</p>{route && <button className="quiet-button" onClick={() => route(issue.competitionId, issue.page, issue.message.includes('Finals') ? 'finals' : issue.message.includes('Prelims') ? 'prelims' : undefined)}>Open {issue.competition} · {['Set up', 'Run', 'Results'][issue.page]}</button>}</li>; }
  return <div className="page-stack"><section className="form-panel publication-task"><div className="form-body"><p className="kicker">Whole event · {data.setup.competitions.length} {data.setup.competitions.length === 1 ? 'competition' : 'competitions'}</p><h2>Publish results</h2><h3 className="publication-task-status">{status}</h3>
    <p role="status">{canSend ? 'Check the results below, then send them for website approval.' : waiting ? 'Sent for approval. The website admin can now approve and publish the complete event.' : published ? 'Published. The approved results are available on the results website.' : pending ? 'Website approval recorded. Results are waiting to finish sending; the admin can retry.' : ready ? 'Ready to review. All scheduled results have head judge approval.' : data.status !== 'active' ? 'This event is archived and read only.' : 'Finish judging and get head judge approval before publishing.'}</p>
    {published ? <p>No further publishing action is needed. If the results change, complete the renewed review in Results, then return here to review and send the updated event.</p> : waiting || pending ? <p>Your organizer step is complete. The website admin handles the final publication on the separate results website.</p> : data.status !== 'active' ? <p>Previous results and publication records remain available below.</p> : <p>First review the exact results for every competition below. Then use <strong>Send results for approval</strong>. The results website’s admin makes the final decision to publish.</p>}
    <div className="shared-inline publication-actions">{canSend ? <button className="primary-button" onClick={() => void action({ action: 'approve-event-publication', publications: manifest(records) })}>Send results for approval</button> : published ? <button className="primary-button" disabled>Results already published</button> : waiting ? <button className="primary-button" disabled>Sent · awaiting website admin</button> : pending ? <button className="primary-button" disabled>Publication in progress</button> : <button className="primary-button" disabled={!ready} onClick={() => void action({ action: 'prepare-event-publication' })}>Review results to publish</button>}{published && navigate && <button className="quiet-button" onClick={() => navigate(2)}>Review judging results</button>}</div>
    {issues.length > 0 && <div className="publication-blockers"><ul>{issues.slice(0, 3).map(issueRow)}</ul>{issues.length > 3 && <details><summary>{issues.length - 3} more items to complete</summary><ul>{issues.slice(3).map(issueRow)}</ul></details>}{navigate && !route && <div className="shared-inline">{Array.from(new Set(issues.map((i) => i.page))).map((page) => <button className="quiet-button" key={page} onClick={() => navigate(page)}>Go to {['Set up', 'Run', 'Results'][page]}</button>)}</div>}</div>}
  </div></section>
    {records.map((p) => <section key={p.id} data-publication-id={p.id}>{p.status === 'stale' && <p role="status">These results changed. Review the updated event before sending it again.</p>}<SnapshotPreview snapshot={p.snapshot} /></section>)}
    {records.length > 0 && <details className="publication-history"><summary>Publication history &amp; status</summary><div className="publication-records">{records.map((p) => <PublicationHistoryCard key={p.id} record={p} />)}</div></details>}
    {history.length > 0 && <details className="publication-history"><summary>Past result versions ({history.length})</summary><div className="publication-records">{history.map((p) => <section key={p.id}><PublicationHistoryCard record={p} /><SnapshotPreview snapshot={p.snapshot} /></section>)}</div></details>}
    <details><summary>About publication</summary><p>Publishing is optional. Judging, corrections and backups continue if publication is paused. Earlier published versions remain available while hosted. Changes need renewed approvals. Hosting shutdown has 30 days’ notice where practicable.</p></details>
  </div>;
}
