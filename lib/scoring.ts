import type { Competition, Judge, Mark, ResultRow } from './domain';

export const MARKS: Exclude<Mark, ''>[] = ['Yes', 'A1', 'A2', 'No'];

export const MARK_VALUES: Record<Exclude<Mark, ''>, number> = {
  Yes: 10,
  A1: 4.5,
  A2: 4.3,
  No: 0,
};

export function scoreTotal(marks: Mark[]) {
  return marks.reduce((sum, mark) => sum + (mark ? MARK_VALUES[mark] : 0), 0);
}

export function ballotProgress(competition: Competition, judges: Judge[]) {
  const total = competition.entries.length * judges.length;
  const selected = competition.entries.reduce(
    (sum, entry) => sum + judges.filter((judge) => Boolean(competition.scores[entry.id]?.[judge.id])).length,
    0,
  );
  return { selected, total, complete: total > 0 && selected === total };
}

export function calculateResults(competition: Competition, judges: Judge[]): ResultRow[] {
  const scored = competition.entries.map((entry) => {
    const marks = judges.map((judge) => competition.scores[entry.id]?.[judge.id] ?? '');
    return {
      entryId: entry.id,
      number: entry.number,
      primary: competition.format === 'Strictly' ? entry.lead ?? 'Unnamed lead' : entry.name ?? 'Unnamed dancer',
      secondary: competition.format === 'Strictly' ? entry.follow ?? 'Unnamed follow' : entry.role ?? 'Unassigned',
      group: competition.format === 'Jack & Jill' ? `${entry.role ?? 'Unassigned'}s` : 'Couples',
      complete: judges.length > 0 && marks.every(Boolean),
      total: scoreTotal(marks),
    };
  });

  const groupOrder = competition.format === 'Jack & Jill' ? ['Leads', 'Follows', 'Unassigneds'] : ['Couples'];
  const result: ResultRow[] = [];

  for (const group of groupOrder) {
    const completeRows = scored
      .filter((row) => row.group === group && row.complete)
      .sort((a, b) => b.total - a.total || a.entryId.localeCompare(b.entryId));

    completeRows.forEach((row, index) => {
      const previous = completeRows[index - 1];
      const place = previous && Math.abs(previous.total - row.total) < 0.0001
        ? result[result.length - 1].place
        : index + 1;
      const tied = completeRows.some(
        (other) => other.entryId !== row.entryId && Math.abs(other.total - row.total) < 0.0001,
      );
      result.push({ ...row, place, tied });
    });
  }

  return result;
}

export function hasTies(rows: ResultRow[]) {
  return rows.some((row) => row.tied);
}
