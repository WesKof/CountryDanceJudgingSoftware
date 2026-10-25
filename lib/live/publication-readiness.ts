import type { LiveRound, LiveView } from './types.ts';
import { roundOpeningIssues, unpairedFinalists } from './validation.ts';

export type PublicationTarget = { kind?: 'prelims' | 'finals'; roundId?: string; section?: 'Roster' };
export type PublicationIssue = PublicationTarget & { message: string; page: 0 | 1 | 2 };

// Explain the existing server requirements; the server still authorizes every action.
export function publicationPreparationIssues(data: LiveView, competitionId: string): PublicationIssue[] {
  if (data.setup.workflow !== 'stage-v1') return [{message:'Publication of legacy-only events is deferred.',page:2}];
  const scheduled=data.setup.rounds.filter((r)=>r.competitionId===competitionId);
  if (!data.setup.competitions.some((c)=>c.id===competitionId) || !scheduled.length) return [{message:'Configure this competition and its stages in Set up.',page:0}];
  const issues:PublicationIssue[]=[];
  // StageDesk enables automatic flow for absent metadata; only explicit false is manual.
  const automatic=data.context.automaticStages!==false;
  function missingFinals(stage:LiveRound):PublicationIssue {
    const prelimSetup=scheduled.find((r)=>r.id===stage.prelimRoundId);
    const prelim=data.rounds.find((r)=>r.id===stage.prelimRoundId&&r.definition.competitionId===competitionId);
    const target:PublicationTarget={kind:'prelims',roundId:prelimSetup?.id};
    if(!prelimSetup)return {message:'Organizer: configure and save Prelims before Finals can open.',page:0,...target};
    if(!prelim)return {message:automatic?'Organizer: prepare Prelims in Set up and Save setup before Finals can open.':'Organizer: start Prelims in Score before Finals can open.',page:automatic?0:1,...target};
    if(!prelim.standings?.complete)return {message:'Finals waits for judges to finish Prelims and for current head approval. Track progress in Score.',page:1,...target};
    if(!prelim.standings.approved)return {message:'Finals waits for the head judge to approve current Prelims results from their private judge page.',page:2,...target};
    const finalsTarget:PublicationTarget={kind:'finals',roundId:stage.id};
    if(unpairedFinalists(data.setup,stage).length)return {message:'Organizer: enter the actual Finals draw in Set up → Couples, then Save setup before Finals scoring can open.',page:0,...finalsTarget,section:'Roster'};
    if(roundOpeningIssues(data.setup,stage).length)return {message:'Organizer: finish Finals preparation in Set up, then Save setup. Check Score for any remaining stage blockers.',page:0,...finalsTarget};
    return {message:automatic?'Finals opens automatically when every current Prelims approval and saved Finals preparation is ready. Check Score for remaining blockers.':'Organizer: start Finals in Score, then have judges complete their assigned scoring.',page:1,...finalsTarget};
  }
  for (const stage of scheduled) {
    const label=stage.kind==='prelims'?'Prelims':'Finals';
    const round=data.rounds.find((r)=>r.id===stage.id && r.definition.competitionId===competitionId);
    if (!round) issues.push(stage.kind==='finals'
      ? missingFinals(stage)
      : {message:automatic?'Organizer: finish Prelims preparation in Set up and Save setup. Scoring opens automatically when preparation is ready.':'Organizer: start Prelims in Score, then have judges complete their assigned scoring.',page:automatic?0:1,kind:stage.kind,roundId:stage.id});
    else if (!round.standings?.complete) issues.push({message:automatic?`Judges must finish scoring and submit the ${label} stage from their private judge pages. Track submissions in Score.`:data.context.stageSubmission?`Judges must finish and submit the ${label} stage; the organizer then concludes it in Score.`:`Finish all required ${label} heat submissions, then the organizer must conclude the stage in Score.`,page:1,kind:stage.kind,roundId:stage.id});
    else if (!round.standings.approved) issues.push({message:`The head judge must review and approve current ${label} results from their judge link, including any pending votes or tie decisions.`,page:2,kind:stage.kind,roundId:stage.id});
  }
  const rounds=data.rounds.filter((r)=>r.definition.competitionId===competitionId);
  if (!scheduled.some((r)=>r.kind==='finals')) issues.push({message:'Configure a Finals stage in Set up before preparing public results.',page:0,kind:'finals'});
  if (rounds.length!==scheduled.length && !issues.length) issues.push({message:'Review the scheduled stages and current results before preparing a snapshot.',page:2});
  for (const finals of rounds.filter((r)=>r.definition.kind==='finals')) {
    const pre=rounds.find((r)=>r.id===finals.definition.prelimRoundId);
    if (pre?.standings?.approved && (finals.definition.finalistIds.length!==pre.standings.advancingIds?.length || !finals.definition.finalistIds.every((id)=>pre.standings!.advancingIds!.includes(id))))
      issues.push({message:'Finalist membership changed; publication is blocked pending the deferred replacement/redance policy.',page:2,kind:'finals',roundId:finals.id});
  }
  return issues;
}
