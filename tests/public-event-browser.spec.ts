import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { api, command } from './stage-helpers';
import { createStage, limitedStage, finish, owner, receiver } from './publication-helpers';
import type { LiveView } from '../lib/live/types';
import { renderIndex, type PublicStore } from '../public-site/render';

async function release(name: string, count = 1, longNames = false) {
  const setup = limitedStage(count, 4); setup.name = name;
  if (longNames) for (const round of setup.rounds) for (const entrant of round.subjects) {
    entrant.primary += ' Alexandra Montgomery-Wellington';
    if (entrant.secondary) entrant.secondary += ' Christopher Beaumont-Richardson';
  }
  const event = await createStage(setup);
  await finish(setup, event.organizer, event.tokens, event.head, false);
  await command(event.organizer, { action: 'prepare-event-publication' });
  const view = await api<LiveView>(event.organizer);
  const publications = view.publications!.map((record) => ({ publicationId: record.id, sourceFingerprint: record.sourceFingerprint }));
  await command(event.organizer, { action: 'approve-event-publication', publications });
  await owner({ action: 'release-event', publications });
  return view.publications![0];
}

async function measure(page: Page, record: Awaited<ReturnType<typeof release>>, label: string) {
  const measurements = [];
  for (const width of [360, 390, 1264, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(receiver + '/leaderboard?event=' + record.snapshot.eventId);
    await expect(page.getByRole('heading', { name: 'Final places', exact: true }).first()).toBeVisible();
    measurements.push(await page.evaluate(() => ({
      width: innerWidth,
      finalTop: document.querySelector('.public-standings h3')!.getBoundingClientRect().top,
      selectedHeading: Boolean(document.querySelector('.selected-event-heading')),
      switches: document.querySelectorAll('.selected-event-heading form').length,
      heading: document.querySelector('main h1')?.textContent,
      overflow: document.documentElement.scrollWidth > innerWidth,
    })));
    if (process.env.PUBLIC_EVENT_EVIDENCE) {
      mkdirSync(process.env.PUBLIC_EVENT_EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${process.env.PUBLIC_EVENT_EVIDENCE}/${label}-${width}.png`, fullPage: false });
    }
  }
  return measurements;
}

test('selected public events keep results near navigation across one/multiple events without changing direct routes', async ({ browser }) => {
  const context = await browser.newContext(), page = await context.newPage();
  const errors: string[] = [], posts: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  try {
    // Isolate empty/single-event presentation without clearing a shared fictional receiver.
    // Multiple-event switching and every direct route below use the real receiver.
    const directory = receiver + '/leaderboard**';
    await page.route(directory, (route) => route.fulfill({ contentType: 'text/html', body: renderIndex({ records: {}, current: {} }, true) }));
    await page.goto(receiver + '/leaderboard');
    await expect(page.locator('.empty')).toContainText('No released competitions');
    await page.unroute(directory);
    const first = await release('River Bend Country Dance Weekend', 2);
    const released = await (await fetch(receiver + '/api/public')).json() as { records: Pick<PublicStore['records'][string], 'snapshot' | 'releasedAt' | 'underReview' | 'lastSynchronizedAt'>[] };
    const isolated: PublicStore = { records: {}, current: {} };
    for (const record of released.records) if (record.snapshot.eventId === first.snapshot.eventId) {
      isolated.records[record.snapshot.id] = { ...record, id: record.snapshot.id, revision: record.snapshot.revision, status: 'released', sourceFingerprint: record.snapshot.sourceFingerprint, competitionId: record.snapshot.competitionId };
      isolated.current[record.snapshot.competitionId] = record.snapshot.id;
    }
    await page.route(directory, (route) => route.fulfill({ contentType: 'text/html', body: renderIndex(isolated, true, first.snapshot.eventId) }));
    const one = await measure(page, first, 'one-event');
    await page.unroute(directory);
    const second = await release('Annual North Texas Country Dance Celebration & Autumn Invitational Community Finals', 1, true);
    const multi = await measure(page, first, 'multiple-events');
    const long = await measure(page, second, 'long-event');
    if (process.env.PUBLIC_EVENT_EVIDENCE) writeFileSync(`${process.env.PUBLIC_EVENT_EVIDENCE}/measurements.json`, JSON.stringify({ one, multi, long }, null, 2));
    expect([...one, ...multi, ...long].every((row) => row.selectedHeading && !row.overflow)).toBe(true);
    expect(one.every((row) => row.switches === 0)).toBe(true);
    expect([...multi, ...long].every((row) => row.switches === 1)).toBe(true);
    expect(one.find((row) => row.width === 390)!.finalTop).toBeLessThan(700);
    expect(multi.find((row) => row.width === 390)!.finalTop).toBeLessThan(780);
    expect(long.find((row) => row.width === 390)!.finalTop).toBeLessThan(900);
    const before = await (await fetch(receiver + '/api/public')).json();
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(receiver + '/leaderboard?event=' + first.snapshot.eventId);
    await expect(page.getByRole('heading', { level: 1, name: first.snapshot.event.name, exact: true })).toBeVisible();
    for (const heading of await page.locator('article.card > h2').allTextContents()) expect(heading).not.toContain(first.snapshot.event.name);
    const switcher = page.getByRole('combobox', { name: 'Switch event', exact: true });
    await expect(switcher).toHaveValue(first.snapshot.eventId);
    await switcher.selectOption(second.snapshot.eventId); await switcher.focus(); await page.keyboard.press('Tab');
    const submit = page.getByRole('button', { name: 'View results', exact: true });
    await expect(submit).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp('event=' + second.snapshot.eventId));
    await expect(page.getByRole('heading', { level: 1, name: second.snapshot.event.name, exact: true })).toBeVisible();
    for (const entrant of second.snapshot.stages.find((stage) => stage.kind === 'finals')!.entrants) {
      await expect(page.locator('.public-standings').getByRole('link', { name: `#${entrant.number} ${entrant.primary} ${entrant.secondary}`, exact: true })).toBeVisible();
    }
    const allEvents = page.getByRole('link', { name: 'All events', exact: true });
    await allEvents.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.event-directory')).toBeVisible();
    await page.goto(receiver + '/leaderboard?event=unavailable-public-event');
    await expect(page.locator('.empty')).toContainText('No released competitions for this selection');
    await page.getByRole('link', { name: 'Choose another event', exact: true }).click();
    await expect(page.locator('.event-directory')).toBeVisible();
    for (const path of [
      '/competition/' + second.snapshot.eventId + '/' + second.snapshot.competitionId,
      '/results/' + second.id,
      '/results/' + second.id + '/entrant/' + second.snapshot.stages.find((stage) => stage.kind === 'finals')!.entrants[0].id,
      '/results/' + second.id + '/judge/' + second.snapshot.stages[0].judges[0].id,
    ]) {
      await page.goto(receiver + path);
      await expect(page.locator('.selected-event-heading')).toHaveCount(0);
      await expect(page.locator('article.card > h2')).toContainText(second.snapshot.event.name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto(receiver + '/');
    await expect(page.getByRole('heading', { level: 1, name: 'Celebrate the dancers. Find your results.' })).toBeVisible();
    await page.setViewportSize({ width: 1264, height: 900 });
    await expect(page.locator('.hero img')).toBeVisible();
    expect(await (await fetch(receiver + '/api/public')).json()).toEqual(before);
    expect(posts).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
