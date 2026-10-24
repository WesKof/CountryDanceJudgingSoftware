import { testFetch } from './test-endpoints.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, base, command, nonce, save } from './stage-helpers.ts';
import { createStage, limitedStage, finish } from './publication-helpers.ts';
import type { LiveView, EventSummary } from '../lib/live/types.ts';

async function summary(token:string,expected=200) {
 const response=await fetch(base+'/api/live?summary=1',{headers:{Authorization:'Bearer '+token}});
 assert.equal(response.status,expected);assert.equal(response.headers.get('cache-control'),'no-store, private');
 return response.json() as Promise<EventSummary>;
}
test('organizer archive/return preserves exact approvals, links, snapshots and locked ballots, with private version-guarded catalog reads',async()=>{
 const setup=limitedStage(1,4),{organizer,tokens,head}=await createStage(setup);
 await finish(setup,organizer,tokens,head,false);
 const before=await api<LiveView>(organizer), ballot=await api<LiveView>(tokens[0]);
 const catalog=await summary(organizer);
 assert.deepEqual(Object.keys(catalog).sort(),['competitionCount','date','eventId','name','status','venue','version']);
 assert.equal(catalog.status,'active');assert.equal(catalog.version,before.version);
 await summary(tokens[0],403);await summary(head,403);await summary('invalid-link',403);
 assert.equal((await api<LiveView>(organizer)).version,before.version);
 await command(organizer,{action:'archive'});
 const archived=await api<LiveView>(organizer);assert.equal((await summary(organizer)).status,'archived');
 assert.deepEqual(archived.rounds,before.rounds);assert.deepEqual(archived.heatSubmissions,before.heatSubmissions);
 assert.deepEqual(archived.judgeLinks,before.judgeLinks);
 await command(tokens[0],{action:'reactivate'},403);await command(head,{action:'reactivate'},403);
 await api(organizer,{action:'reactivate',expectedVersion:before.version,requestId:nonce()},409);
 const input={action:'reactivate',expectedVersion:archived.version,requestId:nonce()};
 const first=await api(organizer,input);assert.deepEqual(await api(organizer,input),first);
 const active=await api<LiveView>(organizer);assert.equal(active.status,'active');assert.equal(active.version,archived.version+1);
 assert.deepEqual(active.rounds,before.rounds);assert.deepEqual(active.judgeLinks,before.judgeLinks);
 assert.deepEqual(active.heatSubmissions,before.heatSubmissions);assert.deepEqual((await api<LiveView>(tokens[0])).ballots,ballot.ballots);
 const final=active.rounds.find((r)=>r.definition.kind==='finals')!;
 await save(tokens[0],final,final.definition.heats[0].songs[0].id,final.definition.subjects[0].id,'No','',423);
 await command(organizer,{action:'reactivate'},400);
});
test('concurrent return-to-active requests cannot reactivate a different generation or clear event history',async()=>{
 const {organizer}=await createStage(limitedStage(1,4));await command(organizer,{action:'archive'});
 const archived=await api<LiveView>(organizer);
 const responses=await Promise.all([0,1].map(()=>testFetch('app', '/api/live',{method:'POST',headers:{Authorization:'Bearer '+organizer,'Content-Type':'application/json'},body:JSON.stringify({action:'reactivate',expectedVersion:archived.version,requestId:nonce()})})));
 assert.equal(responses.filter((r)=>r.status===200).length,1);assert.ok(responses.every((r)=>[200,400,409].includes(r.status)));
 const active=await api<LiveView>(organizer);assert.equal(active.version,archived.version+1);assert.deepEqual(active.setup,archived.setup);assert.deepEqual(active.context,archived.context);
});
