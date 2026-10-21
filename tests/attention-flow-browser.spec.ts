import { openResultsContext } from './setup-browser-helpers';
import { test, expect, type Page } from '@playwright/test';
import { api, base } from './stage-helpers';
import type { LiveView } from '../lib/live/types';

async function settled(page: Page) { await expect(page.locator('.pending-panel')).toHaveCount(0); }
async function submit(page: Page, kind: 'prelims' | 'finals') {
  await settled(page);
  await page.getByRole('button', { name: `Review & submit ${kind}`, exact: true }).click();
  const button = page.getByRole('button', { name: `Submit ${kind}`, exact: true });
  await expect(button).toBeDisabled();
  await page.getByRole('checkbox', { name: /^My scheduled dancing is finished/ }).check();
  await button.click();
}
async function mark(page: Page, bib: number, value: string) { await page.getByRole('button', { name: `Bib ${bib}: ${value}`, exact: true }).click(); }

test('fresh sample runs from setup through automatic stages and private publication preview with low-effort judge navigation', async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desk = await context.newPage();
  const judgeContexts = await Promise.all([390, 727, 1440].map((width) => browser.newContext({ viewport: { width, height: 900 } })));
  const judges = await Promise.all(judgeContexts.map((c) => c.newPage()));
  const errors: string[] = [];
  for (const page of [desk, ...judges]) page.on('pageerror', (e) => errors.push(e.message));
  try {
    // A completely fresh browser session creates the sample through the actual organizer UI.
    await desk.goto(base);
    await expect(desk.getByRole('heading', { level: 1, name: 'Sample Country Dance Social', exact: true })).toBeVisible();
    const binding = await desk.evaluate(() => JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!) as {path:string});
    const organizer = binding.path.split('/').at(-1)!;
    let view = await api<LiveView>(organizer);
    expect(view.context.automaticStages).toBe(true);
    expect(view.rounds).toHaveLength(2);
    expect(view.rounds.every((r) => r.phase === 'dancing')).toBe(true);
    await expect(desk.getByRole('heading', {name:'Prelims is ready for judges',exact:true})).toBeVisible();
    await desk.getByRole('button', {name:'Open judging desk',exact:true}).click();
    await expect(desk.locator('#score-supporting-details')).not.toHaveAttribute('open');
    for (const [i, page] of judges.entries()) {
      await page.goto(base + view.judgeLinks![i].path);
      await expect(page.getByRole('heading', { name: '8 scores still needed', exact: true })).toBeVisible();
      await expect(page.locator('.side-rail')).toHaveCount(0);
      await expect(page.locator('.judge-scoring-help')).not.toHaveAttribute('open');
      const firstMark = page.getByRole('button', { name: 'Bib 101: Yes', exact: true });
      expect((await firstMark.boundingBox())!.y + 44).toBeLessThan(900);
      await page.screenshot({ path: `test-results/focused-judge-scoring-${i}.png` });
      await page.getByRole('button', { name: 'Score next bib · #101', exact: true }).click();
      await expect(page.locator('#judge-bib-101')).toBeFocused();
      await mark(page, 101, 'Yes'); await mark(page, 102, 'A1'); await mark(page, 103, 'A2');
      await page.getByRole('button', { name: 'Next song →', exact: true }).click();
      await expect(page.locator('#judge-ballot')).toBeFocused();
      await expect(page.getByText('Song 2 / 4', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '← Previous song', exact: true }).click();
      await expect(firstMark).toHaveAttribute('aria-pressed', 'true');
      // All prepared songs remain freely selectable; preserve the optional song blanks.
      await page.getByLabel('Assigned heats and songs', { exact: true }).selectOption({ label: 'Jack & Jill · Beginner / Intermediate · prelims · Heat 1 · Sample two-step' });
      for (const [bib, value] of [[201,'Yes'],[202,'No'],[301,'Yes'],[302,'No']] as const) await mark(page,bib,value);
      await settled(page);
      await page.getByRole('button', { name: 'Review & submit prelims', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Submit prelims', exact: true })).toBeDisabled();
      await expect(page.getByRole('checkbox', { name: /^My scheduled dancing is finished/ })).toBeDisabled();
      await page.getByRole('button', { name: /Strictly · Beginner \/ Intermediate · Heat 1: #104/ }).click();
      await expect(page.locator('#judge-bib-104')).toBeFocused();
      await mark(page,104,'No'); await submit(page,'prelims');
      if (i < 2) await expect(page.getByText('Waiting for the other judges. Nothing else to do yet.', {exact:true})).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    const head = judges[2];
    await expect(head.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toHaveCount(2);
    await judges[0].reload();
    await expect(judges[0].getByText('Waiting for head approval. Nothing else to do yet.', {exact:true})).toBeVisible();
    await expect(judges[0].getByRole('heading', {name:'Provisional results',exact:true}).first()).toBeHidden();
    await desk.reload(); await desk.getByRole('button', {name:'03 Results',exact:true}).click();
    await expect(desk.getByRole('link', {name:'Open Head Judge — Robin Hayes ↗',exact:true})).toHaveAttribute('href',view.judgeLinks![2].path);
    for (let i=0;i<2;i++) { await head.getByRole('button', {name:'Approve these exact submissions',exact:true}).first().click(); await expect(head.getByRole('button', {name:'Approve these exact submissions',exact:true})).toHaveCount(1-i); }
    await expect(head.getByRole('heading',{name:'Prelims results approved',exact:true})).toBeVisible();
    await desk.reload(); await desk.getByRole('button',{name:'02 Score',exact:true}).click();
    await desk.getByLabel('#201 Jordan Lee pairs with',{exact:true}).selectOption({label:'#301 Morgan Davis'});
    await desk.getByRole('button',{name:'Save Finals pairings',exact:true}).click();
    await expect(desk.getByRole('heading',{name:'Judging in progress',exact:true})).toBeVisible();
    view=await api<LiveView>(organizer);
    expect(view.context.blockId).toBe(view.setup.blocks.find((b)=>b.kind==='finals')!.id);
    for (const page of judges) {
      await expect(page.getByRole('heading',{name:'3 scores still needed',exact:true})).toBeVisible();
      await expect(page.getByText('Stage submitted. Your scores are locked.',{exact:true})).toHaveCount(0);
      await mark(page,101,'Yes'); await mark(page,102,'A1');
      await settled(page);
      await page.getByRole('button',{name:'Score next bib · #201',exact:true}).click();
      await expect(page.locator('#judge-bib-201')).toBeFocused();
      await expect(page.locator('#judge-bib-201')).toContainText('Morgan Davis');
      await expect(page.getByRole('heading',{name:'1 score still needed',exact:true})).toBeVisible();
      await mark(page,201,'Yes'); await submit(page,'finals');
    }
    for (let i=0;i<2;i++) { await head.getByRole('button',{name:'Approve these exact submissions',exact:true}).first().click(); await expect(head.getByRole('button',{name:'Approve these exact submissions',exact:true})).toHaveCount(1-i); }
    await expect(head.getByRole('heading',{name:'Finals results approved',exact:true})).toBeVisible();
    await expect(head.getByText('Judging is complete. No further action needed.',{exact:true})).toBeVisible();
    await expect(head.locator('.result-sheet').first()).toBeHidden();
    await head.screenshot({path:'test-results/focused-judge-complete.png'});
    view=await api<LiveView>(organizer);
    expect(view.heatSubmissions).toHaveLength(12);
    expect(view.rounds.every((r)=>r.standings?.approved)).toBe(true);
    expect(view.rounds.filter((r)=>r.definition.kind==='finals').map((r)=>r.standings!.rows.map((s)=>s.average))).toEqual([[10,4.5],[10]]);
    await desk.getByRole('button',{name:'03 Results',exact:true}).click();
    await openResultsContext(desk);await desk.locator('#results-scorecards > summary').click();
    await expect(desk.locator('#results-scorecards details.setup-section')).toHaveCount(4);
    await desk.getByRole('button',{name:'04 Publish',exact:true}).click();
    await expect(desk.getByText('Finals pairings saved. Scoring opens automatically when every division is ready.',{exact:true})).toHaveCount(0);
    expect(await desk.evaluate(()=>window.scrollY)).toBe(0);
    await expect(desk.getByText('All Finals are approved. Prepare a private preview before sending for website approval.',{exact:true})).toBeVisible();
    await desk.getByRole('button',{name:'Review results to publish',exact:true}).click();
    await expect(desk.getByRole('button',{name:'Send results for approval',exact:true})).toBeVisible();
    await expect(desk.locator('.publication-competition')).toHaveCount(2);
    for(const card of await desk.locator('.publication-competition').all()) {
      await expect(card).toHaveAttribute('open');
      await expect(card.getByRole('heading',{name:'Final places',exact:true})).toBeVisible();
    }
    const prepared=await api<LiveView>(organizer);
    expect(prepared.publications).toHaveLength(2);
    expect(prepared.publications!.every((p)=>p.status==='prepared'&&!p.releasedAt)).toBe(true);
    await desk.screenshot({path:'test-results/focused-whole-event-preview.png',fullPage:true});
    expect(errors).toEqual([]);
  } finally { await context.close(); for(const c of judgeContexts) await c.close(); }
});
