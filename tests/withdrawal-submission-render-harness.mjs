import fs from 'node:fs';
import ts from 'typescript';
import {createElement,isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {stageFixture} from './stage-fixture.ts';
import {freezeRound} from '../lib/live/validation.ts';
import {validatePairingPlan} from '../lib/live/eligibility.ts';
const root=new URL('../',import.meta.url),url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
/** @param {'Strictly'|'Jack & Jill'} format @returns {{data: import('../lib/live/types.ts').LiveView & {reviewRequests: import('../lib/live/types.ts').ReviewRequest[]}, selected: string, revision?: import('../lib/live/types.ts').ReviewRequest}} */
export function fixture(format='Strictly',whole=false){
 const setup=stageFixture('withdrawal-audit',6),rounds=setup.rounds.filter(r=>r.kind==='prelims').map(r=>({id:r.id,key:r.id+':1',generation:1,version:2,phase:'discussion',definition:freezeRound(setup,r)})),round=rounds.find(r=>r.definition.format===format),definition=round.definition,subjectId=definition.subjects[0].id;
 const data={eventId:'fictional-withdrawal-event',version:11,status:'active',role:'organizer',judgeId:null,setup,context:{blockId:setup.blocks[0].id,performanceId:null,visited:[]},ballots:[],rounds,reviewRequests:[]};
 const leads=definition.subjects.filter(s=>s.role==='Lead'&&s.id!==subjectId),follows=definition.subjects.filter(s=>s.role==='Follow'&&s.id!==subjectId);
 const pairingPlan=format==='Jack & Jill'?definition.heats.flatMap(h=>h.songs.map((song,index)=>({performanceId:song.id,partners:leads.map((lead,side)=>[lead.id,follows[(index+side)%follows.length].id])}))):[];
 validatePairingPlan(definition,subjectId,data.context,pairingPlan);
 const revision={id:whole?'fictional-whole-request':'fictional-entrant-request',kind:'withdrawal',version:3,payload:whole?{competitionId:definition.competitionId}:{competitionId:definition.competitionId,roundKey:round.key,subjectId,pairingPlan},reason:whole?'Synthetic whole-competition reason':'Synthetic entrant revision reason',requester:setup.organizerParticipantId,createdAt:'2026-10-27T00:00:00Z',approvals:[]};data.reviewRequests.push(revision);
 return{data,selected:round.id,revision};
}
// Actual ResultWithdrawals and actual validatePairingPlan execute. Only the presentation
// SetupSection shell and revealResult DOM side effects are substituted explicitly.
// Hooks/effects and static markup are modeled; no DOM scheduling/native validation proof.
/** @param {ReturnType<typeof fixture>} props @param {(input: Record<string,unknown>)=>Promise<boolean>} action */
export async function harness(props=fixture(),action=async()=>true){
 const buckets=new Map();let current='',index=0,seen=new Set(),tree,lateStateUpdates=0;
 const calls=[],prompts=[],reveals=[],validations=[];let confirmResult=true,idSequence=0;
 const bucket=()=>{seen.add(current);if(!buckets.has(current))buckets.set(current,[]);return buckets.get(current);};
 const hooks={validations,reveals,
 useState(initial){const key=current,values=bucket(),slot=index++;if(!(slot in values))values[slot]=typeof initial==='function'?initial():initial;return[values[slot],value=>{if(buckets.get(key)!==values)lateStateUpdates++;values[slot]=typeof value==='function'?value(values[slot]):value;}];},
 useRef(initial){const values=bucket(),slot=index++;if(!(slot in values))values[slot]={current:initial};return values[slot];},
 useId(){const values=bucket(),slot=index++;if(!(slot in values))values[slot]='withdrawal-audit-'+(++idSequence);return values[slot];},
 useEffect(fn,deps){const values=bucket(),slot=index++,old=values[slot];if(!old||!deps||!old.deps||deps.some((v,i)=>!Object.is(v,old.deps[i])))values[slot]={kind:'effect',fn,deps:deps?[...deps]:undefined,cleanup:old?.cleanup,changed:true};},};
 const key='__withdrawalAudit'+crypto.randomUUID().replaceAll('-','');globalThis[key]=hooks;
 const react=url(`export const {useState,useRef,useId,useEffect}=globalThis[${JSON.stringify(key)}];`);
 const eligibility=url(`import {validatePairingPlan as real} from ${JSON.stringify(new URL('lib/live/eligibility.ts',root).href)};const audit=globalThis[${JSON.stringify(key)}];export function validatePairingPlan(...args){const record={input:structuredClone(args)};audit.validations.push(record);try{const result=real(...args);record.result=structuredClone(result);return result;}catch(error){record.error=error.message;throw error;}}`);
 const section=url(`import {createElement} from ${JSON.stringify(import.meta.resolve('react'))};export default function SetupSection({title,children}){return createElement('section',{'data-audit-section':title},children);}`);
 const reveal=url(`const audit=globalThis[${JSON.stringify(key)}];export function revealResult(id){audit.reveals.push(id);}`);
 let code=ts.transpileModule(fs.readFileSync(new URL('components/live/result-withdrawals.tsx',root),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/from\s*(['"])([^'"]+)\1/g,(_all,_q,specifier)=>{const resolved=specifier==='react'?react:specifier==='react/jsx-runtime'?import.meta.resolve(specifier):specifier==='@/lib/live/eligibility'?eligibility:specifier==='./setup-section'?section:specifier==='./result-details'?reveal:undefined;if(!resolved)throw Error('Unreviewed import '+specifier);return'from '+JSON.stringify(resolved);});
 const {default:ResultWithdrawals}=await import(url(code));delete globalThis[key];
 const originalWindow=globalThis.window;globalThis.window={confirm(message){prompts.push(message);return confirmResult;}};
 function expand(node,path='root'){
 if(Array.isArray(node)){const keys=node.filter(isValidElement).map(n=>n.key).filter(k=>k!==null);if(new Set(keys).size!==keys.length)throw Error('Duplicate explicit sibling keys');return node.map((n,i)=>expand(n,path+'/'+(isValidElement(n)&&n.key!==null?n.key:i)));}
 if(!isValidElement(node))return node;const identity=path+'/'+(node.key??'');if(typeof node.type==='function'){const previous=current,oldIndex=index;current=identity+'/'+node.type.name;index=0;seen.add(current);const value=node.type(node.props);current=previous;index=oldIndex;return expand(value,identity+'/body');}return createElement(node.type,{...node.props,key:node.key},expand(node.props.children,identity+'/children'));
 }
 const nodes=(node,out=[])=>{if(Array.isArray(node))node.forEach(n=>nodes(n,out));else if(isValidElement(node)){out.push(node);nodes(node.props.children,out);}return out;};
 const text=node=>Array.isArray(node)?node.map(text).join(''):isValidElement(node)?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';
 const run=input=>{calls.push(structuredClone(input));return action(input);};
 const instance={get props(){return props;},setProps(value){props=value;},calls,prompts,reveals,validations,text,get lateStateUpdates(){return lateStateUpdates;},setConfirm(value){confirmResult=value;},
 render(){seen=new Set();tree=expand(createElement(ResultWithdrawals,{...props,action:run}));for(const k of buckets.keys())if(!seen.has(k)){buckets.get(k).forEach(v=>{if(v?.kind==='effect')v.cleanup?.();});buckets.delete(k);}for(const values of buckets.values())for(const v of values)if(v?.kind==='effect'&&v.changed){v.cleanup?.();v.cleanup=v.fn();v.changed=false;}return renderToStaticMarkup(tree);},
 async stable(){this.render();await new Promise(resolve=>setImmediate(resolve));return this.render();},
 nodes:()=>nodes(tree),unmount(){for(const values of buckets.values())values.forEach(v=>{if(v?.kind==='effect')v.cleanup?.();});buckets.clear();tree=null;},entrantFieldset(){return this.formNodes().find(n=>n.type==='fieldset');},form(whole=false){return nodes(tree).filter(n=>n.type==='form')[Number(whole)];},formNodes(whole=false){return nodes(this.form(whole));},button(whole=false){return this.formNodes(whole).find(n=>n.type==='button'&&n.props.type!=='button');},reason(whole=false){return this.formNodes(whole).find(n=>n.type==='input');},select(whole=false){return this.formNodes(whole).find(n=>n.type==='select');},subject(){return this.formNodes().find(n=>n.type==='select'&&n.props.name==='subject');},revision(){return this.formNodes().find(n=>n.type==='select'&&n.props['aria-label']==='Revise pending withdrawal (optional)');},
 submit(whole=false){this.form(whole).props.onSubmit({preventDefault(){}});},status(){return nodes(tree).filter(n=>n.props.role==='status').map(text);},
 restore(){for(const values of buckets.values())values.forEach(v=>{if(v?.kind==='effect')v.cleanup?.();});buckets.clear();if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;},};return instance;
}
