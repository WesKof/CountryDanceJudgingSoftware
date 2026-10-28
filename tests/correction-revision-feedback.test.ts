import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,harness} from './correction-revision-render-harness.mjs';
import type {NewCorrectionDraft} from '../components/live/new-correction-draft';

function deferred(){let resolve!:(value:boolean)=>void,reject!:(reason:Error)=>void;const promise=new Promise<boolean>((ok,bad)=>{resolve=ok;reject=bad;});return{promise,resolve,reject};}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const mark='Corrected mark for affected bib', source='Submitted heat / judge', intended='Intended bib for mistaken-bib transfer (optional)';

test('actual revision guards repeated submits synchronously and freezes even captured field handlers',async()=>{
 const wait=deferred(),data=fixture(),original=structuredClone(data),h=await harness(data,()=>wait.promise);
 try{h.render();const form=h.editor(),selectors=h.editorNodes().filter(n=>n.type==='select'),reason=h.reason(),key=h.corrections[0].key;
 h.submitEditor();form.props.onSubmit({preventDefault(){},currentTarget:{syntheticReason:'Synthetic repeat'}});
 for(const select of selectors)select.props.onChange({target:{value:'stale-change'}});reason.props.onChange({target:{value:'stale-reason'}});
 h.render();assert.equal(h.calls.length,1);assert.equal(h.submit().props.disabled,true);assert.equal(h.submit().props['aria-busy'],true);assert.equal(h.text(h.submit()),'Submitting revised correction…');assert.match(h.text(h.editorStatus()),/fields are held/);assert.equal(h.editorStatus().props.role,'status');
 assert.ok(h.editorNodes().filter(n=>n.type==='select'||n.type==='input').every(n=>n.props.disabled));assert.equal(h.select(mark).props.value,'Yes');assert.equal(h.reason().props.value,data.reviewRequests[0].reason);assert.equal(h.corrections[0].key,key);assert.deepEqual(data,original);
 const q=data.reviewRequests[0];assert.deepEqual(h.calls,[{action:'request-correction',roundKey:q.payload.roundKey,heatId:q.payload.heatId,judgeId:q.payload.judgeId,submissionId:q.payload.submissionId,changes:[{performanceId:q.payload.changes![0].performanceId,subjectId:q.payload.changes![0].subjectId,after:'Yes'}],reason:q.reason,reviewRequestId:q.id}]);assert.equal(h.prompts.length,0);
 }finally{wait.resolve(false);await flush();h.restore();}
});

for(const outcome of ['true','false','reject']as const)test(`${outcome} callback retains revision intent without claiming exact acknowledgement`,async()=>{
 const wait=deferred(),h=await harness(fixture(),()=>wait.promise);
 try{h.render();h.select(mark).props.onChange({target:{value:'A1'}});h.reason().props.onChange({target:{value:'Retain revised reason'}});h.render();h.submitEditor();h.render();if(outcome==='reject')wait.reject(Error('PRIVATE_REVISION_ERROR'));else wait.resolve(outcome==='true');await flush();const html=h.render();assert.equal(h.submit().props.disabled,false);assert.equal(h.submit().props['aria-busy'],false);assert.equal(h.text(h.submit()),'Submit revised correction');assert.match(h.text(h.editorStatus()),/Revision is not confirmed.*edits are retained/);assert.equal(h.select(mark).props.value,'A1');assert.equal(h.reason().props.value,'Retain revised reason');assert.doesNotMatch(html,/Correction requested\.|PRIVATE_REVISION_ERROR/);assert.equal(h.calls.length,1);assert.equal(h.data.reviewRequests[0].version,3);
 }finally{wait.resolve(false);await flush();h.restore();}
});

for(const state of ['newer','cancelled','applied','archived','head','judge','removed']as const)test(`authoritative ${state} blocks stale submits, field edits and completion`,async()=>{
 const wait=deferred(),data=fixture(),h=await harness(data,()=>wait.promise);
 try{h.render();const form=h.editor(),oldReason=h.reason();h.submitEditor();const next=structuredClone(data);if(state==='newer')next.reviewRequests[0].version++;else if(state==='cancelled')next.reviewRequests[0].cancelledAt='2026-10-27T00:00:01Z';else if(state==='applied')next.reviewRequests[0].appliedAt='2026-10-27T00:00:01Z';else if(state==='archived')next.status='archived';else if(state==='removed')next.reviewRequests=[];else{next.role=state;next.judgeId=next.setup.headJudgeId;}
 h.setData(next);h.render();form.props.onSubmit({preventDefault(){},currentTarget:{syntheticReason:'Stale send'}});oldReason.props.onChange({target:{value:'Stale edit'}});assert.equal(h.calls.length,1);if(state==='newer')assert.equal(h.corrections[0].key,'fictional-request/4');else assert.equal(h.editor(data.reviewRequests[0].id),undefined);wait.resolve(true);await flush();const html=h.render();assert.doesNotMatch(html,/Stale edit|Revision is not confirmed|Submitting revised correction/);assert.equal(h.lateStateUpdates,0);assert.equal(h.calls.length,1);
 }finally{wait.resolve(false);await flush();h.restore();}
});

for(const changed of ['event','person','round','request','version','source']as const)test(`${changed} target owns its new attempt independently of old settlement`,async()=>{
 const first=deferred(),second=deferred();let count=0;const data=fixture(),h=await harness(data,()=>++count===1?first.promise:second.promise);
 try{h.render();const old=h.editor(),oldReason=h.reason();h.submitEditor();const original=structuredClone(h.calls[0]),next=structuredClone(data);if(changed==='event')next.eventId+='-other';else if(changed==='person')next.setup.organizerParticipantId+='-other';else if(changed==='round'){const oldKey=next.rounds[0].key;next.rounds[0].key+='-other';next.reviewRequests[0].payload.roundKey=next.rounds[0].key;next.heatSubmissions!.filter(s=>s.roundKey===oldKey).forEach(s=>s.roundKey=next.rounds[0].key);}else if(changed==='request')next.reviewRequests[0].id+='-other';else if(changed==='source'){next.heatSubmissions![0].id='fictional-source-replacement';next.heatSubmissions![0].version++;}else next.reviewRequests[0].version++;
 h.setData(next);h.render();old.props.onSubmit({preventDefault(){},currentTarget:{syntheticReason:'Old target'}});oldReason.props.onChange({target:{value:'Old field'}});assert.equal(h.calls.length,1);if(changed==='source'){assert.equal(h.select(source).props.value,'');h.select(source).props.onChange({target:{value:'fictional-source-replacement'}});h.render();}h.submitEditor();h.render();first.resolve(true);await flush();h.render();assert.equal(h.calls.length,2);assert.equal(h.submit().props.disabled,true);assert.equal(h.reason().props.value,data.reviewRequests[0].reason);assert.deepEqual(h.calls[0],original);assert.equal(h.lateStateUpdates,0);second.resolve(false);await flush();h.render();assert.match(h.text(h.editorStatus()),/not confirmed/);
 }finally{first.resolve(false);second.resolve(false);await flush();h.restore();}
});

test('other request cards and approval/cancellation remain independent while a revision waits',async()=>{
 const wait=deferred(),data=fixture();data.reviewRequests.push({...structuredClone(data.reviewRequests[0]),id:'fictional-second'});const h=await harness(data,()=>wait.promise);
 try{h.render();h.submitEditor();h.render();assert.equal(h.submit('fictional-second').props.disabled,false);assert.equal(h.approval().props.disabled,false);assert.equal(h.cancellation().props.disabled,false);h.approval().props.onClick();h.cancellation().props.onClick();h.submitEditor('fictional-second');h.render();assert.equal(h.calls.length,4);assert.equal(h.prompts.length,1);assert.equal(h.actionKeys.length,2);for(const keys of h.actionKeys)assert.notEqual(keys.approval,keys.cancellation);assert.equal(new Set([h.submit().props['aria-describedby'],h.approval().props['aria-describedby'],h.cancellation().props['aria-describedby']]).size,3);
 }finally{wait.resolve(false);await flush();h.restore();}
});

test('approval and cancellation waiting do not exclude a revision',async()=>{
 const wait=deferred(),h=await harness(fixture(),()=>wait.promise);try{h.render();h.approval().props.onClick();h.cancellation().props.onClick();h.render();assert.equal(h.submit().props.disabled,false);assert.equal(h.reason().props.disabled,false);h.submitEditor();h.render();assert.equal(h.calls.filter(c=>c.action==='request-correction').length,1);}finally{wait.resolve(false);await flush();h.restore();}
});

test('reentrant Action callback cannot resubmit or edit fields before render',async()=>{
 const wait=deferred();const h:Awaited<ReturnType<typeof harness>>=await harness(fixture(),()=>{h.submitEditor();h.reason().props.onChange({target:{value:'Reentrant edit'}});return wait.promise;});try{h.render();h.submitEditor();h.render();assert.equal(h.calls.length,1);assert.equal(h.reason().props.value,h.data.reviewRequests[0].reason);}finally{wait.resolve(false);await flush();h.restore();}
});

for(const boundary of ['event-return','archive-return']as const)test(`${boundary} does not resurrect an old wait or old captured handlers`,async()=>{
 const first=deferred(),second=deferred();let count=0;const data=fixture(),h=await harness(data,()=>++count===1?first.promise:second.promise);
 try{h.render();const old=h.editor(),oldReason=h.reason();h.submitEditor();const away=structuredClone(data);if(boundary==='event-return')away.eventId+='-away';else away.status='archived';h.setData(away);h.render();h.setData(structuredClone(data));h.render();assert.equal(h.submit().props.disabled,false);old.props.onSubmit({preventDefault(){},currentTarget:{syntheticReason:'Old returned handler'}});oldReason.props.onChange({target:{value:'Old returned field'}});h.render();assert.equal(h.calls.length,1);assert.equal(h.reason().props.value,data.reviewRequests[0].reason);h.submitEditor();h.render();first.resolve(true);await flush();h.render();assert.equal(h.calls.length,2);assert.equal(h.submit().props.disabled,true);assert.equal(h.lateStateUpdates,0);
 }finally{first.resolve(false);second.resolve(false);await flush();h.restore();}
});

for(const value of ['No','']as const)test(`revision tuple preserves ${value==='No'?'No':'blank'} and recorded mistaken-bib transfer`,async()=>{
 const h=await harness();try{h.render();const round=h.data.rounds[0],heat=round.definition.heats[0],other=heat.subjectIds[1];h.select(mark).props.onChange({target:{value}});h.select(intended).props.onChange({target:{value:other}});h.render();h.submitEditor();await flush();h.render();assert.deepEqual(h.calls[0].changes,[{performanceId:heat.songs[0].id,subjectId:heat.subjectIds[0],after:value},{performanceId:heat.songs[0].id,subjectId:other,after:'No'}]);assert.equal(h.calls[0].submissionId,'fictional-submission');assert.equal('requestVersion'in h.calls[0],false);}finally{h.restore();}
});

test('same wrong/intended bib retains existing validation without an action',async()=>{
 const h=await harness();try{h.render();h.select(intended).props.onChange({target:{value:h.data.rounds[0].definition.heats[0].subjectIds[0]}});h.render();h.submitEditor();h.render();assert.equal(h.calls.length,0);assert.match(h.text(h.editorStatus()),/must be distinct/);assert.equal(h.submit().props.disabled,false);}finally{h.restore();}
});

test('replaced submitted heat requires explicit selection while retaining reason and proposed mark',async()=>{
 const data=fixture(),h=await harness(data);try{h.render();h.reason().props.onChange({target:{value:'Retained source reason'}});h.select(mark).props.onChange({target:{value:'A2'}});h.render();const old=h.editor(),next=structuredClone(data);next.heatSubmissions![0].id='fictional-replacement';next.heatSubmissions![0].version++;h.setData(next);const html=h.render();assert.equal(h.select(source).props.value,'');assert.match(html,/selected submitted heat was replaced/);h.submitEditor();assert.equal(h.calls.length,0);old.props.onSubmit({preventDefault(){},currentTarget:{syntheticReason:'Old source send'}});assert.equal(h.calls.length,0);h.select(source).props.onChange({target:{value:'fictional-replacement'}});h.render();assert.equal(h.reason().props.value,'Retained source reason');assert.equal(h.select(mark).props.value,'A2');h.submitEditor();await flush();h.render();assert.equal(h.calls[0].submissionId,'fictional-replacement');assert.equal(h.calls[0].reason,'Retained source reason');}finally{h.restore();}
});

test('deliberate retry after settlement sends only when requested and uses retained edits',async()=>{
 const h=await harness();try{h.render();h.submitEditor();await flush();h.render();h.render();assert.equal(h.calls.length,1);h.reason().props.onChange({target:{value:'Deliberate retry'}});h.render();h.submitEditor();await flush();h.render();assert.equal(h.calls.length,2);assert.equal(h.calls[1].reason,'Deliberate retry');assert.equal(h.prompts.length,0);}finally{h.restore();}
});

test('managed new correction keeps its own draft/controller contract and markup',async()=>{
 const data=fixture();data.rounds[0].standings={rows:[],ties:[],complete:true,submitted:3,required:3,fingerprint:'fictional',decisions:[],approved:false};const h=await harness(data),changes:unknown[]=[],requests:unknown[]=[];let discarded=0;const round=data.rounds[0],fields={source:'fictional-submission',songId:round.definition.heats[0].songs[0].id,subjectId:round.definition.heats[0].subjectIds[0],mark:'Yes' as const,intended:'',reason:'Managed draft reason'};
 const draft:NewCorrectionDraft={target:round,fields,generation:0,pending:false,notice:'Managed draft notice',change:(...args)=>{changes.push(args);},discard:()=>{discarded++;},request:async(...args)=>{requests.push(args);},setNotice:()=>{}};
 try{h.setManagedDraft(draft);let html=h.render();assert.match(html,/New correction draft|Draft ends on reload/);assert.equal(h.text(h.submit()),'Request correction');h.reason().props.onChange({target:{value:'Managed edit'}});assert.equal(changes.length,1);h.submitEditor();await flush();assert.equal(requests.length,1);assert.equal(h.calls.length,0);h.setManagedDraft({...draft,pending:true});html=h.render();assert.equal(h.submit().props.disabled,true);assert.equal(h.text(h.submit()),'Requesting correction…');assert.equal(h.submit().props['aria-busy'],undefined);assert.equal(discarded,0);assert.doesNotMatch(html,/Submitting revised correction|Revision is not confirmed/);}finally{h.restore();}
});

test('unmanaged non-revise correction retains its previous acknowledgement behavior',async()=>{
 const h=await harness();try{h.setDirect(true);h.render();assert.equal(h.text(h.submit()),'Request correction');h.submitEditor();await flush();const html=h.render();assert.match(html,/Correction requested\./);assert.equal(h.calls[0].reviewRequestId,undefined);assert.equal(h.submit().props['aria-busy'],undefined);}finally{h.restore();}
});
