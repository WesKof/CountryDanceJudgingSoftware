import test from 'node:test';
import assert from 'node:assert/strict';
import {adminAcknowledgement,validateAdminReply} from '../lib/live/admin-ack.ts';
import {owner,localKey,createStage,limitedStage,finish} from './publication-helpers.ts';
import {api,command} from './stage-helpers.ts';
import {testFetch,testEndpoint} from './test-endpoints.ts';
import type {LiveView} from '../lib/live/types.ts';
const input=(action:string,extra:Record<string,unknown>={})=>({action,...extra,adminRequest:{version:1,id:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')}});

test('real owner API binds admin operations, preserves legacy replies and rejects invalid markers before service change',async()=>{
  await owner({action:'service',state:'enabled'});
  const list=input('list');validateAdminReply(await owner(list),list,await adminAcknowledgement(list));
  await owner({action:'service',state:'suspended',adminRequest:{version:2,id:'invalid'}},400);
  assert.equal((await owner({action:'list'})).serviceState,'enabled');
  assert.equal(Object.hasOwn(await owner({action:'list'}),'adminAcknowledgement'),false);
  const pause=input('service',{state:'suspended'});validateAdminReply(await owner(pause),pause,await adminAcknowledgement(pause));assert.equal((await owner({action:'list'})).serviceState,'suspended');
  const retry=input('retry');validateAdminReply(await owner(retry),retry,await adminAcknowledgement(retry));
  await owner({action:'service',state:'enabled'});
});

test('real local admin release confirms the selected public event through fresh authority state and keeps role/session boundaries',async()=>{
  const setup=limitedStage(1,3),{organizer,tokens,head}=await createStage(setup);
  await finish(setup,organizer,tokens,head,false);await command(organizer,{action:'prepare-event-publication'});
  const view=await api<LiveView>(organizer),records=view.publications!,event=records[0].snapshot.eventId,manifest=records.map(p=>({publicationId:p.id,sourceFingerprint:p.sourceFingerprint}));
  assert.notEqual(records[0].competitionId,records[0].snapshot.competitionId);assert.notEqual(view.eventId,event);
  await command(organizer,{action:'approve-event-publication',publications:manifest});
  await owner(input('release-event',{eventId:view.eventId,publications:manifest}),400);
  assert.equal((await api<LiveView>(organizer)).publications![0].status,'requested');
  await owner(input('service',{state:'suspended'}),403,organizer);assert.equal((await owner({action:'list'})).serviceState,'enabled');
  const post=(path:string,body:URLSearchParams,cookie='')=>testFetch('receiver',path,{method:'POST',headers:{Origin:testEndpoint('receiver'),'Content-Type':'application/x-www-form-urlencoded',...(cookie?{Cookie:cookie}:{})},body,redirect:'manual'});
  const signed=await post('/admin/login',new URLSearchParams({credential:localKey('LOCAL_OWNER_KEY'),event}));assert.equal(signed.status,303);const cookie=signed.headers.get('set-cookie')!.split(';')[0];
  const page=await testFetch('receiver','/admin?event='+event,{headers:{Cookie:cookie}}),html=await page.text();assert.equal(page.status,200);const csrf=/name="csrf" value="([^"]+)"/.exec(html)![1];
  try{
    for(const key of ['LOCAL_OWNER_KEY','LOCAL_RECEIVER_KEY'])assert.ok(!html.includes(localKey(key)));
    const released=await post('/admin/action',new URLSearchParams({action:'release-event',event,publications:JSON.stringify(manifest),csrf}),cookie);assert.equal(released.status,303);const destination=new URL(released.headers.get('location')!,testEndpoint('receiver'));assert.equal(destination.searchParams.get('event'),event);assert.match(destination.searchParams.get('notice')!,/Confirmed: this event/);assert.equal((await api<LiveView>(organizer)).publications![0].status,'released');
    const confirmed=await testFetch('receiver',destination.pathname+destination.search,{headers:{Cookie:cookie}});assert.match(await confirmed.text(),/Confirmed: this event/);
    const forged=await testFetch('receiver','/admin?event='+event+'&notice='+encodeURIComponent('Approved and published. FORGED_STATUS_SENTINEL'),{headers:{Cookie:cookie}});assert.ok(!(await forged.text()).includes('FORGED_STATUS_SENTINEL'));
    const paused=await post('/admin/action',new URLSearchParams({action:'service',state:'suspended',event,csrf}),cookie);assert.equal(paused.status,303);assert.match(decodeURIComponent(paused.headers.get('location')!),/Website setting confirmed/);assert.equal((await owner({action:'list'})).serviceState,'suspended');
    const checked=await post('/admin/action',new URLSearchParams({action:'retry',event,csrf}),cookie);assert.equal(checked.status,303);assert.match(decodeURIComponent(checked.headers.get('location')!),/Delivery check complete/);
  }finally{await owner({action:'service',state:'enabled'});await post('/admin/action',new URLSearchParams({action:'logout',csrf}),cookie);}
  const anonymous=await testFetch('receiver','/admin?event='+event,{headers:{Cookie:cookie}});assert.match(await anonymous.text(),/Admin access code/);
});
