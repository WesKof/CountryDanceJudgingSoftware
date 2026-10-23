import { test, expect, type Browser } from '@playwright/test';
import { api, base, command, save } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import { stageFixture } from './stage-fixture';
import { cellKey, type LiveSetup, type LiveView } from '../lib/live/types';

async function pendingConflict(browser: Browser, setup: LiveSetup, jackAndJill = false) {
  const event = await createStage(setup);
  await command(event.organizer, { action: 'enable-auto-stages' });
  const organizerView = await api<LiveView>(event.organizer), round = organizerView.rounds[0], heat = round.definition.heats[0];
  const subject = jackAndJill ? round.definition.subjects.filter((entry) => entry.role === 'Follow')[2] : round.definition.subjects[0];
  const song = heat.songs[jackAndJill ? 1 : 0];
  if (jackAndJill) await save(event.tokens[0], round, heat.songs[0].id, round.definition.subjects[0].id, 'No');
  const stale = await api<LiveView>(event.tokens[0]);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  await page.route('**/api/live', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ json: stale }); else await route.continue();
  });
  await page.goto(base + organizerView.judgeLinks![0].path);
  await page.getByLabel('Assigned heats and songs', { exact: true }).selectOption(song.id);
  await save(event.tokens[0], round, song.id, subject.id, jackAndJill ? '' : 'A1', 'PRIVATE_ELIGIBILITY_SERVER');
  const row = page.locator(`.phone-row[data-bib="${subject.number}"]`);
  await row.getByRole('button', { name: /^Note/ }).click();
  await row.getByRole('textbox').fill('PRIVATE_ELIGIBILITY_PENDING');
  const conflict = page.waitForResponse((response) => response.request().method() === 'POST' && response.status() === 409);
  await row.getByRole('button', { name: `Bib ${subject.number}: Yes`, exact: true }).click(); await conflict;
  await expect(page.getByRole('button', { name: 'Keep my edit after comparison', exact: true })).toBeEnabled();
  await page.unroute('**/api/live');
  return { event, round, heat, subject, song, context, page, row };
}

test('a withdrawn entrant keeps saved and pending notes but cannot resend a conflict through Keep my edit', async ({ browser }) => {
  const { event, round, subject, song, context, page, row } = await pendingConflict(browser, limitedStage(1, 4));
  try {
    const request = await command(event.organizer, { action: 'request-withdrawal', competitionId: round.definition.competitionId, roundKey: round.key, subjectId: subject.id, reason: 'Synthetic pending conflict withdrawal' }) as { reviewRequestId: string };
    await command(event.organizer, { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    await command(event.head, { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(row.getByText(/Withdrawn/)).toBeVisible();
    await expect(row.getByRole('button', { name: `Bib ${subject.number}: Yes`, exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Keep my edit after comparison', exact: true })).toBeDisabled({ timeout: 3000 });
    await expect(page.getByText('Pending note: PRIVATE_ELIGIBILITY_PENDING', { exact: true })).toBeVisible();
    await expect(row.getByRole('textbox')).toBeDisabled();
    await expect(row.getByRole('button', { name: 'Clear this mark', exact: true })).toBeDisabled();
    await expect(page.locator('.pending-panel').getByRole('status')).toHaveText('This entry is withdrawn. Retained marks and notes are read only.');
    const saved = await api<LiveView>(event.tokens[0]);
    expect(saved.ballots[0].cells[cellKey(song.id, subject.id)]).toMatchObject({ mark: 'A1', note: 'PRIVATE_ELIGIBILITY_SERVER' });
    expect(JSON.stringify(await api<LiveView>(event.organizer))).not.toContain('PRIVATE_ELIGIBILITY_PENDING');
    await page.locator('.pending-panel').screenshot({ path: 'test-results/withdrawn-pending-390.png' });
  } finally { await context.close(); }
});

test('an approved J&J pairing change makes every score editor read only for an unscheduled song without dropping the pending edit', async ({ browser }) => {
  const setup = stageFixture(undefined, 3), competition = setup.competitions[2];
  setup.competitions = [competition]; setup.rounds = setup.rounds.filter((round) => round.competitionId === competition.id);
  setup.blocks = setup.blocks.map((block) => ({ ...block, roundIds: block.roundIds.filter((id) => setup.rounds.some((round) => round.id === id)) }));
  const { event, round, heat, subject, song, context, page, row } = await pendingConflict(browser, setup, true);
  try {
    const removed = round.definition.subjects.find((entry) => entry.role === 'Lead')!;
    const leads = round.definition.subjects.filter((entry) => entry.role === 'Lead' && entry.id !== removed.id), follows = round.definition.subjects.filter((entry) => entry.role === 'Follow');
    const pairingPlan = heat.songs.slice(1).map((performance, index) => ({ performanceId: performance.id, partners: leads.map((lead, position) => [lead.id, follows[(position + index) % follows.length].id]) }));
    const request = await command(event.organizer, { action: 'request-withdrawal', competitionId: competition.id, roundKey: round.key, subjectId: removed.id, reason: 'Synthetic revised undanced song assignment', pairingPlan }) as { reviewRequestId: string };
    await command(event.organizer, { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    await command(event.head, { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(row.getByText(/Not scheduled this song/)).toBeVisible();
    await expect(row.getByRole('button', { name: `Bib ${subject.number}: Yes`, exact: true })).toBeDisabled();
    await expect(row.getByRole('textbox')).toBeDisabled();
    await expect(row.getByRole('button', { name: 'Clear this mark', exact: true })).toBeDisabled({ timeout: 3000 });
    await expect(page.getByRole('button', { name: 'Keep my edit after comparison', exact: true })).toBeDisabled();
    await expect(page.locator('.pending-panel').getByRole('status')).toHaveText('Not scheduled for this song. Retained marks and notes are read only.');
    const retained = await api<LiveView>(event.tokens[0]);
    expect(retained.ballots[0].cells[cellKey(song.id, subject.id)]).toMatchObject({ mark: '', note: 'PRIVATE_ELIGIBILITY_SERVER' });
    const cache = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('country-dance-live:pending:')).map(([, value]) => value).join(''));
    expect(cache).toContain('PRIVATE_ELIGIBILITY_PENDING');
    await page.locator('.pending-panel').screenshot({ path: 'test-results/unscheduled-pending-390.png' });
    for (const width of [360, 738, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator('.pending-panel').screenshot({ path: 'test-results/unscheduled-pending-1440.png' });
    await page.getByRole('button', { name: 'Open score', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(row).toBeFocused();
  } finally { await context.close(); }
});
