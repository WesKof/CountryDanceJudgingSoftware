import type { LiveSetup } from './types.ts';
import { finalistCountIssues, freezeRound } from './validation.ts';
export type SetupTask = { id: string; label: string; detail: string; section: string; roundId?: string; complete: boolean };
export function setupTasks(setup: LiveSetup): SetupTask[] {
  const panel = setup.judges;
  const identities = [setup.organizerParticipantId, ...panel.map((j) => j.participantId)];
  const peopleReady = !setup.workflow || Boolean(setup.organizerName?.trim() && setup.separationAttested && identities.every((id) => id?.trim()) && new Set(identities).size === identities.length);
  const tasks: SetupTask[] = [
    { id:'details',label:'Name your event',detail:'Venue and date are optional.',section:'Event details',complete:Boolean(setup.name.trim()) },
    { id:'program',label:'Add competitions',detail:'Choose formats and divisions.',section:'Program & stages',complete:setup.competitions.length>0 },
    { id:'panel',label:'Set the judging panel',detail:'Add judges, choose the head and confirm separate role holders.',section:panel.length && panel.some((j)=>j.id===setup.headJudgeId) && panel.every((j)=>Boolean(j.name.trim())) && !peopleReady ? 'Role verification' : 'Judges',complete:panel.length>0 && panel.every((j)=>Boolean(j.name.trim())) && panel.some((j)=>j.id===setup.headJudgeId) && peopleReady },
  ];
  for(const c of setup.competitions) {
    const pre=setup.rounds.find((r)=>r.competitionId===c.id&&r.kind==='prelims');
    if(!pre) {tasks.push({id:c.id,label:'Prepare '+c.format+' · '+c.division,detail:'Add the Prelims and Finals program.',section:'Program & stages',complete:false});continue;}
    const title=c.format+' · '+c.division, final=setup.rounds.find((r)=>r.prelimRoundId===pre.id);
    const roster=pre.subjects.length>0 && (c.format!=='Jack & Jill'||pre.subjects.some((s)=>s.role==='Lead')&&pre.subjects.some((s)=>s.role==='Follow'));
    const unassigned=pre.subjects.some((s)=>!pre.heats.some((h)=>h.subjectIds.includes(s.id)));
    const heatReady=pre.heats.length>0&&pre.heats.every((h)=>h.subjectIds.length>0&&h.songs.length>=2&&h.songs.length<=3)&&!unassigned;
    tasks.push({id:pre.id+'-entries',label:'Add entries · '+title,detail:pre.subjects.length+' entries'+(c.format==='Jack & Jill'?' · both roles needed':''),section:'Roster',roundId:pre.id,complete:roster});
    tasks.push({id:pre.id+'-program',label:'Prepare heats & songs · '+title,detail:unassigned?'Assign every entry to a heat.':pre.heats.length+' heats · check songs and assignments',section:unassigned?'Heat assignments':'Heats, songs & partner rotations',roundId:pre.id,complete:heatReady});
    const countIssues=finalistCountIssues(c.format,final?.finalistCount??0,pre.subjects);
    tasks.push({id:pre.id+'-finalists',label:'Choose finalist count · '+title,detail:countIssues[0]??(final?.finalistCount+' '+(c.format==='Jack & Jill'?'pairs / per role':'couples')),section:'Finalists & pairings',roundId:pre.id,complete:countIssues.length===0});
  }
  // The checklist never substitutes for opening validation. Surface any remaining exact issue.
  if(tasks.every((t)=>t.complete)) for(const r of setup.rounds.filter((r)=>r.kind==='prelims')) {
    try{freezeRound(setup,r);}catch(error){tasks.push({id:r.id+'-review',label:'Review round preparation',detail:(error as Error).message,section:'Round setup',roundId:r.id,complete:false});}
  }
  return tasks;
}
