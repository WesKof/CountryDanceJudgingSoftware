import {publicationPreparationIssues} from '../lib/live/publication-readiness.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPublicSnapshot,validatePublicSnapshot,snapshotFingerprint} from '../lib/live/publication.ts';
import {stageFixture} from './stage-fixture.ts';
import {freezeRound} from '../lib/live/validation.ts';
import {deriveStageStandings} from '../lib/live/stage.ts';
import {cellKey,type LiveView,type HeatSubmission} from '../lib/live/types.ts';
async function fixture(){
 const setup=stageFixture('public-private',3),competitionId=setup.competitions[0].id;setup.competitions=setup.competitions.slice(0,1);setup.rounds=setup.rounds.filter((r)=>r.competitionId===competitionId);setup.blocks=setup.blocks.map((b)=>({...b,roundIds:b.roundIds.filter((id)=>setup.rounds.some((r)=>r.id===id))}));
 const pre=setup.rounds[0],fin=setup.rounds[1];fin.finalistIds=pre.subjects.slice(0,2).map((s)=>s.id);fin.subjects=pre.subjects.slice(0,2);fin.heats[0].subjectIds=fin.finalistIds;fin.heats[0].songs=fin.heats[0].songs.slice(0,2);
 const rounds=setup.rounds.map((r)=>{const definition=freezeRound(setup,r),key=r.id+':1';const submissions:HeatSubmission[]=definition.heats.flatMap((h)=>definition.judgeIds.map((judgeId,j)=>({id:h.id+judgeId,roundKey:key,heatId:h.id,judgeId,version:1,ballotVersion:1,createdAt:'now',cells:Object.fromEntries(h.songs.flatMap((p,song)=>h.subjectIds.map((id)=>[cellKey(p.id,id),{mark:song===0?'Yes':j===0?'':'No',note:'PRIVATE_NOTE',revision:1,mutationId:'private'}])))})));
 const computed=deriveStageStandings(definition,key,submissions);return {id:r.id,key,generation:1,version:1,phase:'approved' as const,definition,standings:{...computed,fingerprint:'approved-hash',approved:true,approvedAt:'2026-10-09',decisions:[],advancingIds:r.kind==='prelims'?fin.finalistIds:[]},submittedMarks:submissions.flatMap((s)=>Object.entries(s.cells).map(([key,c])=>({judgeId:s.judgeId,performanceId:key.split(':')[0],subjectId:key.split(':')[1],mark:c.mark})))};});
 const view:LiveView={eventId:'private-event',role:'organizer',judgeId:null,status:'active',version:1,setup,context:{blockId:null,performanceId:null,visited:[]},rounds,ballots:[]};return {view,competitionId};
}
test('public snapshot independently checks equal weighting, explicit blanks, ranks and public allowlist',async()=>{
 const {view,competitionId}=await fixture(),snapshot=await buildPublicSnapshot(view,competitionId,1,null,'now','snapshot');
 assert.equal(await snapshotFingerprint(snapshot),snapshot.sourceFingerprint);const tampered=structuredClone(snapshot);tampered.event.name+=' changed';assert.notEqual(await snapshotFingerprint(tampered),snapshot.sourceFingerprint);const first=snapshot.stages[1].entrants[0];assert.ok(Math.abs(first.average!-20/3)<1e-9);assert.deepEqual(first.judgeMeans.map((j)=>j.observations),[1,2,2]);
 assert.ok(snapshot.stages.every((s)=>s.marks.some((m)=>m.mark==='')));assert.ok(!JSON.stringify(snapshot).includes('public-private'));assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_NOTE'));
 const leaked=structuredClone(snapshot) as unknown as Record<string,unknown>;leaked.privateNotes='forbidden';assert.throws(()=>validatePublicSnapshot(leaked as never));
 const wrong=structuredClone(snapshot);wrong.stages[1].entrants[0].average=6;assert.throws(()=>validatePublicSnapshot(wrong));
 const missing=structuredClone(snapshot);missing.stages[1].marks.pop();assert.throws(()=>validatePublicSnapshot(missing));
 const changed=structuredClone(view);changed.setup.name+=' changed';const next=await buildPublicSnapshot(changed,competitionId,1,null,'now','snapshot');assert.notEqual(next.sourceFingerprint,snapshot.sourceFingerprint);
});
test('unapproved or changed finalist membership cannot produce a public snapshot',async()=>{const {view,competitionId}=await fixture();view.rounds[1].standings!.approved=false;await assert.rejects(buildPublicSnapshot(view,competitionId,1,null,'now','id'));view.rounds[1].standings!.approved=true;view.rounds[0].standings!.advancingIds=[];await assert.rejects(buildPublicSnapshot(view,competitionId,1,null,'now','id'));});

test('withdrawn public identity retains observations but has no placement',async()=>{const {view,competitionId}=await fixture();const r=view.rounds[1],id=r.definition.subjects[0].id;r.definition.withdrawnIds=[id];r.standings!.rows=r.standings!.rows.filter((row)=>row.subjectId!==id);r.standings!.rows.forEach((row)=>row.place=1);const snapshot=await buildPublicSnapshot(view,competitionId,1,null,'now','withdrawn');const entrant=snapshot.stages[1].entrants[0];assert.equal(entrant.withdrawn,true);assert.equal(entrant.place,null);assert.equal(entrant.average,null);assert.equal(entrant.observations,5);assert.deepEqual(entrant.judgeMeans.map((m)=>m.observations),[1,2,2]);const bad=structuredClone(snapshot);bad.stages[1].entrants[0].observations=0;assert.throws(()=>validatePublicSnapshot(bad));});

test('publication guidance distinguishes unfinished stages, missing head approval and changed finalists',async()=>{
 const {view,competitionId}=await fixture();assert.deepEqual(publicationPreparationIssues(view,competitionId),[]);
 const preOnly=structuredClone(view);preOnly.rounds.pop();preOnly.rounds[0].standings!.approved=false;
 assert.deepEqual(publicationPreparationIssues(preOnly,competitionId).map((i)=>i.page),[2,0]);
 assert.match(publicationPreparationIssues(preOnly,competitionId)[0].message,/head judge.*Prelims/);
 assert.match(publicationPreparationIssues(preOnly,competitionId)[1].message,/automatically fill Finals.*complete Finals/);
 await assert.rejects(buildPublicSnapshot(preOnly,competitionId,1,null,'now','blocked'));
 const pending=structuredClone(view);pending.rounds[1].standings!.complete=false;
 assert.match(publicationPreparationIssues(pending,competitionId)[0].message,/Finals heat submissions.*conclude/);
 const changed=structuredClone(view);changed.rounds[0].standings!.advancingIds=[];
 assert.match(publicationPreparationIssues(changed,competitionId)[0].message,/deferred replacement\/redance/);
 await assert.rejects(buildPublicSnapshot(changed,competitionId,1,null,'now','blocked'));
});
