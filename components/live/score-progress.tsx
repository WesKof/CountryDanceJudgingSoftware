'use client';

import type { LiveView } from '@/lib/live/types';
import SetupSection from './setup-section';

export default function ScoreProgress({ data, error }: { data: LiveView; error: string }) {
  const block = data.setup.blocks.find((b) => b.id === data.context.blockId);
  const heats = (block?.roundIds ?? []).flatMap((id) => {
    const round = data.rounds.find((r) => r.id === id);
    return round?.definition.heats.map((heat) => ({ round, heat })) ?? [];
  });
  const current = heats.find((x) => x.heat.songs.some((s) => s.id === data.context.performanceId));
  const ordered = current ? [current, ...heats.filter((x) => x !== current)] : heats;
  const received = ({ round, heat }: typeof heats[number], judgeId: string) => data.heatSubmissions?.some((s) => s.roundKey === round.key && s.heatId === heat.id && s.judgeId === judgeId);
  const required = heats.reduce((n, x) => n + x.round.definition.judgeIds.length, 0);
  const submitted = heats.reduce((n, x) => n + x.round.definition.judgeIds.filter((id) => received(x, id)).length, 0);
  const stage = block?.kind === 'finals' ? 'Finals' : 'Prelims';
  return <SetupSection title="Submissions & coverage" caption="Judging progress" detailsRef={(node) => { if (node) node.id = 'run-submissions'; }} summaryText={heats.length ? `${stage} · ${submitted} of ${required} required heat submissions received${error ? ' · Last connected status' : ''}` : 'Not started'}>
    <div className="form-body page-stack">
      {error && <p role="status">Last connected status; reconnect to confirm submissions and coverage.</p>}
      <section aria-label="Heat submissions"><h3>Heat submissions</h3>
        {!heats.length ? <p>Not started. Heat submissions appear once a stage starts.</p> : <><p>{stage} · assigned judges for each heat. The current heat appears first.</p>{ordered.map((x) => <section className="score-detail-group" key={`${x.round.key}:${x.heat.id}`}><h4>{x.round.definition.format} · {x.round.definition.division} · {x.heat.name}{x === current && x.round.phase === 'dancing' ? ' · Current heat' : ''}</h4>{x.round.definition.judgeIds.map((id) => <p className="score-progress-row" key={id}><span>{x.round.definition.judges.find((j) => j.id === id)?.name ?? 'Assigned judge'}{id === data.setup.headJudgeId ? ' · Head judge' : ''}</span><strong>{received(x, id) ? 'Received' : 'Awaiting submission'}</strong></p>)}</section>)}</>}
      </section>
      <section aria-label="Scoring coverage"><h3>Scoring coverage</h3><p>All started rounds. A covered entrant/couple has at least one recorded mark across their heat songs; this does not mean every song is scored, a heat is submitted, or results are approved. No counts as a recorded mark; blank scores remain distinct.</p>
        {!data.rounds.length && <p>Not started.</p>}
        {data.rounds.map((r) => <section className="score-detail-group" key={r.key}><h4>{r.definition.format} · {r.definition.division} · {r.definition.kind === 'prelims' ? 'Prelims' : 'Finals'}</h4>{r.definition.judgeIds.map((id) => {
          const progress = r.draftProgress?.find((j) => j.judgeId === id);
          return <p className="score-progress-row" key={id}><span>{r.definition.judges.find((j) => j.id === id)?.name ?? 'Assigned judge'}{id === data.setup.headJudgeId ? ' · Head judge' : ''}</span><span><strong>{progress ? `${progress.filled} / ${progress.required} ${!data.setup.workflow ? 'marks recorded' : r.definition.format === 'Jack & Jill' && r.definition.kind === 'prelims' ? 'entrants covered' : 'couples covered'}` : 'Coverage unavailable'}</strong>{progress && <span className="score-submission-state">{progress.locked ? 'All required submissions received for this judge in this round' : 'Round submissions still pending for this judge'}</span>}</span></p>;
        })}</section>)}
      </section>
      <p>Official averages and rankings appear in Results after the whole stage closes.</p>
    </div>
  </SetupSection>;
}
