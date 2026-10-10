import test from 'node:test';
import assert from 'node:assert/strict';
import { populateFinalists, setFinalsPair } from '../lib/live/finalists.ts';
import { finalistCountIssues, finalistLimitIssues, freezeRound, roundOpeningIssues, unpairedFinalists } from '../lib/live/validation.ts';
import { stageFixture } from './stage-fixture.ts';

test('approved Strictly advancement copies exact identities/order, preserves settings and heat assignments', () => {
  const setup = stageFixture('auto',6), pre = freezeRound(setup,setup.rounds[0]), f = setup.rounds[1];
  const ids = [pre.subjects[2].id,pre.subjects[0].id];
  f.subjects = [pre.subjects[0]]; f.heats[0].subjectIds = [pre.subjects[0].id];
  f.heats.push({...structuredClone(f.heats[0]),id:'extra-heat',subjectIds:[]});
  const before = structuredClone(setup), result = populateFinalists(setup,pre,ids).rounds[1];
  assert.deepEqual(result.finalistIds,ids);assert.deepEqual(result.subjects,ids.map((id)=>pre.subjects.find((s)=>s.id===id)));
  assert.deepEqual(result.heats[0].subjectIds,[pre.subjects[0].id,pre.subjects[2].id]);
  assert.deepEqual(result.heats[0].songs,f.heats[0].songs);assert.equal(result.heats.length,2);assert.deepEqual(setup,before);
  assert.equal(populateFinalists(setup,pre,ids,[f.id]).rounds[1],f);
  assert.throws(()=>populateFinalists(setup,pre,[ids[0],ids[0]]));assert.throws(()=>populateFinalists(setup,pre,['unknown']));
  assert.throws(()=>populateFinalists(setup,{...pre,withdrawnIds:[ids[0]]},ids));
  assert.equal(populateFinalists({...setup,workflow:undefined},pre,ids).workflow,undefined);
});
test('J&J selects advancing people, retains valid actual draws and never invents pairs', () => {
  const setup=stageFixture('jj'),pre=freezeRound(setup,setup.rounds[4]),f=setup.rounds[5];
  const ids=[pre.subjects[0].id,pre.subjects[3].id];
  assert.deepEqual(populateFinalists(setup,pre,ids).rounds[5].subjects,[]);
  f.subjects=[{id:'actual-pair',number:201,primary:'old',secondary:'old',members:[ids[0],ids[1]]}];f.heats[0].subjectIds=['actual-pair'];
  const result=populateFinalists(setup,pre,ids).rounds[5];
  assert.equal(result.subjects[0].id,'actual-pair');assert.equal(result.subjects[0].primary,pre.subjects[0].primary);assert.deepEqual(result.heats[0].subjectIds,['actual-pair']);
  assert.deepEqual(populateFinalists(setup,pre,[ids[0],pre.subjects[4].id]).rounds[5].subjects,[]);
});

test('selected J&J finalists awaiting the draw have a pairing instruction, not empty-entrant warnings', () => {
  const setup=stageFixture('draw'),pre=freezeRound(setup,setup.rounds[4]);
  const selected=populateFinalists(setup,pre,[pre.subjects[0].id,pre.subjects[3].id]),final=selected.rounds[5];
  assert.deepEqual(unpairedFinalists(selected,final).map((s)=>s.number),[201,204]);
  const issues=roundOpeningIssues(selected,final);assert.equal(issues.length,1);assert.match(issues[0],/Finalists are already selected.*actual Finals draw.*#201.*#204/);
  assert.ok(!issues.some((s)=>s.includes('Add entrants')||s.includes('has no entrants')));assert.throws(()=>freezeRound(selected,final),/actual Finals draw/);
  final.subjects=[{id:'draw-pair',number:201,primary:pre.subjects[0].primary,secondary:pre.subjects[3].primary,members:[pre.subjects[0].id,pre.subjects[3].id]}];final.heats[0].subjectIds=['draw-pair'];
  assert.deepEqual(unpairedFinalists(selected,final),[]);assert.deepEqual(roundOpeningIssues(selected,final),[]);assert.doesNotThrow(()=>freezeRound(selected,final));
  final.heats.push({...structuredClone(final.heats[0]),id:'empty-real-heat',subjectIds:[]});assert.match(roundOpeningIssues(selected,final)[0],/has no entrants/);
});

test('count guidance reports per-role capacity, imbalance and empty groups without silently capping the count', () => {
  const subjects=stageFixture('capacity').rounds[4].subjects.filter((_,i)=>[0,1,3,4].includes(i));
  assert.deepEqual(finalistCountIssues('Jack & Jill',2,subjects),[]);
  assert.match(finalistCountIssues('Jack & Jill',3,subjects)[0],/3 per role \(3 couples \/ 6 dancers\).*2 eligible leads and 2 eligible follows.*Choose 1–2 per role/);
  assert.match(finalistCountIssues('Jack & Jill',2,subjects.slice(0,3))[0],/2 eligible leads and 1 eligible follows.*Choose 1–1 per role/);
  assert.match(finalistCountIssues('Jack & Jill',1,subjects.slice(0,2))[0],/0 eligible follows.*No valid finalist count/);
  assert.match(finalistCountIssues('Strictly',3,subjects.slice(0,2))[0],/3 couples.*2 eligible couples/);
  for(const count of [0,-1,1.5,NaN])assert.match(finalistCountIssues('Jack & Jill',count,subjects)[0],/positive whole-number/);
});


test('saving finalist counts respects eligible couples and the smaller J&J role roster, including withdrawals',()=>{
  const setup=stageFixture('limits',2);
  assert.deepEqual(finalistLimitIssues(setup),[]);
  setup.rounds[1].finalistCount=3;assert.match(finalistLimitIssues(setup)[0],/3 couples.*2 eligible couples/);
  setup.rounds[1].finalistCount=2;setup.rounds[5].finalistCount=3;
  const pre=setup.rounds[4];assert.deepEqual(finalistLimitIssues(setup),[]);
  assert.match(finalistLimitIssues(setup,{[pre.id]:[pre.subjects[0].id]})[0],/2 eligible leads and 3 eligible follows/);
  pre.subjects=pre.subjects.filter((_,i)=>[0,1,3,4].includes(i));assert.match(finalistLimitIssues(setup)[0],/2 eligible leads and 2 eligible follows/);
  setup.rounds[5].finalistCount=2;assert.deepEqual(finalistLimitIssues(setup),[]);
  pre.subjects=[];assert.deepEqual(finalistLimitIssues(setup),[]); // Preparation roster may be incomplete.
  setup.rounds[1].finalistCount=3;assert.deepEqual(finalistLimitIssues({...setup,workflow:undefined}),[]);
});

test('J&J pair-count mismatch is distinct from wrong selected identities',()=>{
  const setup=stageFixture('pair-count'),pre=setup.rounds[4],f=setup.rounds[5];
  f.finalistIds=[pre.subjects[0].id,pre.subjects[3].id];
  f.subjects=[{id:'pair',number:201,primary:pre.subjects[0].primary,secondary:pre.subjects[3].primary,members:[f.finalistIds[0],f.finalistIds[1]]}];f.heats[0].subjectIds=['pair'];
  f.finalistCount=2;assert.throws(()=>freezeRound(setup,f),/Configured 2 Finals couples, but 1 actual pairs are saved/);
  f.finalistCount=1;f.subjects[0].members=[pre.subjects[3].id,pre.subjects[0].id];assert.throws(()=>freezeRound(setup,f),/selected lead and follow identities/);
});


test('actual draw edits preserve existing pair identities, other heat assignments and songs; duplicate or unselected partners fail',()=>{
  const setup=stageFixture('inline-draw'),pre=setup.rounds[4],f=setup.rounds[5];f.finalistCount=2;f.finalistIds=[pre.subjects[0].id,pre.subjects[1].id,pre.subjects[3].id,pre.subjects[4].id];
  f.subjects=[{id:'original',number:201,primary:pre.subjects[0].primary,secondary:pre.subjects[3].primary,members:[pre.subjects[0].id,pre.subjects[3].id]}];
  f.heats[0].subjectIds=[];f.heats.push({...structuredClone(f.heats[0]),id:'second-heat',subjectIds:['original']});
  const before=structuredClone(setup),next=setFinalsPair(setup,f.id,pre.subjects[1].id,pre.subjects[4].id,()=> 'actual-second');
  assert.deepEqual(setup,before);assert.deepEqual(next.rounds[5].subjects[0],f.subjects[0]);assert.deepEqual(next.rounds[5].heats[1].subjectIds,['original']);assert.deepEqual(next.rounds[5].heats[0].subjectIds,['actual-second']);
  assert.deepEqual(next.rounds[5].heats.map((h)=>h.songs),f.heats.map((h)=>h.songs));assert.deepEqual(next.rounds[5].finalistIds,f.finalistIds);
  assert.throws(()=>setFinalsPair(next,f.id,pre.subjects[1].id,pre.subjects[3].id),/already paired/);
  assert.throws(()=>setFinalsPair(next,f.id,pre.subjects[1].id,pre.subjects[5].id),/selected lead and follow/);
  assert.throws(()=>setFinalsPair(next,f.id,pre.subjects[3].id,pre.subjects[0].id),/selected lead and follow/);
  const cleared=setFinalsPair(next,f.id,pre.subjects[1].id,'');assert.deepEqual(cleared.rounds[5].subjects,f.subjects);assert.deepEqual(cleared.rounds[5].heats[1].subjectIds,['original']);assert.deepEqual(cleared.rounds[5].heats[0].subjectIds,[]);
  const retained=setFinalsPair(next,f.id,pre.subjects[0].id,pre.subjects[3].id);assert.equal(retained.rounds[5].subjects.find((s)=>s.members?.[0]===pre.subjects[0].id)!.id,'original');assert.deepEqual(retained.rounds[5].heats[1].subjectIds,['original']);
});
