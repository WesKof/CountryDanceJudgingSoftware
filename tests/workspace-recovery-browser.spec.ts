import { test, expect } from '@playwright/test';
import { api, base, command, nonce } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

const catalogKey = 'country-dance-judging:organizer-history';

test('an event saved during a summary read appears without reloading or losing existing links', async ({ browser }) => {
  const earlier = limitedStage(1, 4), added = limitedStage(1, 4);
  earlier.name = 'Synthetic earlier workspace'; added.name = 'Synthetic newly saved workspace';
  const first = await createStage(earlier), second = await createStage(added);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  await context.addInitScript(({ key, path, name, requestId }) => {
    localStorage.setItem(key, JSON.stringify([{ path, name }]));
    localStorage.setItem('country-dance-judging:rehearsal', JSON.stringify({ path, nonce: requestId, configured: true }));
  }, { key: catalogKey, path: first.path, name: earlier.name, requestId: nonce() });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/live?summary=1', async (route) => { await pending; await route.continue(); });
  try {
    await page.goto(base); await page.getByRole('button', { name: 'Events', exact: true }).click();
    await expect(page.getByText('Checking saved events…', { exact: true })).toBeVisible();
    // Another organizer tab can save a link while this tab's summary read is pending.
    await page.evaluate(({ key, path, name }) => {
      const entries = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify([...entries, { path, name }]));
    }, { key: catalogKey, path: second.path, name: added.name });
    release();
    await expect(page.getByText('Checking saved events…', { exact: true })).not.toBeVisible();
    const paths = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).map((entry: { path: string }) => entry.path), catalogKey);
    expect(paths).toEqual([first.path, second.path]);
    await expect(page.locator(`[data-event-path="${second.path}"]`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`[data-event-path="${first.path}"]`)).toBeVisible();
  } finally { release(); await context.close(); }
});

test('failed event checks have a visible retry that refreshes only summaries and preserves event data', async ({ browser }) => {
  const setup = limitedStage(1, 4); setup.name = 'Synthetic retry workspace';
  const event = await createStage(setup);
  await command(event.organizer, { action: 'enable-auto-stages' });
  const before = await api<LiveView>(event.organizer);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  await context.addInitScript(({ key, path, name, requestId }) => {
    localStorage.setItem(key, JSON.stringify([{ path, name }]));
    localStorage.setItem('country-dance-judging:rehearsal', JSON.stringify({ path, nonce: requestId, configured: true }));
  }, { key: catalogKey, path: event.path, name: setup.name, requestId: nonce() });
  let unavailable = true;
  await page.route('**/api/live?summary=1', async (route) => {
    if (unavailable) await route.fulfill({ status: 503, json: { error: 'Synthetic temporary outage' } });
    else await route.continue();
  });
  const writes: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/live')) writes.push(request.postDataJSON().action); });
  try {
    await page.goto(base); await page.getByRole('button', { name: 'Events', exact: true }).click();
    await expect(page.getByText('Link unavailable. Your saved link is retained.', { exact: true })).toBeVisible();
    unavailable = false;
    await page.getByLabel('Find an event', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Refresh events', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Link unavailable. Your saved link is retained.', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive · ' + setup.name, exact: true })).toBeEnabled();
    expect(writes).toEqual([]);
    const after = await api<LiveView>(event.organizer);
    expect(after.version).toBe(before.version); expect(after.ballots).toEqual(before.ballots);
    for (const width of [360, 390, 738, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width <= 390) expect((await page.getByLabel('Find an event', { exact: true }).boundingBox())!.width).toBeGreaterThan(170);
      if (width === 390 || width === 1440) await page.screenshot({ path: `test-results/workspace-recovery-${width}.png`, fullPage: true });
    }
  } finally { await context.close(); }
});

test('creating an event locks the submitted fields until a response and retains them after a failed request', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let rejectCreation = true;
  const requests: { requestId: string; name: string; venue: string }[] = [];
  await page.route('**/api/live', async (route) => {
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'create') {
      requests.push(route.request().postDataJSON());
      if (rejectCreation) { await pending; await route.fulfill({ status: 503, json: { error: 'Synthetic creation temporarily unavailable' } }); }
      else await route.continue();
    } else await route.continue();
  });
  try {
    await page.goto(base + '/live/new');
    await page.getByLabel('Event name', { exact: true }).fill('Synthetic delayed creation');
    await page.getByText('Venue & date (optional)', { exact: true }).click();
    await page.getByLabel('Venue', { exact: true }).fill('Synthetic retained venue');
    const request = page.waitForRequest((r) => r.method() === 'POST' && r.postDataJSON()?.action === 'create');
    await page.getByRole('button', { name: 'Create shared event', exact: true }).click(); await request;
    await expect(page.getByLabel('Event name', { exact: true })).toBeDisabled({ timeout: 5000 });
    await expect(page.getByLabel('Venue', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Creating event…', exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole('alert')).toHaveText('Synthetic creation temporarily unavailable');
    await expect(page.getByLabel('Event name', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('Synthetic delayed creation');
    await expect(page.getByLabel('Venue', { exact: true })).toHaveValue('Synthetic retained venue');
    await page.screenshot({ path: 'test-results/create-retry-390.png', fullPage: true });
    rejectCreation = false;
    await page.getByRole('button', { name: 'Create shared event', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Synthetic delayed creation', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add competitions', exact: true })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1].requestId).toBe(requests[0].requestId);
    expect(requests[1].name).toBe('Synthetic delayed creation');
    expect(requests[1].venue).toBe('Synthetic retained venue');
  } finally { release(); await context.close(); }
});
