import { test, expect } from '@playwright/test';
import { api, base, command, save } from './stage-helpers';
import { createStage, exact } from './publication-helpers';
import { sampleSetup } from '../lib/sample-setup';
import type { LiveView } from '../lib/live/types';

test('automatic desk keeps actions visible, hides context, and opens the exact Finals task in one click', async ({ browser }) => {
  const { organizer, tokens, head, path } = await createStage(sampleSetup());
  await command(organizer, { action: 'enable-auto-stages' });
  const deskContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const judgeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const desk = await deskContext.newPage(), judge = await judgeContext.newPage();
  try {
    await desk.goto(base + path);
    await desk.getByRole('button', { name: '02 Score', exact: true }).click();
    const supporting = desk.locator('#score-supporting-details');
    await expect(supporting).not.toHaveAttribute('open');
    await expect(desk.locator('.round-context')).toBeHidden();
    await expect(desk.locator('#run-live-scores > summary')).toBeHidden();
    const missing = desk.locator('.stage-missing');
    await expect(missing.locator('summary')).toBeVisible();
    await missing.locator('summary').focus(); await missing.locator('summary').press('Enter');
    await expect(missing).toHaveAttribute('open');
    const colors = await missing.evaluate((el) => ({
      panel: getComputedStyle(el).backgroundColor,
      label: getComputedStyle(el.querySelector('summary')!).color,
      text: getComputedStyle(el.querySelector('p')!).color,
    }));
    expect(colors).toEqual({ panel: 'rgb(255, 242, 210)', label: 'rgb(59, 43, 16)', text: 'rgb(59, 43, 16)' });
    expect(await desk.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await desk.screenshot({ path: 'test-results/action-first-missing-390.png', fullPage: true });
    await missing.locator('summary').click();

    const v = await api<LiveView>(organizer);
    await judge.goto(base + v.judgeLinks![0].path);
    await expect(judge.getByRole('heading', { name: '8 scores still needed', exact: true })).toBeVisible();
    await expect(judge.locator('.phone-row')).toHaveCount(4);
    await expect(judge.locator('.judge-scoring-help')).not.toHaveAttribute('open');
    const prelims = v.rounds;
    for (const token of tokens) for (const r of prelims) for (const h of r.definition.heats) for (const [i, id] of h.subjectIds.entries()) {
      const mark = r.definition.format === 'Strictly' ? i === 0 ? 'Yes' : i === 1 ? 'A1' : i === 2 ? 'A2' : 'No' : i % 2 === 0 ? 'Yes' : 'No';
      await save(token, r, h.songs[0].id, id, mark);
    }
    await judge.reload();
    await expect(judge.getByRole('heading', { name: 'Ready to submit your scores', exact: true })).toBeVisible();
    await judge.getByRole('button', { name: 'Review & submit prelims', exact: true }).click();
    const submit = judge.getByRole('button', { name: 'Submit prelims', exact: true });
    await expect(submit).toBeDisabled();
    const firstHeat = judge.locator('.stage-heat-review').first();
    expect((await submit.boundingBox())!.y).toBeLessThan((await firstHeat.boundingBox())!.y);
    await judge.getByRole('checkbox', { name: /^My scheduled dancing is finished/ }).check();
    await submit.click();
    await expect(judge.getByText('Waiting for the other judges. Nothing else to do yet.', { exact: true })).toBeVisible();
    await judge.screenshot({ path: 'test-results/action-first-judge-waiting-390.png', fullPage: true });
    for (const token of tokens.slice(1)) {
      const own = await api<LiveView>(token);
      await api(token, { action: 'submit-stage', blockId: own.context.blockId, acknowledged: true, expectedVersion: own.version, requestId: crypto.randomUUID(), ballotVersions: Object.fromEntries(own.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(own.rounds.map((r) => [r.key, r.version])) });
    }
    await desk.reload();
    await expect(desk.getByRole('heading', { name: 'Head approval needed', exact: true })).toBeVisible();
    await expect(desk.locator('.judge-status-card')).toHaveCount(1);
    await expect(desk.locator('.judge-status-card')).toContainText('Head approval needed');
    await expect(desk.locator('.judge-status-card')).toBeVisible();
    for (const r of prelims) await exact(head, r.id, 'approve');
    await desk.reload();
    await expect(desk.getByRole('heading', { name: 'Set the Finals pairings', exact: true })).toBeVisible();
    await expect(desk.locator('.stage-judge-links')).toHaveCount(0);
    await expect(supporting).not.toHaveAttribute('open');
    await desk.screenshot({ path: 'test-results/action-first-finals-next-390.png', fullPage: true });
    const before = await api<LiveView>(organizer);
    await desk.getByRole('button', { name: 'Set Finals pairings', exact: true }).click();
    await expect(supporting).toHaveAttribute('open');
    await expect(desk.locator('#run-finals')).toHaveAttribute('open');
    await expect(desk.getByLabel('#201 Jordan Lee pairs with', { exact: true })).toBeVisible();
    await expect(desk.locator('#run-finals > summary')).toBeFocused();
    expect((await api<LiveView>(organizer)).version).toBe(before.version);
    expect(await desk.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally { await deskContext.close(); await judgeContext.close(); }
});

