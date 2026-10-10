import test from 'node:test';
import assert from 'node:assert/strict';
import {api,command} from './stage-helpers.ts';
import {createStage,limitedStage,finish,exact,owner,fault,receiver,localKey} from './publication-helpers.ts';
import {latestPublications,type PublicationRecord} from '../lib/live/publication.ts';
import type {LiveView} from '../lib/live/types.ts';
const manifest=(records:PublicationRecord[])=>records.map((p)=>({publicationId:p.id,sourceFingerprint:p.sourceFingerprint}));
test('complete-event approval is exact, permission checked, atomic, durable and revision aware',async(t)=>{
 await owner({action:'service',state:'enabled'});await fault(false);
 const setup=limitedStage(2,4);setup.name='Synthetic complete-event approval';const {organizer,tokens,head}=await createStage(setup);
 let v=await finish(setup,organizer,tokens,head,true);
 await t.test('incomplete event creates no partial preparation and judges cannot publish',async()=>{
  await command(organizer,{action:'prepare-event-publication'},400);assert.equal((await api<LiveView>(organizer)).publications!.length,0);
  await command(tokens[0],{action:'prepare-event-publication'},403);await command(head,{action:'approve-event-publication',publications:[]},403);
 });
 await exact(head,v.rounds.filter((r)=>r.definition.kind==='finals')[1].id,'approve');await command(organizer,{action:'prepare-event-publication'});v=await api<LiveView>(organizer);let records=latestPublications(v.publications!);
 await t.test('one request needs every exact current preview; duplicate and partial lists change nothing',async()=>{
  assert.equal(records.length,2);assert.equal(records[0].snapshot.stages[1].entrants[0].average,10);
  await command(organizer,{action:'approve-event-publication',publications:manifest(records.slice(0,1))},400);
  await command(organizer,{action:'approve-event-publication',publications:manifest([records[0],records[0]])},400);
  await command(organizer,{action:'approve-event-publication',publications:manifest(records).map((p,i)=>i?{...p,sourceFingerprint:'changed'}:p)},400);
  assert.ok((await api<LiveView>(organizer)).publications!.every((p)=>p.status==='prepared'));
  await command(organizer,{action:'approve-event-publication',publications:manifest(records)});
 });
 await t.test('website authority rejects organizer credentials, omitted results and unrequested drafts',async()=>{
  const listed=await owner({action:'list'}),scopes=listed.events as Record<string,{competitionIds:string[];active:boolean}>;assert.equal(scopes[records[0].snapshot.eventId].competitionIds.length,2);assert.equal(scopes[records[0].snapshot.eventId].active,true);
  await owner({action:'release-event',publications:manifest(records)},403,organizer);
  await owner({action:'release-event',publications:manifest(records.slice(0,1))},400);
  const other=await createStage(limitedStage(1,4));await finish(limitedStage(1,4),other.organizer,other.tokens,other.head,false);await command(other.organizer,{action:'prepare-event-publication'});const foreign=(await api<LiveView>(other.organizer)).publications![0];
  await owner({action:'release-event',publications:manifest([records[0],foreign])},400);
  await owner({action:'release-event',publications:manifest([foreign])},400);
  assert.ok((await api<LiveView>(organizer)).publications!.every((p)=>p.status==='requested'));
 });
 await t.test('outage queues the whole event and receiver switches all scopes together on retry',async()=>{
  await fault(true);await owner({action:'release-event',publications:manifest(records)});assert.ok((await api<LiveView>(organizer)).publications!.every((p)=>p.status==='queued'));
  assert.ok(!JSON.stringify(await(await fetch(receiver+'/api/public')).json()).includes(records[0].id));
  await fault(false);
  const queued=(await api<LiveView>(organizer)).publications!,invalid=structuredClone(queued);invalid[1].snapshot.stages[1].entrants[0].average=999;
  const before=await(await fetch(receiver+'/api/public')).text();
  const rejected=await fetch(receiver+'/receive',{method:'POST',headers:{Authorization:'Bearer '+localKey('LOCAL_RECEIVER_KEY'),'Content-Type':'application/json'},body:JSON.stringify({deliveryId:crypto.randomUUID(),kind:'release-set',payload:invalid})});assert.equal(rejected.status,409);assert.equal(await(await fetch(receiver+'/api/public')).text(),before);
  await owner({action:'retry'});assert.ok((await api<LiveView>(organizer)).publications!.every((p)=>p.status==='released'));
  const data=await(await fetch(receiver+'/api/public')).json() as {current:Record<string,string>};for(const p of records)assert.equal(data.current[p.snapshot.eventId+'/'+p.snapshot.competitionId],p.id);
  await owner({action:'release-event',publications:manifest(records)},400);
 });
 await t.test('changed results require renewed approvals; unaffected published competition stays unchanged',async()=>{
  v=await api<LiveView>(organizer);const r=v.rounds.find((r)=>r.definition.kind==='finals')!,h=r.definition.heats[0],sub=v.heatSubmissions!.find((s)=>s.roundKey===r.key&&s.judgeId===setup.judges[0].id)!;
  const q=await command(organizer,{action:'request-correction',roundKey:r.key,heatId:h.id,judgeId:sub.judgeId,submissionId:sub.id,changes:[{performanceId:h.songs[0].id,subjectId:h.subjectIds[0],after:'A1'}],reason:'PRIVATE_SET_REASON'}) as {reviewRequestId:string};
  await command(organizer,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});await command(head,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});
  await owner({action:'release-event',publications:manifest(records)},400);await command(organizer,{action:'prepare-event-publication'},400);await exact(head,r.id,'approve');
  await command(organizer,{action:'prepare-event-publication'});v=await api<LiveView>(organizer);const revised=latestPublications(v.publications!);assert.equal(revised.find((p)=>p.competitionId===r.definition.competitionId)!.revision,2);
  await command(organizer,{action:'approve-event-publication',publications:manifest(records)},400);await command(organizer,{action:'approve-event-publication',publications:manifest(revised)});await owner({action:'release-event',publications:manifest(revised)});
  const changed=revised.find((p)=>p.revision===2)!;assert.ok(Math.abs(changed.snapshot.stages[1].entrants[0].average!-(4.5+10+10)/3)<1e-9);const publicData=JSON.stringify(await(await fetch(receiver+'/api/public')).json());assert.ok(publicData.includes(changed.id)&&publicData.includes(records[0].id));assert.ok(!publicData.includes('PRIVATE_SET_REASON')&&!publicData.includes('PUBLICATION_PRIVATE_NOTE_SENTINEL'));
  records=revised;
 });
 await t.test('receiver rejects malformed event batches without any public pointer changes',async()=>{
  const before=await(await fetch(receiver+'/api/public')).text();const p=records[0],body={deliveryId:crypto.randomUUID(),kind:'release-set',payload:[{...p,status:'queued',organizerApprovedAt:'now',ownerApprovedAt:'now'},{...p,status:'queued',organizerApprovedAt:'now',ownerApprovedAt:'now'}]};
  const response=await fetch(receiver+'/receive',{method:'POST',headers:{Authorization:'Bearer '+localKey('LOCAL_RECEIVER_KEY'),'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,409);assert.equal(await(await fetch(receiver+'/api/public')).text(),before);
 });
});

test('queued event correction invalidates the entire undelivered set and permits a fresh complete request',async()=>{
 await owner({action:'service',state:'enabled'});await fault(true);
 try{
  const setup=limitedStage(2,4),{organizer,tokens,head}=await createStage(setup);let v=await finish(setup,organizer,tokens,head,false);
  await command(organizer,{action:'prepare-event-publication'});v=await api<LiveView>(organizer);const old=latestPublications(v.publications!);await command(organizer,{action:'approve-event-publication',publications:manifest(old)});await owner({action:'release-event',publications:manifest(old)});
  const r=v.rounds.find((r)=>r.definition.kind==='finals')!,h=r.definition.heats[0],sub=v.heatSubmissions!.find((s)=>s.roundKey===r.key&&s.judgeId===setup.judges[0].id)!;
  const q=await command(organizer,{action:'request-correction',roundKey:r.key,heatId:h.id,judgeId:sub.judgeId,submissionId:sub.id,changes:[{performanceId:h.songs[0].id,subjectId:h.subjectIds[0],after:'A1'}],reason:'Synthetic queued set correction'}) as {reviewRequestId:string};await command(organizer,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});await command(head,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});
  assert.ok((await api<LiveView>(organizer)).publications!.every((p)=>p.status==='stale'));
  await exact(head,r.id,'approve');await command(organizer,{action:'prepare-event-publication'});v=await api<LiveView>(organizer);const fresh=latestPublications(v.publications!);assert.ok(fresh.every((p)=>p.status==='prepared'&&!old.some((o)=>o.id===p.id)));
  await command(organizer,{action:'approve-event-publication',publications:manifest(fresh)});await fault(false);await owner({action:'release-event',publications:manifest(fresh)});assert.ok(latestPublications((await api<LiveView>(organizer)).publications!).every((p)=>p.status==='released'));
  const publicData=JSON.stringify(await(await fetch(receiver+'/api/public')).json());assert.ok(old.every((p)=>!publicData.includes(p.id)));assert.ok(fresh.every((p)=>publicData.includes(p.id)));
 }finally{await fault(false);}
});
test('website admin session is private and rejects anonymous, cross-origin and forged approvals',async()=>{
 const post=(path:string,body:URLSearchParams,cookie='',origin=receiver)=>fetch(receiver+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,...(cookie?{Cookie:cookie}:{})},body,redirect:'manual'});
 const signed=await post('/admin/login',new URLSearchParams({credential:localKey('LOCAL_OWNER_KEY')}));assert.equal(signed.status,303);const cookie=signed.headers.get('set-cookie')!;assert.ok(cookie.includes('HttpOnly')&&cookie.includes('SameSite=Strict'));const session=cookie.split(';')[0];
 const html=await(await fetch(receiver+'/admin',{headers:{Cookie:session}})).text();assert.ok(!html.includes(localKey('LOCAL_OWNER_KEY'))&&!html.includes(localKey('LOCAL_RECEIVER_KEY'))&&!html.includes('PUBLICATION_PRIVATE_NOTE_SENTINEL'));
 const csrf=/name="csrf" value="([^"]+)"/.exec(html)![1];
 assert.equal((await post('/admin/action',new URLSearchParams({action:'release-event',csrf,publications:'[]'}))).status,403);
 assert.equal((await post('/admin/action',new URLSearchParams({action:'retry',csrf}),session,'http://untrusted.invalid')).status,403);
 assert.equal((await post('/admin/action',new URLSearchParams({action:'retry',csrf:'forged'}),session)).status,403);
 assert.equal((await post('/admin/action',new URLSearchParams({action:'release-event',csrf,publications:'[]'}),session)).status,409);
 assert.equal((await post('/admin/action',new URLSearchParams({action:'logout',csrf}),session)).status,303);
 const after=await(await fetch(receiver+'/admin',{headers:{Cookie:session}})).text();assert.ok(after.includes('Admin access code'));
});

test('a change to an unchanged published competition cancels another competition’s queued event revision',async()=>{
 await owner({action:'service',state:'enabled'});await fault(false);const setup=limitedStage(2,4),{organizer,tokens,head}=await createStage(setup);await finish(setup,organizer,tokens,head,false);
 const review=async()=>{await command(organizer,{action:'prepare-event-publication'});const v=await api<LiveView>(organizer),records=latestPublications(v.publications!);await command(organizer,{action:'approve-event-publication',publications:manifest(records)});await owner({action:'release-event',publications:manifest(records)});return records;};
 const correct=async(competitionId:string)=>{const v=await api<LiveView>(organizer),r=v.rounds.find((r)=>r.definition.kind==='finals'&&r.definition.competitionId===competitionId)!,h=r.definition.heats[0],sub=v.heatSubmissions!.find((s)=>s.roundKey===r.key&&s.judgeId===setup.judges[0].id)!;const q=await command(organizer,{action:'request-correction',roundKey:r.key,heatId:h.id,judgeId:sub.judgeId,submissionId:sub.id,changes:[{performanceId:h.songs[0].id,subjectId:h.subjectIds[0],after:'A1'}],reason:'Synthetic event-scope correction'}) as {reviewRequestId:string};await command(organizer,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});await command(head,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});await exact(head,r.id,'approve');};
 const original=await review();
 try{
  await correct(setup.competitions[0].id);await fault(true);const pending=await review(),queued=pending.find((p)=>p.revision===2)!;
  assert.equal((await api<LiveView>(organizer)).publications!.find((p)=>p.id===queued.id)!.status,'queued');
  await correct(setup.competitions[1].id);assert.equal((await api<LiveView>(organizer)).publications!.find((p)=>p.id===queued.id)!.status,'stale');
  await fault(false);await owner({action:'retry'});const before=await(await fetch(receiver+'/api/public')).json() as {current:Record<string,string>};for(const p of original)assert.equal(before.current[p.snapshot.eventId+'/'+p.snapshot.competitionId],p.id);
  const renewed=await review();assert.ok(renewed.every((p)=>p.revision===2&&p.id!==queued.id));assert.ok(latestPublications((await api<LiveView>(organizer)).publications!).every((p)=>p.status==='released'));
 }finally{await fault(false);}
});
