import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleSetup } from '../lib/sample-setup.ts';
import { roleVerificationIssues, roundOpeningIssues } from '../lib/live/validation.ts';
import { setupTasks } from '../lib/live/setup-guidance.ts';
import { harness as judgeHarness } from './judge-render-harness.mjs';
import { fixture, harness as deskHarness } from './organizer-review-render-harness.mjs';
test('attestation cannot hide missing identity, normalized duplicates, name or confirmation requirements',()=>{
 const setup=sampleSetup(),original=structuredClone(setup);
 assert.deepEqual(roleVerificationIssues(setup),[]);
 setup.organizerParticipantId=' ';setup.judges[1].participantId='';
 assert.equal(setup.separationAttested,true);
 assert.match(roleVerificationIssues(setup).join(' '),/organizer participant identifier/);
 assert.match(roleVerificationIssues(setup).join(' '),new RegExp(setup.judges[1].name));
 const task=setupTasks(setup).find(t=>t.id==='panel')!;assert.equal(task.complete,false);assert.equal(task.section,'Role verification');assert.match(task.detail,/participant identifier/);
 assert.match(roundOpeningIssues(setup,setup.rounds[0]).join(' '),/Set up → Role verification/);
 setup.organizerParticipantId=original.organizerParticipantId;setup.judges[1].participantId=' '+original.organizerParticipantId!.toUpperCase()+' ';
 assert.match(roleVerificationIssues(setup).join(' '),/unique participant identifier/);
 setup.organizerName=' ';setup.separationAttested=false;
 assert.match(roleVerificationIssues(setup).join(' '),/organizer name/);assert.match(roleVerificationIssues(setup).join(' '),/Confirm/);
 assert.deepEqual(roleVerificationIssues(original),[]);assert.ok(setupTasks(original).every(t=>t.complete));
});
for(const mode of ['stage','legacy'])test(`${mode} judge initial absence uses neutral compact shell, retry and role denial remain`,async()=>{
 let reads=0;const h=await judgeHarness(mode,async()=>{reads++;return null;});try{const saved=h.env.view;h.setView(null);const initial=h.render();assert.match(initial,/judge-focused-shell/);assert.match(initial,/Opening judge page/);assert.doesNotMatch(initial,/Competition navigation|Judge ballot/);assert.equal(h.env.posts.length,0);h.env.error='Unavailable';const failed=h.render();assert.match(failed,/Unavailable/);h.button(/^Retry$/)!.props.onClick();assert.equal(reads,1);h.env.error='';h.setView(saved);const ready=h.render();assert.doesNotMatch(ready,/Opening judge page/);assert.match(ready,new RegExp(saved.setup.judges[0].name));h.setView({...saved,role:'organizer'});assert.match(h.render(),/individual judge link/);assert.equal(h.env.posts.length,0);}finally{h.restore();}
});
test('idle judge links are compact with full head identity; active scoring retains meaningful status',async()=>{
 const view=fixture();view.rounds=[];view.setup.organizerParticipantId='';const h=await deskHarness(view);try{const html=h.render();assert.match(html,/Complete Role verification/);assert.match(html,/Head Judge —/);assert.ok(h.cards().every(c=>c.props.className.includes('is-idle')));for(const j of view.setup.judges)assert.ok(html.includes(j.name));const action=h.nodes().find(n=>n.type==='button'&&h.text(n)==='Complete Role verification')!;action.props.onClick();h.render();assert.equal(h.env.page,0);assert.ok(h.nodes().some(n=>n.props.initialSection==='Role verification'));assert.equal(h.env.posts.length,0);}finally{h.restore();}
});

test('real Setup highlights incomplete attested identities, retains frozen fieldsets and reveals the exact nested section',async()=>{
 const {readFileSync}=await import('node:fs'),{default:ts}=await import('typescript'),{createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const root=new URL('../',import.meta.url),url=(s:string)=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
 const compile=(file:string,section?:string)=>url(ts.transpileModule(readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from\s*(['"])([^'"]+)\1/g,(_a,_q,specifier)=>'from '+JSON.stringify(specifier==='./setup-section'?section:specifier.startsWith('@/')?new URL(specifier.slice(2)+'.ts',root).href:import.meta.resolve(specifier))));
 const section=compile('components/live/setup-section.tsx'),{default:Setup}=await import(compile('components/live/setup.tsx',section)),{revealSetupSection}=await import(section);
 const setup=sampleSetup();setup.organizerParticipantId='';setup.judges[0].participantId='';
 const html=renderToStaticMarkup(createElement(Setup,{setup,update:()=>{throw Error('Unexpected update');},frozenIds:[setup.rounds[0].id],correction:false}));
 assert.match(html,/setup-needs-attention[^>]*data-section="Role verification"/);assert.match(html,/Enter the organizer participant identifier/);assert.match(html,/<fieldset disabled=""><legend>Separate role holders/);assert.equal((html.match(/aria-invalid="true"/g)||[]).length,2);assert.doesNotMatch(html,/Role separation confirmed/);
 const original=globalThis.HTMLDetailsElement;let focused=false,scrolled=false;
 class Detail{open=false;parentElement:Detail|null=null;dataset:{section:string};constructor(name:string){this.dataset={section:name};}querySelector(){return{scrollIntoView(){scrolled=true;},focus(){focused=true;}};}}
 try{globalThis.HTMLDetailsElement=Detail as unknown as typeof HTMLDetailsElement;const parent=new Detail('Judges'),target=new Detail('Role verification');target.parentElement=parent;assert.equal(revealSetupSection({querySelectorAll:()=>[parent,target]},'Role verification'),true);assert.equal(target.open,true);assert.equal(parent.open,true);assert.equal(focused,true);assert.equal(scrolled,true);}finally{if(original===undefined)delete(globalThis as {HTMLDetailsElement?:unknown}).HTMLDetailsElement;else globalThis.HTMLDetailsElement=original;}
});

test('large incomplete panel keeps checklist concise while retaining every exact requirement',()=>{const setup=sampleSetup();setup.judges=Array.from({length:15},(_,i)=>({id:'large-'+i,name:'Judge '+i,participantId:''}));setup.headJudgeId=setup.judges[0].id;const task=setupTasks(setup).find(t=>t.id==='panel')!;assert.equal(roleVerificationIssues(setup).length,15);assert.equal(task.section,'Role verification');assert.match(task.detail,/Judge 0/);assert.match(task.detail,/14 more role requirements/);assert.ok(task.detail.length<130);});
