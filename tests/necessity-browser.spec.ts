import { test, expect } from '@playwright/test';
import { api, base, command } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

test('setup keeps one primary task and one context entry while direct Events and help routes stay read only',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 try{
  await page.goto(base);await expect(page.getByRole('heading',{name:'Prelims is ready for judges',exact:true})).toBeVisible();
  await expect(page.locator('.setup-hero details')).toHaveCount(0);
  await expect(page.locator('.setup-toolbar')).toHaveCount(0);
  await expect(page.locator('.setup-page > details')).toHaveCount(1);
  await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');
  const binding=await page.evaluate(()=>JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!) as {path:string});
  const token=binding.path.split('/').at(-1)!,before=await api<LiveView>(token),posts:string[]=[];
  page.on('request',(r)=>{if(r.method()==='POST'&&r.url().endsWith('/api/live'))posts.push(r.postDataJSON().action);});
  await page.getByRole('button',{name:'Events',exact:true}).click();
  await expect(page.locator('#setup-saved-details')).toHaveAttribute('open');await expect(page.locator('.event-workspace')).toHaveAttribute('open');
  await page.locator('.setup-sample-help > summary').click();await expect(page.getByText('Sample event · fictional people',{exact:true})).toBeVisible();
  await page.getByLabel('Go to section',{exact:true}).selectOption('Judges');await expect(page.locator('[data-section="Judges"] > summary')).toBeFocused();
  for(const width of [360,390,738,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
  expect(posts).toEqual([]);expect((await api<LiveView>(token)).version).toBe(before.version);
  await page.locator('#setup-saved-details > summary').click();await page.getByRole('button',{name:'01 Set up',exact:true}).click();
  await page.screenshot({path:'test-results/necessity-setup-1440.png',fullPage:true});
 }finally{await context.close();}
});

test('a judge with no assignment gets a clear waiting state without an empty song selector or submission task',async({browser})=>{
 const setup=limitedStage(1,4),unused=setup.judges[0].id;setup.rounds=setup.rounds.map((r)=>({...r,judgeIds:r.judgeIds.filter((id)=>id!==unused)}));
 const event=await createStage(setup);await command(event.organizer,{action:'enable-auto-stages'});
 const view=await api<LiveView>(event.organizer),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 try{
  await page.goto(base+view.judgeLinks!.find((j)=>j.id===unused)!.path);
  await expect(page.getByRole('heading',{name:'No scores assigned to you for this stage',exact:true})).toBeVisible();
  await expect(page.getByLabel('Assigned heats and songs',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Review & submit prelims',exact:true})).toHaveCount(0);
  await page.screenshot({path:'test-results/necessity-unassigned-390.png'});
 }finally{await context.close();}
});

test('new event creation exposes the required name and keeps optional details out of the primary form',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 try{
  await page.goto(base+'/live/new');await expect(page.getByRole('button',{name:'02 Score',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Venue',{exact:true})).not.toBeVisible();await page.getByLabel('Event name',{exact:true}).fill('Necessary fields rehearsal');
  await page.getByRole('button',{name:'Create shared event',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Necessary fields rehearsal',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Add competitions',exact:true})).toBeVisible();
 }finally{await context.close();}
});
