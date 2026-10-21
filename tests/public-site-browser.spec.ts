import {test,expect} from '@playwright/test';
import {receiver} from './publication-helpers';
test('photo-led public website, event filtering and scorecards work on phones and desktop without private access',async({browser})=>{
  const context=await browser.newContext(),page=await context.newPage(),errors:string[]=[];page.on('pageerror',(e)=>errors.push(e.message));
  for(const width of [360,390,1440]){
    await page.setViewportSize({width,height:900});await page.goto(receiver+'/');await expect(page.getByRole('heading',{level:1,name:'A little country. A lot of community.'})).toBeVisible();
    expect(await page.locator('.hero img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth===640)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('.winner-card')).toHaveCount(8);await expect(page.getByRole('link',{name:/Owner|Organizer|Judge access/})).toHaveCount(0);
    await page.locator('.winner-card').first().getByRole('link',{name:'Full leaderboard and scorecards',exact:true}).click();await expect(page.getByRole('heading',{name:'Final places',exact:true})).toBeVisible();await expect(page.locator('.public-prelims')).not.toHaveAttribute('open');await expect(page.getByRole('columnheader',{name:'Count',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('navigation').getByRole('link',{name:'Leaderboard',exact:true}).click();const select=page.getByLabel('Find your competition');const options=await select.locator('option').evaluateAll((nodes)=>nodes.map((n)=>({value:(n as HTMLOptionElement).value,label:n.textContent})));expect(options.length).toBeGreaterThan(1);
    await select.selectOption(options[1].value);await page.getByRole('button',{name:'View results',exact:true}).click();await expect(page).toHaveURL(new RegExp('event='+options[1].value));expect(await page.locator('main article.card').count()).toBeGreaterThan(0);
    await page.getByRole('navigation').getByRole('link',{name:'About scoring',exact:true}).click();await expect(page.getByText(/Blank means not observed, not zero/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  expect(errors).toEqual([]);await context.close();
});
