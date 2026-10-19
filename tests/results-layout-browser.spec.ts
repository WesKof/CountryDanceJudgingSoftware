import { test, expect } from '@playwright/test';
import { createStage, limitedStage, exact } from './publication-helpers';
import { api, base, command, save, submitHeat } from './stage-helpers';
import { stageFixture } from './stage-fixture';
import type { LiveView, LiveMark } from '../lib/live/types';

test('Results keeps submitted standings accurate, expands exact scorecards, preserves drafts on resize and retains withdrawn history', async ({ page }) => {
  const setup = limitedStage(1, 2), { organizer, tokens, head, path } = await createStage(setup);
  await command(organizer, { action: 'open-stage', kind: 'prelims' });
  const initial = await api<LiveView>(organizer), round = initial.rounds[0], heat = round.definition.heats[0];
  await page.goto(base + path); await page.getByRole('button', { name: '03 Results', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Judging not yet concluded', exact: true })).toBeVisible();
  await expect(page.locator('.result-sheet')).toHaveCount(0);
  const marks: LiveMark[][] = [['Yes', 'A1'], ['A1', 'Yes'], ['', 'No']];
  for (let song = 0; song < 2; song++) {
    if (song) await command(organizer, { action: 'next' });
    for (let judge = 0; judge < 3; judge++) {
      await save(tokens[judge], round, heat.songs[song].id, heat.subjectIds[0], marks[judge][song], 'RESULTS_PRIVATE_NOTE');
      await save(tokens[judge], round, heat.songs[song].id, heat.subjectIds[1], 'No');
    }
  }
  await command(organizer, { action: 'lineup' });
  for (const token of tokens) await submitHeat(token, round, heat.id);
  await command(organizer, { action: 'conclude-stage' }); await exact(head, round.id, 'approve');
  await page.reload(); await page.getByRole('button', { name: '03 Results', exact: true }).click();
  const sheet = page.locator('.result-sheet');
  await expect(sheet.getByText('4.8333', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Advancing', { exact: true })).toHaveCount(2);
  for (const id of ['results-scorecards', 'results-decisions', 'results-management', 'results-audit']) await expect(page.locator('#' + id)).not.toHaveAttribute('open');
  const top = await page.locator('.results-current').boundingBox(), selector = await page.locator('.round-context').boundingBox(), standings = await sheet.boundingBox();
  expect(top!.y).toBeLessThan(selector!.y); expect(selector!.y).toBeLessThan(standings!.y);
  await sheet.getByRole('button', { name: 'View scorecard for #101', exact: true }).click();
  const first = page.locator('.publication-scorecard').first();
  await expect(first).toHaveAttribute('open'); await expect(first.locator(':scope > summary')).toBeFocused();
  await expect(first.locator('tfoot td').filter({ hasText: /^7\.2500/ })).toHaveCount(2);
  await expect(first.locator('tfoot td').filter({ hasText: /^0\.0000/ })).toHaveCount(1);
  await expect(first.getByText('1 recorded mark', { exact: true })).toBeVisible();
  await expect(first.getByRole('cell', { name: 'Blank Not observed', exact: true })).toBeVisible();
  await expect(first.getByText('No · 0', { exact: true })).toBeVisible();
  await expect(first.locator('details')).not.toHaveAttribute('open');
  await sheet.getByRole('button', { name: 'View scorecard for #102', exact: true }).click();
  await expect(first).toHaveAttribute('open');
  await expect(page.getByRole('button', { name: /Approve.*results|Submit heat|Clear ballot/ })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('RESULTS_PRIVATE_NOTE');
  await page.locator('#results-management > summary').click();
  await page.getByText('Request a score correction', { exact: true }).click();
  const source = (await api<LiveView>(organizer)).heatSubmissions!.find((s) => s.judgeId === setup.judges[0].id)!;
  await page.getByLabel('Submitted heat / judge', { exact: true }).selectOption(source.id);
  await page.getByLabel('Corrected mark for affected bib', { exact: true }).selectOption('A2');
  await page.getByLabel('Correction reason', { exact: true }).fill('Unsaved resize check');
  await expect(page.getByLabel('Correction preview')).toContainText('Yes → A2');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel('Correction reason', { exact: true })).toHaveValue('Unsaved resize check');
    await expect(first).toHaveAttribute('open');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `work/results-${width}.png`, fullPage: true });
  }
  const withdrawal = await command(organizer, { action: 'request-withdrawal', competitionId: setup.competitions[0].id, reason: 'Retain all historical results' }) as { reviewRequestId: string };
  await command(organizer, { action: 'approve-request', reviewRequestId: withdrawal.reviewRequestId, requestVersion: 1 });
  await command(head, { action: 'approve-request', reviewRequestId: withdrawal.reviewRequestId, requestVersion: 1 });
  await page.reload(); await page.getByRole('button', { name: '03 Results', exact: true }).click();
  await page.locator('#results-audit > summary').click();
  await expect(page.getByLabel('History view')).toHaveValue('all');
  const approval = page.locator('.result-audit-entry').filter({ has: page.getByText('Results approved', { exact: true }) });
  await approval.locator('summary').click(); await expect(approval.getByText('4.8333', { exact: true })).toBeVisible();
  await expect(approval).toContainText('Historical approval');
});

test('J&J withdrawal uses actual named remaining pairings and preserves the visited song and revision', async ({ page }) => {
  const setup = stageFixture(undefined, 3), competition = setup.competitions[2];
  setup.competitions = [competition]; setup.rounds = setup.rounds.filter((r) => r.competitionId === competition.id);
  setup.blocks = setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)) }));
  const { organizer, path } = await createStage(setup);
  await command(organizer, { action: 'open-stage', kind: 'prelims' });
  const before = await api<LiveView>(organizer), round = before.rounds[0], heat = round.definition.heats[0];
  const leads = round.definition.subjects.filter((s) => s.role === 'Lead').slice(1), follows = round.definition.subjects.filter((s) => s.role === 'Follow');
  await page.goto(base + path); await page.getByRole('button', { name: '03 Results', exact: true }).click();
  await page.locator('#results-management > summary').click(); await page.locator('#results-entrant-withdrawal > summary').click();
  const form = page.locator('#results-entrant-withdrawal');
  await form.getByLabel('Withdrawal reason', { exact: true }).fill('Named pairing review');
  await form.getByText('Review remaining pairings · 2 undanced songs', { exact: true }).click();
  for (let song = 1; song < 3; song++) {
    const title = heat.songs[song].title;
    const section = form.locator('.score-detail-group').filter({ has: page.getByRole('heading', { name: `Heat 1 · ${title}`, exact: true }) });
    await section.getByRole('button', { name: 'Remove pair', exact: true }).last().click();
    for (let pair = 0; pair < 2; pair++) {
      await form.getByLabel(`${title} pair ${pair + 1} Lead`, { exact: true }).selectOption(leads[pair].id);
      await form.getByLabel(`${title} pair ${pair + 1} Follow`, { exact: true }).selectOption(follows[pair + song - 1].id);
    }
  }
  const response = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'request-withdrawal');
  await form.getByRole('button', { name: 'Request entrant withdrawal', exact: true }).click(); expect((await response).status()).toBe(200);
  const after = await api<LiveView>(organizer), request = after.reviewRequests![0];
  expect(request.payload.pairingPlan).toEqual(heat.songs.slice(1).map((song, index) => ({ performanceId: song.id, partners: leads.map((lead, pair) => [lead.id, follows[index + pair].id]) })));
  expect(after.rounds[0].definition.heats[0].songs[0]).toEqual(heat.songs[0]);
  expect(request.approvals).toHaveLength(0);
  await page.getByRole('button', { name: 'Revise withdrawal request', exact: true }).click();
  await expect(form.getByLabel('Withdrawal reason', { exact: true })).toHaveValue('Named pairing review');
  await expect(form.getByLabel('Song 3 pair 2 Follow', { exact: true })).toHaveValue(follows[2].id);
  await page.getByText('Reviewed undanced pairings', { exact: true }).click();
  await expect(page.locator('.review-request')).toContainText('#202');
  await expect(page.locator('.review-request pre')).toHaveCount(0);
});
