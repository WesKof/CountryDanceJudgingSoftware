import { test, expect, type Browser } from '@playwright/test';
import { api, base, command, save } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import { cellKey, type LiveView } from '../lib/live/types';

async function staleJudge(browser: Browser) {
  const event = await createStage(limitedStage(1, 4));
  await command(event.organizer, { action: 'enable-auto-stages' });
  const view = await api<LiveView>(event.tokens[0]), round = view.rounds[0], heat = round.definition.heats[0];
  const judgePath = (await api<LiveView>(event.organizer)).judgeLinks![0].path;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  // Preserve a real stale view to exercise server conflicts, without mutating owner data.
  await page.route('**/api/live', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ json: view });
    else await route.continue();
  });
  await page.goto(base + judgePath);
  await expect(page.getByLabel('Assigned heats and songs', { exact: true })).toBeVisible();
  return { event, view, round, heat, context, page };
}

test('conflicting pending edits identify their exact bib and song and open the correct score for comparison', async ({ browser }) => {
  const { event, round, heat, context, page } = await staleJudge(browser);
  const subjects = heat.subjectIds.slice(0, 2).map((id) => round.definition.subjects.find((subject) => subject.id === id)!);
  try {
    for (let index = 0; index < 2; index++) {
      const subject = subjects[index], song = heat.songs[index];
      await save(event.tokens[0], round, song.id, subject.id, 'A1', 'PRIVATE_SERVER_' + index);
      await page.getByLabel('Assigned heats and songs', { exact: true }).selectOption(song.id);
      const row = page.locator(`.phone-row[data-bib="${subject.number}"]`);
      await row.getByRole('button', { name: /^Note/ }).click();
      await row.getByRole('textbox').fill('PRIVATE_PENDING_' + index);
      const conflict = page.waitForResponse((response) => response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'save-cell' && response.status() === 409);
      await row.getByRole('button', { name: `Bib ${subject.number}: Yes`, exact: true }).click(); await conflict;
    }
    const panel = page.locator('.pending-panel');
    await expect(panel.locator(':scope > summary')).toContainText('2 pending edits');
    for (let index = 0; index < 2; index++) {
      const entry = panel.getByRole('article', { name: `Pending edit for #${subjects[index].number} on ${heat.songs[index].title}`, exact: true });
      await expect(entry).toBeVisible({ timeout: 3000 });
      await expect(entry.getByText(subjects[index].primary, { exact: false })).toBeVisible();
      await expect(entry.getByText('Pending note: PRIVATE_PENDING_' + index, { exact: true })).toBeVisible();
    }
    await page.getByLabel('Assigned heats and songs', { exact: true }).selectOption(heat.songs[0].id);
    const second = panel.getByRole('article', { name: `Pending edit for #${subjects[1].number} on ${heat.songs[1].title}`, exact: true });
    await second.getByRole('button', { name: 'Open score', exact: true }).click();
    await expect(page.getByLabel('Assigned heats and songs', { exact: true })).toHaveValue(heat.songs[1].id);
    await expect(page.locator(`.phone-row[data-bib="${subjects[1].number}"]`)).toBeFocused();
    const saved = await api<LiveView>(event.tokens[0]);
    for (let index = 0; index < 2; index++) expect(saved.ballots[0].cells[cellKey(heat.songs[index].id, subjects[index].id)].mark).toBe('A1');
    expect(saved.heatSubmissions).toHaveLength(0);
    for (const width of [360, 390, 738, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width === 390 || width === 1440) await panel.screenshot({ path: `test-results/judge-conflicts-${width}.png` });
    }
    const first = panel.getByRole('article', { name: `Pending edit for #${subjects[0].number} on ${heat.songs[0].title}`, exact: true });
    await first.getByRole('button', { name: 'Keep my edit after comparison', exact: true }).click();
    await expect(first).toHaveCount(0);
    await expect(second).toBeVisible();
    const compared = await api<LiveView>(event.tokens[0]);
    expect(compared.ballots[0].cells[cellKey(heat.songs[0].id, subjects[0].id)]).toMatchObject({ mark: 'Yes', note: 'PRIVATE_PENDING_0' });
    expect(compared.ballots[0].cells[cellKey(heat.songs[1].id, subjects[1].id)]).toMatchObject({ mark: 'A1', note: 'PRIVATE_SERVER_1' });
  } finally { await context.close(); }
});

test('a blocked edit offers comparison choices without an ineffective retry and saved-version choice preserves server marks', async ({ browser }) => {
  const { event, round, heat, context, page } = await staleJudge(browser);
  const subject = round.definition.subjects.find((entry) => entry.id === heat.subjectIds[0])!;
  try {
    await save(event.tokens[0], round, heat.songs[0].id, subject.id, 'A1', 'PRIVATE_RETAINED_SERVER');
    const conflict = page.waitForResponse((response) => response.status() === 409);
    await page.getByRole('button', { name: `Bib ${subject.number}: Yes`, exact: true }).click(); await conflict;
    await expect(page.locator('.pending-panel > summary')).toContainText('Action required');
    await expect(page.getByRole('button', { name: 'Retry pending saves', exact: true })).toHaveCount(0, { timeout: 3000 });
    await expect(page.getByRole('button', { name: 'Keep my edit after comparison', exact: true })).toBeEnabled();
    await page.unroute('**/api/live');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Use saved version', exact: true }).click();
    await expect(page.locator('.pending-panel')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Bib ${subject.number}: A1`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    const saved = await api<LiveView>(event.tokens[0]);
    expect(saved.ballots[0].cells[cellKey(heat.songs[0].id, subject.id)].note).toBe('PRIVATE_RETAINED_SERVER');
  } finally { await context.close(); }
});

test('archiving an event disables keeping a conflicting local edit without losing its retained note', async ({ browser }) => {
  const { event, round, heat, context, page } = await staleJudge(browser);
  const subject = round.definition.subjects.find((entry) => entry.id === heat.subjectIds[0])!;
  try {
    await save(event.tokens[0], round, heat.songs[0].id, subject.id, 'A1', 'PRIVATE_ARCHIVED_SERVER');
    const row = page.locator(`.phone-row[data-bib="${subject.number}"]`);
    await row.getByRole('button', { name: /^Note/ }).click();
    await row.getByRole('textbox').fill('PRIVATE_ARCHIVED_LOCAL');
    const conflict = page.waitForResponse((response) => response.status() === 409);
    await row.getByRole('button', { name: `Bib ${subject.number}: Yes`, exact: true }).click(); await conflict;
    await expect(page.getByRole('button', { name: 'Keep my edit after comparison', exact: true })).toBeEnabled();
    await page.unroute('**/api/live'); await command(event.organizer, { action: 'archive' });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByRole('heading', { name: 'Archived event · read only', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep my edit after comparison', exact: true })).toBeDisabled({ timeout: 3000 });
    await expect(page.getByText('Pending note: PRIVATE_ARCHIVED_LOCAL', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open score', exact: true })).toHaveCount(0);
    const saved = await api<LiveView>(event.tokens[0]);
    expect(saved.ballots[0].cells[cellKey(heat.songs[0].id, subject.id)]).toMatchObject({ mark: 'A1', note: 'PRIVATE_ARCHIVED_SERVER' });
  } finally { await context.close(); }
});

test('unreadable and interrupted connections give usable recovery and retain private pending edits until acknowledgement', async ({ browser }) => {
  const event = await createStage(limitedStage(1, 4));
  await command(event.organizer, { action: 'enable-auto-stages' });
  const view = await api<LiveView>(event.tokens[0]), round = view.rounds[0], heat = round.definition.heats[0];
  const judgePath = (await api<LiveView>(event.organizer)).judgeLinks![0].path;
  const subject = round.definition.subjects.find((entry) => entry.id === heat.subjectIds[0])!;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  let mode = 'html';
  await page.route('**/api/live', async (route) => {
    if (mode === 'offline') await route.abort('failed');
    else if (mode === 'html' || mode === 'save-html' && route.request().method() === 'POST') await route.fulfill({ status: 503, contentType: 'text/html', body: '<html><body>Synthetic upstream unavailable</body></html>' });
    else if (mode === 'save-null' && route.request().method() === 'POST') await route.fulfill({ status: 200, json: null });
    else await route.continue();
  });
  try {
    await page.goto(base + judgePath);
    await expect(page.getByText('The shared event is temporarily unavailable. Retry the connection.', { exact: true })).toBeVisible({ timeout: 3000 });
    mode = 'offline'; await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByText('Connection interrupted. Check your connection and retry.', { exact: true })).toBeVisible();
    mode = 'healthy'; await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByLabel('Assigned heats and songs', { exact: true })).toBeVisible();
    mode = 'save-html';
    const row = page.locator(`.phone-row[data-bib="${subject.number}"]`);
    await row.getByRole('button', { name: /^Note/ }).click();
    await row.getByRole('textbox').fill('PRIVATE_UNREADABLE_RESPONSE_NOTE');
    await row.getByRole('button', { name: `Bib ${subject.number}: Yes`, exact: true }).click();
    await expect(page.locator('.pending-panel > summary')).toContainText('Waiting to reconnect');
    await page.locator('.pending-panel > summary').click();
    await expect(page.locator('.pending-panel').getByText(/The shared event is temporarily unavailable/)).toBeVisible();
    const cache = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('country-dance-live:pending:')).map(([, value]) => value).join(''));
    expect(cache).toContain('PRIVATE_UNREADABLE_RESPONSE_NOTE');
    mode = 'save-null';
    const unreadable = page.waitForResponse((response) => response.request().method() === 'POST' && response.status() === 200);
    await page.getByRole('button', { name: 'Retry pending saves', exact: true }).click(); await unreadable;
    await expect(page.locator('.pending-panel')).toBeVisible();
    expect((await api<LiveView>(event.tokens[0])).ballots[0].cells[cellKey(heat.songs[0].id, subject.id)]?.mark ?? '').toBe('');
    mode = 'healthy'; await page.getByRole('button', { name: 'Retry pending saves', exact: true }).click();
    await expect(page.locator('.pending-panel')).toHaveCount(0, { timeout: 10000 });
    const saved = await api<LiveView>(event.tokens[0]);
    expect(saved.ballots[0].cells[cellKey(heat.songs[0].id, subject.id)]).toMatchObject({ mark: 'Yes', note: 'PRIVATE_UNREADABLE_RESPONSE_NOTE' });
    expect(JSON.stringify(await api<LiveView>(event.organizer))).not.toContain('PRIVATE_UNREADABLE_RESPONSE_NOTE');
    expect(JSON.stringify(await api<LiveView>(event.tokens[1]))).not.toContain('PRIVATE_UNREADABLE_RESPONSE_NOTE');
  } finally { await context.close(); }
});
