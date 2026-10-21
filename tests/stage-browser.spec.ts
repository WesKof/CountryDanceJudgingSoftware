import { test, expect, type Page, type Locator } from '@playwright/test';
import { api, base, command, save } from './stage-helpers';
import { createStage, limitedStage, exact } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

async function click(page: Page, target: Locator, action: string) {
  const ack = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === action);
  await target.click(); expect((await ack).status()).toBe(200);
}
async function saved(page: Page) { await expect(page.locator('.pending-panel')).toHaveCount(0, { timeout: 20000 }); }

test('stage workspace: phone scoring, missing heat coverage, pending saves, one submission, all-round history and approvals', async ({ browser }) => {
  test.setTimeout(300000);
  const setup = limitedStage(2, 4), pre = setup.rounds.filter((r) => r.kind === 'prelims'), h = pre[0].heats[0];
  pre[0].heats = [{ ...h, subjectIds: h.subjectIds.slice(0, 2) }, { ...h, id: h.id + '-second', name: 'Heat 2', subjectIds: h.subjectIds.slice(2), songs: h.songs.map((s) => ({ ...s, id: s.id + '-second' })) }];
  const { organizer, tokens, head, path } = await createStage(setup);
  await command(organizer, { action: 'enable-auto-stages' });
  const deskContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), judgeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), headContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const desk = await deskContext.newPage(), judge = await judgeContext.newPage(), headPage = await headContext.newPage();
  const errors: string[] = []; for (const p of [desk, judge, headPage]) p.on('pageerror', (e) => errors.push(e.message));
  try {
    await desk.goto(base + path); await desk.getByRole('button', { name: '02 Score', exact: true }).click();
    await expect(desk.getByRole('button', { name: 'Start prelims stage', exact: true })).toHaveCount(0);
    await expect(desk.getByRole('button', { name: 'Next song', exact: true })).toHaveCount(0);
    await expect(desk.getByRole('button', { name: 'Open prelims review', exact: true })).toHaveCount(0);
    let v = await api<LiveView>(organizer);
    await expect(desk.getByRole('link', { name: 'Head Judge — Synthetic head ↗', exact: true })).toHaveAttribute('href', v.judgeLinks![2].path);
    await judge.goto(base + v.judgeLinks![0].path); await headPage.goto(base + v.judgeLinks![2].path);
    await expect(headPage.getByRole('heading', { level: 1, name: 'Head Judge — Synthetic head', exact: true })).toBeVisible();
    const rounds = v.rounds, missingRound = rounds.at(-1)!, missingHeat = missingRound.definition.heats[0], missingId = missingHeat.subjectIds.at(-1)!, missingSubject = missingRound.definition.subjects.find((s) => s.id === missingId)!;
    for (const r of rounds) for (const heat of r.definition.heats) {
      await judge.getByLabel('Assigned heats and songs', { exact: true }).selectOption(heat.songs[1].id);
      for (const id of heat.subjectIds) {
        const subject = r.definition.subjects.find((s) => s.id === id)!;
        for (const token of tokens.slice(1)) await save(token, r, heat.songs[1].id, id, r.definition.subjects.indexOf(subject) === 0 ? 'Yes' : r.definition.subjects.indexOf(subject) === 1 ? 'A1' : 'No');
        if (id !== missingId) await judge.getByRole('button', { name: `Bib ${subject.number}: ${r.definition.subjects.indexOf(subject) === 0 ? 'Yes' : r.definition.subjects.indexOf(subject) === 1 ? 'A1' : 'No'}`, exact: true }).click();
      }
      await saved(judge);
    }
    // Pending note survives reload, but cannot count as an observation.
    const missingRow = judge.locator(`.phone-row[data-bib="${missingSubject.number}"]`);
    await missingRow.getByRole('button', { name: /^Note/ }).click();
    await judgeContext.route('**/api/live', async (route) => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'save-cell') await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic offline save"}' }); else await route.continue();
    });
    await missingRow.getByRole('textbox').fill('PRIVATE_STAGE_BROWSER_NOTE'); await expect(judge.locator('.pending-panel')).toBeVisible();
    judge.once('dialog', (d) => void d.accept()); await judge.reload(); await expect(judge.locator('.pending-panel')).toBeVisible();
    await judgeContext.unroute('**/api/live'); await saved(judge);
    expect(JSON.stringify(await api<LiveView>(organizer))).not.toContain('PRIVATE_STAGE_BROWSER_NOTE');
    await judge.reload(); await judge.getByRole('button', { name: 'Review & submit prelims', exact: true }).click();
    const submit = judge.getByRole('button', { name: 'Submit prelims', exact: true });
    await expect(submit).toBeDisabled(); await expect(judge.getByRole('heading', { name: 'Scores needed before submission', exact: true })).toBeVisible();
    await judge.getByRole('button', { name: new RegExp(`Strictly · Advanced · Heat 1: #${missingSubject.number}`) }).click();
    await expect(judge.getByLabel('Assigned heats and songs', { exact: true })).toHaveValue(missingHeat.songs[0].id);
    await judge.getByRole('button', { name: `Bib ${missingSubject.number}: No`, exact: true }).click(); await saved(judge);
    await judge.getByRole('button', { name: 'Review & submit prelims', exact: true }).click();
    await expect(submit).toBeDisabled(); await judge.getByRole('checkbox', { name: /^My scheduled dancing is finished/ }).check(); await expect(submit).toBeEnabled();
    await judge.screenshot({ path: 'test-results/stage-review-390.png' });
    await click(judge, submit, 'submit-stage'); await expect(judge.getByRole('heading', { name: 'Your stage scores are submitted', exact: true })).toBeVisible();
    expect((await api<LiveView>(tokens[0])).heatSubmissions).toHaveLength(3);
    expect((await api<LiveView>(organizer)).rounds.every((r) => !r.standings)).toBe(true);
    for (const token of tokens.slice(1)) {
      const own = await api<LiveView>(token); await api(token, { action: 'submit-stage', blockId: own.context.blockId, requestId: crypto.randomUUID(), acknowledged: true, expectedVersion: own.version, ballotVersions: Object.fromEntries(own.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(own.rounds.map((r) => [r.key, r.version])) });
    }
    await headPage.reload(); await expect(headPage.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toHaveCount(2);
    for (let i = 0; i < 2; i++) await click(headPage, headPage.getByRole('button', { name: 'Approve these exact submissions', exact: true }).first(), 'approve');
    const history = headPage.locator('details.setup-section').filter({ has: headPage.getByRole('heading', { name: 'Completed judging & history', exact: true }) });
    await expect(history).not.toHaveAttribute('open'); await expect(headPage.getByRole('heading', { name: 'Head-approved results', exact: true }).first()).toBeHidden();
    await history.locator(':scope > summary').click(); await expect(history.getByRole('heading', { name: 'Head-approved results', exact: true })).toHaveCount(2);
    await desk.reload(); await desk.getByRole('button', { name: '03 Results', exact: true }).click();
    await desk.locator('#results-scorecards > summary').click(); await expect(desk.locator('#results-scorecards').getByRole('heading', { name: 'Prelims · 2 heats', exact: true })).toBeVisible();
    await expect(desk.locator('#results-scorecards').getByRole('heading', { name: 'Prelims · 1 heats', exact: true })).toBeVisible();
    // Finals uses approved entrants and the same stage submission contract.
    v = await api<LiveView>(organizer); expect(v.rounds.filter((r) => r.definition.kind === 'finals')).toHaveLength(2);
    expect(v.context.blockId).toBe(setup.blocks[1].id);
    for (const token of tokens) for (const r of v.rounds.filter((r) => r.definition.kind === 'finals')) for (const heat of r.definition.heats) for (const [i, id] of heat.subjectIds.entries()) await save(token, r, heat.songs[0].id, id, i === 0 ? 'Yes' : 'A1');
    for (const token of tokens) { const own = await api<LiveView>(token); await api(token, { action: 'submit-stage', blockId: own.context.blockId, acknowledged: true, expectedVersion: own.version, requestId: crypto.randomUUID(), ballotVersions: Object.fromEntries(own.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(own.rounds.map((r) => [r.key, r.version])) }); }
    for (const r of v.rounds.filter((r) => r.definition.kind === 'finals')) await exact(head, r.id, 'approve');
    await desk.reload(); await desk.getByRole('button', { name: '03 Results', exact: true }).click(); await desk.locator('#results-scorecards > summary').click();
    await expect(desk.locator('#results-scorecards details.setup-section')).toHaveCount(4);
    await desk.getByRole('button', { name: '02 Score', exact: true }).click();
    const gold = desk.getByRole('button', { name: 'Review event to publish', exact: true }); await gold.hover();
    const colors = await gold.evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor]; }); expect(colors).toEqual(['rgb(24, 52, 41)', 'rgb(243, 212, 147)']);
    for (const p of [judge, headPage]) { expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await p.evaluate(() => innerWidth)); }
    expect(errors).toEqual([]);
  } finally { await Promise.all([deskContext.close(), judgeContext.close(), headContext.close()]); }
});
