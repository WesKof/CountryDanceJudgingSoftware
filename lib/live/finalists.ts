import type { FrozenRound, LiveSetup } from './types.ts';

/** Copy the approved advancement decision; cutoff voting has already been resolved. */
export function populateFinalists(setup: LiveSetup, prelim: FrozenRound, advancingIds: string[], frozenIds: string[] = []): LiveSetup {
  if (setup.workflow !== 'stage-v1') return setup;
  const eligible = new Map(prelim.subjects.filter((s) => !prelim.withdrawnIds?.includes(s.id)).map((s) => [s.id, s]));
  if (new Set(advancingIds).size !== advancingIds.length || advancingIds.some((id) => !eligible.has(id))) throw new Error('Invalid approved finalist identities');
  return { ...setup, rounds: setup.rounds.map((round) => {
    if (round.kind !== 'finals' || round.prelimRoundId !== prelim.id || frozenIds.includes(round.id)) return round;
    const subjects = prelim.format === 'Strictly' ? advancingIds.map((id) => ({ ...eligible.get(id)! })) : round.subjects.filter((s) => s.members?.every((id) => advancingIds.includes(id))).map((s) => ({ ...s, primary: eligible.get(s.members![0])!.primary, secondary: eligible.get(s.members![1])!.primary }));
    const assigned = new Set<string>();
    const heats = round.heats.map((h) => ({ ...h, subjectIds: h.subjectIds.filter((id) => subjects.some((s) => s.id === id) && !assigned.has(id) && Boolean(assigned.add(id))), songs: h.songs.map((song) => ({ ...song, partners: song.partners.filter((pair) => pair.every((id) => subjects.some((s) => s.id === id))) })) }));
    if (heats[0]) heats[0].subjectIds.push(...subjects.filter((s) => !assigned.has(s.id)).map((s) => s.id));
    return { ...round, finalistIds: [...advancingIds], subjects, heats };
  }) };
}

/** Enter one actual draw pair while retaining other pairs, heat assignments and songs. */
export function setFinalsPair(setup: LiveSetup, roundId: string, leadId: string, followId: string, createId = () => crypto.randomUUID()): LiveSetup {
  const round = setup.rounds.find((r) => r.id === roundId);
  const prelim = setup.rounds.find((r) => r.id === round?.prelimRoundId);
  if (!round || round.kind !== 'finals' || !prelim || setup.competitions.find((c) => c.id === round.competitionId)?.format !== 'Jack & Jill') throw new Error('Choose a J&J Finals round.');
  const lead = prelim.subjects.find((s) => s.id === leadId && s.role === 'Lead' && round.finalistIds.includes(s.id));
  const follow = prelim.subjects.find((s) => s.id === followId && s.role === 'Follow' && round.finalistIds.includes(s.id));
  if (!lead || (followId && !follow)) throw new Error('Pair only the selected lead and follow finalists.');
  if (follow && round.subjects.some((s) => s.members?.[0] !== leadId && s.members?.[1] === followId)) throw new Error('That follow is already paired. Clear their previous pairing first.');
  const previous = round.subjects.find((s) => s.members?.[0] === leadId);
  const subjects = round.subjects.filter((s) => s.members?.[0] !== leadId);
  if (follow) subjects.push({id: previous?.id ?? createId(), number: previous?.number ?? lead.number, primary: lead.primary, secondary: follow.primary, members: [lead.id, follow.id]});
  const retained = new Set(subjects.map((s) => s.id));
  const heats = round.heats.map((h) => ({...h, subjectIds: h.subjectIds.filter((id) => retained.has(id))}));
  if (follow) {const pairId=subjects.find((s) => s.members?.[0] === leadId)!.id;if (!heats.some((h) => h.subjectIds.includes(pairId)) && heats[0]) heats[0].subjectIds.push(pairId);}
  return {...setup, rounds: setup.rounds.map((r) => r.id === roundId ? {...r, subjects, heats} : r)};
}
