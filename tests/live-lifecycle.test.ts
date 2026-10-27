import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {liveFixture} from './live-fixture.ts';
import type {LiveView} from '../lib/live/types.ts';
const view=(version=2):LiveView=>({eventId:'fictional',version,status:'active',role:'organizer',judgeId:null,setup:liveFixture(2),context:{blockId:null,performanceId:null,visited:[]},rounds:[],ballots:[]});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};}
const flush=async()=>{for(let n=0;n<24;n++)await Promise.resolve();};
async function harness(){
 const original={fetch:globalThis.fetch,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,window:globalThis.window};const state:unknown[]=[],pending:(()=>void)[]=[],effects:(()=>()=>void)[]=[];let index=0,now=0,next=1,cleanup:(()=>void)|undefined;const timers=new Map<number,{at:number;fn:()=>void}>();
 const hooks={useState(initial:unknown){const slot=index++;if(!(slot in state))state[slot]=initial;return[state[slot],(value:unknown)=>pending.push(()=>{state[slot]=typeof value==='function'?value(state[slot]):value;})];},useRef(initial:unknown){const slot=index++;if(!(slot in state))state[slot]={current:initial};return state[slot];},useCallback<T>(fn:T){return fn;},useEffect(fn:()=>()=>void){if(!effects.length)effects.push(fn);}};
 const key='__lifecycleHooks'+crypto.randomUUID().replaceAll('-','');(globalThis as unknown as Record<string,unknown>)[key]=hooks;const stub='data:text/javascript;base64,'+Buffer.from(`export const {useState,useCallback,useEffect,useRef}=globalThis[${JSON.stringify(key)}];`).toString('base64');let code=ts.transpileModule(readFileSync(new URL('../components/live/client.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from\s*(['"])([^'"]+)\1/g,(_all:string,_quote:string,specifier:string)=>'from '+JSON.stringify(specifier==='react'?stub:specifier.startsWith('@/')?new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href:import.meta.resolve(specifier)));const client=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete(globalThis as unknown as Record<string,unknown>)[key];
 globalThis.setTimeout=((fn:()=>void,ms=0)=>{const id=next++;timers.set(id,{at:now+ms,fn});return id;}) as unknown as typeof setTimeout;globalThis.clearTimeout=((id:unknown)=>{timers.delete(id as number);}) as typeof clearTimeout;
 const listeners=new Map<string,()=>void>();globalThis.window={addEventListener:(type:string,fn:()=>void)=>listeners.set(type,fn),removeEventListener:(type:string)=>listeners.delete(type)} as unknown as Window&typeof globalThis;
 return{client,timers,listeners,render(){while(pending.length)pending.shift()!();index=0;const hook=client.useLive('PRIVATE_TOKEN_SENTINEL');const[draft,setDraft]=hooks.useState('Unsent local edit');return{...hook,draft,setDraft};},mount(){cleanup=effects[0]();},unmount(){cleanup?.();cleanup=undefined;},async advance(ms:number){const end=now+ms;await flush();while(true){const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();await flush();}now=end;await flush();},restore(){cleanup?.();Object.assign(globalThis,original);if(original.window===undefined)delete(globalThis as unknown as Record<string,unknown>).window;}};
}

test('GET header stall settles at the controlled deadline and aborts only its own read',async()=>{
 const h=await harness();try{let signal:AbortSignal|undefined,calls=0;globalThis.fetch=async(_url,options)=>{calls++;signal=options?.signal as AbortSignal;return new Promise<Response>(()=>{});};let settled=false;const result=h.client.liveApi('fictional').then(()=>{settled=true;return null;},(error:Error)=>{settled=true;return error;});await h.advance(9999);assert.equal(settled,false);assert.equal(signal!.aborted,false);await h.advance(1);const error=await result;assert.match(error!.message,/took too long.*Retry/);assert.equal(signal!.aborted,true);assert.equal(calls,1);assert.equal(h.timers.size,0);}finally{h.restore();}
});

test('GET deadline includes stalled JSON bodies even for HTTP errors and clears completed-read timers',async()=>{
 const h=await harness();try{for(const status of [200,503]){let signal:AbortSignal|undefined;globalThis.fetch=async(_url,options)=>{signal=options?.signal as AbortSignal;return{ok:status===200,status,json:()=>new Promise(()=>{})} as unknown as Response;};const result=h.client.liveApi('fictional').catch((error:Error)=>error);await h.advance(10000);assert.match((await result).message,/took too long/);assert.equal(signal!.aborted,true);assert.equal(h.timers.size,0);}
  for(const response of [()=>Response.json(view()),()=>Response.json({}),()=>new Response('invalid JSON',{status:200})]){globalThis.fetch=async()=>response();await h.client.liveApi('fictional').catch(()=>null);assert.equal(h.timers.size,0);}globalThis.fetch=async()=>{throw Error('PRIVATE_FAILURE');};await assert.rejects(h.client.liveApi('fictional'),/Connection interrupted/);assert.equal(h.timers.size,0);
 }finally{h.restore();}
});

test('POST headers and body retain original timing with no read signal, timeout or retry',async()=>{
 const h=await harness();try{for(const phase of ['headers','body']){const waiting=deferred<unknown>();let calls=0,options:RequestInit|undefined;globalThis.fetch=async(_url,input)=>{calls++;options=input;return phase==='headers'?waiting.promise as Promise<Response>:{ok:true,status:200,json:()=>waiting.promise} as unknown as Response;};let settled=false;const result=h.client.liveApi('fictional',{action:'save-cell'}).then((value:unknown)=>{settled=true;return value;});await h.advance(60000);assert.equal(settled,false);assert.equal(h.timers.size,0);assert.equal(options!.signal,undefined);assert.equal(options!.method,'POST');assert.equal(calls,1);waiting.resolve(phase==='headers'?Response.json({cell:{mark:'No'}}):{cell:{mark:'No'}});assert.deepEqual(await result,{cell:{mark:'No'}});}}finally{h.restore();}
});

for(const phase of ['headers','body'])test(`first ${phase} stall reports retry, resumes the next poll and retains local draft state`,async()=>{
 const h=await harness();try{let calls=0;globalThis.fetch=async()=>{calls++;return phase==='headers'?new Promise<Response>(()=>{}):{ok:true,status:200,json:()=>new Promise(()=>{})} as unknown as Response;};let hook=h.render();h.mount();await h.advance(10000);hook=h.render();assert.equal(hook.data,null);assert.match(hook.error,/took too long/);assert.equal(hook.draft,'Unsent local edit');assert.equal(calls,1);assert.equal(h.timers.size,1);globalThis.fetch=async()=>{calls++;return Response.json(view());};await h.advance(4000);hook=h.render();assert.equal(hook.data.eventId,'fictional');assert.equal(hook.error,'');assert.equal(hook.draft,'Unsent local edit');assert.equal(calls,2);h.unmount();assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);}finally{h.restore();}
});

test('later timed-out body retains trusted data/drafts and ignores a late result after valid retry',async()=>{
 const h=await harness();try{globalThis.fetch=async()=>Response.json(view());let hook=h.render();await hook.refresh();hook=h.render();hook.setDraft({note:'Pending note',setup:'Pending setup'});hook=h.render();const trusted=hook.data,draft=hook.draft,body=deferred<LiveView>();globalThis.fetch=async()=>({ok:true,status:200,json:()=>body.promise} as unknown as Response);const waiting=hook.refresh();await h.advance(10000);assert.equal(await waiting,null);hook=h.render();assert.strictEqual(hook.data,trusted);assert.strictEqual(hook.draft,draft);assert.match(hook.error,/took too long/);globalThis.fetch=async()=>Response.json(view(4));await hook.refresh();hook=h.render();assert.equal(hook.data.version,4);assert.equal(hook.error,'');body.resolve(view(9));await flush();hook=h.render();assert.equal(hook.data.version,4);assert.equal(hook.error,'');assert.strictEqual(hook.draft,draft);assert.equal(h.timers.size,0);}finally{h.restore();}
});

test('old failed or timed-out reads cannot overwrite a newer successful connection; callers retain their own result',async()=>{
 const h=await harness();try{for(const failure of ['reject','timeout']){const old=deferred<Response>();let calls=0;globalThis.fetch=()=>++calls===1?old.promise:Promise.resolve(Response.json(view(5)));let hook=h.render();const first=hook.refresh();const second=await hook.refresh();assert.equal(second.version,5);hook=h.render();assert.equal(hook.error,'');if(failure==='reject')old.reject(Error('PRIVATE_OLD_FAILURE'));else await h.advance(10000);assert.equal(await first,null);hook=h.render();assert.equal(hook.error,'');assert.equal(hook.data.version,5);if(failure==='timeout'){old.reject(Error('PRIVATE_LATE_FAILURE'));await flush();hook=h.render();assert.equal(hook.error,'');}assert.equal(h.timers.size,0);}}finally{h.restore();}
});

test('all validated successes still merge by authoritative version, independent of request order',async()=>{
 const h=await harness();try{const old=deferred<Response>();let calls=0;globalThis.fetch=()=>++calls===1?old.promise:Promise.resolve(Response.json(view(9)));let hook=h.render();const first=hook.refresh();assert.equal((await hook.refresh()).version,9);hook=h.render();old.resolve(Response.json(view(10)));assert.equal((await first).version,10);hook=h.render();assert.equal(hook.data.version,10);assert.equal(hook.error,'');assert.equal(h.timers.size,0);}finally{h.restore();}
});

test('a newer pending read cannot starve an older successful preflight, while its eventual failure remains visible',async()=>{
 const h=await harness();try{const first=deferred<Response>(),second=deferred<Response>();let calls=0;globalThis.fetch=()=>++calls===1?first.promise:second.promise;let hook=h.render();const a=hook.refresh(),b=hook.refresh();first.resolve(Response.json(view(3)));assert.equal((await a).version,3);hook=h.render();assert.equal(hook.data.version,3);assert.equal(hook.error,'');second.reject(Error('new failure'));assert.equal(await b,null);hook=h.render();assert.match(hook.error,/Connection interrupted/);assert.equal(hook.data.version,3);assert.equal(h.timers.size,0);}finally{h.restore();}
});

test('older valid success does not clear a newer completed error and effect cleanup prevents future polling',async()=>{
 const h=await harness();try{const old=deferred<Response>();let calls=0;globalThis.fetch=()=>++calls===1?old.promise:Promise.reject(Error('newer'));let hook=h.render();const first=hook.refresh();assert.equal(await hook.refresh(),null);old.resolve(Response.json(view(10)));assert.equal((await first).version,10);hook=h.render();assert.equal(hook.data.version,10);assert.match(hook.error,/Connection interrupted/);
  globalThis.fetch=async()=>new Promise<Response>(()=>{});h.mount();h.unmount();assert.equal(h.listeners.size,0);await h.advance(10000);assert.equal(h.timers.size,0);assert.equal(calls,2);
 }finally{h.restore();}
});
