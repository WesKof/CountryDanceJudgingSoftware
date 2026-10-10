import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEligibility,validatePairingPlan,withdrawalBoundary } from '../lib/live/eligibility.ts';
import { heatReviewSignature,missingHeatSubjects,deriveStageStandings } from '../lib/live/stage.ts';
import {stageFixture} from './stage-fixture.ts';
import {freezeRound} from '../lib/live/validation.ts';
import {cellKey,type ReviewRequest,type HeatSubmission} from '../lib/live/types.ts';
test('withdrawn eligibility retains marks and only waives its own coverage; every judge still submits',()=>{
 const setup=stageFixture('eligibility',3),round=freezeRound(setup,setup.rounds[0]),heat=round.heats[0],id=heat.subjectIds[0];
 const q:ReviewRequest={id:'withdraw',kind:'withdrawal',version:1,payload:{competitionId:round.competitionId,subjectId:id,sourceStage:'prelims'},reason:'Internal',requester:'organizer',createdAt:'',approvals:[],appliedAt:'now'};
 const changed=applyEligibility(round,[q]);assert.equal(missingHeatSubjects(changed.heats[0],{}).length,0);assert.deepEqual(missingHeatSubjects(heat,{}),[id]);
 assert.notEqual(heatReviewSignature(heat,{}),heatReviewSignature(changed.heats[0],{}));
 assert.equal(deriveStageStandings(changed,'key',[]).complete,false);
 const submissions:HeatSubmission[]=changed.heats.flatMap((h)=>round.judgeIds.map((judgeId)=>({id:h.id+judgeId,roundKey:'key',heatId:h.id,judgeId,ballotVersion:1,version:1,createdAt:'',cells:Object.fromEntries(h.songs.flatMap((p)=>h.subjectIds.map((s)=>[cellKey(p.id,s),{mark:s===id?'':'No',note:'private',revision:1,mutationId:'m'}])))})));
 const result=deriveStageStandings(changed,'key',submissions);assert.equal(result.complete,true);assert.equal(result.required,9);assert.equal(result.rows.length,2);assert.ok(result.rows.every((r)=>r.average===0));
 const late={...q,payload:{...q.payload,sourceStage:'finals' as const}};assert.deepEqual(applyEligibility(round,[late]).withdrawnIds,[]);
});
test('J&J undanced exact pairing plan preserves danced history and rejects uncovered dancers',()=>{
 const setup=stageFixture('pairing',3),round=freezeRound(setup,setup.rounds.find((r)=>r.kind==='prelims'&&setup.competitions.find((c)=>c.id===r.competitionId)?.format==='Jack & Jill')!);
 const h=round.heats[0],context={blockId:round.blockId,performanceId:h.songs[0].id,visited:[h.songs[0].id]},removed=round.subjects[0].id;
 const leads=round.subjects.filter((s)=>s.role==='Lead'&&s.id!==removed),follows=round.subjects.filter((s)=>s.role==='Follow');
 const plan=h.songs.slice(1).map((p,song)=>({performanceId:p.id,partners:leads.map((l,i)=>[l.id,follows[(i+song)%follows.length].id])}));
 assert.throws(()=>validatePairingPlan(round,removed,context,[]));assert.throws(()=>validatePairingPlan(round,removed,context,[{performanceId:h.songs[0].id,partners:[]}])) ;
 const exact=validatePairingPlan(round,removed,context,plan),q:ReviewRequest={id:'q',version:1,kind:'withdrawal',payload:{competitionId:round.competitionId,subjectId:removed,sourceStage:'prelims',pairingPlan:exact},reason:'private',requester:'o',createdAt:'',appliedAt:'now',approvals:[]};
 const changed=applyEligibility(round,[q]);assert.deepEqual(changed.heats[0].songs[0].partners,h.songs[0].partners);assert.deepEqual(changed.heats[0].songs[1].partners,exact[0].partners);assert.notEqual(withdrawalBoundary(round,context),withdrawalBoundary(changed,context));
});
