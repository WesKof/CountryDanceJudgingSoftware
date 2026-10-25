import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { api, base, command, nonce, save } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import type { LiveView, EventSummary } from '../lib/live/types';
import { openSetupNavigation } from './setup-browser-helpers';
const catalogKey = 'country-dance-judging:organizer-history', bindingKey = 'country-dance-judging:rehearsal';
async function catalog(page: Page, path: string) { return page.evaluate(({ key, path }) => JSON.stringify(JSON.parse(localStorage.getItem(key)!).find((entry: { path: string }) => entry.path === path)), { key: catalogKey, path }); }
async function openEvents(page: Page) { await page.getByRole('button', { name: 'Events', exact: true }).click(); const workspace = page.locator('.event-workspace'); await expect(workspace).toHaveAttribute('open'); await expect(workspace.getByText('Checking saved events…', { exact: true })).toHaveCount(0); return workspace; }
async function fixture(browser: Browser) {
  const setupA = limitedStage(1, 4), setupB = limitedStage(1, 4); setupA.name = 'Synthetic current summary A'; setupB.name = 'Synthetic saved summary B';
  const a = await createStage(setupA), b = await createStage(setupB);
  await command(b.organizer, { action: 'enable-auto-stages' });
  const view = await api<LiveView>(b.organizer), round = view.rounds[0], heat = round.definition.heats[0];
  for (const id of heat.subjectIds) await save(b.tokens[0], round, heat.songs[0].id, id, 'No', 'PRIVATE_SUMMARY_RECOVERY_NOTE');
  const judge = await api<LiveView>(b.tokens[0]);
  await api(b.tokens[0], { action: 'submit-stage', requestId: nonce(), blockId: judge.context.blockId, expectedVersion: judge.version, acknowledged: true, ballotVersions: Object.fromEntries(judge.ballots.map(ballot => [ballot.roundKey, ballot.version])), roundVersions: Object.fromEntries(judge.rounds.map(round => [round.key, round.version])) });
  const original = await command(b.organizer, { action: 'backup', includeNotes: true });
  const aBefore = await api<LiveView>(a.organizer), links = (await api<LiveView>(b.organizer)).judgeLinks;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  await page.goto(base + '/live/new');
  await page.evaluate(({ key, bindingKey, a, b, requestId }) => {
    localStorage.setItem(key, JSON.stringify([{ path: a.path, name: 'Synthetic current summary A' }, { path: b.path, name: 'Synthetic saved summary B' }]));
    localStorage.setItem(bindingKey, JSON.stringify({ path: a.path, nonce: requestId, configured: true }));
  }, { key: catalogKey, bindingKey, a: { path: a.path }, b: { path: b.path }, requestId: nonce() });
  await page.goto(base); const workspace = await openEvents(page), card = workspace.getByRole('article', { name: setupB.name, exact: true });
  await expect(card.getByRole('button', { name: 'Archive · ' + setupB.name, exact: true })).toBeEnabled();
  const baselineCatalog = await catalog(page, b.path), binding = await page.evaluate(key => localStorage.getItem(key), bindingKey);
  return { a, b, setupA, setupB, aBefore, original, links, context, page, workspace, card, baselineCatalog, binding };
}
async function summary(token: string): Promise<EventSummary> { return (await fetch(base + '/api/live?summary=1', { headers: { Authorization: 'Bearer ' + token } })).json(); }
async function retained(f: Awaited<ReturnType<typeof fixture>>) {
  const after = await command(f.b.organizer, { action: 'backup', includeNotes: true });
  for (const key of ['ballots', 'privateNotes', 'history']) expect(JSON.stringify(after[key]) === JSON.stringify(f.original[key])).toBe(true);
  expect(JSON.stringify((await api<LiveView>(f.b.organizer)).judgeLinks) === JSON.stringify(f.links)).toBe(true);
}
function evidence(name: string, value: object) { const dir = process.env.EVENT_SUMMARY_EVIDENCE; if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2)); } }

test('malformed archive acknowledgement and summary retain the saved link and require explicit recovery', async ({ browser }) => {
  const f = await fixture(browser), observe = process.env.EVENT_SUMMARY_OBSERVE === '1'; let bad = true, posts = 0;
  try {
    await f.page.route('**/api/live*', async route => {
      const request = route.request(); if (request.headers().authorization !== 'Bearer ' + f.b.organizer) return route.continue();
      if (request.method() === 'POST' && request.postDataJSON()?.action === 'archive') { posts++; return route.fulfill({ status: 200, json: {} }); }
      if (bad && new URL(request.url()).searchParams.has('summary')) return route.fulfill({ status: 200, json: {} });
      return route.continue();
    });
    f.page.once('dialog', dialog => void dialog.accept()); await f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true }).click();
    await expect(f.workspace.getByText('Checking saved events…', { exact: true })).toHaveCount(0);
    if (observe) {
      await expect(f.workspace.getByText('Event archived. Its records remain available below.', { exact: true })).toBeVisible();
      expect(await catalog(f.page, f.b.path) === f.baselineCatalog).toBe(false);
      const savedNameLost = await f.page.evaluate(({ key, path }) => !JSON.parse(localStorage.getItem(key)!).find((entry: { path: string }) => entry.path === path)?.name, { key: catalogKey, path: f.b.path });
      expect(savedNameLost).toBe(true); await f.page.reload(); await openEvents(f.page); await expect(f.page.getByRole('article', { name: f.setupB.name, exact: true })).toHaveCount(0);
      evidence('before', { falseArchiveNotice: true, savedNameLost: true, linkFilteredAfterReload: true, actualBindingRetained: await f.page.evaluate(key => localStorage.getItem(key), bindingKey) === f.binding, browserPosts: posts });
    } else {
      await expect(f.workspace.getByText(/could not be confirmed/).first()).toBeVisible();
      expect(await catalog(f.page, f.b.path) === f.baselineCatalog).toBe(true);
      await expect(f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true })).toBeDisabled();
      for (const width of [390, 1440]) {
        await f.page.setViewportSize({ width, height: 844 });
        expect(await f.workspace.locator('[role="status"]').evaluateAll(elements => elements.filter(element => element.getClientRects().length).every(element => {
          const bounds = element.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(element);
          return [...range.getClientRects()].every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1);
        }))).toBe(true);
        const dir = process.env.EVENT_SUMMARY_EVIDENCE; if (dir) { mkdirSync(dir, { recursive: true }); await f.workspace.screenshot({ path: `${dir}/unconfirmed-${width}.png` }); }
      }
      expect(await f.page.evaluate(key => localStorage.getItem(key), bindingKey) === f.binding).toBe(true);
      bad = false; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true })).toBeEnabled();
      await f.page.reload(); await openEvents(f.page); await expect(f.page.getByRole('article', { name: f.setupB.name, exact: true })).toBeVisible();
      evidence('unaccepted', { catalogRetained: true, recoveredAfterRefresh: true, survivesReload: true, bindingRetained: true, browserPosts: posts });
    }
    expect(posts).toBe(1); const actual = await summary(f.b.organizer); expect(actual.status).toBe('active');
    expect(JSON.stringify(await api<LiveView>(f.a.organizer)) === JSON.stringify(f.aBefore)).toBe(true); await retained(f);
  } finally { await f.context.close(); }
});

test('manual summary validation preserves known metadata and identity across invalid and stale reads', async ({ browser }) => {
  test.skip(process.env.EVENT_SUMMARY_OBSERVE === '1', 'After-fix regression'); const f = await fixture(browser); let payload: unknown;
  try {
    const original = await summary(f.b.organizer);
    await f.page.route('**/api/live?summary=1', route => route.request().headers().authorization === 'Bearer ' + f.b.organizer ? route.fulfill({ status: 200, json: payload }) : route.continue());
    for (const invalid of [{}, [], { ...original, name: 7 }, { ...original, venue: null }, { ...original, status: 'deleted' }, { ...original, version: 0 }, { ...original, competitionCount: -1 }, { ...original, eventId: 'different-event' }, { ...original, version: original.version - 1 }]) {
      payload = invalid; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.card.getByRole('status')).toBeVisible();
      expect(await catalog(f.page, f.b.path) === f.baselineCatalog).toBe(true); await expect(f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true })).toBeDisabled();
    }
    payload = original; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true })).toBeEnabled();
    await f.page.reload(); await openEvents(f.page); payload = { ...original, eventId: 'different-after-reload' }; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.card.getByRole('status')).toBeVisible(); expect(await catalog(f.page, f.b.path) === f.baselineCatalog).toBe(true);
    payload = original; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true })).toBeEnabled();
    for (const width of [390, 1440]) { await f.page.setViewportSize({ width, height: 844 }); expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    expect(await f.page.evaluate(key => localStorage.getItem(key), bindingKey) === f.binding).toBe(true); await retained(f); evidence('manual', { invalidCases: 9, catalogRetained: true, identityRetained: true, recovery: true });
  } finally { await f.context.close(); }
});

test('a failed device catalog save retains the last checked in-memory status and version', async ({ browser }) => {
  test.skip(process.env.EVENT_SUMMARY_OBSERVE === '1', 'After-fix regression'); const f = await fixture(browser); let payload: EventSummary;
  try {
    const original = await summary(f.b.organizer); await command(f.b.organizer, { action: 'archive' }); const actual = await summary(f.b.organizer); payload = actual;
    await f.page.route('**/api/live?summary=1', route => route.request().headers().authorization === 'Bearer ' + f.b.organizer ? route.fulfill({ status: 200, json: payload }) : route.continue());
    await f.page.evaluate(key => {
      const original = Storage.prototype.setItem;
      (window as Window & { restoreSummaryStorage?: () => void }).restoreSummaryStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('Synthetic full catalog storage', 'QuotaExceededError'); return original.call(this, name, value); };
    }, catalogKey);
    await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.workspace.getByText('The list could not be saved on this device. Event records are unchanged.', { exact: true })).toBeVisible();
    await f.workspace.locator('.event-archive > summary').click(); await expect(f.card.getByText('Read only', { exact: true })).toBeVisible(); expect(await catalog(f.page, f.b.path) === f.baselineCatalog).toBe(true);
    payload = original; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.card.getByRole('status')).toBeVisible(); await expect(f.card.getByText('Read only', { exact: true })).toBeVisible(); await expect(f.card.getByRole('button', { name: 'Return to active · ' + f.setupB.name, exact: true })).toBeDisabled();
    await f.page.evaluate(() => (window as Window & { restoreSummaryStorage?: () => void }).restoreSummaryStorage?.()); payload = actual; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.card.getByRole('button', { name: 'Return to active · ' + f.setupB.name, exact: true })).toBeEnabled();
    expect(await f.page.evaluate(key => localStorage.getItem(key), bindingKey) === f.binding).toBe(true); await retained(f); evidence('storage', { lastCheckedMetadataRetained: true, staleReadRejectedAfterFailedSave: true, explicitStorageRecovery: true, bindingRetained: true });
  } finally { await f.context.close(); }
});

test('accepted lifecycle actions require matching readback and distinguish subsequent changes', async ({ browser }) => {
  test.skip(process.env.EVENT_SUMMARY_OBSERVE === '1', 'After-fix regression'); const f = await fixture(browser); let mode = 'partial', before = await summary(f.b.organizer), posts = 0;
  try {
    await f.page.route('**/api/live*', async route => {
      const request = route.request(); if (request.headers().authorization !== 'Bearer ' + f.b.organizer) return route.continue();
      if (request.method() === 'POST' && ['archive', 'reactivate'].includes(request.postDataJSON()?.action)) {
        posts++; const response = await route.fetch();
        if (mode === 'concurrent') await command(f.b.organizer, { action: 'archive' });
        return mode === 'bad-ack' ? route.fulfill({ status: 200, json: {} }) : route.fulfill({ response });
      }
      if (new URL(request.url()).searchParams.has('summary')) {
        if (mode === 'partial') return route.fulfill({ status: 200, json: {} });
        if (mode === 'stale') return route.fulfill({ status: 200, json: before });
      }
      return route.continue();
    });
    f.page.once('dialog', dialog => void dialog.accept()); await f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true }).click();
    await expect(f.workspace.getByText(/could not be confirmed/).first()).toBeVisible(); expect(await catalog(f.page, f.b.path) === f.baselineCatalog).toBe(true); expect((await summary(f.b.organizer)).status).toBe('archived');
    mode = 'normal'; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.workspace.getByText('Checking saved events…', { exact: true })).toHaveCount(0); await f.workspace.locator('.event-archive > summary').click(); const restore = f.card.getByRole('button', { name: 'Return to active · ' + f.setupB.name, exact: true }); await expect(restore).toBeEnabled();
    before = await summary(f.b.organizer); mode = 'stale'; await restore.click(); await expect(f.workspace.getByText(/could not be confirmed/).first()).toBeVisible(); expect((await summary(f.b.organizer)).status).toBe('active');
    mode = 'normal'; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true })).toBeEnabled();
    mode = 'bad-ack'; f.page.once('dialog', dialog => void dialog.accept()); await f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true }).click(); await expect(f.workspace.getByText(/could not be confirmed/).first()).toBeVisible();
    mode = 'normal'; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(restore).toBeEnabled(); await restore.click(); await expect(f.workspace.getByText('Event returned to active. Submitted ballots and approvals are unchanged.', { exact: true })).toBeVisible();
    f.page.once('dialog', dialog => void dialog.accept()); await f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true }).click(); await expect(f.workspace.getByText('Event archived. Its records remain available below.', { exact: true })).toBeVisible();
    mode = 'concurrent'; await restore.click(); await expect(f.workspace.getByText(/changed again/).first()).toBeVisible();
    expect((await summary(f.b.organizer)).status).toBe('archived'); mode = 'normal'; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(restore).toBeEnabled();
    expect(posts).toBe(6); await retained(f); evidence('lifecycle', { partialAcceptedReadback: true, staleOppositeStatus: true, malformedAckAfterActualAcceptance: true, normalConfirmedArchive: true, subsequentRealChange: true, browserLifecyclePosts: posts, scoresNotesHistoryLinksRetained: true });
  } finally { await f.context.close(); }
});

test('an uncertain current-event action keeps the binding and setup draft; confirmed recovery reloads once', async ({ browser }) => {
  test.skip(process.env.EVENT_SUMMARY_OBSERVE === '1', 'After-fix regression'); const f = await fixture(browser); let mode = 'partial', navigations = 0, posts = 0;
  try {
    await openSetupNavigation(f.page); await f.page.getByRole('combobox', { name: 'Go to section', exact: true }).selectOption('Event details'); await f.page.getByLabel('Venue', { exact: true }).fill('Unsent current summary draft'); await openEvents(f.page);
    const current = f.workspace.getByRole('article', { name: f.setupA.name, exact: true }), before = await catalog(f.page, f.a.path);
    f.page.on('request', request => { if (request.isNavigationRequest() && request.frame() === f.page.mainFrame()) navigations++; if (request.method() === 'POST' && request.headers().authorization === 'Bearer ' + f.a.organizer && request.postDataJSON()?.action === 'archive') posts++; });
    await f.page.route('**/api/live*', route => {
      const request = route.request(); if (request.headers().authorization !== 'Bearer ' + f.a.organizer || mode === 'normal') return route.continue();
      if (request.method() === 'POST' && request.postDataJSON()?.action === 'archive') return route.fulfill({ status: 200, json: mode === 'partial' ? { ok: true } : {} });
      if (mode === 'partial' && new URL(request.url()).searchParams.has('summary')) return route.fulfill({ status: 200, json: {} }); return route.continue();
    });
    f.page.once('dialog', dialog => void dialog.accept()); await current.getByRole('button', { name: 'Archive · ' + f.setupA.name, exact: true }).click(); await expect(f.workspace.getByText(/could not be confirmed/).first()).toBeVisible();
    expect(navigations).toBe(0); expect(posts).toBe(1); expect(await catalog(f.page, f.a.path) === before).toBe(true); expect(await f.page.evaluate(key => localStorage.getItem(key), bindingKey) === f.binding).toBe(true); await expect(f.page.getByLabel('Venue', { exact: true })).toHaveValue('Unsent current summary draft');
    expect(JSON.stringify(await api<LiveView>(f.a.organizer)) === JSON.stringify(f.aBefore)).toBe(true);
    mode = 'unchanged'; await f.workspace.getByRole('button', { name: 'Refresh events', exact: true }).click(); await expect(current.getByRole('button', { name: 'Archive · ' + f.setupA.name, exact: true })).toBeEnabled();
    f.page.once('dialog', dialog => void dialog.accept()); await current.getByRole('button', { name: 'Archive · ' + f.setupA.name, exact: true }).click(); await expect(f.workspace.getByText(/checked event state is unchanged/)).toBeVisible(); await expect(current.getByRole('button', { name: 'Archive · ' + f.setupA.name, exact: true })).toBeEnabled(); expect(posts).toBe(2); expect(navigations).toBe(0); await expect(f.page.getByLabel('Venue', { exact: true })).toHaveValue('Unsent current summary draft'); expect(await f.page.evaluate(key => localStorage.getItem(key), bindingKey) === f.binding).toBe(true);
    mode = 'normal'; f.page.once('dialog', dialog => void dialog.accept()); await current.getByRole('button', { name: 'Archive · ' + f.setupA.name, exact: true }).click(); await expect(f.page.getByRole('heading', { name: 'Archived event · read only', exact: true })).toBeVisible(); expect(navigations).toBe(1); expect(posts).toBe(3);
    await retained(f); evidence('current', { unknownActionNoReload: true, bindingAndDraftRetained: true, validatedUnchangedAllowsDeliberateRetry: true, confirmedActionOneReload: true, otherEventDataRetained: true });
  } finally { await f.context.close(); }
});

test('an unknown acknowledgement with a validated unchanged state permits only deliberate retry', async ({ browser }) => {
  test.skip(process.env.EVENT_SUMMARY_OBSERVE === '1', 'After-fix regression'); const f = await fixture(browser); let unknown = true, posts = 0;
  try {
    const before = await summary(f.b.organizer);
    await f.page.route('**/api/live', route => { const request = route.request(); if (request.method() === 'POST' && request.headers().authorization === 'Bearer ' + f.b.organizer && request.postDataJSON()?.action === 'archive') { posts++; if (unknown) return route.fulfill({ status: 200, json: {} }); } return route.continue(); });
    const archive = f.card.getByRole('button', { name: 'Archive · ' + f.setupB.name, exact: true });
    f.page.once('dialog', dialog => void dialog.accept()); await archive.focus(); await f.page.keyboard.press('Enter'); await expect(f.workspace.getByText(/checked event state is unchanged/)).toBeVisible(); await expect(archive).toBeEnabled(); await expect(f.workspace.locator('.event-card:focus')).toHaveCount(0);
    expect(posts).toBe(1); expect(JSON.stringify(await summary(f.b.organizer)) === JSON.stringify(before)).toBe(true); expect(await catalog(f.page, f.b.path) === f.baselineCatalog).toBe(true); expect(await f.page.evaluate(key => localStorage.getItem(key), bindingKey) === f.binding).toBe(true);
    unknown = false; f.page.once('dialog', dialog => void dialog.accept()); await archive.click(); await expect(f.workspace.getByText('Event archived. Its records remain available below.', { exact: true })).toBeVisible(); expect(posts).toBe(2); expect((await summary(f.b.organizer)).version).toBe(before.version + 1);
    await retained(f); evidence('retry', { unknownAckNoSuccessOrAutoRetry: true, validatedUnchangedActionable: true, nextPostOnlyAfterUserRetry: true, exactOneVersionAdvance: true, recordsRetained: true });
  } finally { await f.context.close(); }
});
