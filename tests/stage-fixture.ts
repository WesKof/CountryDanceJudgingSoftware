import type { LiveSetup, LiveSubject } from '../lib/live/types.ts';

export function stageFixture(prefix = crypto.randomUUID(), couples = 22): LiveSetup {
  const key = (name: string) => `${prefix}-${name}`;
  const judges = ['one', 'two', 'head'].map((name) => ({ id: key(`judge-${name}`), name: `Synthetic ${name}`, participantId: `${prefix}-person-${name}` }));
  const blocks: LiveSetup['blocks'] = ['prelims', 'finals'].map((kind) => ({ id: key(kind), kind: kind as 'prelims' | 'finals', label: kind === 'prelims' ? 'Prelims' : 'Finals', roundIds: [] }));
  const setup: LiveSetup = { workflow: 'stage-v1', name: 'Synthetic full stage rehearsal', venue: 'Isolated local test', date: '2026-10-08', organizerName: 'Synthetic organizer', organizerParticipantId: `${prefix}-person-organizer`, separationAttested: true, headJudgeId: judges[2].id, judges, competitions: [], rounds: [], blocks };
  for (const [formatIndex, format] of (['Strictly', 'Jack & Jill'] as const).entries()) for (const [divisionIndex, division] of ['Beginner / Intermediate', 'Advanced'].entries()) {
    const stem = `${formatIndex}-${divisionIndex}`, competitionId = key(`competition-${stem}`), prelimId = key(`pre-${stem}`), finalsId = key(`fin-${stem}`);
    setup.competitions.push({ id: competitionId, format, division }); blocks[0].roundIds.push(prelimId); blocks[1].roundIds.push(finalsId);
    const subjects: LiveSubject[] = Array.from({ length: format === 'Strictly' ? couples : 6 }, (_, i) => ({ id: key(`subject-${stem}-${i}`), number: (format === 'Strictly' ? 101 : 201) + i, primary: `Entrant ${stem} ${i + 1}`, secondary: format === 'Strictly' ? `Partner ${stem} ${i + 1}` : '', ...(format === 'Jack & Jill' ? { role: i < 3 ? 'Lead' as const : 'Follow' as const } : {}) }));
    const makeHeat = (roundId: string, ids: string[], n: number) => ({ id: `${roundId}-heat-${n}`, name: `Heat ${n}`, subjectIds: ids, songs: Array.from({ length: divisionIndex === 0 ? 3 : 2 }, (_, song) => ({ id: `${roundId}-heat-${n}-song-${song + 1}`, title: `Song ${song + 1}`, artist: 'Synthetic artist', tempo: song ? 'Fast' : 'Slow', notes: 'PRIVATE_SELECTION_SENTINEL', partners: format === 'Jack & Jill' && ids.length ? [0, 1, 2].map((lead): [string, string] => [subjects[lead].id, subjects[3 + (lead + song) % 3].id]) : [] })) });
    const heats = format === 'Strictly' ? [0, 1, 2].map((n) => makeHeat(prelimId, subjects.slice(Math.floor(n * subjects.length / 3), Math.floor((n + 1) * subjects.length / 3)).map((s) => s.id), n + 1)) : [makeHeat(prelimId, subjects.map((s) => s.id), 1)];
    setup.rounds.push({ id: prelimId, competitionId, blockId: blocks[0].id, kind: 'prelims', subjects, heats, judgeIds: judges.map((j) => j.id), finalistIds: [], finalistCount: 0 }, { id: finalsId, competitionId, blockId: blocks[1].id, kind: 'finals', subjects: [], heats: [makeHeat(finalsId, [], 1)], judgeIds: judges.map((j) => j.id), prelimRoundId: prelimId, finalistIds: [], finalistCount: format === 'Strictly' ? 2 : 1 });
  }
  return setup;
}
