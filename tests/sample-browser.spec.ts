import {test,expect} from '@playwright/test';
import {api,base} from './stage-helpers';
import {expandSetup,openJudgeAccess,openRecovery} from './setup-browser-helpers';
import type {LiveView} from '../lib/live/types';

test('new visitors get a ready sample on the main page; fresh samples and blank events preserve earlier work',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const failures:string[]=[];page.on('pageerror',(e)=>failures.push(e.message));
 let lostSetup=true;const creates:string[]=[];
 page.on('request',(r)=>{if(r.method()==='POST'&&r.url().endsWith('/api/live')&&r.postDataJSON()?.action==='create')creates.push(r.postDataJSON().requestId);});
 await context.route('**/api/live',async(route)=>{
  if(lostSetup&&route.request().method()==='POST'&&route.request().postDataJSON()?.action==='setup'){
   lostSetup=false;await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic lost setup response'})});
  }else await route.continue();
 });
 await page.goto(base);await expect(page.getByText('Synthetic lost setup response',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.getByRole('heading',{level:1,name:'Sample Country Dance Social'})).toBeVisible();await expect(page).toHaveURL(base+'/');
 await expect(page.getByText('Sample event · fictional people',{exact:true})).toBeVisible();
 await expect(page.locator('details.setup-section[open]')).toHaveCount(0);expect(creates).toHaveLength(1);
 const binding=await page.evaluate(()=>JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!) as {path:string}),token=binding.path.split('/').at(-1)!;
 const initial=await api<LiveView>(token);expect(initial.setup.competitions.map((c)=>c.format)).toEqual(['Strictly','Jack & Jill']);
 expect(initial.setup.rounds.filter((r)=>r.kind==='prelims').map((r)=>r.subjects.map((s)=>s.number))).toEqual([[101,102,103,104],[201,202,301,302]]);
 expect(initial.ballots).toEqual([]);expect(initial.rounds).toEqual([]);expect(initial.publications??[]).toEqual([]);
 expect(await page.evaluate(()=>localStorage.getItem('country-dance-judging:v2'))).toBeNull();
 await page.screenshot({path:'test-results/organizer-main-sample-390.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await expandSetup(page);await expect(page.getByRole('button',{name:'Start prelims stage',exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Event-long private judge links',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Data & recovery',exact:true})).toHaveCount(0);await openRecovery(page);await expect(page.getByRole('button',{name:'Review results to publish',exact:true}).first()).toBeDisabled();await expect(page.getByText(/Approved Prelims automatically fill Finals/).first()).toBeVisible();await expect(page.getByRole('button',{name:'Download shared backup',exact:true})).toBeVisible();await openJudgeAccess(page);const popup=page.waitForEvent('popup');await page.getByRole('link',{name:'Open judge page',exact:true}).first().click();const judge=await popup;
 await page.getByRole('button',{name:'02 Score',exact:true}).click();await expect(page.getByRole('button',{name:'Start prelims stage',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Start prelims stage',exact:true}).click();await judge.reload();await expect(judge.locator('.phone-row')).toHaveCount(4);
 const saved=judge.waitForResponse((r)=>r.request().postDataJSON()?.action==='save-cell');await judge.locator('.phone-row').first().getByRole('button',{name:'Bib 101: Yes',exact:true}).click();expect((await saved).status()).toBe(200);
 const judgeToken=new URL(judge.url()).pathname.split('/').at(-1)!;const observed=await api<LiveView>(judgeToken);expect(Object.values(observed.ballots[0].cells)[0].mark).toBe('Yes');
 await page.locator('.rail-item').nth(1).click();await expect(page.getByRole('button',{name:'Next song',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:/^Bib \d+:/})).toHaveCount(0);await page.screenshot({path:'test-results/organizer-run-390.png',fullPage:true});
 await page.reload();await expect(page.getByRole('heading',{level:1,name:'Sample Country Dance Social'})).toBeVisible();await expandSetup(page);
 page.once('dialog',(d)=>void d.accept());await page.getByRole('button',{name:'Try a fresh sample',exact:true}).click();
 await expect.poll(()=>page.evaluate((old)=>{const next=JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!);return Boolean(next.configured&&next.path&&next.path!==old);},binding.path)).toBe(true);
 await expect(page.getByRole('button',{name:'Save setup',exact:true})).toBeDisabled();
 const next=await page.evaluate(()=>JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!) as {path:string});
 const fresh=await api<LiveView>(next.path.split('/').at(-1)!);expect(fresh.setup.rounds.map((r)=>r.id).some((id)=>initial.setup.rounds.some((r)=>r.id===id))).toBe(false);
 expect((await api<LiveView>(judgeToken)).ballots).toEqual(observed.ballots);expect(fresh.rounds).toEqual([]);expect(fresh.ballots).toEqual([]);
 await expandSetup(page);page.once('dialog',(d)=>void d.accept());await page.getByRole('button',{name:'Start a blank event',exact:true}).click();
 await expect(page.getByRole('heading',{level:1,name:'New country dance event'})).toBeVisible();await expect(page.getByText('Sample event · fictional people',{exact:true})).toHaveCount(0);
 await expandSetup(page);await expect(page.getByRole('link',{name:'Open judge page',exact:true})).toHaveCount(0);
 await page.getByLabel('Saved event',{exact:true}).selectOption(binding.path);await expect(page.getByRole('heading',{level:1,name:'Sample Country Dance Social'})).toBeVisible();
 expect((await api<LiveView>(judgeToken)).ballots).toEqual(observed.ballots);expect(failures).toEqual([]);await context.close();
});

test('main-page private organizer link checks the role before changing saved access',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 await page.goto(base);await expect(page.getByRole('heading',{level:1,name:'Sample Country Dance Social'})).toBeVisible();
 const raw=await page.evaluate(()=>localStorage.getItem('country-dance-judging:rehearsal')!),binding=JSON.parse(raw) as {path:string};
 const view=await api<LiveView>(binding.path.split('/').at(-1)!);const judgeToken=view.judgeLinks![0].path.split('/').at(-1)!;
 await page.screenshot({path:'test-results/organizer-main-sample-1440.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/organizer-main-sample-390.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.goto(base+'/?event='+judgeToken);await expect(page.getByText('Organizer access required. Use your individual judge link for scoring.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Save setup',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('country-dance-judging:rehearsal'))).toBe(raw);
 await page.goto(base+'/?event='+binding.path.split('/').at(-1)!);await expect(page.getByRole('heading',{level:1,name:'Sample Country Dance Social'})).toBeVisible();
 await expect(page.getByText('Sample event · fictional people',{exact:true})).toBeVisible();
 expect((await api<LiveView>(binding.path.split('/').at(-1)!)).eventId).toBe(view.eventId);await context.close();
});
