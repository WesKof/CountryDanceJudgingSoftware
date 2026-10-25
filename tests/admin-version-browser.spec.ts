import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {testEndpoint} from './test-endpoints';
import type {PublicationRecord} from '../lib/live/publication';

test('admin overview keeps Version intact without changing desktop, nested tables or primary controls',async({browser})=>{
 const receiver=testEndpoint('receiver',true),config=process.env.ADMIN_VERSION_CONFIGURATION,fixture=process.env.ADMIN_VERSION_FIXTURE,store=process.env.LOCAL_TEST_RECEIVER_STORE;
 test.skip(!config||!fixture,'Run this geometry fixture with the dedicated read-only authority manifest, not operational workflow services.');
 if(!config||!fixture||!store)throw Error('Set owned layout configuration, authority fixture and public store paths.');
 const key=readFileSync(config,'utf8').split(/\r?\n/).find(line=>line.startsWith('LOCAL_OWNER_KEY='))!.slice(16);
 const records=(JSON.parse(readFileSync(fixture,'utf8')) as {publications:PublicationRecord[]}).publications;
 const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex'),before={store:hash(store),fixture:hash(fixture)};
 const context=await browser.newContext(),page=await context.newPage(),posts:string[]=[],errors:string[]=[],measurements=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(new URL(request.url()).pathname);});
 try{
  await page.goto(receiver+'/admin?event=normal');await page.getByLabel('Admin access code',{exact:true}).fill(key);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  for(const event of ['normal','stress'])for(const width of [360,390,760,761,1440]){
   await page.setViewportSize({width,height:900});await page.goto(receiver+'/admin?event='+event);await page.evaluate(()=>document.fonts.ready);
   const card=page.locator('.admin-request'),table=card.locator(':scope > table'),current=records.filter(record=>record.snapshot.eventId===event);
   await expect(table.locator('th').nth(1)).toHaveText('Version');await expect(table.locator('tbody tr')).toHaveCount(current.length);
   for(const [index,record]of current.entries()){
    const cells=table.locator('tbody tr').nth(index).locator('td');await expect(cells.nth(0)).toHaveText(record.snapshot.competition.format+' · '+record.snapshot.competition.division);await expect(cells.nth(1)).toHaveText(String(record.revision));await expect(cells.nth(2)).toHaveText(record.status==='requested'?'Ready for approval':record.status==='released'?'Published':'Sending pending');
   }
   const measured=await card.evaluate(card=>{
    const table=card.querySelector(':scope > table')!,header=table.querySelectorAll('th')[1],range=document.createRange();range.selectNodeContents(header);
    const headerRects=[...range.getClientRects()],bounds=header.getBoundingClientRect(),headerStyle=getComputedStyle(header),overflow:string[]=[];
    for(const [i,cell]of [...table.querySelectorAll('th,td')].entries()){
     const box=cell.getBoundingClientRect(),style=getComputedStyle(cell),left=box.left+parseFloat(style.paddingLeft),right=box.right-parseFloat(style.paddingRight),walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);
     while(walker.nextNode())if(walker.currentNode.textContent?.trim()){const text=document.createRange();text.selectNodeContents(walker.currentNode);if([...text.getClientRects()].some(rect=>rect.left<left-1||rect.right>right+1))overflow.push('cell'+i);}
    }
    const action=card.querySelector(':scope > form button')!.getBoundingClientRect();
    return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,versionLines:headerRects.length,versionCell:bounds.width,versionText:headerRects.map(rect=>({left:rect.left,right:rect.right})),headerBounds:{left:bounds.left+parseFloat(headerStyle.paddingLeft),right:bounds.right-parseFloat(headerStyle.paddingRight)},overflow,overviewWidths:[...table.querySelectorAll('th')].map(cell=>cell.getBoundingClientRect().width),nestedWidths:[...card.querySelectorAll(':scope > div[data-publication-id] > table')].map(table=>[...table.querySelectorAll('th')].map(cell=>cell.getBoundingClientRect().width)),action:{top:action.top,height:action.height},tableFont:getComputedStyle(header).fontSize};
   });
   measurements.push({event,...measured});
   if(process.env.ADMIN_VERSION_EVIDENCE){mkdirSync(process.env.ADMIN_VERSION_EVIDENCE,{recursive:true});await page.screenshot({path:`${process.env.ADMIN_VERSION_EVIDENCE}/${event}-${width}.png`,fullPage:false});}
  }
  if(process.env.ADMIN_VERSION_EVIDENCE)writeFileSync(`${process.env.ADMIN_VERSION_EVIDENCE}/measurements.json`,JSON.stringify(measurements,null,2));
  for(const row of measurements){expect(row.versionLines,JSON.stringify(row)).toBe(1);expect(row.scrollWidth).toBeLessThanOrEqual(row.width);expect(row.overflow).toEqual([]);expect(row.versionText.every(rect=>rect.left>=row.headerBounds.left&&rect.right<=row.headerBounds.right)).toBe(true);}
  if(process.env.ADMIN_VERSION_BASELINE){
   const baseline=JSON.parse(readFileSync(process.env.ADMIN_VERSION_BASELINE,'utf8')) as typeof measurements;
   for(const row of measurements){const old=baseline.find(prior=>prior.event===row.event&&prior.width===row.width)!;expect(row.nestedWidths).toEqual(old.nestedWidths);expect(row.action).toEqual(old.action);expect(row.tableFont).toBe(old.tableFont);if(row.width>760)expect(row.overviewWidths).toEqual(old.overviewWidths);}
  }
  await page.setViewportSize({width:390,height:900});await page.goto(receiver+'/admin?event=normal');
  const select=page.getByRole('combobox',{name:'Event to review',exact:true});await select.selectOption('stress');await select.focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'View event',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page).toHaveURL(url=>url.searchParams.get('event')==='stress');
  const card=page.locator('.admin-request');await expect(card.getByRole('button',{name:'Retry sending',exact:true})).toBeEnabled();
  await page.locator('.admin-supporting > summary').focus();await page.keyboard.press('Space');await page.locator('#website-controls > summary').focus();await page.keyboard.press('Space');await expect(page.getByRole('button',{name:'Resume publication',exact:true})).toBeVisible();
  expect(hash(store)).toBe(before.store);expect(hash(fixture)).toBe(before.fixture);expect(posts).toEqual(['/admin/login']);expect(errors).toEqual([]);
 }finally{await context.close();}
});
