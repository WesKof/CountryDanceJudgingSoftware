import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { api, command, nonce } from './stage-helpers';
import { createStage, limitedStage, finish, owner, receiver } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

async function release(name: string, venue: string, date: string, count: number) {
  const setup = limitedStage(count, 4); Object.assign(setup, { name, venue, date });
  const event = await createStage(setup);
  await finish(setup, event.organizer, event.tokens, event.head, false);
  await command(event.organizer, { action: 'prepare-event-publication' });
  const view = await api<LiveView>(event.organizer);
  const publications = view.publications!.map(record => ({ publicationId: record.id, sourceFingerprint: record.sourceFingerprint }));
  await command(event.organizer, { action: 'approve-event-publication', publications });
  await owner({ action: 'release-event', publications });
  return view.publications![0];
}

test('released event search uses native GET, complete groups and recoverable query context without changing public data', async ({ browser }) => {
  const context = await browser.newContext(), page = await context.newPage();
  const tag = 'Search-' + nonce().slice(0, 12), errors: string[] = [], posts: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  try {
    const initial = await (await fetch(receiver + '/api/public')).json() as { current: Record<string, string> };
    if (!Object.keys(initial.current).length) {
      await page.goto(receiver + '/leaderboard?q=unavailable');
      await expect(page.locator('.empty')).toContainText('No released competitions yet');
      await expect(page.locator('main form')).toHaveCount(0);
    }
    const first = await release(tag + ' Fall <Friends> & "Family" .*', 'Prairie Hall ' + tag + ' ' + 'Unbroken'.repeat(10), '2026-11-15', 2);
    await page.goto(receiver + '/leaderboard?q=' + encodeURIComponent(tag));
    await expect(page.locator('.event-link')).toHaveCount(1);
    await expect(page.locator('.event-link')).toContainText('2 competitions');
    const second = await release(tag + ' Annual North Texas Country Dance Celebration and Community Finals', 'Autumn Pavilion', '2026-12-20', 1);
    const before = await (await fetch(receiver + '/api/public')).json() as { current: Record<string, string>; records: { snapshot: { id: string; eventId: string } }[] };
    const currentIds = new Set(Object.values(before.current));
    const eventCount = new Set(before.records.filter(record => currentIds.has(record.snapshot.id)).map(record => record.snapshot.eventId)).size;
    for (const width of [360, 390, 1264, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(receiver + '/leaderboard');
      const input = page.getByRole('searchbox', { name: 'Search events', exact: true });
      await input.fill('  ' + tag.toUpperCase() + '   family  '); await input.focus(); await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeFocused(); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(url => url.searchParams.has('q'));
      expect(new URL(page.url()).searchParams.get('q')).toContain(tag.toUpperCase());
      await expect(input).toHaveValue(tag.toUpperCase() + ' family');
      await expect(page.locator('main form')).toHaveCount(1); await expect(page.locator('main select')).toHaveCount(0);
      await expect(page.locator('.event-link')).toHaveCount(1); await expect(page.locator('.event-link')).toContainText(first.snapshot.event.name);
      await expect(page.locator('.event-link')).toContainText('2 competitions');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.event-link').click();
      await expect(page.getByRole('heading', { level: 1, name: first.snapshot.event.name, exact: true })).toBeVisible();
      await expect(page.locator('article.card')).toHaveCount(2);
      const switcher = page.getByRole('combobox', { name: 'Switch event', exact: true });
      await switcher.selectOption(second.snapshot.eventId); await page.getByRole('button', { name: 'View results', exact: true }).click();
      await expect(page).toHaveURL(url => url.searchParams.get('event') === second.snapshot.eventId);
      expect(new URL(page.url()).searchParams.get('q')).toBe(tag.toUpperCase() + ' family');
      await page.getByRole('link', { name: 'Back to search', exact: true }).click();
      await expect(input).toHaveValue(tag.toUpperCase() + ' family'); await expect(page.locator('.event-link')).toHaveCount(1);
      await input.fill(tag); await input.press('Enter'); await expect(page.locator('.event-link')).toHaveCount(2);
      if (process.env.PUBLIC_SEARCH_EVIDENCE) {
        mkdirSync(process.env.PUBLIC_SEARCH_EVIDENCE, { recursive: true });
        await page.screenshot({ path: `${process.env.PUBLIC_SEARCH_EVIDENCE}/search-${width}.png`, fullPage: false });
      }
    }
    for (const query of ['prairie ' + tag, '2026-11-15', '<Friends> & "Family"', '.*']) {
      await page.goto(receiver + '/leaderboard?q=' + encodeURIComponent(query));
      await expect(page.getByRole('searchbox')).toHaveValue(query);
      await expect(page.locator('.event-link[href*="' + first.snapshot.eventId + '"]')).toBeVisible();
      await expect(page.locator('.event-link[href*="' + second.snapshot.eventId + '"]')).toHaveCount(0);
    }
    const impossible = '<script>alert("' + tag + '")</script>^$';
    await page.goto(receiver + '/leaderboard?q=' + encodeURIComponent(impossible));
    await expect(page.getByRole('heading', { name: 'No events found', exact: true })).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveValue(impossible); await expect(page.locator('script')).toHaveCount(0);
    await page.getByRole('link', { name: 'Show all events', exact: true }).click();
    await expect(page.getByRole('searchbox')).toHaveValue(''); await expect(page.locator('.event-link')).toHaveCount(eventCount);
    await page.goto(receiver + '/leaderboard?event=missing&q=' + encodeURIComponent(tag));
    await expect(page.locator('.empty')).toContainText('No released competitions for this selection');
    await page.getByRole('link', { name: 'Choose another event', exact: true }).click();
    await expect(page.getByRole('searchbox')).toHaveValue(tag); await expect(page.locator('.event-link')).toHaveCount(2);
    expect(await (await fetch(receiver + '/api/public')).json()).toEqual(before);
    expect(posts).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
