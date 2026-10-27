import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join, sep, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStage, limitedStage, finish, owner, localKey, exact } from './publication-helpers.ts';
import { api, command } from './stage-helpers.ts';
import { testFetch } from './test-endpoints.ts';
import { deliveryAcknowledgement, confirmsDelivery, readDeliveryReceipt, type DeliveryEnvelope } from '../lib/live/delivery-ack.ts';
import { buildPublicSnapshot, latestPublications } from '../lib/live/publication.ts';
import type { LiveView } from '../lib/live/types.ts';

test('durable release-set retries require exact acknowledgement after file failure, lost response and legacy/mismatched HTTP200', async () => {
  const store = process.env.LOCAL_TEST_RECEIVER_STORE;
  assert.ok(store, 'Require the exact owned fictional store.');
  const fault = async (acknowledgement = 'normal') => { const response = await testFetch('receiver', '/test/fault', { method: 'POST', headers: { Authorization: 'Bearer '+localKey('LOCAL_RECEIVER_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ unavailable: false, acknowledgement }) }); assert.equal(response.status, 200); };
  await fault(); await owner({ action: 'service', state: 'enabled' });
  const setup = limitedStage(2, 3), { organizer, tokens, head } = await createStage(setup);
  await finish(setup, organizer, tokens, head, false);
  await command(organizer, { action: 'prepare-event-publication' });
  const records = (await api<LiveView>(organizer)).publications!;
  await command(organizer, { action: 'approve-event-publication', publications: records.map((p) => ({ publicationId: p.id, sourceFingerprint: p.sourceFingerprint })) });
  const before = readFileSync(store, 'utf8');
  // A directory at the task-owned temporary FILE path makes the real write fail.
  mkdirSync(store+'.tmp');
  try { const result = await owner({ action: 'release-event', publications: records.map((p) => ({ publicationId: p.id, sourceFingerprint: p.sourceFingerprint })) }); assert.ok(Number(result.pending) > 0); assert.equal(readFileSync(store, 'utf8'), before); }
  finally { rmdirSync(store+'.tmp'); }
  try {
    await fault('drop'); assert.ok(Number((await owner({ action: 'retry' })).pending) > 0);
    const committed = readFileSync(store, 'utf8');
    const saved = JSON.parse(committed) as { receipts: Record<string, string> };
    const delivery = Object.values(saved.receipts).map((raw) => JSON.parse(raw) as DeliveryEnvelope).find((m) => m.kind === 'release-set' && JSON.stringify(m.payload).includes(records[0].id));
    assert.ok(delivery);
    for (const mode of ['wrong', 'missing']) {
      await fault(mode); assert.ok(Number((await owner({ action: 'retry' })).pending) > 0);
      assert.equal(readFileSync(store, 'utf8'), committed);
      assert.ok((await api<LiveView>(organizer)).publications!.every((p) => p.status === 'queued'));
    }
    await fault(); await Promise.all([owner({ action: 'retry' }),owner({ action: 'retry' }),owner({ action: 'retry' })]);
    assert.equal((await owner({ action: 'retry' })).pending, 0);
    assert.ok((await api<LiveView>(organizer)).publications!.every((p) => p.status === 'released'));
    assert.ok((await api<LiveView>(organizer)).publications!.every((p) => !p.underReview),'Concurrent retry must not downgrade a delivered outbox row or invent review.');
    assert.equal(readFileSync(store, 'utf8'), committed);
    const send = () => testFetch('receiver', '/receive', { method: 'POST', headers: { Authorization: 'Bearer '+localKey('LOCAL_RECEIVER_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify(delivery) });
    const expected = await deliveryAcknowledgement(delivery);
    const first = await send(), second = await send();
    assert.deepEqual(await first.clone().json(), await second.clone().json());
    assert.equal(await confirmsDelivery(first, expected), true);
    assert.equal(await confirmsDelivery(second, expected), true);
    // An old sender can still rely on HTTP200; persisted receipt strings are unchanged.
    assert.equal(readFileSync(store, 'utf8'), committed);
    const view = await api<LiveView>(organizer), round = view.rounds.find((r) => r.definition.kind === 'finals')!, heat = round.definition.heats[0];
    const submission = view.heatSubmissions!.find((s) => s.roundKey === round.key && s.judgeId === setup.judges[0].id)!;
    const request = await command(organizer, { action: 'request-correction', roundKey: round.key, heatId: heat.id, judgeId: submission.judgeId, submissionId: submission.id, changes: [{ performanceId: heat.songs[0].id, subjectId: heat.subjectIds[0], after: 'A1' }], reason: 'Synthetic acknowledgement status check' }) as { reviewRequestId: string };
    await command(organizer, { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    await command(head, { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    const priorSync = (await api<LiveView>(organizer)).publications!.find((p) => p.id === records[0].id)!.lastSynchronizedAt;
    for (const mode of ['missing', 'wrong']) {
      await fault(mode); assert.ok(Number((await owner({ action: 'retry' })).pending) > 0);
      assert.equal((await api<LiveView>(organizer)).publications!.find((p) => p.id === records[0].id)!.lastSynchronizedAt, priorSync);
    }
    const noticeStore = readFileSync(store, 'utf8');
    await fault(); assert.equal((await owner({ action: 'retry' })).pending, 0);
    assert.notEqual((await api<LiveView>(organizer)).publications!.find((p) => p.id === records[0].id)!.lastSynchronizedAt, priorSync);
    assert.equal(readFileSync(store, 'utf8'), noticeStore);
  } finally { await fault(); }
});

test('receipt-only lookup is authenticated, read-only, conflict-aware and serialized after an in-flight delivery', async () => {
  const file = process.env.LOCAL_TEST_RECEIVER_STORE; assert.ok(file);
  const send = (message: DeliveryEnvelope, lookup = true, key = localKey('LOCAL_RECEIVER_KEY')) => testFetch('receiver', '/receive', { method: 'POST', headers: { Authorization: 'Bearer '+key, 'Content-Type': 'application/json', ...(lookup ? { 'X-Publication-Receipt-Only': '1' } : {}) }, body: JSON.stringify(message) });
  const fault = async (body: object) => { const r = await testFetch('receiver', '/test/fault', { method: 'POST', headers: { Authorization: 'Bearer '+localKey('LOCAL_RECEIVER_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); assert.equal(r.status, 200); return r.json() as Promise<{held:number}>; };
  const message: DeliveryEnvelope = { deliveryId: crypto.randomUUID(), kind: 'status', payload: { id: crypto.randomUUID(), eventId: 'synthetic-event', competitionId: 'synthetic-competition', revision: 1 } }, expected = await deliveryAcknowledgement(message);
  const before = readFileSync(file, 'utf8');
  assert.equal(await readDeliveryReceipt(await send(message), expected), false);
  assert.equal((await send(message, true, 'invalid')).status, 403);
  assert.equal(readFileSync(file, 'utf8'), before);
  await fault({hold:true});
  let delivery: Promise<Response> | undefined, lookup: Promise<Response> | undefined;
  try {
    delivery = send(message, false);
    for (let n=0;n<100;n++) { if ((await fault({inspect:true})).held === 1) break; await new Promise((r)=>setTimeout(r,10)); }
    assert.equal((await fault({inspect:true})).held, 1);
    let complete = false; lookup = send(message).then((response)=>{complete=true;return response;});
    await new Promise((r)=>setTimeout(r,30)); assert.equal(complete, false);
    await fault({hold:false});
    assert.equal(await confirmsDelivery(await delivery, expected), true);
    assert.equal(await readDeliveryReceipt(await lookup, expected), true);
    const committed = readFileSync(file, 'utf8');
    assert.equal((await send({...message,payload:{different:true}})).status,409);
    assert.equal(await readDeliveryReceipt(await send(message), expected), true);
    assert.equal(readFileSync(file, 'utf8'), committed);
  } finally { await fault({hold:false}); await Promise.allSettled([delivery,lookup].filter((p):p is Promise<Response>=>Boolean(p))); }
});

test('ambiguous committed correction waits for exact receipt, repairs wrong drafts and prepares revision2 under an event-version guard', async () => {
  const fault = async (acknowledgement='normal') => { const r=await testFetch('receiver','/test/fault',{method:'POST',headers:{Authorization:'Bearer '+localKey('LOCAL_RECEIVER_KEY'),'Content-Type':'application/json'},body:JSON.stringify({unavailable:false,acknowledgement})});assert.equal(r.status,200); };
  await fault(); await owner({action:'service',state:'enabled'});
  try {
    const setup=limitedStage(1,3),{organizer,tokens,head}=await createStage(setup);
    await finish(setup,organizer,tokens,head,false);await command(organizer,{action:'prepare-event-publication'});
    const original=(await api<LiveView>(organizer)).publications![0], manifest=[{publicationId:original.id,sourceFingerprint:original.sourceFingerprint}];
    await command(organizer,{action:'approve-event-publication',publications:manifest});await fault('missing');await owner({action:'release-event',publications:manifest});
    await command(organizer,{action:'prepare-event-publication'});
    assert.equal((await api<LiveView>(organizer)).publications!.length,1,'Unchanged queued preparation remains idempotent.');
    let view=await api<LiveView>(organizer);const round=view.rounds.find(r=>r.definition.kind==='finals')!,heat=round.definition.heats[0],sub=view.heatSubmissions!.find(s=>s.roundKey===round.key&&s.judgeId===setup.judges[0].id)!;
    const q=await command(organizer,{action:'request-correction',roundKey:round.key,heatId:heat.id,judgeId:sub.judgeId,submissionId:sub.id,changes:[{performanceId:heat.songs[0].id,subjectId:heat.subjectIds[0],after:'A1'}],reason:'Synthetic ambiguous commit correction'}) as {reviewRequestId:string};
    await command(organizer,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});await command(head,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});await exact(head,round.id,'approve');
    await command(organizer,{action:'prepare-event-publication'},400);
    for(const mode of ['missing','wrong']){await fault(mode);assert.ok(Number((await owner({action:'retry'})).pending)>0);await command(organizer,{action:'prepare-event-publication'},400);}
    // Seed one historical pre-fix draft only into the explicitly owned fictional D1.
    const d1=process.env.LOCAL_TEST_D1_STORE;assert.ok(d1,'Set the exact fresh owned D1 root for historical repair verification.');
    const base=resolve(d1);assert.ok(base.startsWith(resolve('work')+sep));assert.equal(base,join(dirname(resolve(process.env.LOCAL_TEST_RECEIVER_STORE!)),'d1'),'D1 and public store must belong to the same explicitly owned fresh fixture.');
    const find=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(x=>{assert.equal(x.isSymbolicLink(),false);const f=join(dir,x.name);return x.isDirectory()?find(f):f.endsWith('.sqlite')?[f]:[];});
    const candidates=find(base).filter(f=>/[\\/]d1[\\/]miniflare-D1DatabaseObject[\\/][a-f0-9]{64}\.sqlite$/.test(f));assert.equal(candidates.length,1);
    view=await api<LiveView>(organizer);const id=crypto.randomUUID(),snapshot=await buildPublicSnapshot(view,setup.competitions[0].id,1,null,new Date().toISOString(),id);
    const draft={id,competitionId:setup.competitions[0].id,revision:1,sourceFingerprint:snapshot.sourceFingerprint,snapshot,status:'requested',organizerApprovedAt:new Date().toISOString()};
    const db=new DatabaseSync(candidates[0]);try{db.prepare('INSERT INTO live_publication_snapshots (id,event_id,competition_id,data) VALUES (?,?,?,?)').run(id,view.eventId,draft.competitionId,JSON.stringify(draft));}finally{db.close();}
    const staleVersion=(await api<LiveView>(organizer)).version,receiverBefore=JSON.parse(readFileSync(process.env.LOCAL_TEST_RECEIVER_STORE!,'utf8'));
    await fault();await owner({action:'service',state:'suspended'});await owner({action:'retry'});
    view=await api<LiveView>(organizer);assert.ok(view.version>staleVersion);
    assert.equal(view.publications!.find(p=>p.id===id)!.status,'stale');
    assert.equal(view.publications!.find(p=>p.id===original.id)!.status,'released');assert.equal(view.publications!.find(p=>p.id===original.id)!.underReview,true);
    assert.deepEqual(JSON.parse(readFileSync(process.env.LOCAL_TEST_RECEIVER_STORE!,'utf8')).current,receiverBefore.current);
    await api(organizer,{action:'prepare-event-publication',expectedVersion:staleVersion,requestId:crypto.randomUUID()},409);
    await command(organizer,{action:'prepare-event-publication'});view=await api<LiveView>(organizer);const next=latestPublications(view.publications!)[0];
    assert.equal(next.revision,2);assert.equal(next.snapshot.supersedes,original.id);assert.equal(next.organizerApprovedAt,undefined);assert.equal(next.ownerApprovedAt,undefined);
    const currentManifest=[{publicationId:next.id,sourceFingerprint:next.sourceFingerprint}];await command(organizer,{action:'approve-event-publication',publications:currentManifest});await owner({action:'release-event',publications:currentManifest},400);
    await owner({action:'service',state:'enabled'});await owner({action:'release-event',publications:currentManifest});
    assert.equal(latestPublications((await api<LiveView>(organizer)).publications!)[0].status,'released');
  } finally {await fault();await owner({action:'service',state:'enabled'});}
});

test('a late normal acknowledgement cannot clear review or downgrade an already reconciled delivery', async () => {
  const fault=async(body:object={})=>{const r=await testFetch('receiver','/test/fault',{method:'POST',headers:{Authorization:'Bearer '+localKey('LOCAL_RECEIVER_KEY'),'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json() as Promise<{heldResponses:number}>;};
  await fault();await owner({action:'service',state:'enabled'});
  let sending:Promise<unknown>|undefined;
  try{
   for(const beforeLookup of [true,false]){
    const setup=limitedStage(1,3),{organizer,tokens,head}=await createStage(setup);await finish(setup,organizer,tokens,head,false);await command(organizer,{action:'prepare-event-publication'});
    let view=await api<LiveView>(organizer);const original=view.publications![0],manifest=[{publicationId:original.id,sourceFingerprint:original.sourceFingerprint}];await command(organizer,{action:'approve-event-publication',publications:manifest});
    await fault({acknowledgement:'late'});sending=owner({action:'release-event',publications:manifest});
    for(let n=0;n<100;n++){if((await fault({inspect:true})).heldResponses===1)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal((await fault({inspect:true})).heldResponses,1);
    view=await api<LiveView>(organizer);const round=view.rounds.find(r=>r.definition.kind==='finals')!,heat=round.definition.heats[0],sub=view.heatSubmissions!.find(s=>s.roundKey===round.key&&s.judgeId===setup.judges[0].id)!;
    const q=await command(organizer,{action:'request-correction',roundKey:round.key,heatId:heat.id,judgeId:sub.judgeId,submissionId:sub.id,changes:[{performanceId:heat.songs[0].id,subjectId:heat.subjectIds[0],after:'A1'}],reason:'Synthetic late acknowledgement'}) as {reviewRequestId:string};await command(organizer,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});await command(head,{action:'approve-request',reviewRequestId:q.reviewRequestId,requestVersion:1});
    if(beforeLookup){await fault();await sending;assert.equal((await api<LiveView>(organizer)).publications![0].status,'stale');const blocked=await command(organizer,{action:'prepare-event-publication'},400);assert.match(String(blocked.error),/Retry sending/);}
    await fault({flush:false});await owner({action:'retry'});assert.equal((await api<LiveView>(organizer)).publications![0].underReview,true);
    const before=JSON.parse(readFileSync(process.env.LOCAL_TEST_RECEIVER_STORE!,'utf8')).current;
    await fault();await sending;await owner({action:'retry'});
    const after=(await api<LiveView>(organizer)).publications![0];assert.equal(after.status,'released');assert.equal(after.underReview,true);assert.equal(after.id,original.id);assert.deepEqual(JSON.parse(readFileSync(process.env.LOCAL_TEST_RECEIVER_STORE!,'utf8')).current,before);
   }
  }finally{await fault();if(sending)await sending;}
});
