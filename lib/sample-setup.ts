import type { LiveSetup, LiveSubject } from './live/types.ts';

// Fictional preparation data only: no ballots, approvals or published results.
export function sampleSetup(prefix = crypto.randomUUID()): LiveSetup {
  const judges = [
    { id: 'sample-judge-alex', name: 'Alex Morgan', participantId: 'sample-person-alex' },
    { id: 'sample-judge-jamie', name: 'Jamie Ellis', participantId: 'sample-person-jamie' },
    { id: 'sample-judge-robin', name: 'Robin Hayes', participantId: 'sample-person-robin' },
  ];
  const setup: LiveSetup = {
    workflow: 'stage-v1', name: 'Sample Country Dance Social', venue: 'Sample dance hall', date: '',
    organizerName: 'Casey Bennett (sample)', organizerParticipantId: 'sample-person-casey',
    separationAttested: true, headJudgeId: judges[2].id, judges,
    competitions: [], rounds: [], blocks: [
      { id: 'sample-prelims', kind: 'prelims', label: 'Prelims', roundIds: [] },
      { id: 'sample-finals', kind: 'finals', label: 'Finals', roundIds: [] },
    ],
  };
  const couples: LiveSubject[] = [
    ['Mason Reed', 'Avery Brooks'], ['Cole Bennett', 'Sadie Monroe'],
    ['Eli Turner', 'Mae Collins'], ['Noah Hayes', 'Clara James'],
  ].map(([primary, secondary], i) => ({ id: `sample-couple-${i}`, number: 101+i, primary, secondary }));
  const dancers: LiveSubject[] = ['Jordan Lee', 'Cameron Wells', 'Morgan Davis', 'Taylor Quinn'].map((primary,i) =>
    ({ id: `sample-dancer-${i}`, number: i<2 ? 201+i : 301+i-2, primary, secondary: '', role: i<2 ? 'Lead' : 'Follow' }));
  for (const [i, format] of (['Strictly', 'Jack & Jill'] as const).entries()) {
    const competitionId = `sample-competition-${i}`, prelimId = `sample-pre-${i}`, finalsId = `sample-fin-${i}`;
    const subjects = i === 0 ? couples : dancers;
    setup.competitions.push({ id: competitionId, format, division: 'Beginner / Intermediate' });
    setup.blocks[0].roundIds.push(prelimId); setup.blocks[1].roundIds.push(finalsId);
    const heats = (rid: string, roster: LiveSubject[]) => [{ id: `${rid}-heat`, name: 'Heat 1', subjectIds: roster.map((s)=>s.id),
      songs: ['Sample two-step', 'Sample country swing'].map((title,n) => ({ id: `${rid}-song-${n}`, title, artist: 'Sample playlist',
        tempo: n ? 'Medium' : 'Slow', notes: '', partners: i===1 && roster.length ? [0,1].map((lead): [string,string] =>
          [dancers[lead].id,dancers[2+(lead+n)%2].id]) : [] })) }];
    setup.rounds.push({ id: prelimId, competitionId, blockId: setup.blocks[0].id, kind: 'prelims', subjects,
      heats: heats(prelimId,subjects), judgeIds: judges.map((j)=>j.id), finalistIds: [], finalistCount: 0 },
      { id: finalsId, competitionId, blockId: setup.blocks[1].id, kind: 'finals', prelimRoundId: prelimId, subjects: [],
        heats: heats(finalsId,[]), judgeIds: judges.map((j)=>j.id), finalistIds: [], finalistCount: i===0 ? 2 : 1 });
  }
  return isolateSetup(setup,prefix);
}

// Copy preparation, never ballots/history. Stable references within the copy get fresh, bounded IDs.
export function isolateSetup(source: LiveSetup, prefix = crypto.randomUUID()): LiveSetup {
  const setup=structuredClone(source), ids=new Map<string,string>();
  const key=(id:string) => { if(!id) return id; if(!ids.has(id)) ids.set(id,`${prefix}-${ids.size}`); return ids.get(id)!; };
  setup.judges=setup.judges.map((j)=>({...j,id:key(j.id)}));setup.headJudgeId=key(setup.headJudgeId);
  setup.competitions=setup.competitions.map((c)=>({...c,id:key(c.id)}));
  setup.blocks=setup.blocks.map((b)=>({...b,id:key(b.id),roundIds:b.roundIds.map(key)}));
  setup.rounds=setup.rounds.map((r)=>({...r,id:key(r.id),competitionId:key(r.competitionId),blockId:key(r.blockId),
    ...(r.prelimRoundId?{prelimRoundId:key(r.prelimRoundId)}:{}),judgeIds:r.judgeIds.map(key),finalistIds:r.finalistIds.map(key),
    subjects:r.subjects.map((s)=>({...s,id:key(s.id),...(s.members?{members:s.members.map(key) as [string,string]}:{})})),
    heats:r.heats.map((h)=>({...h,id:key(h.id),subjectIds:h.subjectIds.map(key),songs:h.songs.map((s)=>({...s,id:key(s.id),partners:s.partners.map(([a,b])=>[key(a),key(b)] as [string,string])}))}))}));
  return setup;
}

export function blankSetup(): LiveSetup {
  return { workflow: 'stage-v1', name: 'New country dance event', venue: '', date: '', organizerName: '', organizerParticipantId: '',
    separationAttested: false, headJudgeId: '', judges: [], competitions: [], rounds: [], blocks: [
      { id: 'prelims', kind: 'prelims', label: 'Prelims', roundIds: [] },
      { id: 'finals', kind: 'finals', label: 'Finals', roundIds: [] },
    ] };
}
