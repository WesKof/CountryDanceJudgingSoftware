import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createStage,limitedStage,finish,owner,fault} from './publication-helpers.ts';
import {api,command} from './stage-helpers.ts';
import {testFetch} from './test-endpoints.ts';
import {latestPublications,type PublicationRecord} from '../lib/live/publication.ts';
import type {LiveView} from '../lib/live/types.ts';
// Compile only this component in memory; Node can load its ordinary typed dependencies.
let code=ts.transpileModule(readFileSync(new URL('../components/live/publication.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
code=code.replace(/from\s*(['"])([^'"]+)\1/g,(_all:string,_quote:string,specifier:string)=>'from '+JSON.stringify(specifier.startsWith('@/')?new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href:import.meta.resolve(specifier)));
const {PublicationPanel}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const render=(data:LiveView)=>renderToStaticMarkup(createElement(PublicationPanel,{data,action:async()=>true}));
const current=(v:LiveView)=>latestPublications(v.publications!)[0];
const manifest=(record:PublicationRecord)=>[{publicationId:record.id,sourceFingerprint:record.sourceFingerprint}];
async function prepared(){const setup=limitedStage(1,3),session=await createStage(setup);await finish(setup,session.organizer,session.tokens,session.head,false);await command(session.organizer,{action:'prepare-event-publication'});return session;}
function assertBlocked(v:LiveView){assert.equal(v.publicationDeliveryUnconfirmed,true);const html=render(v);assert.match(html,/Website admin action needed/);assert.match(html,/Ask the website admin to check the previous delivery before updated results can be prepared/);assert.match(html,/<button class="primary-button" disabled="">Waiting for website admin<\/button>/);assert.ok(!html.includes('Review results to publish'));assert.ok(!html.includes('Send results for approval'));assert.ok(!html.includes('Retry sending'));assert.ok(!html.includes('href="/admin'));assert.ok(html.indexOf('Website admin action needed')<html.indexOf('Results preview'));assert.ok(!/<details id="publication-supporting"[^>]*\bopen/.test(html));return html;}
async function publicBytes(){return(await testFetch('receiver','/api/public')).text();}

test('organizer sees an authoritative receipt dependency before prepare, including suspended and archived flows, without judge/admin authority leakage',async()=>{
 await fault(false);await owner({action:'service',state:'enabled'});const {organizer,tokens,head}=await prepared();let v=await api<LiveView>(organizer);const record=current(v);await command(organizer,{action:'approve-event-publication',publications:manifest(record)});const before=await publicBytes();
 try{
  await fault(true);await owner({action:'release-event',publications:manifest(record)});v=await api<LiveView>(organizer);assert.equal(v.publicationDeliveryUnconfirmed,false);assert.equal(current(v).status,'queued');const setup=structuredClone(v.setup);setup.name+=' corrected';await command(organizer,{action:'setup',setup});v=await api<LiveView>(organizer);assert.equal(current(v).status,'stale');const saved=JSON.stringify(v.publications);assertBlocked(v);await command(organizer,{action:'prepare-event-publication'},400);
  // Repeated reads and in-memory rendering do not perform receipt lookup/reconciliation.
  const repeated=await api<LiveView>(organizer);assert.equal(JSON.stringify(repeated.publications),saved);assertBlocked(repeated);assert.equal(await publicBytes(),before);
  for(const token of [tokens[0],head]){const privateView=await api<LiveView>(token);assert.equal(Object.hasOwn(privateView,'publicationDeliveryUnconfirmed'),false);assert.equal(Object.hasOwn(privateView,'publications'),false);}
  await owner({action:'retry'},403,organizer);await owner({action:'list'},403,organizer);
  await owner({action:'service',state:'suspended'});assertBlocked(await api<LiveView>(organizer));await command(organizer,{action:'archive'});v=await api<LiveView>(organizer);assert.equal(v.publicationDeliveryUnconfirmed,true);const archived=render(v);assert.match(archived,/<button class="primary-button" disabled="">Archived · read only<\/button>/);assert.ok(!archived.includes('Website admin action needed'));assert.ok(!archived.includes('Review results to publish'));
  await fault(false);await owner({action:'retry'});assert.equal((await api<LiveView>(organizer)).publicationDeliveryUnconfirmed,true);await command(organizer,{action:'reactivate'});assertBlocked(await api<LiveView>(organizer));await owner({action:'retry'});v=await api<LiveView>(organizer);assert.equal(v.publicationDeliveryUnconfirmed,false);assert.equal(current(v).status,'stale');assert.equal((await owner({action:'list'})).serviceState,'suspended');const resolved=render(v);assert.match(resolved,/<button class="primary-button">Review results to publish<\/button>/);assert.ok(!resolved.includes('Website admin action needed'));assert.equal(await publicBytes(),before);
  await command(organizer,{action:'prepare-event-publication'});v=await api<LiveView>(organizer);assert.equal(current(v).status,'prepared');assert.equal(current(v).organizerApprovedAt,undefined);assert.equal(current(v).ownerApprovedAt,undefined);
 }finally{await fault(false);await owner({action:'service',state:'enabled'});}
});

test('uncertain single-release signal is scoped to its event and resolved historical stale snapshots do not block another preparation',async()=>{
 await fault(false);await owner({action:'service',state:'enabled'});const first=await prepared();let v=await api<LiveView>(first.organizer);const record=current(v);await command(first.organizer,{action:'approve-publication',publicationId:record.id,sourceFingerprint:record.sourceFingerprint});
 try{await fault(true);await owner({action:'release',publicationId:record.id,sourceFingerprint:record.sourceFingerprint});v=await api<LiveView>(first.organizer);const changed=structuredClone(v.setup);changed.venue+=' correction';await command(first.organizer,{action:'setup',setup:changed});assertBlocked(await api<LiveView>(first.organizer));
  const second=await prepared();const unaffected=await api<LiveView>(second.organizer);assert.equal(unaffected.publicationDeliveryUnconfirmed,false);assert.match(render(unaffected),/Send results for approval/);assert.ok(!render(unaffected).includes('Website admin action needed'));
  await fault(false);await owner({action:'retry'});v=await api<LiveView>(first.organizer);assert.equal(v.publicationDeliveryUnconfirmed,false);assert.equal(current(v).status,'stale');assert.match(render(v),/<button class="primary-button">Review results to publish<\/button>/);await command(first.organizer,{action:'prepare-event-publication'});assert.equal(current(await api<LiveView>(first.organizer)).status,'prepared');
 }finally{await fault(false);}
});

test('ordinary stale drafts, prepared/requested/queued/released states and identical setup retain truthful organizer actions',async()=>{
 await fault(false);await owner({action:'service',state:'enabled'});const {organizer}=await prepared();let v=await api<LiveView>(organizer);const original=current(v);const setup=structuredClone(v.setup);setup.date='2026-10-29';await command(organizer,{action:'setup',setup});v=await api<LiveView>(organizer);assert.equal(current(v).status,'stale');assert.equal(v.publicationDeliveryUnconfirmed,false);assert.match(render(v),/<button class="primary-button">Review results to publish<\/button>/);
 await command(organizer,{action:'prepare-event-publication'});v=await api<LiveView>(organizer);let record=current(v);assert.notEqual(record.id,original.id);assert.match(render(v),/Send results for approval/);await command(organizer,{action:'approve-event-publication',publications:manifest(record)});v=await api<LiveView>(organizer);assert.equal(v.publicationDeliveryUnconfirmed,false);assert.match(render(v),/Sent · awaiting website admin/);
 try{await fault(true);await owner({action:'release-event',publications:manifest(record)});v=await api<LiveView>(organizer);assert.equal(v.publicationDeliveryUnconfirmed,false);assert.match(render(v),/Publication in progress/);}finally{await fault(false);await owner({action:'retry'});}
 v=await api<LiveView>(organizer);record=current(v);const before=await publicBytes();assert.equal(record.status,'released');assert.equal(v.publicationDeliveryUnconfirmed,false);assert.match(render(v),/Results already published/);await command(organizer,{action:'setup',setup:v.setup});v=await api<LiveView>(organizer);assert.equal(v.publicationDeliveryUnconfirmed,false);assert.deepEqual(current(v),record);assert.equal(await publicBytes(),before);assert.match(render(v),/Results already published/);
 // Read-only old payloads retain the existing presentation; authority still guards writes.
 const legacy=structuredClone(v);delete legacy.publicationDeliveryUnconfirmed;assert.match(render(legacy),/Results already published/);
});
