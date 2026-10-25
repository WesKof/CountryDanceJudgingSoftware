import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {testEndpoint} from './test-endpoints';
import type {PublicationRecord} from '../lib/live/publication';

test('admin headings retain full metadata within cards and preserve normal review geometry',async({browser})=>{
 const receiver=testEndpoint('receiver',true),config=process.env.ADMIN_HEADING_CONFIGURATION,fixture=process.env.ADMIN_HEADING_FIXTURE,store=process.env.LOCAL_TEST_RECEIVER_STORE;
 test.skip(!config&&!fixture,'Use the dedicated read-only authority fixture, not operational workflow services.');
 if(!config||!fixture||!store)throw Error('Set owned heading configuration, authority fixture and public store paths.');
 const key=readFileSync(config,'utf8').split(/\r?\n/).find(line=>line.startsWith('LOCAL_OWNER_KEY='))?.slice(16);
 if(!key)throw Error('The dedicated configuration requires its own owner key.');
 const records=(JSON.parse(readFileSync(fixture,'utf8')) as {publications:PublicationRecord[]}).publications;
 const completed=records.every(record=>record.status==='released');
 const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex'),before={store:hash(store),fixture:hash(fixture),config:hash(config)};
 const context=await browser.newContext(),page=await context.newPage(),posts:string[]=[],errors:string[]=[],measurements=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(new URL(request.url()).pathname);});
 try{
  await page.goto(receiver+'/admin?event=normal');await page.getByLabel('Admin access code',{exact:true}).fill(key);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  for(const event of ['normal','stress'])for(const width of [360,390,760,761,1440]){
   await page.setViewportSize({width,height:900});await page.goto(receiver+'/admin?event='+event);await page.evaluate(()=>document.fonts.ready);
   const card=page.locator(completed?'.admin-complete':'.admin-request'),current=records.filter(record=>record.snapshot.eventId===event);
   await expect(card.locator(':scope > h2')).toHaveText(current[0].snapshot.event.name);
   if(completed){const link=card.getByRole('link',{name:'View published results',exact:true});await expect(link).toHaveAttribute('href','/leaderboard?event='+event);await link.focus();await expect(link).toBeFocused();await expect(page.locator('.admin-request')).toHaveCount(0);}
   else{await expect(card.locator(':scope > div[data-publication-id]')).toHaveCount(current.length);for(const record of current){const preview=card.locator(`:scope > [data-publication-id="${record.id}"]`);await expect(preview.locator(':scope > h3')).toHaveText(record.snapshot.competition.format+' · '+record.snapshot.competition.division);await expect(preview.locator('article > h2')).toHaveText(record.snapshot.event.name+' · '+record.snapshot.competition.format+' · '+record.snapshot.competition.division);}}
   for(const summary of await card.locator(':scope > div > details > summary').all()){await summary.focus();await page.keyboard.press('Space');}
   await page.evaluate(()=>window.scrollTo(0,0));
   const measured=await card.evaluate(card=>{
    const rect=(element:Element)=>{const box=element.getBoundingClientRect();return{width:box.width,height:box.height};};
    const headings=[...card.querySelectorAll('h2,h3')].map(heading=>{
     const box=heading.getBoundingClientRect(),style=getComputedStyle(heading),parent=heading.parentElement!,parentBox=parent.getBoundingClientRect(),parentStyle=getComputedStyle(parent),range=document.createRange();range.selectNodeContents(heading);
     const bounds={left:Math.max(box.left,parentBox.left+parseFloat(parentStyle.paddingLeft)),right:Math.min(box.right,parentBox.right-parseFloat(parentStyle.paddingRight))};
     return{text:heading.textContent,bounds,rects:[...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right})),font:style.font,margin:style.margin,color:style.color,height:box.height};
    });
    const tables=[...card.querySelectorAll('table')].map(table=>({widths:[...table.querySelectorAll('th')].map(cell=>cell.getBoundingClientRect().width),text:table.textContent,fonts:[...table.querySelectorAll('th,td')].map(cell=>getComputedStyle(cell).font),averages:[...table.querySelectorAll('td:last-child')].map(cell=>({text:cell.textContent,lines:(()=>{const range=document.createRange();range.selectNodeContents(cell);return [...range.getClientRects()].length;})()}))}));
    const action=card.querySelector(':scope > form, :scope > a.button')!,button=action.querySelector('button')??action,buttonBox=button.getBoundingClientRect();
    return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,headings,tables,action:{...rect(action),button:{width:buttonBox.width,height:buttonBox.height,top:buttonBox.top,text:button.textContent}},card:{width:card.getBoundingClientRect().width,padding:getComputedStyle(card).padding},headingElements:card.querySelectorAll('h2,h3').length};
   });
   measurements.push({event,...measured});
   if(process.env.ADMIN_HEADING_EVIDENCE){mkdirSync(process.env.ADMIN_HEADING_EVIDENCE,{recursive:true});await page.screenshot({path:`${process.env.ADMIN_HEADING_EVIDENCE}/${event}-${width}.png`,fullPage:false});if(!completed&&event==='stress'&&width===390){await card.locator(':scope > div[data-publication-id] > h3').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.ADMIN_HEADING_EVIDENCE}/competition-heading-390.png`});await card.locator('article > h2').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.ADMIN_HEADING_EVIDENCE}/nested-heading-390.png`});}}
  }
  if(process.env.ADMIN_HEADING_EVIDENCE)writeFileSync(`${process.env.ADMIN_HEADING_EVIDENCE}/measurements.json`,JSON.stringify(measurements,null,2));
  // Collect every breakpoint before asserting, so a baseline failure retains complete evidence.
  for(const row of measurements){expect(row.scrollWidth,JSON.stringify({event:row.event,width:row.width})).toBeLessThanOrEqual(row.width);for(const heading of row.headings){expect(heading.rects.length).toBeGreaterThan(0);expect(heading.rects.every(rect=>rect.left>=heading.bounds.left-1&&rect.right<=heading.bounds.right+1),JSON.stringify(heading)).toBe(true);}}
  if(process.env.ADMIN_HEADING_BASELINE){
   const baseline=JSON.parse(readFileSync(process.env.ADMIN_HEADING_BASELINE,'utf8')) as typeof measurements;
   for(const row of measurements){const old=baseline.find(prior=>prior.event===row.event&&prior.width===row.width)!;expect(row.tables).toEqual(old.tables);expect(row.card).toEqual(old.card);expect({...row.action,button:{...row.action.button,top:0}}).toEqual({...old.action,button:{...old.action.button,top:0}});if(row.headings[0].height===old.headings[0].height)expect(row.action.button.top).toBe(old.action.button.top);expect(row.headings.map(({text,font,margin,color})=>({text,font,margin,color}))).toEqual(old.headings.map(({text,font,margin,color})=>({text,font,margin,color})));if(row.event==='normal')expect(row.headings.map(heading=>heading.height)).toEqual(old.headings.map(heading=>heading.height));}
  }
  if(!completed){await page.setViewportSize({width:390,height:900});await page.goto(receiver+'/admin?event=normal');
  const select=page.getByRole('combobox',{name:'Event to review',exact:true});await select.selectOption('stress');await select.focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'View event',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page).toHaveURL(url=>url.searchParams.get('event')==='stress');
  await expect(page.getByRole('button',{name:'Retry sending',exact:true})).toBeEnabled();}
  expect(hash(store)).toBe(before.store);expect(hash(fixture)).toBe(before.fixture);expect(hash(config)).toBe(before.config);expect(posts).toEqual(['/admin/login']);expect(errors).toEqual([]);
 }finally{await context.close();}
});
