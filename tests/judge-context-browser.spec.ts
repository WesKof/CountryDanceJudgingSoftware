import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {api,base,command,save} from './stage-helpers';
import {createStage,limitedStage} from './publication-helpers';
import type {LiveView} from '../lib/live/types';

test('selected scoring context stays visible on a long ballot without changing marks, notes or targets',async({browser})=>{
 const store=process.env.LOCAL_TEST_RECEIVER_STORE;if(!store)throw Error('Configure the owned fictional receiver store before fixture creation.');readFileSync(store);
 const setup=limitedStage(3,26);setup.name='Synthetic scrolling judge context';
 const long=setup.competitions[2];long.division='Western Regional Advanced Community Invitational Division';
 for(const round of setup.rounds.filter(round=>round.competitionId===long.id))for(const heat of round.heats){heat.name='Community Invitational Heat';for(const song of heat.songs)song.title='Championship selection '+'UnbrokenSong'.repeat(6)+' '+song.title;}
 const fixture=await createStage(setup);await command(fixture.organizer,{action:'enable-auto-stages'});
 const view=await api<LiveView>(fixture.organizer),round=view.rounds.find(round=>round.definition.competitionId===setup.competitions[0].id)!,heat=round.definition.heats[0];
 await save(fixture.tokens[0],round,heat.songs[0].id,heat.subjectIds[0],'No','PRIVATE_CONTEXT_RETAINED');
 const before=await api<LiveView>(fixture.tokens[0]),context=await browser.newContext(),page=await context.newPage(),posts:string[]=[],errors:string[]=[],measurements=[];
 page.on('request',request=>{if(request.method()==='POST')posts.push(new URL(request.url()).pathname);});page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(base+view.judgeLinks![0].path);const select=page.getByRole('combobox',{name:'Assigned heats and songs',exact:true}),nav=page.getByRole('navigation',{name:'Song navigation',exact:true});
  await select.selectOption(heat.songs[0].id);
  for(const width of [360,390,1440]){
   await page.setViewportSize({width,height:844});await page.locator('.phone-row').last().scrollIntoViewIfNeeded();
   const measured=await nav.evaluate(nav=>{const box=nav.getBoundingClientRect(),heading=document.querySelector('#judge-ballot .panel-heading')!.getBoundingClientRect();return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nav:{top:box.top,bottom:box.bottom,height:box.height,text:nav.textContent},headingBottom:heading.bottom};});measurements.push(measured);
   if(process.env.JUDGE_CONTEXT_EVIDENCE){mkdirSync(process.env.JUDGE_CONTEXT_EVIDENCE,{recursive:true});await page.screenshot({path:`${process.env.JUDGE_CONTEXT_EVIDENCE}/scrolled-${width}.png`});}
  }
  if(process.env.JUDGE_CONTEXT_EVIDENCE)writeFileSync(`${process.env.JUDGE_CONTEXT_EVIDENCE}/measurements.json`,JSON.stringify(measurements,null,2));
  for(const row of measurements){expect(row.headingBottom).toBeLessThan(0);expect(row.nav.top).toBeGreaterThanOrEqual(0);expect(row.nav.bottom).toBeLessThan(220);expect(row.scrollWidth).toBe(row.width);}
  await expect(nav).toContainText(round.definition.division);await expect(nav).toContainText(heat.name);await expect(nav).toContainText(heat.songs[0].title);
  await page.setViewportSize({width:390,height:844});const next=nav.getByRole('button',{name:'Next song →',exact:true});await next.focus();await page.keyboard.press('Enter');
  await expect(select).toHaveValue(heat.songs[1].id);await expect(nav).toContainText(heat.songs[1].title);await expect(page.locator('#judge-ballot')).toBeFocused();
  expect(before.context.performanceId).not.toBe(heat.songs[1].id);
  await nav.getByRole('button',{name:'← Previous song',exact:true}).focus();await page.keyboard.press('Enter');await expect(select).toHaveValue(heat.songs[0].id);await expect(nav).toContainText(heat.songs[0].title);await next.focus();await page.keyboard.press('Enter');await expect(select).toHaveValue(heat.songs[1].id);
  const mark=page.getByRole('button',{name:'Bib 101: No',exact:true});await mark.focus();await expect(mark).toBeFocused();
  const focus=await mark.evaluate(mark=>({top:mark.getBoundingClientRect().top,barBottom:document.querySelector('.judge-song-navigation')!.getBoundingClientRect().bottom}));expect(focus.top).toBeGreaterThanOrEqual(focus.barBottom);
  await page.locator('.phone-row').last().getByRole('button',{name:/No$/}).focus();
  for(let index=0;index<55;index++){await page.keyboard.press('Shift+Tab');const focused=await page.evaluate(()=>{const active=document.activeElement!;if(!active.closest('.phone-row'))return null;const box=active.getBoundingClientRect(),bar=document.querySelector('.judge-song-navigation')!.getBoundingClientRect();return{top:box.top,bottom:box.bottom,barBottom:bar.bottom,height:innerHeight};});if(focused){expect(focused.top).toBeGreaterThanOrEqual(focused.barBottom);expect(focused.bottom).toBeLessThanOrEqual(focused.height);}}
  await page.getByRole('button',{name:'Score next bib · #102',exact:true}).click();await expect(page.locator('#judge-bib-102')).toBeFocused();
  const bibFocus=await page.locator('#judge-bib-102').evaluate(row=>({top:row.getBoundingClientRect().top,barBottom:document.querySelector('.judge-song-navigation')!.getBoundingClientRect().bottom}));expect(bibFocus.top).toBeGreaterThanOrEqual(bibFocus.barBottom);
  const other=before.rounds.find(round=>round.definition.competitionId===long.id)!,otherHeat=other.definition.heats[0];await select.selectOption(otherHeat.songs[0].id);
  await expect(nav).toContainText(long.division);await expect(nav).toContainText(otherHeat.name);await expect(nav).toContainText(otherHeat.songs[0].title);
  for(const name of ['Leads','Follows']){await page.getByRole('button',{name,exact:true}).click();await expect(nav).toContainText(long.division);await expect(select).toHaveValue(otherHeat.songs[0].id);}
  const longMeasurements=[];
  for(const width of [360,390,1440]){await page.setViewportSize({width,height:844});await page.locator('.phone-row').last().scrollIntoViewIfNeeded();const measured=await nav.evaluate(nav=>{const box=nav.getBoundingClientRect(),context=nav.querySelector('.judge-song-context')!,range=document.createRange();range.selectNodeContents(context);const heading=document.querySelector('#judge-ballot .panel-heading')!,headingBox=heading.getBoundingClientRect(),style=getComputedStyle(heading),walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);let headingTextFits=true;while(walker.nextNode())if(walker.currentNode.textContent?.trim()){const text=document.createRange();text.selectNodeContents(walker.currentNode);if([...text.getClientRects()].some(rect=>rect.left<headingBox.left+parseFloat(style.paddingLeft)-1||rect.right>headingBox.right-parseFloat(style.paddingRight)+1))headingTextFits=false;}return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:box.height,clearance:parseFloat(nav.parentElement!.style.getPropertyValue('--judge-song-clearance')),text:context.textContent,textFits:[...range.getClientRects()].every(rect=>rect.left>=box.left-1&&rect.right<=box.right+1),headingTextFits};});longMeasurements.push(measured);if(process.env.JUDGE_CONTEXT_EVIDENCE)await page.screenshot({path:`${process.env.JUDGE_CONTEXT_EVIDENCE}/long-context-${width}.png`});}
  if(process.env.JUDGE_CONTEXT_EVIDENCE)writeFileSync(`${process.env.JUDGE_CONTEXT_EVIDENCE}/long-measurements.json`,JSON.stringify(longMeasurements,null,2));
  for(const row of longMeasurements){expect(row.scrollWidth).toBe(row.width);expect(row.height).toBeLessThan(220);expect(row.clearance).toBeGreaterThan(row.height);expect(row.textFits).toBe(true);expect(row.headingTextFits).toBe(true);}
  await select.selectOption(heat.songs[0].id);await expect(nav).toContainText(round.definition.division);await expect(page.getByRole('button',{name:'Bib 101: No',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Note for bib 101',exact:true}).click();await expect(page.getByRole('textbox',{name:'Note for bib 101',exact:true})).toHaveValue('PRIVATE_CONTEXT_RETAINED');
  expect((await api<LiveView>(fixture.tokens[0])).ballots).toEqual(before.ballots);expect(posts).toEqual([]);expect(errors).toEqual([]);
 }finally{await context.close();}
});
