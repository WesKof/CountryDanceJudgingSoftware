import { test, expect } from '@playwright/test';
import { api, base, command, nonce, save } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

test('event workspace archives old events, searches retained records, and returns them to active without clearing scores', async({browser})=>{
 const a=limitedStage(1,4),b=limitedStage(1,4);a.name='Earlier rehearsal';b.name='Today’s rehearsal';
 const old=await createStage(a),current=await createStage(b);
 await command(old.organizer,{action:'enable-auto-stages'});
 const oldView=await api<LiveView>(old.organizer),r=oldView.rounds[0];
 await save(old.tokens[0],r,r.definition.heats[0].songs[0].id,r.definition.subjects[0].id,'Yes','PRIVATE_ARCHIVE_NOTE');
 const before=await api<LiveView>(old.tokens[0]);
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 await context.addInitScript(({path,history,nonce})=>{
  localStorage.setItem('country-dance-judging:rehearsal',JSON.stringify({path,nonce,configured:true,sample:false}));
  localStorage.setItem('country-dance-judging:organizer-history',JSON.stringify(history));
 },{path:current.path,name:b.name,nonce:nonce(),history:[{path:old.path,name:a.name},{path:current.path,name:b.name},{path:'/live/unavailable-test-link',name:'Retained missing link'}]});
 try{
  await page.goto(base);await page.getByRole('button',{name:'Events',exact:true}).click();
  const workspace=page.locator('.event-workspace');await expect(workspace).toHaveAttribute('open');
  await expect(workspace.getByRole('region',{name:'Active events',exact:true}).locator('.event-card').first()).toHaveAttribute('data-event-path',current.path);
  await expect(workspace.getByText('Link unavailable. Your saved link is retained.',{exact:true})).toBeVisible();
  const older=workspace.locator(`[data-event-path="${old.path}"]`);
  page.once('dialog',(d)=>void d.accept());await older.getByRole('button',{name:'Archive · Earlier rehearsal',exact:true}).click();
  await expect(workspace.getByText('Event archived. Its records remain available below.',{exact:true})).toBeVisible();
  await expect(workspace.getByRole('region',{name:'Active events',exact:true}).locator(`[data-event-path="${old.path}"]`)).toHaveCount(0);
  await expect(workspace.locator('.event-archive')).not.toHaveAttribute('open');
  await workspace.getByLabel('Find an event',{exact:true}).fill('Earlier');
  await expect(workspace.locator('.event-archive')).toHaveAttribute('open');
  await expect(older.getByText('Read only',{exact:true})).toBeVisible();
  await expect(workspace.getByText('Checking saved events…',{exact:true})).not.toBeVisible();
  await page.screenshot({path:'test-results/event-workspace-archived-390.png',fullPage:true});
  await older.getByRole('link',{name:'Open records · Earlier rehearsal',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Archived event · read only',exact:true})).toBeVisible();
  expect((await api<LiveView>(old.tokens[0])).ballots).toEqual(before.ballots);
  await page.getByRole('button',{name:'02 Score',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Archived event',exact:true})).toBeVisible();
  await expect(page.getByText('Results open when all judges submit.',{exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'03 Results',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Archived results · read only',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Go to Score',exact:true})).toHaveCount(0);
  const judgePage=await context.newPage();await judgePage.goto(base+(await api<LiveView>(old.organizer)).judgeLinks![0].path);
  await expect(judgePage.getByRole('heading',{name:'Archived event · read only',exact:true})).toBeVisible();
  await expect(judgePage.getByRole('button',{name:'Review & submit prelims',exact:true})).toHaveCount(0);
  const history=judgePage.locator('[data-section="Completed judging & history"]');await history.locator(':scope > summary').click();
  await history.getByText(/My saved records/).click();await history.getByText('Heat 1',{exact:true}).click();
  await expect(history.getByText(/PRIVATE_ARCHIVE_NOTE/)).toBeVisible();await judgePage.close();
  await page.getByRole('button',{name:'Events',exact:true}).click();
  await page.locator('.event-archive > summary').click();
  await page.locator(`[data-event-path="${old.path}"]`).getByRole('button',{name:'Return to active · Earlier rehearsal',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Prelims is ready for judges',exact:true})).toBeVisible();
  expect((await api<LiveView>(old.tokens[0])).ballots).toEqual(before.ballots);
  expect((await api<LiveView>(old.organizer)).status).toBe('active');
  await page.getByRole('button',{name:'Events',exact:true}).click();
  await expect(workspace.getByText('Checking saved events…',{exact:true})).not.toBeVisible();
  for(const width of [390,727,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await page.screenshot({path:`test-results/event-workspace-${width}.png`});}
 }finally{await context.close();}
});

test('blank setup guides the organizer through real fields, preserves drafts, and opens scoring on one complete save',async({browser})=>{
 const created=await api<{path:string}>('',{action:'create',name:'Guided setup rehearsal',venue:'',date:'',requestId:nonce()});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const errors:string[]=[];page.on('pageerror',(e)=>errors.push(e.message));
 try{
  await page.goto(base+created.path);
  await expect(page.getByRole('heading',{name:'Add competitions',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open this step',exact:true}).click();
  await expect(page.locator('[data-section="Program & stages"] > summary')).toBeFocused();
  await page.getByRole('button',{name:'+ Strictly',exact:true}).click();await page.getByRole('button',{name:'Add competition',exact:true}).click();
  await page.getByRole('button',{name:'Open this step',exact:true}).click();
  await page.getByLabel('New judge name',{exact:true}).fill('Trial Head');await page.getByRole('button',{name:'Add judge',exact:true}).click();
  await page.getByLabel('Event head judge',{exact:true}).selectOption({label:'Trial Head'});
  await page.getByRole('button',{name:'Open this step',exact:true}).click();
  await expect(page.locator('[data-section="Role verification"]')).toHaveAttribute('open');
  await page.getByLabel('Organizer name',{exact:true}).fill('Trial Organizer');
  await page.getByLabel('Organizer participant identifier',{exact:true}).fill('trial-organizer');
  await page.getByLabel('Participant identifier for Trial Head',{exact:true}).fill('trial-head');
  await page.getByRole('checkbox',{name:/^I confirm that the organizer/}).check();
  await page.getByRole('button',{name:'Open this step',exact:true}).click();
  const roster=page.locator('[data-section="Roster"]');
  for(const bib of [101,102]){await roster.locator('form input[name="number"]').fill(String(bib));await roster.locator('form input[name="primary"]').fill('Lead '+bib);await roster.locator('form input[name="secondary"]').fill('Follow '+bib);await roster.getByRole('button',{name:'Add entrant',exact:true}).click();}
  await page.getByRole('button',{name:'Open this step',exact:true}).click();
  await page.getByLabel('Number of finalist couples',{exact:true}).fill('1');
  await expect(page.getByRole('heading',{name:'Review and save your setup',exact:true})).toBeVisible();
  await expect(page.getByText(/Saving complete preparation opens scoring automatically/)).toBeVisible();
  await page.setViewportSize({width:1440,height:900});await page.setViewportSize({width:390,height:844});
  await expect(page.getByLabel('Number of finalist couples',{exact:true})).toHaveValue('1');
  await page.getByRole('button',{name:'Save setup',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Prelims is ready for judges',exact:true})).toBeVisible();
  await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');
  const view=await api<LiveView>(created.path.split('/').at(-1)!);expect(view.rounds[0].phase).toBe('dancing');expect(view.setup.rounds[0].subjects).toHaveLength(2);expect(view.setup.separationAttested).toBe(true);
  await page.screenshot({path:'test-results/setup-guided-complete-390.png',fullPage:true});
  await page.getByRole('button',{name:'Open judging desk',exact:true}).click();
  await expect(page.getByRole('link',{name:'Head Judge — Trial Head ↗',exact:true})).toBeVisible();
  expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/setup-guided-saved-390.png'});
 }finally{await context.close();}
});


test('unavailable current events retain the saved catalog and unreadable catalog bytes stay untouched',async({browser})=>{
 const saved=await createStage(limitedStage(1,4));
 const context=await browser.newContext(),page=await context.newPage();
 const historyKey='country-dance-judging:organizer-history',bindingKey='country-dance-judging:rehearsal';
 await context.addInitScript(({historyKey,bindingKey,path,nonce})=>{
  localStorage.setItem(historyKey,JSON.stringify([{path,name:'Retained event'}]));
  localStorage.setItem(bindingKey,JSON.stringify({path:'/live/unavailable-current',nonce,configured:true}));
 },{historyKey,bindingKey,path:saved.path,nonce:nonce()});
 try{
  await page.goto(base);await expect(page.getByText('Event unavailable',{exact:true})).toBeVisible();
  await page.locator('.event-workspace > summary').click();
  await expect(page.locator(`[data-event-path="${saved.path}"]`)).toBeVisible();
  expect(JSON.parse((await page.evaluate((key)=>localStorage.getItem(key),historyKey))!)[0].path).toBe(saved.path);
 }finally{await context.close();}
 const corrupt=await browser.newContext(),corruptPage=await corrupt.newPage();
 const bytes='{unreadable retained links';const posts:string[]=[];
 await corrupt.addInitScript(({historyKey,bytes})=>localStorage.setItem(historyKey,bytes),{historyKey,bytes});
 corruptPage.on('request',(r)=>{if(r.method()==='POST'&&r.url().endsWith('/api/live'))posts.push(r.url());});
 try{
  await corruptPage.goto(base);await expect(corruptPage.getByText('Event unavailable',{exact:true})).toBeVisible();
  await corruptPage.locator('.event-workspace > summary').click();
  await expect(corruptPage.getByRole('button',{name:'Start a blank event',exact:true})).toBeDisabled();
  await expect(corruptPage.getByRole('button',{name:'Try a fresh sample',exact:true})).toBeDisabled();
  expect(await corruptPage.evaluate((key)=>localStorage.getItem(key),historyKey)).toBe(bytes);expect(posts).toEqual([]);
 }finally{await corrupt.close();}
});


test('late event-summary reads merge the catalog without losing a newly created event',async({browser})=>{
 const saved=await createStage(limitedStage(1,4));
 const context=await browser.newContext(),page=await context.newPage();
 const key='country-dance-judging:organizer-history';
 await context.addInitScript(({path,nonce,key})=>{
  localStorage.setItem(key,JSON.stringify([{path,name:'Earlier saved event'}]));
  localStorage.setItem('country-dance-judging:rehearsal',JSON.stringify({path,nonce,configured:true}));
 },{path:saved.path,nonce:nonce(),key});
 let release!:()=>void;const pending=new Promise<void>((resolve)=>{release=resolve;});
 await page.route('**/api/live?summary=1',async(route)=>{await pending;await route.continue();});
 try{
  await page.goto(base);await page.getByRole('button',{name:'Events',exact:true}).click();
  await expect(page.getByText('Checking saved events…',{exact:true})).toBeVisible();
  page.once('dialog',(d)=>void d.accept());await page.getByRole('button',{name:'Start a blank event',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Add competitions',exact:true})).toBeVisible();
  const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!).path as string);
  expect(current).not.toBe(saved.path);release();
  await page.getByRole('button',{name:'Events',exact:true}).click();
  await expect(page.getByText('Checking saved events…',{exact:true})).not.toBeVisible();
  const retained=await page.evaluate((key)=>JSON.parse(localStorage.getItem(key)!) as {path:string}[],key);
  expect(retained.map((e)=>e.path)).toContain(saved.path);expect(retained.map((e)=>e.path)).toContain(current);
 }finally{release();await context.close();}
});
