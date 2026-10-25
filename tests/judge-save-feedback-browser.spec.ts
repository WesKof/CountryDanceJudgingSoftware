import {test,expect,type Browser,type Page,type Locator} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {api,base,command,save} from './stage-helpers';
import {createStage,limitedStage} from './publication-helpers';
import {cellKey,type LiveView} from '../lib/live/types';

function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return{promise,release};}
async function fixture(browser:Browser,long=false){
 const store=process.env.LOCAL_TEST_RECEIVER_STORE;if(!store)throw Error('Configure the owned fictional receiver store before creating test events.');readFileSync(store);
 const setup=limitedStage(1,26);setup.name='Synthetic deep ballot save feedback';
 if(long){setup.competitions[0].division='Western Regional Advanced Community Invitational Division';for(const round of setup.rounds)for(const heat of round.heats){heat.name='Community Invitational Heat';for(const song of heat.songs)song.title='Championship selection '+'UnbrokenSong'.repeat(6)+' '+song.title;}}
 const event=await createStage(setup);await command(event.organizer,{action:'enable-auto-stages'});
 const view=await api<LiveView>(event.tokens[0]),round=view.rounds[0],heat=round.definition.heats[0],subject=round.definition.subjects.find(subject=>subject.id===heat.subjectIds.at(-1))!,song=heat.songs[0];
 await save(event.tokens[0],round,song.id,subject.id,'No','PRIVATE_SAVED_NOTE');
 const before=await api<LiveView>(event.tokens[0]),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 return{event,before,round,heat,subject,song,context,page};
}
async function cache(page:Page){return page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('country-dance-live:pending:'))));}
async function focusAtEdge(control:Locator){await control.focus();await control.evaluate(control=>{const bar=document.querySelector('.judge-song-navigation')!.getBoundingClientRect();window.scrollBy(0,control.getBoundingClientRect().top-bar.bottom-4);});const measured=await control.evaluate(control=>({top:control.getBoundingClientRect().top,barBottom:document.querySelector('.judge-song-navigation')!.getBoundingClientRect().bottom}));expect(measured.top-measured.barBottom).toBeGreaterThanOrEqual(0);expect(measured.top-measured.barBottom).toBeLessThanOrEqual(8);return measured;}
async function focusClear(control:Locator){await expect(control).toBeFocused();const measured=await control.evaluate(control=>({top:control.getBoundingClientRect().top,barBottom:document.querySelector('.judge-song-navigation')!.getBoundingClientRect().bottom}));expect(measured.top).toBeGreaterThanOrEqual(measured.barBottom);return measured;}
async function capture(page:Page,name:string){
 const directory=process.env.JUDGE_SAVE_EVIDENCE;if(!directory)return;
 mkdirSync(directory,{recursive:true});await page.screenshot({path:`${directory}/${name}.png`});
 const measured=await page.evaluate(()=>{const nav=document.querySelector('.judge-song-navigation')!,bar=nav.getBoundingClientRect(),panel=document.querySelector('.pending-panel'),cue=document.querySelector('.judge-save-feedback'),save=document.querySelector('.save-state'),walker=document.createTreeWalker(nav,NodeFilter.SHOW_TEXT);let textFits=true;while(walker.nextNode())if(walker.currentNode.textContent?.trim()){const range=document.createRange();range.selectNodeContents(walker.currentNode);if([...range.getClientRects()].some(rect=>rect.left<bar.left-1||rect.right>bar.right+1))textFits=false;}return{width:innerWidth,pageWidth:document.documentElement.scrollWidth,nav:{top:bar.top,height:bar.height,text:nav.textContent,textFits,clearance:parseFloat(nav.parentElement!.style.getPropertyValue('--judge-song-clearance'))},pendingBottom:panel?.getBoundingClientRect().bottom,saveBottom:save?.getBoundingClientRect().bottom,cue:cue?{text:cue.textContent,top:cue.getBoundingClientRect().top,bottom:cue.getBoundingClientRect().bottom}:null};});
 expect(measured.pageWidth).toBe(measured.width);expect(measured.nav.textFits).toBe(true);expect(measured.nav.clearance).toBeGreaterThan(measured.nav.height);
 writeFileSync(`${directory}/${name}.json`,JSON.stringify({measured,cache:await cache(page)},null,2));return measured;
}

test('deep-ballot delayed and interrupted saves stay visible until exact acknowledgement without navigation writes',async({browser})=>{
 const f=await fixture(browser),{page,context,event,subject,song}=f,hold=gate(),started=gate(),retryStarted=gate(),retryHold=gate(),requests:{requestId:string;mark:string;note:string}[]=[],errors:string[]=[];
 let mode:'delay'|'fail'|'pass'|'malformed'='delay';
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live',async route=>{
  if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='save-cell'){
   requests.push(route.request().postDataJSON());
   if(mode==='delay'){started.release();await hold.promise;}
   else if(mode==='fail'){mode='pass';await route.fulfill({status:503,json:{error:'Synthetic interrupted save'}});return;}
   else if(mode==='malformed'){await route.fulfill({status:200,json:{}});return;}
   else if(requests.at(-1)!.note==='PRIVATE_INTERRUPTED_NOTE'){retryStarted.release();await retryHold.promise;}
  }
  await route.continue();
 });
 try{
  await page.goto(base+(await api<LiveView>(event.organizer)).judgeLinks![0].path);
  const row=page.locator(`#judge-bib-${subject.number}`),editor=row.getByRole('textbox',{name:`Note for bib ${subject.number}`,exact:true}),cue=page.locator('.judge-save-feedback'),panel=page.locator('.pending-panel');
  await row.getByRole('button',{name:`Note for bib ${subject.number}`,exact:true}).click();await editor.fill('PRIVATE_PENDING_NOTE');await started.promise;
  const focusedMark=page.getByRole('button',{name:'Bib 116: No',exact:true});await expect(cue).toHaveCount(0);const focusBefore=await focusAtEdge(focusedMark);
  await expect(cue).toBeVisible();await expect(cue).toContainText('1 pending edit');await expect(cue).toContainText('Saving');expect(await cue.textContent()).not.toContain('PRIVATE');
  const focusAfter=await focusedMark.evaluate(mark=>({top:mark.getBoundingClientRect().top,barBottom:document.querySelector('.judge-song-navigation')!.getBoundingClientRect().bottom}));
  if(process.env.JUDGE_SAVE_EVIDENCE){mkdirSync(process.env.JUDGE_SAVE_EVIDENCE,{recursive:true});writeFileSync(`${process.env.JUDGE_SAVE_EVIDENCE}/focused-appearance.json`,JSON.stringify({before:focusBefore,after:focusAfter},null,2));await page.screenshot({path:`${process.env.JUDGE_SAVE_EVIDENCE}/focused-appearance.png`});}
  await focusClear(focusedMark);expect(focusAfter.top-focusBefore.top).toBeLessThanOrEqual(64);
  for(const width of [360,390,1440]){await page.setViewportSize({width,height:844});await row.scrollIntoViewIfNeeded();await capture(page,'delayed-'+width);}
  await page.getByRole('button',{name:'Next song →',exact:true}).focus();await focusedMark.focus();await focusClear(focusedMark);for(let index=0;index<18;index++){await page.keyboard.press('Shift+Tab');const focused=await page.evaluate(()=>{const active=document.activeElement!;if(!active.closest('.phone-row'))return null;return{top:active.getBoundingClientRect().top,barBottom:document.querySelector('.judge-song-navigation')!.getBoundingClientRect().bottom};});if(focused)expect(focused.top).toBeGreaterThanOrEqual(focused.barBottom);}
  const old=f.before.ballots[0].cells[cellKey(song.id,subject.id)],waiting=await api<LiveView>(event.tokens[0]);expect(waiting.ballots[0].cells[cellKey(song.id,subject.id)]).toEqual(old);
  const pending=await cache(page),count=requests.length;await cue.focus();await page.keyboard.press('Enter');await expect(panel.locator(':scope > summary')).toBeFocused();await expect(panel).toHaveAttribute('open');expect(await cache(page)).toEqual(pending);expect(requests).toHaveLength(count);await expect(page.getByRole('combobox',{name:'Assigned heats and songs',exact:true})).toHaveValue(song.id);
  const beforeRemoval=await focusAtEdge(focusedMark);hold.release();await expect(panel).toHaveCount(0);await expect(cue).toHaveCount(0);const afterRemoval=await focusClear(focusedMark);expect(Math.abs(afterRemoval.top-beforeRemoval.top)).toBeLessThanOrEqual(64);
  const acknowledged=await api<LiveView>(event.tokens[0]);expect(acknowledged.ballots[0].cells[cellKey(song.id,subject.id)]).toMatchObject({mark:'No',note:'PRIVATE_PENDING_NOTE',revision:old.revision+1,mutationId:requests[0].requestId});
  mode='fail';await page.setViewportSize({width:390,height:844});await editor.fill('PRIVATE_INTERRUPTED_NOTE');const errorBefore=await focusAtEdge(focusedMark);await expect(cue).toContainText('Waiting to reconnect');const errorAfter=await focusClear(focusedMark);await retryStarted.promise;await row.scrollIntoViewIfNeeded();
  if(process.env.JUDGE_SAVE_EVIDENCE)writeFileSync(`${process.env.JUDGE_SAVE_EVIDENCE}/focus-lifecycle.json`,JSON.stringify({delayed:{before:focusBefore,after:focusAfter},acknowledged:{before:beforeRemoval,after:afterRemoval},error:{before:errorBefore,after:errorAfter}},null,2));
  await expect(cue).toContainText('Waiting to reconnect');const interrupted=await cache(page),retryCount=requests.length;await capture(page,'interrupted-390');await cue.click();await expect(panel.locator(':scope > summary')).toBeFocused();expect(await cache(page)).toEqual(interrupted);expect(requests).toHaveLength(retryCount);
  retryHold.release();await expect(cue).toHaveCount(0);await expect(panel).toHaveCount(0);expect((await api<LiveView>(event.tokens[0])).ballots[0].cells[cellKey(song.id,subject.id)]).toMatchObject({mark:'No',note:'PRIVATE_INTERRUPTED_NOTE'});
  const observer=await page.evaluateHandle(()=>{const state={shown:false};const observer=new MutationObserver(()=>{if(document.querySelector('.judge-save-feedback'))state.shown=true;});observer.observe(document.body,{childList:true,subtree:true});return{state,observer};});
  mode='pass';await editor.fill('PRIVATE_FAST_NOTE');await expect(panel).toHaveCount(0);await expect.poll(async()=>(await api<LiveView>(event.tokens[0])).ballots[0].cells[cellKey(song.id,subject.id)].note).toBe('PRIVATE_FAST_NOTE');
  expect(await observer.evaluate(value=>{value.observer.disconnect();return value.state.shown;})).toBe(false);await observer.dispose();expect(errors).toEqual([]);
  mode='malformed';await editor.fill('PRIVATE_UNCONFIRMED_NOTE');await expect(cue).toContainText('Waiting to reconnect');await row.scrollIntoViewIfNeeded();await capture(page,'unconfirmed-390');expect((await api<LiveView>(event.tokens[0])).ballots[0].cells[cellKey(song.id,subject.id)].note).toBe('PRIVATE_FAST_NOTE');
  const unconfirmed=await cache(page),unconfirmedCount=requests.length;await cue.click();await expect(panel.locator(':scope > summary')).toBeFocused();expect(await cache(page)).toEqual(unconfirmed);expect(requests).toHaveLength(unconfirmedCount);mode='pass';await page.getByRole('button',{name:'Retry pending saves',exact:true}).click();await expect(cue).toHaveCount(0);await expect(panel).toHaveCount(0);expect((await api<LiveView>(event.tokens[0])).ballots[0].cells[cellKey(song.id,subject.id)]).toMatchObject({mark:'No',note:'PRIVATE_UNCONFIRMED_NOTE'});expect(errors).toEqual([]);
  for(const note of ['PRIVATE_INTERRUPTED_NOTE','PRIVATE_UNCONFIRMED_NOTE'])expect(new Set(requests.filter(request=>request.note===note).map(request=>request.requestId)).size).toBe(1);
  const after=await api<LiveView>(event.tokens[0]),key=cellKey(song.id,subject.id);expect(after.ballots.map(ballot=>({round:ballot.roundKey,locked:ballot.locked,cells:Object.fromEntries(Object.entries(ballot.cells).filter(([id])=>id!==key))}))).toEqual(f.before.ballots.map(ballot=>({round:ballot.roundKey,locked:ballot.locked,cells:Object.fromEntries(Object.entries(ballot.cells).filter(([id])=>id!==key))})));
 }finally{hold.release();retryHold.release();await context.close();}
});

test('blocked global pending cue opens comparison without retargeting or overwriting the saved score',async({browser})=>{
 const f=await fixture(browser,true),{page,context,event,round,heat,subject,song}=f,errors:string[]=[],posts:string[]=[];
 const stale=f.before;
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(request.postData()??'');});
 await page.route('**/api/live',async route=>{if(route.request().method()==='GET')await route.fulfill({json:stale});else await route.continue();});
 try{
  await page.goto(base+(await api<LiveView>(event.organizer)).judgeLinks![0].path);await save(event.tokens[0],round,song.id,subject.id,'A1','PRIVATE_OTHER_SAVED');
  const row=page.locator(`#judge-bib-${subject.number}`);await row.getByRole('button',{name:`Note for bib ${subject.number}`,exact:true}).click();const conflict=page.waitForResponse(response=>response.request().method()==='POST'&&response.status()===409);await row.getByRole('textbox').fill('PRIVATE_BLOCKED_NOTE');await conflict;
  const select=page.getByRole('combobox',{name:'Assigned heats and songs',exact:true}),cue=page.locator('.judge-save-feedback'),panel=page.locator('.pending-panel');await select.selectOption(heat.songs[1].id);
  for(const width of [360,390,1440]){await page.setViewportSize({width,height:844});await page.locator('.phone-row').last().scrollIntoViewIfNeeded();await expect(cue).toContainText('Action required');expect(await cue.textContent()).not.toContain('PRIVATE');await capture(page,'blocked-'+width);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);expect(await page.locator('.judge-song-navigation').evaluate(element=>element.getBoundingClientRect().height)).toBeLessThan(240);}
  const before=await cache(page),count=posts.length;await cue.focus();await page.keyboard.press('Enter');await expect(panel.locator(':scope > summary')).toBeFocused();await expect(panel).toHaveAttribute('open');await expect(select).toHaveValue(heat.songs[1].id);expect(posts).toHaveLength(count);expect(await cache(page)).toEqual(before);
  await expect(panel.getByText('Pending note: PRIVATE_BLOCKED_NOTE',{exact:true})).toBeVisible();expect((await api<LiveView>(event.tokens[0])).ballots[0].cells[cellKey(song.id,subject.id)]).toMatchObject({mark:'A1',note:'PRIVATE_OTHER_SAVED'});expect(errors).toEqual([]);
 }finally{await context.close();}
});
