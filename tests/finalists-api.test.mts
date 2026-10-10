import test from 'node:test';
import assert from 'node:assert/strict';
import { stageFixture } from './stage-fixture.ts';
import { api,command,nonce,save,submitHeat } from './stage-helpers.ts';
import type { LiveView } from '../lib/live/types.ts';

test('automatic finalists persist only after exact head approval; count changes reapprove, started Finals stay frozen', {timeout:120000}, async()=>{
  const created=await api<{path:string}>('',{action:'create',requestId:nonce(),name:'Automatic finalists API',venue:'Synthetic',date:''}),organizer=created.path.split('/').at(-1)!;
  const setup=stageFixture(crypto.randomUUID(),3);setup.competitions=[setup.competitions[0]];setup.rounds=setup.rounds.slice(0,2);setup.blocks.forEach((b)=>b.roundIds=b.roundIds.slice(0,1));
  const pre=setup.rounds[0],f=setup.rounds[1];pre.heats=[{...pre.heats[0],subjectIds:pre.subjects.map((s)=>s.id),songs:pre.heats[0].songs.slice(0,2)}];
  await command(organizer,{action:'setup',setup});await command(organizer,{action:'open-stage',kind:'prelims'});
  let v=await api<LiveView>(organizer);const tokens=v.judgeLinks!.map((l)=>l.path.split('/').at(-1)!),head=tokens[2],r=v.rounds[0];
  for(const token of tokens)for(const [i,s] of r.definition.subjects.entries())await save(token,r,r.definition.heats[0].songs[0].id,s.id,['Yes','A1','A2'][i] as 'Yes'|'A1'|'A2');
  await command(organizer,{action:'next'});await command(organizer,{action:'lineup'});for(const token of tokens)await submitHeat(token,r,r.definition.heats[0].id);await command(organizer,{action:'conclude-stage'});
  v=await api<LiveView>(organizer);assert.deepEqual(v.setup.rounds[1].finalistIds,[]);
  const approve=async(token:string,expected=200)=>{const h=await api<LiveView>(head),review=h.rounds[0];return command(token,{action:'approve',roundKey:review.key,roundVersion:review.version,fingerprint:review.standings!.fingerprint},expected);};
  await approve(organizer,403);await approve(tokens[0],403);await approve(head);
  const expected=pre.subjects.slice(0,2).map((s)=>s.id);
  v=await api<LiveView>(organizer);assert.deepEqual(v.setup.rounds[1].finalistIds,expected);assert.deepEqual(v.setup.rounds[1].subjects,pre.subjects.slice(0,2));
  const backup=await command(organizer,{action:'backup'}) as {setup:typeof setup};assert.deepEqual(backup.setup.rounds[1].finalistIds,expected);
  const changed=structuredClone(v.setup);changed.rounds[1].finalistCount=1;await command(organizer,{action:'setup',setup:changed});
  await command(organizer,{action:'open-stage',kind:'finals'},400);await approve(head);
  v=await api<LiveView>(organizer);assert.deepEqual(v.setup.rounds[1].finalistIds,[expected[0]]);
  // Simulate an older approved event whose Finals were left empty. Read derives; opening persists.
  const empty=structuredClone(v.setup);empty.rounds[1].finalistIds=[];empty.rounds[1].subjects=[];empty.rounds[1].heats[0].subjectIds=[];
  await command(organizer,{action:'setup',setup:empty});v=await api<LiveView>(organizer);assert.deepEqual(v.setup.rounds[1].finalistIds,[expected[0]]);
  await command(organizer,{action:'open-stage',kind:'finals'});v=await api<LiveView>(organizer);assert.deepEqual(v.rounds.find((x)=>x.id===f.id)!.definition.finalistIds,[expected[0]]);
  const invalid=structuredClone(v.setup);invalid.rounds[1].finalistCount=2;await command(organizer,{action:'setup',setup:invalid},423);
  assert.deepEqual((await api<LiveView>(organizer)).rounds.find((x)=>x.id===f.id)!.definition.subjects,pre.subjects.slice(0,1));
});

test('setup rejects over-capacity counts without writes; valid count cycles preserve scores and exact approval history', {timeout:120000}, async()=>{
  const setup=stageFixture(),competition=setup.competitions[2];setup.competitions=[competition];setup.rounds=setup.rounds.filter((r)=>r.competitionId===competition.id);setup.blocks=setup.blocks.map((b)=>({...b,roundIds:b.roundIds.filter((id)=>setup.rounds.some((r)=>r.id===id))}));
  const pre=setup.rounds[0],final=setup.rounds[1];pre.subjects=pre.subjects.filter((_,i)=>[0,1,3,4].includes(i));pre.heats[0].subjectIds=pre.subjects.map((s)=>s.id);pre.heats[0].songs=pre.heats[0].songs.slice(0,2).map((song,i)=>({...song,partners:[0,1].map((lead):[string,string]=>[pre.subjects[lead].id,pre.subjects[2+(lead+i)%2].id])}));final.finalistCount=1;
  const c=await api<{path:string}>('',{action:'create',requestId:nonce(),name:'Count limit API',venue:'Synthetic',date:''}),organizer=c.path.split('/').at(-1)!;await command(organizer,{action:'setup',setup});await command(organizer,{action:'open-stage',kind:'prelims'});let v=await api<LiveView>(organizer);const tokens=v.judgeLinks!.map((l)=>l.path.split('/').at(-1)!),head=tokens[2],r=v.rounds[0];
  for(const token of tokens)for(const [i,s]of pre.subjects.entries())await save(token,r,r.definition.heats[0].songs[0].id,s.id,i%2===0?'Yes':'A1');await command(organizer,{action:'next'});await command(organizer,{action:'lineup'});for(const token of tokens)await submitHeat(token,r,r.definition.heats[0].id);await command(organizer,{action:'conclude-stage'});
  const approve=async(token:string,expected=200)=>{const h=await api<LiveView>(head),r=h.rounds[0];return command(token,{action:'approve',roundKey:r.key,roundVersion:r.version,fingerprint:r.standings!.fingerprint},expected);};
  await approve(tokens[0],403);await approve(head);v=await api<LiveView>(organizer);
  const original=structuredClone(v),averages=v.rounds[0].standings!.rows.map((row)=>row.average),submissions=v.heatSubmissions,fingerprint=v.rounds[0].standings!.fingerprint;
  const firstBackup=await command(organizer,{action:'backup'}) as {history:{approvals:{id:string}[]}};
  const excessive=structuredClone(v.setup);excessive.rounds[1].finalistCount=3;await command(tokens[0],{action:'setup',setup:excessive},403);
  const rejected=await command(organizer,{action:'setup',setup:excessive},400);assert.match(String(rejected.error),/3 per role.*2 eligible leads and 2 eligible follows.*Choose 1.2 per role/);
  v=await api<LiveView>(organizer);assert.equal(v.version,original.version);assert.deepEqual(v.setup,original.setup);assert.equal(v.rounds[0].standings!.approved,true);assert.deepEqual(v.heatSubmissions,submissions);
  const two=structuredClone(v.setup);two.rounds[1].finalistCount=2;await command(organizer,{action:'setup',setup:two});v=await api<LiveView>(organizer);assert.equal(v.setup.rounds[1].advancementRevision,1);assert.equal(v.rounds[0].standings!.approved,false);await approve(head);
  v=await api<LiveView>(organizer);const secondVersion=v.version;const badAgain=structuredClone(v.setup);badAgain.rounds[1].finalistCount=3;await command(organizer,{action:'setup',setup:badAgain},400);v=await api<LiveView>(organizer);assert.equal(v.version,secondVersion);assert.equal(v.setup.rounds[1].advancementRevision,1);assert.equal(v.rounds[0].standings!.approved,true);
  const back=structuredClone(v.setup);back.rounds[1].finalistCount=1;await command(organizer,{action:'setup',setup:back});v=await api<LiveView>(organizer);assert.equal(v.rounds[0].standings!.approved,false);assert.notEqual(v.rounds[0].standings!.fingerprint,fingerprint);assert.equal(v.setup.rounds[1].advancementRevision,2);await approve(head);
  v=await api<LiveView>(organizer);assert.deepEqual(v.setup.rounds[1].finalistIds,[pre.subjects[0].id,pre.subjects[2].id]);assert.deepEqual(v.rounds[0].standings!.rows.map((row)=>row.average),averages);assert.deepEqual(v.heatSubmissions,submissions);
  const spoof=structuredClone(v.setup);spoof.rounds[1].advancementRevision=999999;await command(organizer,{action:'setup',setup:spoof});v=await api<LiveView>(organizer);assert.equal(v.setup.rounds[1].advancementRevision,2);assert.equal(v.rounds[0].standings!.approved,true);
  const renewed=await command(organizer,{action:'backup'}) as {history:{approvals:{id:string}[]}};assert.equal(renewed.history.approvals.length,firstBackup.history.approvals.length+2);for(const old of firstBackup.history.approvals)assert.ok(renewed.history.approvals.some((a)=>a.id===old.id));
  const withdrawal=await command(organizer,{action:'request-withdrawal',roundKey:v.rounds[0].key,competitionId:competition.id,subjectId:pre.subjects[0].id,reason:'Synthetic capacity reduction',pairingPlan:[]}) as {reviewRequestId:string};
  await command(organizer,{action:'approve-request',reviewRequestId:withdrawal.reviewRequestId,requestVersion:1});await command(head,{action:'approve-request',reviewRequestId:withdrawal.reviewRequestId,requestVersion:1});
  v=await api<LiveView>(organizer);const withdrawnVersion=v.version,overWithdrawn=structuredClone(v.setup);overWithdrawn.rounds[1].finalistCount=2;
  const afterWithdrawal=await command(organizer,{action:'setup',setup:overWithdrawn},400);assert.match(String(afterWithdrawal.error),/1 eligible leads and 2 eligible follows/);assert.equal((await api<LiveView>(organizer)).version,withdrawnVersion);

});
