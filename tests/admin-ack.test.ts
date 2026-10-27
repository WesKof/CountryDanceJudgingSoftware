import test from 'node:test';
import assert from 'node:assert/strict';
import {adminAcknowledgement,validateAdminReply,readAdminReply,releaseNotice} from '../lib/live/admin-ack.ts';
import {ownerPublication} from '../lib/live/server.ts';
import type {PublicationRecord} from '../lib/live/publication.ts';

const request=(action:string,extra:Record<string,unknown>={})=>({action,...extra,adminRequest:{version:1,id:'a'.repeat(64)}});
const record=(n=0):PublicationRecord=>({id:'publication-'+n,competitionId:'operational-'+n,revision:1,sourceFingerprint:'fingerprint-'+n,status:'released',organizerApprovedAt:'2026-10-27T12:00:00Z',ownerApprovedAt:'2026-10-27T12:01:00Z',releasedAt:'2026-10-27T12:02:00Z',snapshot:{id:'publication-'+n,competitionId:'public-competition-'+n,eventId:'public-event-'+n,revision:1,supersedes:null,schemaVersion:1,scoringVersion:'equal-judge-stage-v1',event:{name:'Synthetic community',venue:'Fictional hall',date:''},competition:{format:'Strictly',division:'Beginner'},preparedAt:'2026-10-27T11:00:00Z',headApproval:[],changeSummary:'Head-approved results',sourceFingerprint:'fingerprint-'+n,stages:[]}});
const listing=(publications:PublicationRecord[]=[])=>({publications,enabled:true,serviceState:'enabled',events:Object.fromEntries(publications.map(p=>[p.snapshot.eventId,{competitionIds:[p.competitionId],active:true}]))});

test('admin acknowledgements bind nonce, action, exact public event/manifest and requested state',async()=>{
  const input=request('release-event',{eventId:'public-event',publications:[{publicationId:'snapshot',sourceFingerprint:'fingerprint'}]}),ack=await adminAcknowledgement(input);
  for(const changed of [{...input,action:'retry'},{...input,eventId:'other'},{...input,publications:[{publicationId:'other',sourceFingerprint:'fingerprint'}]},{...input,adminRequest:{version:1,id:'b'.repeat(64)}}]){
    if(changed.action==='retry')await assert.rejects(adminAcknowledgement(changed));else assert.notEqual((await adminAcknowledgement(changed)).requestDigest,ack.requestDigest);
  }
  for(const context of [{version:2,id:'a'.repeat(64)},{version:1,id:'short'},{version:1,id:'a'.repeat(64)+'\n'},{version:1,id:'a'.repeat(64),constructor:true},{version:1,id:'a'.repeat(64),toString:true}])await assert.rejects(adminAcknowledgement({...request('list'),adminRequest:context}));
  let writes=0;const db={prepare(){writes++;throw new Error('No write expected');}} as unknown as D1Database;
  for(const context of [{version:2,id:'a'.repeat(64)},{version:1,id:'a'.repeat(64)+'\n'}])await assert.rejects(ownerPublication(db,{action:'service',state:'suspended',adminRequest:context},{enabled:true,receiverUrl:'http://127.0.0.1:3110',receiverKey:'fiction-only'}));assert.equal(writes,0);
});

test('strict operation schemas reject missing fields, wrong operations, prototype keys and coerced enums',async()=>{
  const input=request('list'),ack=await adminAcknowledgement(input),good={...listing([record()]),adminAcknowledgement:ack};
  assert.equal(validateAdminReply(good,input,ack).publications![0].competitionId,'operational-0');
  for(const bad of [{},{...good,constructor:true},{...good,toString:true},{...good,serviceState:['enabled']},{...good,publications:[{...record(),status:['released']}]},{...good,events:{}},{...good,enabled:false},{...good,adminAcknowledgement:{...ack,accepted:'true'}},{...good,adminAcknowledgement:{...ack,action:'retry'}},{...good,adminAcknowledgement:{...ack,requestId:'b'.repeat(64)}},{...good,adminAcknowledgement:{...ack,constructor:true}},{...good,publications:[{...record(),privateNotes:'never expose'}]},{...good,publications:[{...record(),snapshot:{...record().snapshot,eventId:'constructor'}}]}])assert.throws(()=>validateAdminReply(bad,input,ack));
  const service=request('service',{state:'suspended'}),serviceAck=await adminAcknowledgement(service);
  assert.throws(()=>validateAdminReply({ok:true,state:'enabled',adminAcknowledgement:serviceAck},service,serviceAck));
  await assert.rejects(adminAcknowledgement(request('service',{state:['suspended']})));
  const retry=request('retry'),retryAck=await adminAcknowledgement(retry);
  for(const data of [{ok:true},{ok:true,pending:0},{ok:true,pending:-1,delivered:0},{ok:true,pending:0,delivered:0.5}])assert.throws(()=>validateAdminReply({...data,adminAcknowledgement:retryAck},retry,retryAck));
});

test('bounded response reader accepts genuine large fictional history and distinguishes tiny action replies',async()=>{
  const input=request('list'),ack=await adminAcknowledgement(input),records=Array.from({length:300},(_,n)=>{const p=record(n);p.snapshot.event.name='Synthetic '+'.'.repeat(7990);p.snapshot.event.venue='Fictional '+'.'.repeat(7990);return p;}),body={...listing(records),adminAcknowledgement:ack};
  const encoded=JSON.stringify(body);assert.ok(new TextEncoder().encode(encoded).length>4_600_000);
  assert.equal((await readAdminReply(Response.json(body),input,ack)).publications!.length,300);
  const retry=request('retry'),expected=await adminAcknowledgement(retry);
  for(const response of [new Response('PRIVATE_RESPONSE_SENTINEL',{headers:{'content-type':'application/json'}}),new Response(null),new Response('{}',{headers:{'content-type':'text/html'}}),new Response(' '.repeat(4097),{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'4097'}}),Response.json({ok:true,delivered:0,pending:0,adminAcknowledgement:expected},{status:403})])await assert.rejects(readAdminReply(response,retry,expected),error=>!String(error).includes('PRIVATE_RESPONSE_SENTINEL'));
  let cancelled=false;const never=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{}'));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}});
  await assert.rejects(readAdminReply(never,retry,expected,20));assert.equal(cancelled,true);
  const invalidUtf8=new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}});await assert.rejects(readAdminReply(invalidUtf8,retry,expected));
});

test('selected-event notice ignores unrelated global pending and never publishes empty or changed targets',async()=>{
  const p=record(),input=request('list'),ack=await adminAcknowledgement(input),reply=validateAdminReply({...listing([p]),adminAcknowledgement:ack},input,ack),manifest=[{publicationId:p.id,sourceFingerprint:p.sourceFingerprint}];
  assert.match(releaseNotice({...reply,pending:9},p.snapshot.eventId,manifest),/Confirmed/);
  for(const target of [[],[...manifest,...manifest],[{publicationId:'other',sourceFingerprint:p.sourceFingerprint}]])assert.doesNotMatch(releaseNotice(reply,p.snapshot.eventId,target),/Confirmed/);
  assert.doesNotMatch(releaseNotice(reply,'constructor',manifest),/Confirmed/);
  const changed=structuredClone(reply);changed.publications![0].underReview=true;assert.doesNotMatch(releaseNotice(changed,p.snapshot.eventId,manifest),/Confirmed/);
  for(const status of ['prepared','released'] as const){const historical=structuredClone(reply),next=structuredClone(p);next.id='new-version';next.snapshot.id=next.id;next.revision=2;next.snapshot.revision=2;next.snapshot.preparedAt='2026-10-27T14:00:00Z';next.status=status;historical.publications!.push(next);assert.doesNotMatch(releaseNotice(historical,p.snapshot.eventId,manifest),/Confirmed/);}
  const queued=structuredClone(reply);queued.publications![0].status='queued';assert.match(releaseNotice(queued,p.snapshot.eventId,manifest),/Sending is pending/);
});

test('delivery checks are a nonce-bound opt-in with bounded public event counts and exact old reply compatibility',async()=>{
  const event='p-'+'a'.repeat(24),p=record();p.snapshot.eventId=event;
  const old=request('list'),oldAck=await adminAcknowledgement(old),oldBody={...listing([p]),adminAcknowledgement:oldAck};assert.equal(Object.hasOwn(validateAdminReply(oldBody,old,oldAck),'unconfirmedDeliveries'),false);
  const input=request('list',{includeDeliveryChecks:true}),ack=await adminAcknowledgement(input);assert.notEqual(ack.requestDigest,oldAck.requestDigest);
  const body={...listing([p]),adminAcknowledgement:ack,unconfirmedDeliveries:{[event]:2}};assert.equal(validateAdminReply(body,input,ack).unconfirmedDeliveries![event],2);
  const manifest=[{publicationId:p.id,sourceFingerprint:p.sourceFingerprint}];assert.doesNotMatch(releaseNotice(validateAdminReply(body,input,ack),event,manifest),/Confirmed/);
  const other=record(1);other.snapshot.eventId='p-'+'b'.repeat(24);const unrelated={...listing([p,other]),adminAcknowledgement:ack,unconfirmedDeliveries:{[other.snapshot.eventId]:1}};assert.match(releaseNotice(validateAdminReply(unrelated,input,ack),event,manifest),/Confirmed/);
  assert.throws(()=>validateAdminReply({...oldBody,unconfirmedDeliveries:{}},old,oldAck));assert.throws(()=>validateAdminReply({...body,unconfirmedDeliveries:undefined},input,ack));
  for(const counts of [[],{[event]:-1},{[event]:0.5},{[event]:Number.MAX_SAFE_INTEGER+1},{[event]:['1']},{['p-'+'b'.repeat(24)]:1},{[event+'\n']:1},{constructor:1},{'raw-event-uuid':1}])assert.throws(()=>validateAdminReply({...body,unconfirmedDeliveries:counts},input,ack));
  assert.throws(()=>validateAdminReply({...body,unconfirmedDeliveries:Object.fromEntries(Array.from({length:4097},(_,n)=>['p-'+n.toString(16).padStart(24,'0'),0]))},input,ack));
  for(const includeDeliveryChecks of [false,'true',[],null])await assert.rejects(adminAcknowledgement(request('list',{includeDeliveryChecks})));
  await assert.rejects(adminAcknowledgement(request('retry',{includeDeliveryChecks:true})));
});
