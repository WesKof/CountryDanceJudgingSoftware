import test from 'node:test';
import assert from 'node:assert/strict';
import {isLiveView} from '../lib/live/view-validation.ts';
import {liveFixture} from './live-fixture.ts';
import {createStage,limitedStage,finish,owner,exact} from './publication-helpers.ts';
import {api,command,nonce} from './stage-helpers.ts';
import type {LiveView} from '../lib/live/types.ts';
const check=(view:LiveView,label:string)=>assert.equal(isLiveView(view),true,label);
async function roles(organizer:string,tokens:string[],label:string){check(await api<LiveView>(organizer),label+' organizer');for(const token of tokens)check(await api<LiveView>(token),label+' private judge/head');}

test('read structure accepts real blank and legacy role-filtered preparations, visible songs, ballots and archived views',async()=>{
 const created=await api<{path:string}>('',{action:'create',requestId:nonce(),name:'Fictional read boundary',venue:'',date:''});const organizer=created.path.split('/').at(-1)!;let view=await api<LiveView>(organizer);check(view,'blank organizer');assert.equal(view.rounds.length,0);
 const setup=liveFixture(2);await command(organizer,{action:'setup',setup});view=await api<LiveView>(organizer);const tokens=view.judgeLinks!.map(j=>j.path.split('/').at(-1)!);await roles(organizer,tokens,'legacy preparation');await command(organizer,{action:'open-block',blockId:setup.blocks[0].id});await roles(organizer,tokens,'legacy dancing');await command(organizer,{action:'next'});await roles(organizer,tokens,'legacy visible songs');await command(organizer,{action:'archive'});await roles(organizer,tokens,'legacy archived');
});

test('read structure accepts real stage organizer/head/judge, immutable submissions, publication and correction histories without private-field requirements',async()=>{
 const setup=limitedStage(1,3),{organizer,tokens,head}=await createStage(setup);await roles(organizer,tokens,'stage preparation');await finish(setup,organizer,tokens,head,false);await roles(organizer,tokens,'stage approved');let view=await api<LiveView>(organizer);assert.ok(view.heatSubmissions!.length>0);assert.equal(view.publicationDeliveryUnconfirmed,false);
 await command(organizer,{action:'prepare-event-publication'});view=await api<LiveView>(organizer);check(view,'prepared publication');const record=view.publications![0],publications=[{publicationId:record.id,sourceFingerprint:record.sourceFingerprint}];await command(organizer,{action:'approve-event-publication',publications});check(await api<LiveView>(organizer),'requested publication');await owner({action:'release-event',publications});check(await api<LiveView>(organizer),'released publication');
 const round=view.rounds.find(r=>r.definition.kind==='finals')!,heat=round.definition.heats[0],sub=view.heatSubmissions!.find(s=>s.roundKey===round.key&&s.judgeId===setup.judges[0].id)!;const request=await command(organizer,{action:'request-correction',roundKey:round.key,heatId:heat.id,judgeId:sub.judgeId,submissionId:sub.id,changes:[{performanceId:heat.songs[0].id,subjectId:heat.subjectIds[0],after:'A1'}],reason:'Fictional read-contract correction'}) as {reviewRequestId:string};await roles(organizer,tokens,'pending correction');await command(organizer,{action:'approve-request',reviewRequestId:request.reviewRequestId,requestVersion:1});await command(head,{action:'approve-request',reviewRequestId:request.reviewRequestId,requestVersion:1});await roles(organizer,tokens,'applied correction');view=await api<LiveView>(organizer);assert.ok(view.heatSubmissions!.some(s=>s.supersedes));assert.ok(view.resultAudit!.length>0);await exact(head,round.id,'approve');await roles(organizer,tokens,'renewed head');
 const compatible={...view,newOptionalSection:{future:true}};check(compatible,'compatible extra');for(const token of tokens){const privateView=await api<LiveView>(token);assert.equal(Object.hasOwn(privateView.setup,'organizerParticipantId'),false);assert.equal(Object.hasOwn(privateView,'publicationDeliveryUnconfirmed'),false);check(privateView,'filtered private identity');}
});
