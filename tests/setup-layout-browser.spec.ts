import { test, expect } from '@playwright/test';
import { createStage, limitedStage } from './publication-helpers';
import { api, base } from './stage-helpers';
import type { LiveView } from '../lib/live/types';

test('Set up section navigation and responsive resizing preserve drafts, selection and saved event data', async ({ browser }) => {
  const setup = limitedStage(2, 4), { organizer, path } = await createStage(setup);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(base + path);
  await expect(page.locator('.setup-main-card[open]')).toHaveCount(0);
  await expect(page.locator('.setup-main-card .setup-section[open]')).toHaveCount(0);
  const toolbar = page.locator('.setup-toolbar'), banner = page.locator('.setup-hero');
  expect((await banner.boundingBox())!.y + (await banner.boundingBox())!.height).toBeLessThan((await toolbar.boundingBox())!.y);
  const before = await api<LiveView>(organizer), posts: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/live')) posts.push(request.postDataJSON().action); });
  await page.getByLabel('Go to section').selectOption('Event details');
  await page.getByLabel('Venue', { exact: true }).fill('Synthetic responsive venue');
  const details = page.locator('details[data-section="Event details"]');
  await details.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(details).not.toHaveAttribute('open');
  await expect(details.locator(':scope > summary')).toContainText('Synthetic responsive venue');
  await page.getByLabel('Go to section').selectOption('Program & stages');
  await page.locator('.competition-card').nth(1).click();
  await page.getByLabel('Select round to configure', { exact: true }).selectOption(setup.rounds[3].id);
  await page.getByLabel('Go to section').selectOption('Judges');
  for (const width of [390, 360, 768, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(details).not.toHaveAttribute('open');
    await expect(page.locator('details[data-section="Round setup"]')).not.toHaveAttribute('open');
    await expect(page.getByLabel('Select round to configure')).toHaveValue(setup.rounds[3].id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.getByLabel('Go to section', { exact: true }).selectOption('Event details');
  await expect(details).toHaveAttribute('open');
  await expect(details.locator(':scope > summary')).toBeFocused();
  await expect(page.getByLabel('Venue', { exact: true })).toHaveValue('Synthetic responsive venue');
  await expect(page.locator('details[data-section="Judges"]')).toHaveAttribute('open');
  await expect(page.locator('details[data-section="Round setup"]')).not.toHaveAttribute('open');
  await page.locator('.setup-event-tools > summary').click();
  await page.getByRole('button', { name: 'Other events', exact: true }).click();
  await expect(page.locator('details[data-section="Other events"]')).toHaveAttribute('open');
  await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeEnabled();
  expect(posts).toEqual([]);
  expect((await api<LiveView>(organizer)).setup).toEqual(before.setup);
  const response = page.waitForResponse((r) => r.request().postDataJSON()?.action === 'setup');
  await page.getByRole('button', { name: 'Save setup', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
  const saved = await api<LiveView>(organizer);
  expect(saved.setup).toEqual({ ...before.setup, venue: 'Synthetic responsive venue' });
  expect(saved.context).toEqual(before.context);
  expect(saved.judgeLinks).toEqual(before.judgeLinks);
  expect(saved.ballots).toEqual(before.ballots);
  await page.reload();
  await expect(page.locator('.setup-main-card[open]')).toHaveCount(0);
  await expect(page.getByLabel('Venue', { exact: true })).toHaveValue('Synthetic responsive venue');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/collapsed-setup-${width}.png`, fullPage: true });
  }
  await context.close();
});
