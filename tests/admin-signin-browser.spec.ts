import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { api, command } from './stage-helpers';
import { createStage, limitedStage, finish, localKey, owner, receiver, publicationBaseline } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

async function prepared(name: string, publish = false) {
  const setup = limitedStage(1, 4); setup.name = name;
  const event = await createStage(setup); await finish(setup, event.organizer, event.tokens, event.head, false);
  await command(event.organizer, { action: 'prepare-event-publication' });
  const view = await api<LiveView>(event.organizer), publications = view.publications!.map(record => ({ publicationId: record.id, sourceFingerprint: record.sourceFingerprint }));
  await command(event.organizer, { action: 'approve-event-publication', publications });
  if (publish) await owner({ action: 'release-event', publications });
  return { ...event, name, eventId: view.publications![0].snapshot.eventId };
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('selected admin event survives failed sign-in and retry without changing authorized event or public data', async ({ browser }) => {
  const file = process.env.LOCAL_TEST_RECEIVER_STORE; if (!file) throw new Error('Set the owned fictional receiver store for hash verification before creating events.');
  const storeHash = () => createHash('sha256').update(readFileSync(file)).digest('hex'); storeHash();
  const baseline = await publicationBaseline();
  const completed = await prepared('Synthetic sign-in continuity · Published event', true);
  const first = await prepared('Synthetic sign-in continuity · First pending event'), second = await prepared('Synthetic sign-in continuity · Latest pending event');
  const events = [completed, first, second], before = await Promise.all(events.map(async event => digest(await api<LiveView>(event.organizer))));
  const publicBefore = storeHash();
  const publicApiBefore = digest(await (await fetch(receiver + '/api/public')).json());
  const errors: string[] = [], posts: string[] = [];
  for (const selected of [{ eventId: completed.eventId, heading: 'Results published', name: completed.name }, { eventId: first.eventId, heading: 'Results ready for review', name: first.name }, { eventId: 'unavailable-event', heading: 'No results to review for this event', name: '' }, { eventId: '', heading: 'Results ready for review', name: second.name }]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
    try {
      await page.goto(receiver + '/admin' + (selected.eventId ? '?event=' + encodeURIComponent(selected.eventId) : ''));
      const credential = page.getByLabel('Admin access code', { exact: true });
      if (selected.eventId) await expect(page.locator('input[name="event"]')).toHaveValue(selected.eventId); else await expect(page.locator('input[name="event"]')).toHaveCount(0);
      await credential.fill('synthetic-wrong-access-code'); await credential.press('Enter');
      await expect(page.getByRole('alert')).toContainText('Sign-in failed'); await expect(credential).toHaveValue('');
      expect(await page.content()).not.toContain('synthetic-wrong-access-code');
      if (selected.eventId) await expect(page.locator('input[name="event"]')).toHaveValue(selected.eventId);
      await credential.fill(localKey('LOCAL_OWNER_KEY')); await credential.press('Enter');
      await expect(page).toHaveURL(url => url.pathname === '/admin' && (url.searchParams.get('event') ?? '') === selected.eventId);
      await expect(page.getByRole('heading', { level: 1, name: selected.heading, exact: true })).toBeVisible();
      if (selected.name) await expect(page.getByRole('heading', { level: 2, name: selected.name, exact: true })).toBeVisible();
      if (selected.eventId === completed.eventId) {
        await expect(page.locator('.admin-complete')).toBeVisible(); await expect(page.locator('.admin-request')).toHaveCount(0);
        await expect(page.getByRole('combobox', { name: 'Event to review', exact: true }).locator('option')).toHaveCount(baseline.pendingEventIds.length + 3);
        for (const width of [360, 390, 1440]) {
          await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          if (process.env.ADMIN_SIGNIN_EVIDENCE) { mkdirSync(process.env.ADMIN_SIGNIN_EVIDENCE, { recursive: true }); await page.screenshot({ path: `${process.env.ADMIN_SIGNIN_EVIDENCE}/completed-${width}.png`, fullPage: false }); }
        }
      } else if (selected.eventId === first.eventId) await expect(page.locator('.admin-request')).toHaveAttribute('data-event-id', first.eventId);
      else if (!selected.eventId) { expect(new URL(page.url()).search).toBe(''); await expect(page.locator('.admin-request')).toHaveAttribute('data-event-id', second.eventId); }
      else { await expect(page.getByRole('combobox')).toHaveValue(''); await expect(page.getByRole('combobox')).toHaveAttribute('required'); }
    } finally { await context.close(); }
  }
  expect(await Promise.all(events.map(async event => digest(await api<LiveView>(event.organizer))))).toEqual(before);
  expect(storeHash()).toBe(publicBefore); expect(digest(await (await fetch(receiver + '/api/public')).json())).toBe(publicApiBefore);
  expect(posts).toHaveLength(8); expect(posts.every(path => path === '/admin/login')).toBe(true); expect(errors).toEqual([]);
  const after = await publicationBaseline(), retained = new Set(baseline.publications.map(record => record.id));
  expect(after.publications.filter(record => retained.has(record.id))).toEqual(baseline.publications);
  for (const record of baseline.publicData.records) expect(after.publicData.records).toContainEqual(record);
  for (const [event, id] of Object.entries(baseline.publicData.current)) expect(after.publicData.current[event]).toBe(id);
});
