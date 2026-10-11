'use client';

import type { LiveView } from '@/lib/live/types';

export function roundStatus(data: LiveView, roundId: string) {
  const round = data.rounds.find((r) => r.id === roundId);
  if (!round || round.phase === 'setup') return 'Not started';
  if (data.reviewRequests?.some((q) => (q.payload.roundKey === round.key || !q.payload.roundKey && q.payload.competitionId === round.definition.competitionId) && !q.appliedAt && !q.cancelledAt)) return 'Pending request';
  if (round.standings?.approved) return 'Head approved';
  if (round.phase === 'dancing') return 'Judging in progress';
  if (round.standings?.advancementTies?.some((t) => !t.complete)) return 'Panel votes needed';
  if (round.definition.kind === 'finals' && round.standings?.rows.some((r) => !r.decided)) return 'Head decision needed';
  return 'Head review needed';
}

// A view selector only. Its callbacks never issue a judging or setup command.
export default function RoundContext({ data, selected, select, overview = false }: { data: LiveView; selected: string; select: (id: string) => void; overview?: boolean }) {
  const frozen = data.rounds.find((r) => r.id === selected);
  const round = data.setup.rounds.find((r) => r.id === selected) ?? frozen?.definition;
  const competition = data.setup.competitions.find((c) => c.id === round?.competitionId);
  const reviewsNeeded = data.rounds.filter((r) => r.phase === 'discussion' && !r.standings?.approved).length;
  const rounds = [...data.setup.rounds, ...data.rounds.filter((r) => !data.setup.rounds.some((s) => s.id === r.id)).map((r) => r.definition)];
  return <section className="round-context" aria-label="Competition and round context">
    <label><span>{overview ? 'Results to review' : 'Competition & round view'}</span><select aria-label="Competition and round view" value={selected} onChange={(e) => select(e.target.value)}><option value="" disabled>Choose a competition</option>{rounds.map((r) => { const c = data.setup.competitions.find((c) => c.id === r.competitionId), frozen = data.rounds.find((f) => f.id === r.id); return <option key={r.id} value={r.id}>{c?.format ?? frozen?.definition.format} · {c?.division ?? frozen?.definition.division} · {r.kind === 'prelims' ? 'Prelims' : 'Finals'}</option>; })}</select></label>
    <div className="context-status"><p className="kicker">{competition ? `${competition.format} · ${competition.division}` : frozen ? `${frozen.definition.format} · ${frozen.definition.division} · Withdrawn competition` : 'Event program'}</p><strong>{round ? `${round.kind === 'prelims' ? 'Prelims' : 'Finals'} · ${roundStatus(data, round.id)}` : 'Add a competition in Set up'}</strong>{data.status === 'archived' && <span>Archived · read only</span>}</div>
    {overview && <details className="round-overview"><summary><span>All competitions & pending work</span>{reviewsNeeded > 0 && <small>{reviewsNeeded} round {reviewsNeeded === 1 ? 'review' : 'reviews'} needed</small>}</summary><div className="round-overview-list">{rounds.map((r) => { const c = data.setup.competitions.find((c) => c.id === r.competitionId), frozen = data.rounds.find((f) => f.id === r.id); return <button className="quiet-button" key={r.id} aria-pressed={r.id === selected} onClick={() => select(r.id)}><span>{c?.format ?? frozen?.definition.format} · {c?.division ?? frozen?.definition.division} · {r.kind === 'prelims' ? 'Prelims' : 'Finals'}</span><strong>{roundStatus(data, r.id)}</strong></button>; })}</div></details>}
  </section>;
}
