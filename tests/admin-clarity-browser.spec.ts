import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { api, command } from './stage-helpers';
import { createStage, limitedStage, finish, localKey, owner, fault, receiver, publicationBaseline } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

async function prepared(name: string, competitions: number, partial = false) {
  const setup = limitedStage(competitions, 4); setup.name = name;
  const event = await createStage(setup); await finish(setup, event.organizer, event.tokens, event.head, false);
  await command(event.organizer, partial ? { action: 'prepare-publication', competitionId: setup.competitions[0].id } : { action: 'prepare-event-publication' });
  let view = await api<LiveView>(event.organizer);
  if (partial) await command(event.organizer, { action: 'approve-publication', publicationId: view.publications![0].id, sourceFingerprint: view.publications![0].sourceFingerprint });
  else await command(event.organizer, { action: 'approve-event-publication', publications: view.publications!.map(record => ({ publicationId: record.id, sourceFingerprint: record.sourceFingerprint })) });
  view = await api<LiveView>(event.organizer);
  return { ...event, eventId: view.publications![0].snapshot.eventId };
}

test('admin review states and necessary navigation show the current task while exact independent release stays intact', async ({ browser }) => {
  const baseline = await publicationBaseline(), priorPending = baseline.pendingEventIds.length;
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  async function screenshot(name: string) {
    if (process.env.ADMIN_CLARITY_EVIDENCE) { mkdirSync(process.env.ADMIN_CLARITY_EVIDENCE, { recursive: true }); await page.screenshot({ path: `${process.env.ADMIN_CLARITY_EVIDENCE}/${name}.png`, fullPage: false }); }
  }
  try {
    await page.goto(receiver + '/admin'); await page.getByLabel('Admin access code', { exact: true }).fill(localKey('LOCAL_OWNER_KEY'));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    if (!priorPending) {
      await expect(page.getByRole('heading', { level: 1, name: 'No results to review', exact: true })).toBeVisible();
      await expect(page.getByRole('combobox')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Approve & publish results', exact: true })).toHaveCount(0);
    } else {
      expect(baseline.pendingEventIds).toContain(await page.locator('.admin-request').getAttribute('data-event-id'));
      await expect(page.getByRole('combobox')).toHaveCount(priorPending > 1 ? 1 : 0);
    }
    await expect(page.locator('.admin-supporting')).not.toHaveAttribute('open'); await screenshot('empty-390');
    const first = await prepared('Synthetic admin clarity · River Bend Country Dance Weekend', 2, true);
    await page.goto(receiver + '/admin?event=' + first.eventId);
    await expect(page.getByRole('heading', { level: 1, name: 'Waiting for updated results', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(priorPending ? 1 : 0);
    await expect(page.getByRole('button', { name: 'Approve & publish results', exact: true })).toHaveCount(0); await screenshot('blocked-390');
    await command(first.organizer, { action: 'prepare-event-publication' }); let view = await api<LiveView>(first.organizer);
    await command(first.organizer, { action: 'approve-event-publication', publications: view.publications!.map(record => ({ publicationId: record.id, sourceFingerprint: record.sourceFingerprint })) });
    const publicBefore = await (await fetch(receiver + '/api/public')).json();
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(receiver + '/admin?event=' + first.eventId);
      await expect(page.getByRole('heading', { level: 1, name: 'Results ready for review', exact: true })).toBeVisible();
      await expect(page.getByRole('combobox')).toHaveCount(priorPending ? 1 : 0);
      const approval = page.getByRole('button', { name: 'Approve & publish results', exact: true });
      await expect(approval).toBeEnabled(); await expect(approval).toBeInViewport();
      await expect(page.locator('.admin-supporting')).not.toHaveAttribute('open');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await screenshot('ready-' + width);
    }
    expect(await (await fetch(receiver + '/api/public')).json()).toEqual(publicBefore);
    await page.setViewportSize({ width: 390, height: 900 }); await owner({ action: 'service', state: 'suspended' }); await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Publication paused', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve & publish results', exact: true })).toBeDisabled();
    const tools = page.getByRole('link', { name: 'Open website controls', exact: true }); await tools.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Resume publication', exact: true })).toBeInViewport(); await screenshot('paused-controls-390');
    await page.getByRole('button', { name: 'Resume publication', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Results ready for review', exact: true })).toBeVisible();
    const second = await prepared('Synthetic admin clarity · Autumn Invitational', 1);
    await page.goto(receiver + '/admin?event=' + first.eventId);
    const select = page.getByRole('combobox', { name: 'Event to review', exact: true }); await expect(select).toBeVisible();
    await select.selectOption(second.eventId); await select.focus(); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'View event', exact: true })).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(url => url.searchParams.get('event') === second.eventId);
    await expect(page.locator('.admin-request')).toHaveAttribute('data-event-id', second.eventId);
    await page.goto(receiver + '/admin?event=unavailable');
    await expect(page.getByRole('heading', { level: 1, name: 'No results to review for this event', exact: true })).toBeVisible();
    await expect(select).toHaveValue(''); await expect(select).toHaveAttribute('required');
    await select.selectOption(first.eventId); await page.getByRole('button', { name: 'View event', exact: true }).click();
    await page.getByRole('button', { name: 'Approve & publish results', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Results published', exact: true })).toBeVisible();
    await expect(select).toBeVisible(); await expect(select.locator('option')).toHaveCount(priorPending + 2); await screenshot('published-with-next-390');
    view = await api<LiveView>(second.organizer); const publications = view.publications!.map(record => ({ publicationId: record.id, sourceFingerprint: record.sourceFingerprint }));
    await fault(true); try { await owner({ action: 'release-event', publications }); } finally { await fault(false); }
    await page.goto(receiver + '/admin?event=' + second.eventId);
    await expect(page.getByRole('heading', { level: 1, name: 'Sending pending', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(priorPending ? 1 : 0); await expect(page.locator('.admin-request').getByRole('button', { name: 'Approve & publish results', exact: true })).toHaveCount(0);
    const retry = page.locator('.admin-request').getByRole('button', { name: 'Retry sending', exact: true }); await expect(retry).toBeInViewport(); await screenshot('queued-390');
    await retry.click(); await page.goto(receiver + '/admin?event=' + second.eventId);
    await expect(page.getByRole('heading', { level: 1, name: 'Results published', exact: true })).toBeVisible(); await expect(page.getByRole('combobox')).toHaveCount(priorPending ? 1 : 0);
    await page.goto(receiver + '/admin');
    if (!priorPending) await expect(page.getByRole('heading', { level: 1, name: 'No results to review', exact: true })).toBeVisible();
    else expect(baseline.pendingEventIds).toContain(await page.locator('.admin-request').getAttribute('data-event-id'));
    const after = await publicationBaseline(), retained = new Set(baseline.publications.map(record => record.id));
    expect(after.pendingEventIds.sort()).toEqual([...baseline.pendingEventIds].sort());
    expect(after.publications.filter(record => retained.has(record.id))).toEqual(baseline.publications);
    for (const record of baseline.publicData.records) expect(after.publicData.records).toContainEqual(record);
    for (const [event, id] of Object.entries(baseline.publicData.current)) expect(after.publicData.current[event]).toBe(id);
    expect(errors).toEqual([]);
  } finally { await fault(false); await owner({ action: 'service', state: 'enabled' }); await context.close(); }
});
