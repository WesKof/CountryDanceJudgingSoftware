import { test, expect, type Page } from '@playwright/test';
import { api, base, command, save, submitHeat } from './stage-helpers';
import { createStage, limitedStage, dance, exact, receiver, localKey } from './publication-helpers';
import type { LiveView } from '../lib/live/types';
import { stageFixture } from './stage-fixture';
import { setFinalsPair } from '../lib/live/finalists';

async function publishTab(page: Page) { await page.getByRole('button', { name: '04 Publish', exact: true }).click(); }
async function layout(page: Page, name: string) {
  for (const width of [360, 390, 727, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/publication-display-${name}-${width}.png`, fullPage: false });
  }
}

test('Publish clearly distinguishes review, send and released states while scorecards preserve blanks, zeroes and equal judge means', async ({ browser }) => {
  const setup = limitedStage(1, 4), { organizer, tokens, head, path } = await createStage(setup);
  await command(organizer, { action: 'open-stage', kind: 'prelims' });
  let view = await api<LiveView>(organizer); const prelim = view.rounds[0];
  await dance(organizer, tokens, prelim); await command(organizer, { action: 'conclude-stage' }); await exact(head, prelim.id, 'approve');
  await command(organizer, { action: 'open-stage', kind: 'finals' });
  view = await api<LiveView>(organizer); const finals = view.rounds.find((r) => r.definition.kind === 'finals')!, heat = finals.definition.heats[0];
  for (const [index, token] of tokens.entries()) {
    await save(token, finals, heat.songs[0].id, heat.subjectIds[0], index === 2 ? 'A1' : 'Yes');
    await save(token, finals, heat.songs[0].id, heat.subjectIds[1], 'A1');
  }
  await command(organizer, { action: 'next' }); await save(tokens[0], finals, heat.songs[1].id, heat.subjectIds[0], 'No');
  await command(organizer, { action: 'lineup' }); for (const token of tokens) await submitHeat(token, finals, heat.id);
  await command(organizer, { action: 'conclude-stage' }); await exact(head, finals.id, 'approve');
  view = await api<LiveView>(organizer); expect(view.rounds.find((r) => r.id === finals.id)!.standings!.rows.map((r) => r.average)).toEqual([6.5, 4.5]);
  const context = await browser.newContext({ timezoneId: 'America/Chicago' }), page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path); await publishTab(page);
  const task = page.locator('.publication-task');
  await expect(task.getByRole('heading', { name: 'Ready for your review', exact: true })).toBeVisible();
  await expect(task.getByRole('button', { name: 'Review results to publish', exact: true })).toBeEnabled();
  await task.getByRole('button', { name: 'Review results to publish', exact: true }).click();
  await expect(task.getByRole('button', { name: 'Send results for approval', exact: true })).toBeVisible();
  const before = await api<LiveView>(organizer), snapshot = before.publications![0].snapshot;
  const preview = page.locator('[data-publication-id]').first();
  await expect(preview.locator('.result-group')).toContainText('6.5000');
  await preview.getByText('Prelims, scorecards & scoring details', { exact: true }).click();
  const finalCards = preview.locator('.snapshot-stage').filter({ has: page.getByRole('heading', { name: 'Finals', exact: true }) });
  const first = finalCards.locator('.publication-scorecard').filter({ hasText: '#101 Entrant 0-0 1' });
  await first.locator(':scope > summary').focus(); await first.locator(':scope > summary').press('Enter');
  await expect(first).toHaveAttribute('open');
  const rows = first.getByRole('row');
  await expect(rows.nth(1).getByRole('cell')).toHaveText(['Yes', 'Yes', 'A1']);
  await expect(rows.nth(2).getByRole('cell')).toHaveText(['No', 'BlankNot observed', 'BlankNot observed']);
  await expect(first.locator('tfoot')).toContainText('5.0000'); await expect(first.locator('tfoot')).toContainText('2 recorded marks');
  await expect(first.locator('tfoot')).toContainText('10.0000'); await expect(first.locator('tfoot')).toContainText('4.5000');
  await expect(first.locator(':scope > summary')).toContainText('Average 6.5000');
  const prelimCards = preview.locator('.snapshot-stage').filter({ has: page.getByRole('heading', { name: 'Prelims', exact: true }) });
  const zero = prelimCards.locator('.publication-scorecard').filter({ hasText: '#103 Entrant 0-0 3' });
  await zero.locator(':scope > summary').click(); await expect(zero.locator('tfoot')).toContainText('0.0000');
  await expect(zero.getByRole('row').nth(1).getByRole('cell')).toHaveText(['No', 'No', 'No']);
  await expect(zero.getByRole('row').nth(2).getByRole('cell')).toHaveText(['BlankNot observed', 'BlankNot observed', 'BlankNot observed']);
  await zero.locator(':scope > summary').click();
  await first.scrollIntoViewIfNeeded(); await layout(page, 'scorecard');
  const history = page.locator('.publication-history').first(); await history.locator(':scope > summary').click();
  await expect(history).toContainText('Ready to send for approval'); await expect(history).toContainText('Not published');
  expect((await api<LiveView>(organizer)).version).toBe(before.version);
  expect((await api<LiveView>(organizer)).publications![0].snapshot).toEqual(snapshot);
  await task.getByRole('button', { name: 'Send results for approval', exact: true }).click();
  await expect(task.getByRole('button', { name: 'Sent · awaiting website admin', exact: true })).toBeDisabled();
  await expect(task.getByRole('heading', { name: 'Waiting for website approval', exact: true })).toBeVisible();
  await expect(history).toContainText('Awaiting website admin');
  await task.scrollIntoViewIfNeeded(); await layout(page, 'waiting');
  const adminContext = await browser.newContext(), admin = await adminContext.newPage(); await admin.goto(receiver + '/admin');
  await admin.getByLabel('Admin access code', { exact: true }).fill(localKey('LOCAL_OWNER_KEY')); await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await admin.locator(`[data-event-id="${snapshot.eventId}"]`).getByRole('button', { name: 'Approve & publish results', exact: true }).click();
  await expect(admin.getByText('Approved and published. The results are now on this website.', { exact: true })).toBeVisible();
  await expect(task.getByRole('button', { name: 'Results already published', exact: true })).toBeDisabled({ timeout: 15000 });
  await expect(task.getByText(/No further publishing action is needed/)).toBeVisible();
  await expect(task.getByRole('button', { name: 'Send results for approval', exact: true })).toHaveCount(0);
  await expect(history.locator('time')).toHaveCount(2);
  expect(await history.locator('time').first().getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(await history.locator('time').first().innerText()).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
  await task.scrollIntoViewIfNeeded(); await layout(page, 'published');
  await history.scrollIntoViewIfNeeded(); await layout(page, 'history');
  expect((await api<LiveView>(organizer)).publications![0].snapshot).toEqual(snapshot);
  expect(errors).toEqual([]); await Promise.all([context.close(), adminContext.close()]);
});

test('J&J publication groups Prelims by role and Finals by the actual couple without changing snapshot data', async ({ browser }) => {
  const setup = stageFixture(), competition = setup.competitions[2];
  setup.competitions = [competition]; setup.rounds = setup.rounds.filter((r) => r.competitionId === competition.id);
  setup.blocks = setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)) }));
  const { organizer, tokens, head, path } = await createStage(setup);
  await command(organizer, { action: 'open-stage', kind: 'prelims' });
  let view = await api<LiveView>(organizer); const prelim = view.rounds[0], heat = prelim.definition.heats[0];
  for (const token of tokens) for (const [i, subject] of prelim.definition.subjects.entries()) await save(token, prelim, heat.songs[0].id, subject.id, i % 3 === 0 ? 'Yes' : i % 3 === 1 ? 'A1' : 'A2');
  for (let i = 1; i < heat.songs.length; i++) await command(organizer, { action: 'next' });
  await command(organizer, { action: 'lineup' }); for (const token of tokens) await submitHeat(token, prelim, heat.id);
  await command(organizer, { action: 'conclude-stage' }); await exact(head, prelim.id, 'approve');
  view = await api<LiveView>(organizer); const final = view.setup.rounds[1];
  await command(organizer, { action: 'setup', setup: setFinalsPair(view.setup, final.id, prelim.definition.subjects[0].id, prelim.definition.subjects[3].id) });
  await command(organizer, { action: 'open-stage', kind: 'finals' }); view = await api<LiveView>(organizer);
  const finals = view.rounds.find((r) => r.id === final.id)!; await dance(organizer, tokens, finals);
  await command(organizer, { action: 'conclude-stage' }); await exact(head, finals.id, 'approve');
  await command(organizer, { action: 'prepare-event-publication' }); const before = await api<LiveView>(organizer), snapshot = before.publications![0].snapshot;
  const context = await browser.newContext(), page = await context.newPage(); await page.goto(base + path); await publishTab(page);
  const preview = page.locator('.publication-preview'); await preview.getByText('Prelims, scorecards & scoring details', { exact: true }).click();
  const pre = preview.locator('.snapshot-stage').filter({ has: page.getByRole('heading', { name: 'Prelims', exact: true }) });
  await expect(pre.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible(); await expect(pre.getByRole('heading', { name: 'Follows', exact: true })).toBeVisible();
  await expect(pre.locator('.publication-scorecard')).toHaveCount(6);
  const fin = preview.locator('.snapshot-stage').filter({ has: page.getByRole('heading', { name: 'Finals', exact: true }) });
  const card = fin.locator('.publication-scorecard'); await expect(card).toHaveCount(1);
  await expect(card.locator('summary')).toContainText('#201 Entrant 1-0 1 & Entrant 1-0 4'); await card.locator('summary').click();
  await expect(card.getByRole('row').nth(1).getByRole('cell')).toHaveText(['Yes', 'Yes', 'Yes']);
  await expect(card.getByRole('row').nth(2).getByRole('cell')).toHaveText(['BlankNot observed', 'BlankNot observed', 'BlankNot observed']);
  await expect(card.locator('tfoot')).toContainText('10.0000'); await expect(card.locator('summary')).toContainText('Average 10.0000');
  await card.scrollIntoViewIfNeeded(); await layout(page, 'jj-scorecard');
  const after = await api<LiveView>(organizer); expect(after.version).toBe(before.version); expect(after.publications![0].snapshot).toEqual(snapshot);
  expect(after.rounds.find((r) => r.id === finals.id)!.definition).toEqual(finals.definition); await context.close();
});
