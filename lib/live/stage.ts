import { cellKey, type Cells, type FrozenRound, type HeatSubmission, type LiveHeat, type LiveResult, type LiveSubmission, type StageVote, type TieDecision, type AdvancementTie } from './types.ts';

const TENTHS = { Yes: 100, A1: 45, A2: 43, No: 0 };
export function missingHeatSubjects(heat: LiveHeat, cells: Cells): string[] {
  return heat.subjectIds.filter((id) => !heat.withdrawnIds?.includes(id) && !heat.songs.some((p) => Object.hasOwn(TENTHS, cells[cellKey(p.id, id)]?.mark ?? '')));
}
export function latestHeatSubmissions(submissions: HeatSubmission[]): HeatSubmission[] {
  const latest = new Map<string, HeatSubmission>();
  for (const sub of submissions) {
    const key = `${sub.roundKey}/${sub.heatId}/${sub.judgeId}`;
    if (!latest.has(key) || latest.get(key)!.version < sub.version) latest.set(key, sub);
  }
  return [...latest.values()];
}
export function heatSnapshot(heat: LiveHeat, cells: Cells): Cells {
  return Object.fromEntries(heat.songs.flatMap((p) => heat.subjectIds.map((id) => {
    const key = cellKey(p.id, id);
    return [key, cells[key] ?? { mark: '', note: '', revision: 0, mutationId: '' }];
  })));
}
export function heatReviewSignature(heat: LiveHeat, cells: Cells): string {
  return JSON.stringify([heat.id, heat.eligibilityVersion ?? '', ...heat.songs.flatMap((p) => heat.subjectIds.map((id) => {
    const c = cells[cellKey(p.id, id)]; return [p.id, id, c?.mark ?? '', c?.note ?? '', c?.revision ?? 0];
  }))]);
}
export function deriveStageStandings(round: FrozenRound, key: string, submissions: HeatSubmission[], decisions: TieDecision[] = []) {
  const latest = latestHeatSubmissions(submissions).filter((s) => s.roundKey === key);
  const required = round.heats.length * round.judgeIds.length;
  const complete = required > 0 && round.heats.every((h) => round.judgeIds.every((j) => {
    const s = latest.find((s) => s.heatId === h.id && s.judgeId === j);
    return s && missingHeatSubjects(h, s.cells).length === 0;
  }));
  if (!complete) return { rows: [] as LiveResult[], ties: [], complete: false, submitted: latest.length, required };
  const combined: LiveSubmission[] = round.judgeIds.map((judgeId) => ({ id: judgeId, roundKey: key, judgeId, ballotVersion: 0, createdAt: '', cells: Object.assign({}, ...latest.filter((s) => s.judgeId === judgeId).map((s) => s.cells)) }));
  const rows: LiveResult[] = round.subjects.filter((subject) => !round.withdrawnIds?.includes(subject.id)).map((subject) => {
    const heat = round.heats.find((h) => h.subjectIds.includes(subject.id))!;
    const judgeMeans = combined.map((s) => {
      const marks = heat.songs.map((p) => s.cells[cellKey(p.id, subject.id)]?.mark).filter((m): m is keyof typeof TENTHS => Boolean(m));
      return { judgeId: s.judgeId, observations: marks.length, average: marks.reduce((sum, m) => sum + TENTHS[m], 0) / (10 * marks.length) };
    });
    const songs = heat.songs.map((p) => {
      const marks = combined.map((s) => s.cells[cellKey(p.id, subject.id)]?.mark).filter((m): m is keyof typeof TENTHS => Boolean(m));
      const sumTenths = marks.reduce((sum, m) => sum + TENTHS[m], 0);
      return { id: p.id, title: p.title, sumTenths, denominator: marks.length, average: marks.length ? sumTenths / (10 * marks.length) : 0 };
    });
    return { subjectId: subject.id, number: subject.number, primary: subject.primary, secondary: subject.secondary,
      group: round.format === 'Jack & Jill' && round.kind === 'prelims' ? `${subject.role}s` : 'Couples',
      average: judgeMeans.reduce((sum, j) => sum + j.average, 0) / judgeMeans.length,
      sumTenths: songs.reduce((sum, p) => sum + p.sumTenths, 0), denominator: songs.reduce((sum, p) => sum + p.denominator, 0), judgeMeans, songs, place: 0, tied: false, decided: false };
  });
  const ties: { key: string; group: string; subjectIds: string[] }[] = [];
  const sorted: LiveResult[] = [];
  for (const group of ['Leads', 'Follows', 'Couples']) {
    const groupRows = rows.filter((r) => r.group === group).sort((a, b) => b.average - a.average || a.number - b.number);
    for (let start = 0; start < groupRows.length;) {
      let end = start + 1;
      while (end < groupRows.length && Math.abs(groupRows[end].average - groupRows[start].average) < 1e-9) end++;
      const tied = groupRows.slice(start, end), subjectIds = tied.map((r) => r.subjectId).sort(), tieKey = `${group}:${subjectIds.join(',')}`;
      const decision = decisions.find((d) => d.key === tieKey);
      if (tied.length > 1) ties.push({ key: tieKey, group, subjectIds });
      if (round.kind === 'finals' && decision && !decision.shared) tied.sort((a, b) => decision.order.indexOf(a.subjectId) - decision.order.indexOf(b.subjectId));
      tied.forEach((r, i) => sorted.push({ ...r, place: start + 1 + (round.kind === 'finals' && decision && !decision.shared ? i : 0), tied: tied.length > 1, decided: tied.length === 1 || Boolean(decision) }));
      start = end;
    }
  }
  return { rows: sorted, ties, complete, submitted: latest.length, required };
}

export function advancement(rows: LiveResult[], cutoff: number, judgeIds: string[], votes: StageVote[], decisions: TieDecision[]) {
  const advancingIds: string[] = [], ties: AdvancementTie[] = [];
  for (const group of ['Leads', 'Follows', 'Couples']) {
    const groupRows = rows.filter((r) => r.group === group);
    for (const place of [...new Set(groupRows.map((r) => r.place))]) {
      const batch = groupRows.filter((r) => r.place === place);
      if (place > cutoff) continue;
      const slots = Math.min(batch.length, cutoff - place + 1);
      if (slots === batch.length) { advancingIds.push(...batch.map((r) => r.subjectId)); continue; }
      const subjectIds = batch.map((r) => r.subjectId).sort(), key = `${group}:${subjectIds.join(',')}`;
      const panelVotes = votes.filter((v) => v.tieKey === key && judgeIds.includes(v.judgeId));
      const all = judgeIds.every((j) => panelVotes.some((v) => v.judgeId === j));
      const counts = subjectIds.map((id) => ({ id, count: panelVotes.filter((v) => v.selected.includes(id)).length })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
      const deadlocked = all && counts[slots - 1].count === counts[slots].count;
      const decision = decisions.find((d) => d.key === key && !d.shared);
      let selected = all && !deadlocked ? counts.slice(0, slots).map((v) => v.id) : [];
      if (deadlocked && decision) {
        const boundary = counts[slots - 1].count;
        const certain = counts.filter((v) => v.count > boundary).map((v) => v.id);
        const tiedIds = counts.filter((v) => v.count === boundary).map((v) => v.id);
        selected = [...certain, ...decision.order.filter((id) => tiedIds.includes(id)).slice(0, slots - certain.length)];
      }
      const complete = all && selected.length === slots;
      ties.push({ key, group, subjectIds, slots, votes: panelVotes, deadlocked, selected, complete });
      if (complete) advancingIds.push(...selected);
    }
  }
  return { advancingIds, advancementTies: ties };
}

// A stage spans every assigned competition in the current block. Heat identity is
// kept in each coverage item; a mark in a different heat cannot fill a gap.
export function stageAssignments(data: import('./types.ts').LiveView) {
  const block = data.setup.blocks.find((b) => b.id === data.context.blockId);
  return data.rounds.filter((r) => block?.roundIds.includes(r.id) && r.definition.judgeIds.includes(data.judgeId!));
}
export function stageReviewSignature(data: import('./types.ts').LiveView) {
  return JSON.stringify([data.context.blockId, ...stageAssignments(data).map((r) => {
    const ballot = data.ballots.find((b) => b.roundKey === r.key);
    return [r.key, r.version, ...r.definition.heats.map((h) => heatReviewSignature(h, ballot?.cells ?? {}))];
  })]);
}
export function stageCoverage(data: import('./types.ts').LiveView) {
  return stageAssignments(data).flatMap((round) => round.definition.heats.map((heat) => {
    const ballot = data.ballots.find((b) => b.roundKey === round.key);
    const submitted = Boolean(data.heatSubmissions?.some((s) => s.roundKey === round.key && s.heatId === heat.id && s.judgeId === data.judgeId));
    return { round, heat, ballot, submitted, missing: missingHeatSubjects(heat, ballot?.cells ?? {}) };
  }));
}
