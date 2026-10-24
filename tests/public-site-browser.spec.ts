import {test,expect} from '@playwright/test';
import {createStage,limitedStage,finish,owner,receiver} from './publication-helpers';
import {api,command} from './stage-helpers';
import type {LiveView} from '../lib/live/types';
test('event-first public website, event filtering and scorecards work on phones and desktop without private access',async({browser})=>{
  const setup=limitedStage(1,4);setup.name='Synthetic standalone public navigation';
  const fixture=await createStage(setup);await finish(setup,fixture.organizer,fixture.tokens,fixture.head,false);
  await command(fixture.organizer,{action:'prepare-event-publication'});
  const view=await api<LiveView>(fixture.organizer),publications=view.publications!.map((record)=>({publicationId:record.id,sourceFingerprint:record.sourceFingerprint}));
  await command(fixture.organizer,{action:'approve-event-publication',publications});await owner({action:'release-event',publications});
  const publicData=await(await fetch(receiver+'/api/public')).json() as {current:Record<string,string>};
  const expectedCards=Math.min(8,Object.keys(publicData.current).length);
  const released=view.publications![0],knownLink=`/competition/${released.snapshot.eventId}/${released.snapshot.competitionId}`;
  expect(publicData.current[released.snapshot.eventId+'/'+released.snapshot.competitionId]).toBe(released.id);
  const context=await browser.newContext(),page=await context.newPage(),errors:string[]=[];page.on('pageerror',(e)=>errors.push(e.message));
  for(const width of [360,390,1440]){
    await page.setViewportSize({width,height:900});await page.goto(receiver+'/');await expect(page.getByRole('heading',{level:1,name:'Celebrate the dancers. Find your results.'})).toBeVisible();
    expect(await page.locator('.hero img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth===640)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({path:`test-results/public-home-${width}.png`,fullPage:false});await expect(page.locator('.winner-card')).toHaveCount(expectedCards);await expect(page.locator(`.winner-card .result-link[href="${knownLink}"]`)).toBeVisible();await expect(page.getByRole('link',{name:/Owner|Organizer|Judge access/})).toHaveCount(0);
    await page.locator('.winner-card').first().getByRole('link',{name:'Full leaderboard and scorecards',exact:true}).click();await expect(page.getByRole('heading',{name:'Final places',exact:true})).toBeVisible();await expect(page.locator('.public-supporting')).not.toHaveAttribute('open');await expect(page.locator('.public-stage-records.public-prelims')).toBeHidden();await expect(page.getByRole('columnheader',{name:'Count',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('navigation').getByRole('link',{name:'Leaderboard',exact:true}).click();await expect(page.locator('.event-directory')).toBeVisible();await expect(page.getByRole('heading',{name:'Final places',exact:true})).toHaveCount(0);const select=page.getByLabel('Find your competition');const options=await select.locator('option').evaluateAll((nodes)=>nodes.map((n)=>({value:(n as HTMLOptionElement).value,label:n.textContent})));expect(options.length).toBeGreaterThan(1);
    await select.selectOption(options[1].value);await page.getByRole('button',{name:'View results',exact:true}).click();await expect(page).toHaveURL(new RegExp('event='+options[1].value));expect(await page.locator('main article.card').count()).toBeGreaterThan(0);
    await page.getByRole('navigation').getByRole('link',{name:'About scoring',exact:true}).click();await expect(page.getByText(/Blank means not observed, not zero/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  expect(errors).toEqual([]);await context.close();
});
