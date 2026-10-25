import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {api,base,command,save} from './stage-helpers';
import {createStage,limitedStage} from './publication-helpers';
import type {LiveView} from '../lib/live/types';

test('eight organizer judge links retain full names, head identity, progress and keyboard GET access',async({browser})=>{
 const file=process.env.LOCAL_TEST_RECEIVER_STORE;if(!file)throw Error('Configure the owned fictional receiver store before creating events.');readFileSync(file);const hash=()=>createHash('sha256').update(readFileSync(file)).digest('hex'),publicBefore=hash(),measurements=[];
 const baselineInput=process.env.ORGANIZER_LINK_BASELINE?JSON.parse(readFileSync(process.env.ORGANIZER_LINK_BASELINE,'utf8')):undefined;
 if(baselineInput&&(!Array.isArray(baselineInput)||!baselineInput.every(row=>typeof row.profile==='string'&&typeof row.width==='number'&&Array.isArray(row.cards)&&row.cards.length===8)))throw Error('Configure a valid eight-judge layout baseline before fixture creation.');
 for(const profile of ['normal','long']){
  const setup=limitedStage(1,4);setup.name='Synthetic organizer judge links · '+profile;for(let number=4;number<=8;number++)setup.judges.push({id:crypto.randomUUID(),name:'Synthetic judge '+number,participantId:crypto.randomUUID()});
  if(profile==='long'){setup.judges[1].name='LongName'.repeat(20);setup.judges[2].name=('Synthetic Head Long Name '.repeat(8)).slice(0,159)+'Z';expect(setup.judges[1].name.length).toBe(160);expect(setup.judges[2].name.length).toBe(160);}
  for(const round of setup.rounds)round.judgeIds=setup.judges.map(judge=>judge.id);
  const event=await createStage(setup);await command(event.organizer,{action:'enable-auto-stages'});const before=await api<LiveView>(event.organizer),context=await browser.newContext(),page=await context.newPage(),posts:string[]=[],errors:string[]=[];
  page.on('request',request=>{if(request.method()==='POST')posts.push(request.postDataJSON()?.action??'unknown');});page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(base+event.path);await page.getByRole('button',{name:'02 Score',exact:true}).click();const group=page.locator('.stage-judge-links'),cards=group.locator('.judge-status-card');await expect(cards).toHaveCount(8);await expect(page.locator('#score-supporting-details')).not.toHaveAttribute('open');
   for(const [index,judge]of setup.judges.entries()){const card=cards.nth(index),link=card.locator('a'),expected=(judge.id===setup.headJudgeId?'Head Judge — ':'')+judge.name+' ↗';await expect(link).toHaveText(expected);expect(await link.getAttribute('href')===before.judgeLinks!.find(item=>item.id===judge.id)!.path).toBe(true);await expect(card.locator('small')).toContainText('4 scores needed');}
   for(const width of [360,390,1440]){
    await page.setViewportSize({width,height:900});await group.scrollIntoViewIfNeeded();
    const measured=await cards.evaluateAll(cards=>cards.map(card=>{const box=card.getBoundingClientRect(),style=getComputedStyle(card),link=card.querySelector('a')!,linkBox=link.getBoundingClientRect(),status=card.querySelector('small')!.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(link);const glyphs=[...range.getClientRects()];const left=box.left+parseFloat(style.paddingLeft),right=box.right-parseFloat(style.paddingRight),walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);let fits=true;while(walker.nextNode())if(walker.currentNode.textContent?.trim()){const text=document.createRange();text.selectNodeContents(walker.currentNode);if([...text.getClientRects()].some(rect=>rect.left<left-1||rect.right>right+1))fits=false;}return{height:box.height,width:box.width,linkWidth:linkBox.width,nameLines:new Set(glyphs.map(rect=>Math.round(rect.top*10))).size,linkText:link.textContent,statusText:card.querySelector('small')!.textContent,textFits:fits,overlap:linkBox.left<status.right-1&&linkBox.right>status.left+1&&linkBox.top<status.bottom-1&&linkBox.bottom>status.top+1};}));
    const row={profile,width,pageWidth:await page.evaluate(()=>document.documentElement.scrollWidth),cards:measured};measurements.push(row);
    if(process.env.ORGANIZER_LINK_EVIDENCE){mkdirSync(process.env.ORGANIZER_LINK_EVIDENCE,{recursive:true});await page.screenshot({path:`${process.env.ORGANIZER_LINK_EVIDENCE}/${profile}-${width}.png`});}
   }
   for(const index of [1,2]){
    const link=cards.nth(index).locator('a');await link.focus();const popupPromise=page.waitForEvent('popup');await page.keyboard.press('Enter');const popup=await popupPromise;
    try{await expect(popup.getByRole('heading',{level:1,name:(index===2?'Head Judge — ':'')+setup.judges[index].name,exact:true})).toBeVisible();expect(new URL(popup.url()).origin===new URL(base).origin).toBe(true);expect(new URL(popup.url()).pathname===before.judgeLinks![index].path).toBe(true);const own=await api<LiveView>(event.tokens[index]);expect(own.role).toBe(index===2?'head':'judge');}finally{await popup.close();}
   }
   expect((await api<LiveView>(event.organizer)).version).toBe(before.version);expect(posts).toEqual([]);
   const round=before.rounds[0],heat=round.definition.heats[0];for(const id of heat.subjectIds)await save(event.tokens[0],round,heat.songs[0].id,id,'No','PRIVATE_ORGANIZER_LINK_NOTE');await expect(cards.first().locator('small')).toContainText('Awaiting submission');
   const own=await api<LiveView>(event.tokens[0]);await api(event.tokens[0],{action:'submit-stage',blockId:own.context.blockId,acknowledged:true,expectedVersion:own.version,requestId:crypto.randomUUID(),ballotVersions:Object.fromEntries(own.ballots.map(ballot=>[ballot.roundKey,ballot.version])),roundVersions:Object.fromEntries(own.rounds.map(round=>[round.key,round.version]))});await expect(cards.first().locator('small')).toContainText('Stage submitted');await expect(page.getByText('1 / 8 judges submitted the stage.',{exact:true})).toBeVisible();expect(await page.content()).not.toContain('PRIVATE_ORGANIZER_LINK_NOTE');await expect(cards.nth(2).locator('a')).toContainText('Head Judge —');expect(posts).toEqual([]);expect(errors).toEqual([]);
   if(profile==='long'){
    await command(event.organizer,{action:'revoke-link',judgeId:setup.judges[1].id});const revoked=cards.nth(1);await expect(revoked.locator('strong')).toHaveText(setup.judges[1].name+' · Link revoked');await expect(revoked.locator('a')).toHaveCount(0);const rows=[];
    for(const width of [360,390,1440]){await page.setViewportSize({width,height:900});await revoked.scrollIntoViewIfNeeded();const measured=await revoked.evaluate(card=>{const box=card.getBoundingClientRect(),style=getComputedStyle(card),name=card.querySelector('strong')!,range=document.createRange();range.selectNodeContents(name);const rects=[...range.getClientRects()];return{width:innerWidth,pageWidth:document.documentElement.scrollWidth,height:box.height,text:name.textContent,textFits:rects.every(rect=>rect.left>=box.left+parseFloat(style.paddingLeft)-1&&rect.right<=box.right-parseFloat(style.paddingRight)+1)};});rows.push(measured);if(process.env.ORGANIZER_LINK_EVIDENCE){await page.screenshot({path:`${process.env.ORGANIZER_LINK_EVIDENCE}/revoked-${width}.png`});writeFileSync(`${process.env.ORGANIZER_LINK_EVIDENCE}/revoked-${width}.json`,JSON.stringify(measured,null,2));}}
    for(const row of rows){expect(row.pageWidth).toBe(row.width);expect(row.textFits).toBe(true);}expect(posts).toEqual([]);expect(errors).toEqual([]);
   }
  }finally{await context.close();}
 }
 if(process.env.ORGANIZER_LINK_EVIDENCE)writeFileSync(`${process.env.ORGANIZER_LINK_EVIDENCE}/measurements.json`,JSON.stringify(measurements,null,2));
 for(const row of measurements){expect(row.pageWidth).toBe(row.width);for(const card of row.cards){expect(card.textFits).toBe(true);expect(card.overlap).toBe(false);}}
 if(baselineInput){const baseline=baselineInput as typeof measurements;for(const row of measurements){const old=baseline.find(item=>item.profile===row.profile&&item.width===row.width)!;if(row.width>600)expect(row.cards).toEqual(old.cards);else for(const [index,card]of row.cards.entries()){expect(card.linkText).toBe(old.cards[index].linkText);expect(card.statusText).toBe(old.cards[index].statusText);if(row.profile==='long'&&[1,2].includes(index))expect(card.height).toBeLessThan(old.cards[index].height*.65);else expect(card.height).toBeLessThanOrEqual(old.cards[index].height+8);}}}
 expect(hash()).toBe(publicBefore);
});
