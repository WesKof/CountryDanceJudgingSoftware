import type { AppState, Competition, Entry } from './domain.ts';
import type { LiveRound, LiveSetup, LiveSubject } from './live/types.ts';

export const emptyCompetition: Competition = { id: '', name: 'No competition', format: 'Strictly', division: '', round: '', entries: [], scores: {}, revisions: [] };
const kind = (round: string) => /final/i.test(round) ? 'finals' as const : 'prelims' as const;
const subjects = (c: Competition): LiveSubject[] => c.entries.map((e) => ({ id: e.id, number: e.number, primary: e.name ?? e.lead ?? '', secondary: e.follow ?? '', ...(e.role ? { role: e.role } : {}) }));
const entries = (r: LiveRound, c: Competition): Entry[] => r.subjects.map((s) => ({ id: s.id, number: s.number, ...(c.format === 'Jack & Jill' ? { name: s.secondary ? `${s.primary} & ${s.secondary}` : s.primary, ...(s.role ? { role: s.role } : {}) } : { lead: s.primary, follow: s.secondary }) }));

export function localSetup(state: AppState): LiveSetup {
  if (state.demoSetup) return state.demoSetup;
  const blocks: LiveSetup['blocks'] = ['prelims', 'finals'].map((k) => ({ id: `demo-${k}`, kind: k as 'prelims' | 'finals', label: k === 'prelims' ? 'Prelims' : 'Finals', roundIds: [] }));
  const rounds: LiveRound[] = [];
  for (const c of state.competitions) {
    for (const b of blocks) {
      const roster = b.kind === kind(c.round) ? subjects(c) : [];
      const rid = `${c.id}-${b.kind}`; b.roundIds.push(rid);
      rounds.push({ id: rid, competitionId: c.id, blockId: b.id, kind: b.kind, subjects: roster, judgeIds: [], finalistIds: [], finalistCount: 0,
        ...(b.kind === 'finals' ? { prelimRoundId: `${c.id}-prelims` } : {}),
        heats: [{ id: `${rid}-heat`, name: 'Heat 1', subjectIds: roster.map((s) => s.id), songs: [1, 2].map((n) => ({ id: `${rid}-song-${n}`, title: `Song ${n}`, artist: '', tempo: '', notes: '', partners: [] })) }] });
    }
  }
  return { name: state.event.name, venue: state.event.venue, date: state.event.date, headJudgeId: '', workflow: 'stage-v1', organizerName: '', organizerParticipantId: '', separationAttested: false, judges: state.judges,
    competitions: state.competitions.map((c) => ({ id: c.id, format: c.format, division: c.division })), rounds, blocks };
}

export function applyLocalSetup(state: AppState, setup: LiveSetup): AppState {
  const competitions = setup.competitions.map((c) => {
    const old = state.competitions.find((item) => item.id === c.id);
    const next: Competition = old ?? { id: c.id, name: c.format, format: c.format, division: c.division, round: 'Preliminary', entries: [], scores: {}, revisions: [] };
    const r = setup.rounds.find((r) => r.competitionId === c.id && r.kind === kind(next.round))!;
    return { ...next, format: c.format, division: c.division, entries: entries(r, next) };
  });
  const removed = state.competitions.filter((c) => !competitions.some((next) => next.id === c.id));
  return { ...state, event: { name: setup.name, venue: setup.venue, date: setup.date }, judges: setup.judges.map(({ id, name }) => ({ id, name })), competitions,
    activeCompetitionId: competitions.some((c) => c.id === state.activeCompetitionId) ? state.activeCompetitionId : competitions[0]?.id ?? '',
    demoSetup: setup, removedCompetitions: [...(state.removedCompetitions ?? []), ...removed] };
}

export function removeLocalCompetition(state: AppState, id: string): AppState {
  const setup = localSetup(state);
  const roundIds = new Set(setup.rounds.filter((r) => r.competitionId === id).map((r) => r.id));
  return applyLocalSetup(state, { ...setup, competitions: setup.competitions.filter((c) => c.id !== id), rounds: setup.rounds.filter((r) => !roundIds.has(r.id)), blocks: setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((rid) => !roundIds.has(rid)) })) });
}

// The retained v2 editor remains usable after saving the richer setup extension.
// Reconcile metadata/rosters without converting scores or discarding heat/song data.
export function reconcileLocalSetup(state: AppState): AppState {
  if (!state.demoSetup) return state;
  const setup = state.demoSetup;
  const generated = localSetup({ ...state, demoSetup: undefined });
  const added = generated.rounds.filter((r) => !setup.rounds.some((old) => old.competitionId === r.competitionId && old.kind === r.kind));
  const rounds = [...setup.rounds, ...added.map((r) => ({ ...r, blockId: setup.blocks.find((b) => b.kind === r.kind)!.id }))].map((r) => {
    const c = state.competitions.find((c) => c.id === r.competitionId)!;
    if (!c || r.kind !== kind(c.round)) return r;
    const roster = subjects(c).map((s) => ({ ...r.subjects.find((old) => old.id === s.id), ...s }));
    const ids = new Set(roster.map((s) => s.id));
    return { ...r, subjects: roster, heats: r.heats.map((h) => ({ ...h, subjectIds: h.subjectIds.filter((id) => ids.has(id)), songs: h.songs.map((p) => ({ ...p, partners: p.partners.filter((pair) => pair.every((id) => ids.has(id))) })) })) };
  });
  return { ...state, demoSetup: { ...setup, ...state.event, competitions: state.competitions.map(({ id, format, division }) => ({ id, format, division })),
    judges: state.judges.map((j) => ({ ...setup.judges.find((old) => old.id === j.id), ...j })), headJudgeId: state.judges.some((j) => j.id === setup.headJudgeId) ? setup.headJudgeId : '', rounds,
    blocks: setup.blocks.map((b) => ({ ...b, roundIds: [...b.roundIds, ...added.filter((r) => r.kind === b.kind).map((r) => r.id)] })) } };
}
