import type { LiveView } from './types.ts';

export type PublicationIssue = { message: string; page: 0 | 1 | 2 };

// Explain the existing server requirements; the server still authorizes every action.
export function publicationPreparationIssues(data: LiveView, competitionId: string): PublicationIssue[] {
  if (data.setup.workflow !== 'stage-v1') return [{message:'Publication of legacy-only events is deferred.',page:2}];
  const scheduled=data.setup.rounds.filter((r)=>r.competitionId===competitionId);
  if (!data.setup.competitions.some((c)=>c.id===competitionId) || !scheduled.length) return [{message:'Configure this competition and its stages in Set up.',page:0}];
  const issues:PublicationIssue[]=[];
  for (const stage of scheduled) {
    const label=stage.kind==='prelims'?'Prelims':'Finals';
    const round=data.rounds.find((r)=>r.id===stage.id && r.definition.competitionId===competitionId);
    if (!round) issues.push(stage.kind==='finals'
      ? {message:'Approved Prelims automatically fill Finals. For J&J, enter the actual draw in Set up, then complete Finals in Run.',page:0}
      : {message:'Start and complete Prelims in Run.',page:1});
    else if (!round.standings?.complete) issues.push({message:`Finish all required ${label} heat submissions and conclude the stage in Run.`,page:1});
    else if (!round.standings.approved) issues.push({message:`The head judge must review and approve current ${label} results from their judge link, including any pending votes or tie decisions.`,page:2});
  }
  const rounds=data.rounds.filter((r)=>r.definition.competitionId===competitionId);
  if (!scheduled.some((r)=>r.kind==='finals')) issues.push({message:'Configure a Finals stage in Set up before preparing public results.',page:0});
  if (rounds.length!==scheduled.length && !issues.length) issues.push({message:'Review the scheduled stages and current results before preparing a snapshot.',page:2});
  for (const finals of rounds.filter((r)=>r.definition.kind==='finals')) {
    const pre=rounds.find((r)=>r.id===finals.definition.prelimRoundId);
    if (pre?.standings?.approved && (finals.definition.finalistIds.length!==pre.standings.advancingIds?.length || !finals.definition.finalistIds.every((id)=>pre.standings!.advancingIds!.includes(id))))
      issues.push({message:'Finalist membership changed; publication is blocked pending the deferred replacement/redance policy.',page:2});
  }
  return issues;
}
