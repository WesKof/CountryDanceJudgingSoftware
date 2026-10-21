import { fault, owner } from './publication-helpers';
import {test,expect} from '@playwright/test';
import {api,base,command} from './stage-helpers';
import {createStage,limitedStage,finish,localKey,receiver} from './publication-helpers';
import type {LiveView} from '../lib/live/types';
test('organizer sends whole event; separate website admin has one top approval and public cards fit phones',async({browser})=>{
 const setup=limitedStage(2,4);setup.name='Synthetic website admin browser';const {organizer,tokens,head}=await createStage(setup);await finish(setup,organizer,tokens,head,false);
 const organizerContext=await browser.newContext(),desk=await organizerContext.newPage();await desk.goto(base+'/live/'+organizer);await desk.locator('.rail-item').nth(3).click();
 await desk.getByRole('button',{name:'Review results to publish',exact:true}).click();await expect(desk.getByRole('button',{name:'Send results for approval',exact:true})).toBeVisible();
 let v=await api<LiveView>(organizer);expect(v.publications).toHaveLength(2);const p=v.publications![0];
 await desk.getByRole('button',{name:'Send results for approval',exact:true}).click();await expect(desk.getByText(/Sent for approval/)).toBeVisible();await expect(desk.locator('a[href="/owner"]')).toHaveCount(0);
 const context=await browser.newContext(),page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e)=>errors.push(e.message));await page.goto(base+'/owner');await expect(page).toHaveURL(receiver+'/admin');await expect(page.getByRole('button',{name:'Approve & publish results',exact:true})).toHaveCount(0);
 await page.getByLabel('Admin access code',{exact:true}).fill(organizer);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByText(/Sign-in failed/)).toBeVisible();
 await page.getByLabel('Admin access code',{exact:true}).fill(localKey('LOCAL_OWNER_KEY'));await page.getByRole('button',{name:'Sign in',exact:true}).click();const card=page.locator(`[data-event-id="${p.snapshot.eventId}"]`);const approval=card.getByRole('button',{name:'Approve & publish results',exact:true});await expect(approval).toBeEnabled();await expect(card.locator(':scope > div[data-publication-id]')).toHaveCount(2);
 for(const width of [360,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(await approval.evaluate((button)=>{const card=button.closest('.admin-request')!;return Boolean(button.compareDocumentPosition(card.querySelector('table')!)&Node.DOCUMENT_POSITION_FOLLOWING);})).toBe(true);}
 await page.screenshot({path:'test-results/website-admin-review.png',fullPage:false});await approval.click();await expect(page.getByText('Approved and published. The results are now on this website.',{exact:true})).toBeVisible();v=await api<LiveView>(organizer);expect(v.publications!.every((p)=>p.status==='released')).toBe(true);
 for(const width of [360,390,1440]){await page.setViewportSize({width,height:900});await page.goto(receiver+'/competition/'+p.snapshot.eventId+'/'+p.snapshot.competitionId);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await expect(page.getByText('10.0000',{exact:true}).first()).toBeVisible();await page.getByRole('link',{name:/#101 Entrant/}).first().click();await expect(page.getByText(/Blank · Not observed/).first()).toBeVisible();await page.getByRole('link',{name:'Synthetic head',exact:true}).first().click();await expect(page.getByText(/Head judge/).first()).toBeVisible();}
 expect(errors).toEqual([]);await Promise.all([context.close(),organizerContext.close()]);
});

test('website approval stays disabled for a partial request until the organizer sends the complete event',async({browser})=>{
 const setup=limitedStage(2,4);setup.name='Synthetic partial website request';const {organizer,tokens,head}=await createStage(setup);await finish(setup,organizer,tokens,head,false);await command(organizer,{action:'prepare-publication',competitionId:setup.competitions[0].id});let v=await api<LiveView>(organizer);const first=v.publications![0];await command(organizer,{action:'approve-publication',publicationId:first.id,sourceFingerprint:first.sourceFingerprint});
 const context=await browser.newContext(),page=await context.newPage();await page.goto(receiver+'/admin');await page.getByLabel('Admin access code',{exact:true}).fill(localKey('LOCAL_OWNER_KEY'));await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.goto(receiver+'/admin?event='+first.snapshot.eventId);const card=page.locator(`[data-event-id="${first.snapshot.eventId}"]`);await expect(card.getByRole('button',{name:'Approve & publish results',exact:true})).toBeDisabled();await expect(card.getByText(/organizer needs to send updated results/)).toBeVisible();
 await command(organizer,{action:'prepare-event-publication'});v=await api<LiveView>(organizer);await command(organizer,{action:'approve-event-publication',publications:v.publications!.map((p)=>({publicationId:p.id,sourceFingerprint:p.sourceFingerprint}))});await page.reload();await expect(card.getByRole('button',{name:'Approve & publish results',exact:true})).toBeEnabled();await expect(card.locator(':scope > div[data-publication-id]')).toHaveCount(2);await context.close();
});


test('website admin sees Retry sending as the current action for an approved queued event',async({browser})=>{
 const setup=limitedStage(1,4),event=await createStage(setup);await finish(setup,event.organizer,event.tokens,event.head,false);
 await command(event.organizer,{action:'prepare-event-publication'});let view=await api<LiveView>(event.organizer);
 const publications=view.publications!.map((p)=>({publicationId:p.id,sourceFingerprint:p.sourceFingerprint}));
 await command(event.organizer,{action:'approve-event-publication',publications});
 await fault(true);
 try{await owner({action:'release-event',publications});}finally{await fault(false);}
 view=await api<LiveView>(event.organizer);expect(view.publications![0].status).toBe('queued');
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 try{
  await page.goto(receiver+'/admin');await page.getByLabel('Admin access code',{exact:true}).fill(localKey('LOCAL_OWNER_KEY'));await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await owner({action:'service',state:'suspended'});await page.goto(receiver+'/admin?event='+view.publications![0].snapshot.eventId);
  const paused=page.locator(`[data-event-id="${view.publications![0].snapshot.eventId}"]`);await expect(paused.getByRole('button',{name:'Publication paused',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Resume publication',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Resume publication',exact:true}).click();await page.goto(receiver+'/admin?event='+view.publications![0].snapshot.eventId);
  const card=page.locator(`[data-event-id="${view.publications![0].snapshot.eventId}"]`);await expect(card.getByRole('button',{name:'Retry sending',exact:true})).toBeVisible();
  await expect(page.locator('.admin-supporting')).not.toHaveAttribute('open');
  expect(await card.getByRole('button',{name:'Retry sending',exact:true}).evaluate((button)=>Boolean(button.compareDocumentPosition(button.closest('.admin-request')!.querySelector('table')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await card.getByRole('button',{name:'Retry sending',exact:true}).click();
  expect((await api<LiveView>(event.organizer)).publications![0].status).toBe('released');
 }finally{await fault(false);await owner({action:'service',state:'enabled'});await context.close();}
});
