'use client';
import type { ReactNode } from 'react';
import type { LiveView } from '@/lib/live/types';
import { publicationPreparationIssues, type PublicationTarget } from '@/lib/live/publication-readiness';
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

export function SnapshotPreview({ snapshot, heading = true }: { snapshot: PublicSnapshot; heading?: boolean }) {
  return <section className="result-sheet publication-preview">{heading && <><h2>{snapshot.competition.format} · {snapshot.competition.division}</h2><p>Result version {snapshot.revision}</p></>}
    {snapshot.stages.filter((s) => s.kind === 'finals').map((stage) => <div className="result-group" key={stage.id}><h3>Final places</h3><div className="table-wrap"><table className="results-places"><thead><tr><th scope="col">Place</th><th scope="col" className="results-bib-column">Number</th><th scope="col">Contestant</th><th scope="col">Average</th></tr></thead><tbody>{stage.entrants.filter((e) => !e.withdrawn).sort((a, b) => (a.place ?? 999) - (b.place ?? 999)).map((e) => <tr key={e.id}><td><span className="result-place-badge">{e.place ?? '—'}</span></td><td className="results-bib-column">#{e.number}</td><td><span className="results-mobile-bib">#{e.number}</span><strong>{e.primary}</strong>{e.secondary && <small>{e.secondary}</small>}</td><td>{e.average?.toFixed(4) ?? '—'}</td></tr>)}</tbody></table></div></div>)}
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
function publicationStatus(record: PublicationRecord, historical = false) {
  if (historical) return record.releasedAt ? 'Previously published' : 'Past version · not published';
  if (record.underReview) return 'Under review';
  return { prepared: 'Ready to send for approval', requested: 'Awaiting website admin', queued: 'Finishing publication', released: 'Published', stale: 'Needs renewed review' }[record.status];
}
function PublicationHistoryCard({ record, historical = false }: { record: PublicationRecord; historical?: boolean }) {
  return <article className="publication-record"><div className="publication-record-heading"><h3>{record.snapshot.competition.format} · {record.snapshot.competition.division}</h3><span className="publication-status-label">{publicationStatus(record, historical)}</span></div><dl className="publication-record-facts"><div><dt>Result version</dt><dd>{record.revision}</dd></div><div><dt>Published</dt><dd><PublicationTime value={record.releasedAt} empty="Not published" /></dd></div><div><dt>Last sent</dt><dd><PublicationTime value={record.lastSynchronizedAt} empty="Not yet sent" /></dd></div></dl></article>;
}
function PublicationSection({ title, caption, summary, className = '', publicationId, initiallyOpen = false, children }: { title: string; caption: string; summary: string; className?: string; publicationId?: string; initiallyOpen?: boolean; children: ReactNode }) {
  return <details className={`form-panel setup-section ${className}`} data-publication-id={publicationId} open={initiallyOpen}>
    <summary className="panel-heading compact"><div><p className="kicker">{caption}</p><h2>{title}</h2><p className="section-summary">{summary}</p></div></summary>
    {children}
  </details>;
}
const manifest = (records: PublicationRecord[]) => records.map((p) => ({ publicationId: p.id, sourceFingerprint: p.sourceFingerprint }));
export function PublicationPanel({ data, action, navigate, route, recovery }: { recovery?: ReactNode; data: LiveView; action: (input: Record<string, unknown>) => Promise<boolean>; navigate?: (page: number) => void; route?: (competitionId: string, page: 0 | 1 | 2, target?: PublicationTarget) => void }) {
  const latest = latestPublications(data.publications ?? []), records = data.setup.competitions.flatMap((c) => latest.filter((p) => p.competitionId === c.id));
  const issues = data.setup.competitions.flatMap((c) => publicationPreparationIssues(data, c.id).map((issue) => ({ ...issue, competitionId: c.id, competition: `${c.format} · ${c.division}` })));
  const groupedIssues = new Map<string, typeof issues>();
  for (const issue of issues) {
    const key=JSON.stringify([issue.competitionId,issue.page,issue.kind,issue.roundId,issue.section]);
    const group=groupedIssues.get(key)??[];group.push(issue);groupedIssues.set(key,group);
  }
  const issueGroups=[...groupedIssues.values()];
  const ready = data.status === 'active' && data.setup.competitions.length > 0 && issues.length === 0;
  const complete = records.length === data.setup.competitions.length && records.length > 0;
  const canSend = ready && complete && records.some((p) => p.status === 'prepared') && records.every((p) => ['prepared', 'requested', 'released'].includes(p.status) && !p.underReview);
  const waiting = complete && records.some((p) => p.status === 'requested') && records.every((p) => ['requested', 'released'].includes(p.status) && !p.underReview);
  const published = complete && records.every((p) => p.status === 'released' && !p.underReview);
  const pending = records.some((p) => p.status === 'queued');
  const history = (data.publications ?? []).filter((p) => !records.some((r) => r.id === p.id));
  const status = data.status !== 'active' ? 'Archived · read only' : canSend ? 'Ready to send' : waiting ? 'Waiting for website approval' : published ? 'Already published' : pending ? 'Publication in progress' : ready ? 'Ready for your review' : 'Judging and head approval needed';
  function issueRow(group: typeof issues, index: number) { const issue=group[0];return <li key={index}><p><strong>{issue.competition}</strong><br />{issue.message}</p>{route && <button className="quiet-button" onClick={() => route(issue.competitionId, issue.page, {kind:issue.kind,roundId:issue.roundId,section:issue.section})}>Open {issue.competition} · {['Set up', 'Score', 'Results'][issue.page]}</button>}{group.length>1&&<details><summary>Related requirements</summary>{group.slice(1).map((item,i)=><p key={i}>{item.message}</p>)}</details>}</li>; }
  return <div className="page-stack publication-layout"><section className="form-panel publication-task"><div className="form-body"><p className="kicker">Whole event · {data.setup.competitions.length} {data.setup.competitions.length === 1 ? 'competition' : 'competitions'}</p><h2>Publish results</h2><h3 className="publication-task-status">{status}</h3>
    <p role="status">{data.status !== 'active' ? 'This event is archived and read only.' : canSend ? 'Check the results below, then send them for website approval.' : waiting ? 'Sent for approval. The website admin can now approve and publish the complete event.' : published ? 'Published. The approved results are available on the results website.' : pending ? 'Website approval recorded. Results are waiting to finish sending; the admin can retry.' : ready ? 'All Finals are approved. Prepare a private preview before sending for website approval.' : 'Finish judging and get head judge approval before publishing.'}</p>
    <div className="shared-inline publication-actions">{data.status !== 'active' ? <button className="primary-button" disabled>Archived · read only</button> : canSend ? <button className="primary-button" onClick={() => void action({ action: 'approve-event-publication', publications: manifest(records) })}>Send results for approval</button> : published ? <button className="primary-button" disabled>Results already published</button> : waiting ? <button className="primary-button" disabled>Sent · awaiting website admin</button> : pending ? <button className="primary-button" disabled>Publication in progress</button> : <button className="primary-button" disabled={!ready} onClick={() => void action({ action: 'prepare-event-publication' })}>Review results to publish</button>}{published && navigate && <button className="quiet-button" onClick={() => navigate(2)}>Review judging results</button>}</div>
    {data.status === 'active' && issues.length > 0 && <div className="publication-blockers"><ul>{issueGroups.slice(0, 3).map(issueRow)}</ul>{issueGroups.length > 3 && <details><summary>{issueGroups.length - 3} more items to complete</summary><ul>{issueGroups.slice(3).map(issueRow)}</ul></details>}{navigate && !route && <div className="shared-inline">{Array.from(new Set(issues.map((i) => i.page))).map((page) => <button className="quiet-button" key={page} onClick={() => navigate(page)}>Go to {['Set up', 'Score', 'Results'][page]}</button>)}</div>}</div>}
  </div></section>
    {records.length > 0 ? <div className="publication-competitions page-stack" aria-label="Results preview">
      {records.map((p) => <PublicationSection key={p.id} publicationId={p.id} initiallyOpen={canSend && p.status==='prepared'} className="publication-competition" caption="Results preview" title={`${p.snapshot.competition.format} · ${p.snapshot.competition.division}`} summary={`Result version ${p.revision} · ${publicationStatus(p)}`}>
        {(p.status === 'stale' || p.underReview) && <div className="form-body"><p role="status">These results need renewed review. This preview retains the previously prepared version.</p>{route && <button className="quiet-button" onClick={() => route(p.competitionId, 2)}>Review updated results</button>}</div>}
        <SnapshotPreview snapshot={p.snapshot} heading={false} />
      </PublicationSection>)}
    </div> : null}
    <details id="publication-supporting" className="supporting-drawer"><summary>Publication records &amp; tools <small>History, backup &amp; recovery</small></summary><div className="supporting-content page-stack">
    <PublicationSection className="publication-history" title="Publication history & status" caption="Publication records" summary={records.length ? status : 'No publication prepared yet'}>
      <div className="form-body page-stack">{records.length ? <div className="publication-records">{records.map((p) => <PublicationHistoryCard key={p.id} record={p} />)}</div> : <p>No current publication records.</p>}
      {history.length > 0 && <details className="publication-past"><summary>Past result versions ({history.length})</summary><div className="publication-records">
        {[...new Set(history.map((p) => p.competitionId))].map((id) => <section key={id}><h3>{history.find((p) => p.competitionId === id)!.snapshot.competition.format} · {history.find((p) => p.competitionId === id)!.snapshot.competition.division}</h3>
          {history.filter((p) => p.competitionId === id).sort((a, b) => b.snapshot.preparedAt.localeCompare(a.snapshot.preparedAt) || b.revision - a.revision).map((p) => <div className="publication-past-version" key={p.id}><PublicationHistoryCard record={p} historical /><details><summary>View version {p.revision} results</summary><SnapshotPreview snapshot={p.snapshot} /></details></div>)}
        </section>)}
      </div></details>}
      </div>
    </PublicationSection>
    <PublicationSection title="About publication" caption="How it works" summary="Approvals, updates and hosting">
      <div className="form-body page-stack"><p>The head judge approves results. You review and send the complete event. The results website admin approves its public release.</p><p>Publishing is optional. Judging, corrections and backups continue if publication is paused. Changes need renewed approvals.</p><p>Earlier published versions remain available while hosted. Hosting shutdown has 30 days’ notice where practicable.</p></div>
    </PublicationSection>
    {recovery}
    </div></details>
  </div>;
}
