import type { LiveSetup, LiveSubject } from '../lib/live/types.ts';

const id = () => crypto.randomUUID();
export function liveFixture(couples = 22): LiveSetup {
  const judges = [{ id: id(), name: 'Rehearsal Judge One' }, { id: id(), name: 'Rehearsal Head Judge' }];
  const blocks: LiveSetup['blocks'] = [{ id: id(), label: 'Prelims discussion block', kind: 'prelims', roundIds: [] }, { id: id(), label: 'Finals discussion block', kind: 'finals', roundIds: [] }];
  const setup: LiveSetup = { name: 'Local judging rehearsal', venue: 'Local test', date: '2026-10-08', headJudgeId: judges[1].id, judges, blocks, competitions: [], rounds: [] };
  for (const format of ['Strictly', 'Jack & Jill'] as const) for (const division of ['Beginner / Intermediate', 'Advanced']) {
    const competitionId = id(); setup.competitions.push({ id: competitionId, format, division });
    const subjects: LiveSubject[] = format === 'Strictly' ? Array.from({ length: couples }, (_, i) => ({ id: id(), number: i + 101, primary: `Lead ${i + 1}`, secondary: `Follow ${i + 1}` })) : Array.from({ length: 4 }, (_, i) => ({ id: id(), number: i + 201, primary: `Dancer ${i + 1}`, secondary: '', role: i < 2 ? 'Lead' : 'Follow' }));
    const prelimId = id(); const finalsId = id(); blocks[0].roundIds.push(prelimId); blocks[1].roundIds.push(finalsId);
    const makeHeat = (subjectIds: string[], index: number, kind: string) => ({ id: id(), name: `Heat ${index + 1}`, subjectIds, songs: Array.from({ length: division === 'Advanced' ? 2 : 3 }, (_, i) => ({ id: id(), title: `${format} ${division} ${kind} heat ${index + 1} song ${i + 1}`, artist: 'Rehearsal artist', tempo: i === 0 ? 'Slow' : 'Fast', notes: 'ORGANIZER_SELECTION_NOTE', partners: [] as [string, string][] })) });
    const heats = format === 'Strictly' && couples > 2 ? [makeHeat(subjects.slice(0, Math.ceil(couples / 2)).map((s) => s.id), 0, 'prelims'), makeHeat(subjects.slice(Math.ceil(couples / 2)).map((s) => s.id), 1, 'prelims')] : [makeHeat(subjects.map((s) => s.id), 0, 'prelims')];
    if (format === 'Jack & Jill') heats[0].songs[0].partners = [[subjects[0].id, subjects[2].id], [subjects[1].id, subjects[3].id]];
    setup.rounds.push({ id: prelimId, competitionId, kind: 'prelims', blockId: blocks[0].id, subjects, heats, judgeIds: [], finalistIds: [], finalistCount: 0 }, { id: finalsId, competitionId, kind: 'finals', blockId: blocks[1].id, subjects: [], heats: [makeHeat([], 0, 'finals')], judgeIds: [], finalistIds: [], finalistCount: 0, prelimRoundId: prelimId });
  }
  return setup;
}
