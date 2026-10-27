import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {isLiveView} from '../lib/live/view-validation.ts';
import {liveFixture} from './live-fixture.ts';
import {freezeRound} from '../lib/live/validation.ts';
import type {LiveView} from '../lib/live/types.ts';
function fixture():LiveView {const setup=liveFixture(2);return {eventId:'fictional-event',version:2,status:'active',role:'organizer',judgeId:null,setup,context:{blockId:null,performanceId:null,visited:[]},rounds:[{id:'r',key:'r:1',generation:1,version:1,phase:'discussion',definition:freezeRound(setup,setup.rounds[0]),standings:{rows:[],ties:[],complete:false,submitted:0,required:2,fingerprint:'current',decisions:[],approved:false}}],ballots:[{roundKey:'r:1',judgeId:'j',version:3,locked:false,cells:{'song:s':{mark:'No',note:'Retain this private draft',revision:3,mutationId:'acknowledged'}}}]};}
async function harness(){
 const state:unknown[]=[],pending:(()=>void)[]=[];let index=0;
 const hooks={useState(initial:unknown){const slot=index++;if(!(slot in state))state[slot]=typeof initial==='function'?initial():initial;return[state[slot],(value:unknown)=>pending.push(()=>{state[slot]=typeof value==='function'?value(state[slot]):value;})];},useCallback<T>(callback:T){return callback;},useEffect(){}};
 const key='__liveReadHooks'+crypto.randomUUID().replaceAll('-','');(globalThis as unknown as Record<string,unknown>)[key]=hooks;
 const stub='data:text/javascript;base64,'+Buffer.from(`export const {useState,useCallback,useEffect}=globalThis[${JSON.stringify(key)}];`).toString('base64');
 let code=ts.transpileModule(readFileSync(new URL('../components/live/client.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/from\s*(['"])([^'"]+)\1/g,(_all:string,_quote:string,specifier:string)=>'from '+JSON.stringify(specifier==='react'?stub:specifier.startsWith('@/')?new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href:import.meta.resolve(specifier)));
 const client=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete(globalThis as unknown as Record<string,unknown>)[key];
 const render=()=>{while(pending.length)pending.shift()!();index=0;const live=client.useLive('PRIVATE_TOKEN_SENTINEL');const [draft,setDraft]=hooks.useState('Unsaved organizer/judge edit');return {...live,draft,setDraft};};return{client,render};
}

test('structural read guard accepts incomplete/role-filtered views, optional omissions and compatible additions without changing content',()=>{
 const good=fixture();assert.equal(isLiveView(good),true);assert.equal(isLiveView({...good,resultAudit:[{id:'audit',context:'Result review',at:'now',actor:'Head judge',title:'Retained display',outcome:'Recorded',details:[],marks:[{entrant:'Fictional couple',song:'Song',mark:'Historical display label'}]}]}),true);const blank:LiveView={...good,setup:{name:'New event',venue:'',date:'',headJudgeId:'',judges:[],competitions:[],rounds:[],blocks:[]},rounds:[],ballots:[]};assert.equal(isLiveView(blank),true);
 const filtered={...blank,role:'judge',judgeId:'j',setup:{...blank.setup,workflow:'stage-v1'},publicationDeliveryUnconfirmed:false,newCompatibleField:{future:true},restoredHistory:{uninterpreted:['opaque']}};assert.equal(isLiveView(filtered),true);assert.equal(isLiveView({...filtered,status:'archived'}),true);assert.equal(isLiveView({...filtered,publicationDeliveryUnconfirmed:true}),true);assert.equal(good.ballots[0].cells['song:s'].mark,'No');assert.equal(good.ballots[0].cells['song:s'].note,'Retain this private draft');
});

test('read guard rejects malformed core and present known nested collections before display or merge',()=>{
 const good=fixture(),cases:unknown[]=[null,[],{}, {role:'organizer'}, {...good,version:'2'}, {...good,status:'unknown'}, {...good,setup:null}, {...good,context:{visited:[]}}, {...good,rounds:null}, {...good,ballots:{}}, {...good,role:'owner'}, {...good,publicationDeliveryUnconfirmed:[]}, {...good,judgeLinks:[{}]}, {...good,heatSubmissions:[{}]}, {...good,reviewRequests:[{payload:{changes:[]}}]}, {...good,publications:[{snapshot:{stages:[]}}]}, {...good,resultAudit:[{details:null}]}];
 const mutate=(change:(copy:LiveView)=>void)=>{const copy=structuredClone(good);change(copy);cases.push(copy);};
 mutate(v=>{(v.setup as unknown as Record<string,unknown>).judges=null;});mutate(v=>{(v.setup.rounds[0] as unknown as Record<string,unknown>).heats={};});mutate(v=>{(v.rounds[0].definition.heats[0].songs[0] as unknown as Record<string,unknown>).partners=[['one']];});mutate(v=>{(v.rounds[0] as unknown as Record<string,unknown>).definition={};});mutate(v=>{(v.rounds[0].standings as unknown as Record<string,unknown>).rows=[{}];});mutate(v=>{(v.rounds[0].standings as unknown as Record<string,unknown>).advancementTies=[{votes:[]}];});mutate(v=>{(v.rounds[0] as unknown as Record<string,unknown>).liveScores=[{marks:null}];});mutate(v=>{(v.rounds[0] as unknown as Record<string,unknown>).draftProgress=[{missing:[{}]}];});mutate(v=>{(v.ballots[0] as unknown as Record<string,unknown>).cells=null;});mutate(v=>{(v.ballots[0].cells['song:s'] as unknown as Record<string,unknown>).revision='3';});
 for(const value of cases)assert.equal(isLiveView(value),false);
});

test('successful GETs reject malformed JSON views generically while generic POST acknowledgements stay unchanged',async()=>{
 const {client}=await harness(),original=globalThis.fetch;try{
  for(const value of [{},null,[],{setup:{PRIVATE_PAYLOAD_SENTINEL:true}}, {...fixture(),rounds:[null]}]){globalThis.fetch=async()=>Response.json(value);await assert.rejects(client.liveApi('PRIVATE_TOKEN_SENTINEL'),(error:unknown)=>error instanceof client.ApiError&&(error as {status:number}).status===502&&(error as Error).message==='The shared event is temporarily unavailable. Retry the connection.');}
  for(const ack of [{},{ok:true},{path:'/live/fictional'},{cell:{mark:'No'}},{format:'backup'}]){globalThis.fetch=async()=>Response.json(ack);assert.deepEqual(await client.liveApi('fictional',{action:'test-operation'}),ack);}
  globalThis.fetch=async()=>new Response('not JSON',{status:200});await assert.rejects(client.liveApi('fictional'),/temporarily unavailable/);globalThis.fetch=async()=>{throw Error('PRIVATE_NETWORK_SENTINEL');};await assert.rejects(client.liveApi('fictional'),/Connection interrupted/);
 }finally{globalThis.fetch=original;}
});

test('first malformed read stays unloaded with a truthful error and successful retry restores data',async()=>{
 const {render}=await harness(),original=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({});let hook=render();assert.equal(await hook.refresh(),null);hook=render();assert.equal(hook.data,null);assert.match(hook.error,/temporarily unavailable.*Retry/);assert.equal(hook.draft,'Unsaved organizer/judge edit');globalThis.fetch=async()=>Response.json(fixture());assert.equal((await hook.refresh()).eventId,'fictional-event');hook=render();assert.equal(hook.data.eventId,'fictional-event');assert.equal(hook.error,'');assert.equal(hook.draft,'Unsaved organizer/judge edit');}finally{globalThis.fetch=original;}
});

test('later malformed reads preserve last-good object and local drafts until retry; valid delayed cells still merge normally',async()=>{
 const {render}=await harness(),original=globalThis.fetch;try{globalThis.fetch=async()=>Response.json(fixture());let hook=render();await hook.refresh();hook=render();hook.setDraft({note:'Still unsaved',setup:'Retain pending setup'});hook=render();const trusted=hook.data,draft=hook.draft;
  for(const bad of [{}, {...fixture(),setup:{}}, {...fixture(),rounds:[{...fixture().rounds[0],standings:{rows:null}}]}, {...fixture(),ballots:[{...fixture().ballots[0],cells:{bad:null}}]}]){globalThis.fetch=async()=>Response.json(bad);assert.equal(await hook.refresh(),null);hook=render();assert.strictEqual(hook.data,trusted);assert.strictEqual(hook.draft,draft);assert.match(hook.error,/temporarily unavailable/);assert.ok(!hook.error.includes('PRIVATE_TOKEN_SENTINEL'));}
  const delayed=fixture();delayed.ballots[0].version=2;delayed.ballots[0].cells['song:s']={mark:'Yes',note:'Stale',revision:2,mutationId:'older'};globalThis.fetch=async()=>Response.json(delayed);await hook.refresh();hook=render();assert.equal(hook.data.ballots[0].cells['song:s'].mark,'No');assert.equal(hook.data.ballots[0].cells['song:s'].revision,3);assert.equal(hook.data.ballots[0].cells['song:s'].note,'Retain this private draft');assert.strictEqual(hook.draft,draft);assert.equal(hook.error,'');
 }finally{globalThis.fetch=original;}
});
