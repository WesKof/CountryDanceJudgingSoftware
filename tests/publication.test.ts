import {publicationPreparationIssues} from '../lib/live/publication-readiness.ts';
import {renderResults,renderIndex} from '../public-site/render.ts';
import type {PublicationRecord} from '../lib/live/publication.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPublicSnapshot,validatePublicSnapshot,snapshotFingerprint} from '../lib/live/publication.ts';
import {stageFixture} from './stage-fixture.ts';
import {freezeRound,roundOpeningIssues} from '../lib/live/validation.ts';
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
 assert.deepEqual(publicationPreparationIssues(preOnly,competitionId).map((i)=>i.page),[2,2]);
 assert.match(publicationPreparationIssues(preOnly,competitionId)[0].message,/head judge.*Prelims/);
 assert.match(publicationPreparationIssues(preOnly,competitionId)[1].message,/Finals waits.*head judge.*Prelims/);
 await assert.rejects(buildPublicSnapshot(preOnly,competitionId,1,null,'now','blocked'));
 const pending=structuredClone(view);pending.rounds[1].standings!.complete=false;
 assert.match(publicationPreparationIssues(pending,competitionId)[0].message,/submit the Finals stage.*private judge pages/);
 const changed=structuredClone(view);changed.rounds[0].standings!.advancingIds=[];
 assert.match(publicationPreparationIssues(changed,competitionId)[0].message,/deferred replacement\/redance/);
 await assert.rejects(buildPublicSnapshot(changed,competitionId,1,null,'now','blocked'));
});

test('automatic Publish blockers target the current prerequisite stage without parsing message words', async () => {
 const {view,competitionId}=await fixture();view.context.automaticStages=true;view.context.stageSubmission=true;
 const preId=view.setup.rounds[0].id,finalId=view.setup.rounds[1].id;
 const missing=structuredClone(view);missing.rounds=[];
 let issues=publicationPreparationIssues(missing,competitionId);
 assert.equal(issues.length,2);assert.deepEqual(issues.map(({page,kind,roundId})=>({page,kind,roundId})),[{page:0,kind:'prelims',roundId:preId},{page:0,kind:'prelims',roundId:preId}]);
 assert.ok(issues.every(issue=>!issue.message.includes('Run')&&!issue.message.includes('Start')));
 const scoring=structuredClone(view);scoring.rounds.pop();scoring.rounds[0].standings!.complete=false;
 issues=publicationPreparationIssues(scoring,competitionId);assert.equal(issues.length,2);
 assert.ok(issues.every(issue=>issue.page===1&&issue.kind==='prelims'&&issue.roundId===preId));
 assert.match(issues[0].message,/judges.*submit.*stage/i);assert.doesNotMatch(issues[0].message,/conclude|Run/);
 const review=structuredClone(view);review.rounds.pop();review.rounds[0].standings!.approved=false;
 issues=publicationPreparationIssues(review,competitionId);assert.equal(issues.length,2);
 assert.ok(issues.every(issue=>issue.page===2&&issue.kind==='prelims'&&issue.roundId===preId));
 const waiting=structuredClone(view);waiting.rounds.pop();issues=publicationPreparationIssues(waiting,competitionId);
 assert.equal(issues.length,1);assert.deepEqual({page:issues[0].page,kind:issues[0].kind,roundId:issues[0].roundId},{page:1,kind:'finals',roundId:finalId});
 const unapproved=structuredClone(view);unapproved.rounds[1].standings!.approved=false;
 issues=publicationPreparationIssues(unapproved,competitionId);assert.equal(issues.length,1);assert.equal(issues[0].kind,'finals');assert.equal(issues[0].roundId,finalId);assert.equal(issues[0].page,2);
});

test('Publish guidance identifies actual draw setup and preserves manual, legacy, mismatch and configured-stage requirements', async () => {
 const {view,competitionId}=await fixture();const before=JSON.stringify(view),preId=view.setup.rounds[0].id,finalId=view.setup.rounds[1].id;
 const draw=structuredClone(view);draw.context.automaticStages=true;draw.rounds.pop();draw.setup.competitions[0].format='Jack & Jill';draw.setup.rounds[1].subjects=[];
 const drawBefore=JSON.stringify(draw);
 let issues=publicationPreparationIssues(draw,competitionId);assert.equal(issues.length,1);
 assert.deepEqual({page:issues[0].page,kind:issues[0].kind,roundId:issues[0].roundId,section:issues[0].section},{page:0,kind:'finals',roundId:finalId,section:'Roster'});assert.match(issues[0].message,/actual.*draw/);assert.equal(JSON.stringify(draw),drawBefore);
 assert.ok(roundOpeningIssues(draw.setup,draw.setup.rounds[1]).some(issue=>issue.includes('Set up → Couples')));assert.equal(JSON.stringify(draw),drawBefore);
 const manual=structuredClone(view);manual.context.automaticStages=false;manual.rounds=[];
 issues=publicationPreparationIssues(manual,competitionId);assert.equal(issues.length,2);assert.equal(issues[0].page,1);assert.equal(issues[0].roundId,preId);assert.match(issues[0].message,/start Prelims.*Score/i);
 const incomplete=structuredClone(view);incomplete.context.automaticStages=false;incomplete.rounds[1].standings!.complete=false;
 issues=publicationPreparationIssues(incomplete,competitionId);assert.equal(issues.length,1);assert.match(issues[0].message,/heat submissions.*conclude.*Score/);
 incomplete.context.stageSubmission=true;assert.match(publicationPreparationIssues(incomplete,competitionId)[0].message,/stage.*conclude.*Score/);
 const noFinals=structuredClone(view);noFinals.setup.rounds.pop();noFinals.rounds.pop();issues=publicationPreparationIssues(noFinals,competitionId);assert.equal(issues.length,1);assert.equal(issues[0].page,0);assert.equal(issues[0].kind,'finals');
 const mismatch=structuredClone(view);mismatch.rounds[0].standings!.advancingIds=[];issues=publicationPreparationIssues(mismatch,competitionId);assert.equal(issues.length,1);assert.equal(issues[0].page,2);assert.equal(issues[0].kind,'finals');assert.equal(issues[0].roundId,finalId);assert.match(issues[0].message,/deferred replacement\/redance/);
 const extra=structuredClone(view);extra.rounds.push({...structuredClone(extra.rounds[0]),id:'retained-extra-round'});issues=publicationPreparationIssues(extra,competitionId);assert.equal(issues.length,1);assert.match(issues[0].message,/scheduled stages/);
 const legacy=structuredClone(view);delete legacy.setup.workflow;issues=publicationPreparationIssues(legacy,competitionId);assert.equal(issues.length,1);assert.equal(issues[0].page,2);assert.match(issues[0].message,/legacy-only/);
 assert.equal(publicationPreparationIssues(view,'unknown-competition').length,1);assert.deepEqual(publicationPreparationIssues(view,competitionId),[]);assert.equal(JSON.stringify(view),before);
});


test('unreleased admin previews keep scorecards without broken public links or superseded labels',async()=>{
 const {view,competitionId}=await fixture(),snapshot=await buildPublicSnapshot(view,competitionId,1,null,'now','preview');
 const requested:PublicationRecord={id:snapshot.id,competitionId:snapshot.competitionId,revision:1,sourceFingerprint:snapshot.sourceFingerprint,snapshot,status:'requested'};
 const preview=renderResults(requested,{records:{},current:{}});
 assert.match(preview,/Private preview · Not published/);assert.doesNotMatch(preview,/Superseded|href="\/results\//);
 assert.match(preview,/6.6667/);assert.match(preview,/Blank · Not observed/);
 const released:PublicationRecord={...requested,status:'released',releasedAt:'2026-10-21T21:00:00Z'},scope=snapshot.eventId+'/'+snapshot.competitionId;
 const store={records:{[released.id]:released},current:{[scope]:released.id}},published=renderResults(released,store);
 assert.match(published,/Revision 1 · Released/);assert.ok(published.includes('/results/preview/entrant/'));assert.ok(published.includes('/results/preview/judge/'));
 const revised:PublicationRecord={...requested,id:'preview-next',revision:2,snapshot:{...snapshot,id:'preview-next',revision:2,supersedes:requested.id}};
 const revisedPreview=renderResults(revised,store);assert.match(revisedPreview,/Revision 2 · Private preview · Not published/);assert.doesNotMatch(revisedPreview,/Superseded|href="\/results\//);
 assert.match(renderResults({...revised,status:'queued',ownerApprovedAt:'now'},store),/Approved · Sending pending/);
 const next:PublicationRecord={...revised,status:'released',releasedAt:'2026-10-21T21:01:00Z'};
 assert.match(renderResults(released,{records:{...store.records,[next.id]:next},current:{[scope]:next.id}}),/Superseded · <a href="\/results\/preview-next">Current revision/);
});

test('public navigation keeps releases discoverable and preserves linked original versions during correction review',async()=>{
 const {view,competitionId}=await fixture(),snapshot=await buildPublicSnapshot(view,competitionId,1,null,'now','original');
 const original:PublicationRecord={id:snapshot.id,competitionId,revision:1,sourceFingerprint:snapshot.sourceFingerprint,snapshot,status:'released',releasedAt:'2026-10-21T18:00:00Z',lastSynchronizedAt:'2026-10-21T18:01:00Z'};
 const revised:PublicationRecord={...original,id:'corrected',revision:2,releasedAt:'2026-10-21T19:00:00Z',snapshot:{...snapshot,id:'corrected',revision:2,supersedes:original.id,changeSummary:'Approved recording-error correction'}};
 const draft:PublicationRecord={...revised,id:'private-draft',revision:3,status:'requested',releasedAt:undefined,snapshot:{...revised.snapshot,id:'private-draft',revision:3,changeSummary:'PRIVATE_DRAFT_SENTINEL'}};
 const scope=snapshot.eventId+'/'+snapshot.competitionId,store={records:{original,corrected:revised,'private-draft':draft},current:{[scope]:revised.id}},before=structuredClone(store);
 const directory=renderIndex(store,true);
 assert.equal((directory.match(/class="event-link"/g)??[]).length,1);
 assert.doesNotMatch(directory,/Final places|PRIVATE_DRAFT_SENTINEL/);
 const selected=renderIndex(store,true,snapshot.eventId);
 assert.match(selected,/Final places/);assert.match(selected,/class="public-scorecards"><summary/);
 assert.doesNotMatch(selected,/href="\/results\/private-draft|PRIVATE_DRAFT_SENTINEL/);
 const old=renderResults(original,store);
 assert.match(old,/earlier published version/);assert.match(old,/href="\/results\/corrected">Current revision/);
 assert.match(old,/datetime="2026-10-21T18:00:00Z"/);assert.match(old,/Oct 21, 2026/);
 assert.match(renderResults(revised,store),/href="\/results\/original">Revision 1/);
 assert.match(renderResults({...revised,underReview:true},store),/correction is under review.*previously approved results/);
 assert.match(renderResults(revised,store,snapshot.stages[1].entrants[0].id),/class="public-scorecards" open/);
 assert.deepEqual(store,before);
});
