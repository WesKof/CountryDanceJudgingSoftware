import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleSetup,blankSetup,isolateSetup} from '../lib/sample-setup.ts';
import {validateSetup,freezeRound} from '../lib/live/validation.ts';

test('sample preparation is stage-ready and independent; finals still require actual advancement',()=>{
 const first=validateSetup(sampleSetup()),second=validateSetup(sampleSetup());
 const pre=first.rounds.filter((r)=>r.kind==='prelims');
 assert.deepEqual(pre.map((r)=>freezeRound(first,r).subjects.length),[4,4]);
 const jj=pre[1];assert.deepEqual(jj.heats[0].songs.map((s)=>s.partners.length),[2,2]);
 assert.equal(new Set([first.organizerParticipantId,...first.judges.map((j)=>j.participantId)]).size,4);
 assert.equal(first.rounds.some((r)=>second.rounds.some((s)=>s.id===r.id)),false);
 for(const final of first.rounds.filter((r)=>r.kind==='finals'))assert.throws(()=>freezeRound(first,final));
 first.rounds[0].subjects[0].primary='Changed sample';assert.equal(second.rounds[0].subjects[0].primary,'Mason Reed');
 const copy=validateSetup(isolateSetup(second));assert.equal(copy.rounds.some((r)=>second.rounds.some((s)=>s.id===r.id)),false);assert.deepEqual(copy.judges.map((j)=>j.participantId),second.judges.map((j)=>j.participantId));for(const r of copy.rounds.filter((r)=>r.kind==='prelims'))freezeRound(copy,r);
 const blank=validateSetup(blankSetup());assert.deepEqual(blank.rounds,[]);assert.deepEqual(blank.judges,[]);assert.equal(blank.separationAttested,false);
});
