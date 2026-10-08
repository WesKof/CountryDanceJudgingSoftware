import { cellKey, type FrozenRound, type Cells, type LiveSubmission, type LiveResult, type TieDecision } from './types.ts';

export const LIVE_MARKS = ['Yes', 'A1', 'A2', 'No'] as const;
const TENTHS = { Yes: 100, A1: 45, A2: 43, No: 0 };

export function requiredCells(round: FrozenRound) {
  return round.heats.flatMap((heat) => heat.songs.flatMap((song) => heat.subjectIds.map((subjectId) => ({ performanceId: song.id, subjectId, key: cellKey(song.id, subjectId) }))));
}
export function missingCells(round: FrozenRound, cells: Cells) {
  return requiredCells(round).filter(({ key }) => !cells[key]?.mark);
}
export function deriveStandings(round: FrozenRound, submissions: LiveSubmission[], decisions: TieDecision[] = []) {
  const panel = round.judgeIds.map((id) => submissions.find((item) => item.judgeId === id));
  const rows: LiveResult[] = [];
  for (const subject of round.subjects) {
    const heat = round.heats.find((item) => item.subjectIds.includes(subject.id));
    if (!heat || !panel.length || panel.some((item) => !item)) continue;
    const songs: LiveResult['songs'] = [];
    let incomplete = false;
    for (const song of heat.songs) {
      const marks = panel.map((item) => item?.cells[cellKey(song.id, subject.id)]?.mark);
      if (marks.some((mark) => !mark)) { incomplete = true; break; }
      const sumTenths = marks.reduce<number>((sum, mark) => sum + TENTHS[mark as keyof typeof TENTHS], 0);
      songs.push({ id: song.id, title: song.title, sumTenths, denominator: marks.length, average: sumTenths / (10 * marks.length) });
    }
    if (incomplete || !songs.length) continue;
    const sumTenths = songs.reduce((sum, song) => sum + song.sumTenths, 0);
    const denominator = songs.reduce((sum, song) => sum + song.denominator, 0);
    rows.push({ subjectId: subject.id, number: subject.number, primary: subject.primary, secondary: subject.secondary,
      group: round.format === 'Jack & Jill' && round.kind === 'prelims' ? `${subject.role}s` : 'Couples',
      sumTenths, denominator, average: sumTenths / (10 * denominator), songs, place: 0, tied: false, decided: false });
  }
  const ties: { key: string; group: string; subjectIds: string[] }[] = [];
  const sorted: LiveResult[] = [];
  for (const group of ['Leads', 'Follows', 'Couples']) {
    const groupRows = rows.filter((row) => row.group === group).sort((a, b) => b.average - a.average || a.number - b.number);
    for (let start = 0; start < groupRows.length;) {
      let end = start + 1;
      while (end < groupRows.length && Math.abs(groupRows[end].average - groupRows[start].average) < 0.0001) end++;
      const tiedRows = groupRows.slice(start, end);
      const subjectIds = tiedRows.map((row) => row.subjectId).sort();
      const key = `${group}:${subjectIds.join(',')}`;
      const decision = decisions.find((item) => item.key === key);
      if (tiedRows.length > 1) ties.push({ key, group, subjectIds });
      if (decision && !decision.shared) tiedRows.sort((a, b) => decision.order.indexOf(a.subjectId) - decision.order.indexOf(b.subjectId));
      tiedRows.forEach((row, offset) => sorted.push({ ...row, place: start + 1 + (decision && !decision.shared ? offset : 0), tied: tiedRows.length > 1, decided: tiedRows.length === 1 || Boolean(decision) }));
      start = end;
    }
  }
  return { rows: sorted, ties, complete: round.subjects.length > 0 && sorted.length === round.subjects.length && panel.every(Boolean), submitted: panel.filter(Boolean).length, required: round.judgeIds.length };
}
