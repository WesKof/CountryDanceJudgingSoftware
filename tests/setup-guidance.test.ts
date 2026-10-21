import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleSetup, blankSetup } from '../lib/sample-setup.ts';
import { setupTasks } from '../lib/live/setup-guidance.ts';

test('setup guidance checks all competitions without requiring premature actual Finals draws',()=>{
 const setup=sampleSetup(), original=structuredClone(setup);
 assert.ok(setup.rounds.filter((r)=>r.kind==='finals').every((r)=>r.subjects.length===0));
 assert.ok(setupTasks(setup).every((t)=>t.complete));
 const second=setup.rounds.filter((r)=>r.kind==='prelims')[1];
 second.heats[0].subjectIds=second.heats[0].subjectIds.slice(1);
 const next=setupTasks(setup).find((t)=>!t.complete)!;
 assert.equal(next.roundId,second.id);assert.equal(next.section,'Heat assignments');
 assert.equal(original.rounds.filter((r)=>r.kind==='prelims')[1].heats[0].subjectIds.length,4);
});
test('setup guidance points to missing role verification and the exact finalist count, keeping optional details optional',()=>{
 const blank=blankSetup();assert.equal(setupTasks(blank).find((t)=>!t.complete)?.section,'Program & stages');
 const setup=sampleSetup();setup.judges[1].participantId=setup.organizerParticipantId;
 assert.equal(setupTasks(setup).find((t)=>!t.complete)?.section,'Role verification');
 setup.judges[1].participantId='distinct-panel-person';
 const final=setup.rounds.find((r)=>r.kind==='finals'&&r.finalistCount===1)!;final.finalistCount=3;
 const next=setupTasks(setup).find((t)=>!t.complete)!;
 assert.equal(next.section,'Finalists & pairings');assert.equal(next.roundId,final.prelimRoundId);
 setup.venue='';setup.date='';final.finalistCount=1;assert.ok(setupTasks(setup).every((t)=>t.complete));
});
