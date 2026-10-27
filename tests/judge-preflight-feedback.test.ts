import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './judge-render-harness.mjs';
const flush=async()=>{for(let n=0;n<32;n++)await Promise.resolve();};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
function ready(h:Awaited<ReturnType<typeof harness>>,mode:string){h.render();if(mode==='stage'){const review=h.button(/^Review & submit/)!;assert.ok(review);review.props.onClick();h.render();}const check=h.checkbox();if(check){check.props.onChange({target:{checked:true}});h.render();}const submit=h.button(/^Submit /)!;assert.ok(submit);assert.equal(submit.props.disabled,false);return submit;}
for(const mode of ['legacy','heat','stage'])test(`real ${mode} submission renders checking, disables repeats and restores retry after unavailable read`,async()=>{
 const pending=deferred<unknown>();let reads=0;const h=await harness(mode,()=>{reads++;return pending.promise;});try{const submit=ready(h,mode);submit.props.onClick();const html=h.render(),checking=h.button(/^Checking saved scores/)!;assert.ok(checking);assert.equal(checking.props.disabled,true);assert.match(html,/<div class="save-state" role="status">Checking saved scores…<\/div>/);assert.match(html,/Checking saved scores before submission/);if(mode!=='legacy')assert.equal(h.checkbox()!.props.checked,true);if(mode==='heat')assert.ok(!html.includes('This heat is not available'));if(mode==='legacy')assert.ok(!html.includes('Complete all marks and wait'));if(mode==='stage')assert.ok(!html.includes('>Ready to submit your scores</h2>'));
  // Invoke the captured callback as well as its disabled replacement: the ref owns same-tick repeats.
  submit.props.onClick();checking.props.onClick();assert.equal(reads,1);assert.equal(h.env.posts.length,0);h.env.error='The shared event took too long to respond. Retry the connection.';pending.resolve(null);await flush();const failed=h.render();assert.ok(!failed.includes('Checking saved scores'));assert.match(failed,/Retry the connection/);assert.equal(h.button(/^Submit /)!.props.disabled,false);if(mode!=='legacy')assert.equal(h.checkbox()!.props.checked,true);
 }finally{h.restore();}
});

test('stage checking acknowledgement still requires the current signature and does not lock scoring navigation',async()=>{
 const pending=deferred<unknown>(),h=await harness('stage',()=>pending.promise);try{ready(h,'stage').props.onClick();h.render();assert.equal(h.checkbox()!.props.checked,true);assert.equal(h.button(/^Return to scoring/)!.props.disabled,undefined);const changed=structuredClone(h.env.view);changed.ballots[0].cells[Object.keys(changed.ballots[0].cells)[0]].revision++;h.setView(changed);h.render();assert.equal(h.checkbox()!.props.checked,false);pending.resolve(null);await flush();h.render();assert.equal(h.button(/^Submit /)!.props.disabled,true);}finally{h.restore();}
});

test('stage checking transitions to existing submitting then completed markup without replaying the POST',async()=>{
 const read=deferred<unknown>(),ack=deferred<unknown>();let reads=0;const h=await harness('stage',()=>++reads===1?read.promise:Promise.resolve(h.env.view));try{h.setPost(()=>ack.promise);ready(h,'stage').props.onClick();h.render();read.resolve(h.env.view);await flush();const posting=h.render();assert.ok(!posting.includes('Checking saved scores'));assert.match(posting,/Submitting your stage scores/);assert.equal(h.env.posts.length,1);assert.equal(h.button(/^Submitting/)!.props.disabled,true);
  const complete=structuredClone(h.env.view);for(const round of complete.rounds)round.phase='discussion';for(const ballot of complete.ballots)ballot.locked=true;h.setView({...complete,heatSubmissions:complete.rounds.flatMap(r=>r.definition.heats.map(heat=>({id:heat.id+'-submitted',roundKey:r.key,judgeId:complete.judgeId,heatId:heat.id,version:1,ballotVersion:1,createdAt:'now'})))});ack.resolve({ok:true});await flush();const done=h.render();assert.ok(!done.includes('Checking saved scores'));assert.ok(!done.includes('Submitting your stage scores'));assert.match(done,/Your stage scores are submitted/);assert.equal(h.env.posts.length,1);
 }finally{h.restore();}
});
