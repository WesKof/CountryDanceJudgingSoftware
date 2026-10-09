import type { FrozenRound, LiveSetup, LiveRound, LiveSubject } from './types.ts';

export class LiveError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) { super(message); this.status = status; this.details = details; }
}
export function requireRule(value: unknown, message: string): asserts value {
  if (!value) throw new LiveError(400, message);
}
export function text(value: unknown, label: string, max = 160, required = false): string {
  requireRule(typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0), `Invalid ${label}.`);
  return value;
}
export function id(value: unknown): string {
  requireRule(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value), 'Invalid record identity.');
  return value;
}
export function integer(value: unknown, min = 0, max = 1000000): number {
  requireRule(Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max, 'Invalid number.');
  return Number(value);
}
function array(value: unknown, max: number): unknown[] {
  requireRule(Array.isArray(value) && value.length <= max, 'Invalid or oversized list.');
  return value;
}
export function record(value: unknown): Record<string, unknown> {
  requireRule(value && typeof value === 'object' && !Array.isArray(value), 'Invalid record.');
  return value as Record<string, unknown>;
}
function unique(values: string[], label: string) { requireRule(new Set(values).size === values.length, `Duplicate ${label}.`); }
function subject(value: unknown): LiveSubject {
  const s = record(value);
  const result: LiveSubject = { id: id(s.id), number: integer(s.number, 1), primary: text(s.primary, 'name', 160, true), secondary: text(s.secondary, 'partner', 160) };
  if (s.role !== undefined) { requireRule(s.role === 'Lead' || s.role === 'Follow', 'Choose Lead or Follow.'); result.role = s.role; }
  if (s.members !== undefined) { const members = array(s.members, 2).map(id); requireRule(members.length === 2, 'A pair needs two members.'); result.members = members as [string, string]; }
  return result;
}
export function validateSetup(value: unknown): LiveSetup {
  const s = record(value);
  const judges = array(s.judges, 15).map((value) => { const j = record(value); return { id: id(j.id), name: text(j.name, 'judge name', 160, true), ...(j.participantId !== undefined ? { participantId: text(j.participantId, 'participant identifier', 160).trim().toLowerCase() } : {}) }; });
  const competitions: LiveSetup['competitions'] = array(s.competitions, 8).map((value) => {
    const c = record(value); requireRule(c.format === 'Strictly' || c.format === 'Jack & Jill', 'Invalid competition format.');
    return { id: id(c.id), format: c.format, division: text(c.division, 'division', 120, true) };
  });
  const rounds: LiveRound[] = array(s.rounds, 16).map((value) => {
    const r = record(value); requireRule(r.kind === 'prelims' || r.kind === 'finals', 'Invalid round.');
    const subjects = array(r.subjects, 200).map(subject);
    unique(subjects.map((s) => s.id), 'subject'); unique(subjects.map((s) => String(s.number)), 'bib');
    const heats = array(r.heats, 6).map((value) => {
      const h = record(value);
      return { id: id(h.id), name: text(h.name, 'heat name', 120, true), subjectIds: array(h.subjectIds, 200).map(id), songs: array(h.songs, 6).map((value) => {
        const p = record(value);
        return { id: id(p.id), title: text(p.title, 'song title', 160, true), artist: text(p.artist, 'artist'), tempo: text(p.tempo, 'tempo/style'), notes: text(p.notes, 'selection notes', 2000), partners: array(p.partners, 100).map((value) => {
          const pair = array(value, 2).map(id); requireRule(pair.length === 2, 'Invalid partner map.'); return pair as [string, string];
        }) };
      }) };
    });
    const judgeIds = array(r.judgeIds, 15).map(id); unique(judgeIds, 'judge assignment');
    const finalistIds = array(r.finalistIds, 200).map(id); unique(finalistIds, 'finalist');
    return { id: id(r.id), competitionId: id(r.competitionId), kind: r.kind, blockId: id(r.blockId), subjects, heats, judgeIds,
      ...(r.prelimRoundId ? { prelimRoundId: id(r.prelimRoundId) } : {}), finalistIds, finalistCount: integer(r.finalistCount, 0, 100) };
  });
  const blocks: LiveSetup['blocks'] = array(s.blocks, 8).map((value) => {
    const b = record(value); requireRule(b.kind === 'prelims' || b.kind === 'finals', 'Invalid block.');
    return { id: id(b.id), label: text(b.label, 'block label', 120, true), kind: b.kind, roundIds: array(b.roundIds, 16).map(id) };
  });
  const setup: LiveSetup = { name: text(s.name, 'event name', 160, true), venue: text(s.venue, 'venue'), date: text(s.date, 'date', 10), headJudgeId: s.headJudgeId ? id(s.headJudgeId) : '', judges, competitions, rounds, blocks };
  if (s.workflow === 'stage-v1') {
    Object.assign(setup, { workflow: 'stage-v1', organizerName: text(s.organizerName ?? '', 'organizer name', 160), organizerParticipantId: text(s.organizerParticipantId ?? '', 'organizer participant identifier', 160).trim().toLowerCase(), separationAttested: s.separationAttested === true });
    const identities = judges.map((j) => j.participantId).filter((p): p is string => Boolean(p));
    unique(identities, 'participant identifier');
    requireRule(!identities.includes(setup.organizerParticipantId!), 'The organizer cannot serve as a judge or head judge. Use distinct participant identifiers.');
    unique(blocks.map((b) => b.kind), 'stage');
    requireRule(rounds.every((r) => r.heats.every((h) => h.songs.length >= 2 && h.songs.length <= 3)), 'Schedule 2–3 songs for every heat.');
  }
  unique(judges.map((s) => s.id), 'judge'); unique(competitions.map((s) => s.id), 'competition'); unique(rounds.map((s) => s.id), 'round'); unique(blocks.map((s) => s.id), 'block');
  const ordered = blocks.flatMap((b) => b.roundIds); unique(ordered, 'scheduled round');
  requireRule(ordered.length === rounds.length && rounds.every((r) => blocks.some((b) => b.id === r.blockId && b.kind === r.kind && b.roundIds.includes(r.id))), 'Every round must be scheduled exactly once in its matching block.');
  requireRule(!setup.headJudgeId || judges.some((j) => j.id === setup.headJudgeId), 'Head judge must be on the event panel.');
  unique(rounds.flatMap((r) => r.heats.flatMap((h) => h.songs.map((p) => p.id))), 'song performance');
  for (const r of rounds) {
    requireRule(competitions.some((c) => c.id === r.competitionId), 'Unknown competition.');
    requireRule(r.judgeIds.every((j) => judges.some((item) => item.id === j)), 'Unknown assigned judge.');
    const assigned = r.heats.flatMap((h) => h.subjectIds); unique(assigned, 'heat assignment');
    requireRule(assigned.every((s) => r.subjects.some((item) => item.id === s)), 'Unknown heat entrant.');
    for (const h of r.heats) for (const p of h.songs) {
      unique(p.partners.flat(), 'rotation partner');
      requireRule(p.partners.every(([l, f]) => h.subjectIds.includes(l) && h.subjectIds.includes(f) && r.subjects.some((s) => s.id === l && s.role === 'Lead') && r.subjects.some((s) => s.id === f && s.role === 'Follow')), 'Partner maps need one lead and one follow in the same heat.');
    }
  }
  return setup;
}
export function roundOpeningIssues(setup: LiveSetup, round: LiveRound): string[] {
  const competition = setup.competitions.find((c) => c.id === round.competitionId)!;
  const prefix = `${competition.format} · ${competition.division} · ${round.kind}: `;
  const issues: string[] = [];
  if (!setup.judges.length || !setup.headJudgeId) issues.push('Add judges and designate the event head judge.');
  if (setup.workflow === 'stage-v1' && (!setup.organizerName?.trim() || !setup.organizerParticipantId || !setup.separationAttested || setup.judges.some((j) => !j.participantId))) issues.push('Enter distinct organizer/panel participant identifiers and confirm separation of duties.');
  if (setup.workflow === 'stage-v1' && round.judgeIds.length && !round.judgeIds.includes(setup.headJudgeId)) issues.push('Include the event head judge among this stage’s required judges.');
  if (!round.subjects.length) issues.push('Add entrants to this round.');
  if (!round.heats.length) issues.push('Add a heat and its songs.');
  for (const heat of round.heats) {
    if (!heat.subjectIds.length) issues.push(`${heat.name} has no entrants. Assign contestants or remove this heat.`);
    if (!heat.songs.length) issues.push(`${heat.name} has no songs. Add the songs this group will dance to.`);
  }
  const unassigned = round.subjects.filter((s) => !round.heats.some((h) => h.subjectIds.includes(s.id)));
  if (unassigned.length) issues.push(`Assign bibs ${unassigned.slice(0, 8).map((s) => s.number).join(', ')}${unassigned.length > 8 ? ' and the remaining entrants' : ''} to a heat.`);
  return issues.map((issue) => prefix + issue);
}
export function freezeRound(setup: LiveSetup, round: LiveRound): FrozenRound {
  const competition = setup.competitions.find((c) => c.id === round.competitionId)!;
  const issues = roundOpeningIssues(setup, round);
  requireRule(!issues.length, issues[0]);
  const judgeIds = round.judgeIds.length ? round.judgeIds : setup.judges.map((j) => j.id);
  requireRule(round.heats.flatMap((h) => h.subjectIds).length === round.subjects.length, 'Assign every entrant to exactly one heat.');
  if (competition.format === 'Jack & Jill' && round.kind === 'prelims') requireRule(round.subjects.every((s) => s.role), 'J&J prelims require individual Lead/Follow roles.');
  else requireRule(round.subjects.every((s) => s.secondary.trim()), 'Couples require both partner names.');
  if (round.kind === 'finals') {
    const prelim = setup.rounds.find((r) => r.id === round.prelimRoundId && r.kind === 'prelims' && r.competitionId === round.competitionId);
    requireRule(prelim && round.finalistCount > 0, 'Configure finalist count and the matching preliminary round.');
    requireRule(round.finalistIds.every((id) => prelim.subjects.some((s) => s.id === id)), 'Finalists must come from the matching prelim roster.');
    if (competition.format === 'Jack & Jill') {
      const members = round.subjects.flatMap((s) => s.members ?? []); unique(members, 'finalist pair member');
      requireRule(members.length === round.finalistIds.length && members.every((id) => round.finalistIds.includes(id)), 'Each selected finalist must appear once in a finals pair.');
      requireRule(round.subjects.length === round.finalistCount && round.subjects.every((s) => s.members && prelim.subjects.some((p) => p.id === s.members![0] && p.role === 'Lead' && p.primary === s.primary) && prelim.subjects.some((p) => p.id === s.members![1] && p.role === 'Follow' && p.primary === s.secondary)), 'Finals pairs must contain the selected lead and follow identities.');
    } else requireRule(round.subjects.length === round.finalistCount && round.subjects.length === round.finalistIds.length && round.subjects.every((s) => round.finalistIds.includes(s.id) && prelim.subjects.some((p) => p.id === s.id && p.primary === s.primary && p.secondary === s.secondary)), 'Strictly finals retain the selected couples.');
  }
  return { ...round, ...competition, id: round.id, judgeIds, judges: setup.judges.filter((j) => judgeIds.includes(j.id)) };
}
