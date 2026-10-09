import { test, expect } from '@playwright/test';
import { expandSetup } from './setup-browser-helpers';
import { readFile } from 'node:fs/promises';
import { createDefaultState, type AppState } from '../lib/domain';
import { stageFixture } from './stage-fixture';
import { api, command, base, nonce } from './stage-helpers';
import type { LiveView } from '../lib/live/types';

test('equivalent local/shared setup buttons, confirmations, persistence, empty program and v2 backup history', async ({ browser }) => {
  const setup = stageFixture(undefined, 6);
  const legacy: AppState = { ...createDefaultState(), event: { name: setup.name, venue: setup.venue, date: setup.date }, judges: setup.judges, demoSetup: setup, activeCompetitionId: setup.competitions[0].id,
    competitions: setup.competitions.map((c) => { const r = setup.rounds.find((r) => r.competitionId === c.id && r.kind === 'prelims')!; return { ...c, name: c.format, round: 'Preliminary', entries: r.subjects.map((s) => ({ id: s.id, number: s.number, ...(s.role ? { name: s.primary, role: s.role } : { lead: s.primary, follow: s.secondary }) })), scores: Object.fromEntries(r.subjects.map((s) => [s.id, Object.fromEntries(setup.judges.map((j) => [j.id, 'Yes' as const]))])), revisions: [{ id: 'retained-v2-revision', createdAt: '2026-10-08', label: 'Historical totals', rows: [] }] }; }) };
  const localContext = await browser.newContext({ viewport: { width: 390, height: 844 } }), sharedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const local = await localContext.newPage(), shared = await sharedContext.newPage();
  const localPosts: string[] = []; local.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/live')) localPosts.push(r.postData() ?? ''); });
  await local.goto(base); await local.evaluate((s) => localStorage.setItem('country-dance-judging:v2', JSON.stringify(s)), legacy); await local.reload(); await local.locator('.rail-item').nth(0).click();
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: setup.name, venue: '', date: '' }), token = created.path.split('/').at(-1)!;
  await command(token, { action: 'setup', setup }); await shared.goto(base + created.path);
  for (const page of [local, shared]) {
    await expect(page.locator('details.setup-section[open]')).toHaveCount(0);
    await expect(page.getByLabel('Event name', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Event overview · legacy ballots', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: page === local ? 'test-results/local-setup-collapsed-390.png' : 'test-results/shared-setup-collapsed-1440.png' });
    const eventSection = page.locator('details.setup-section').filter({ has: page.getByRole('heading', { name: 'Event details', exact: true }) });
    await eventSection.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('Event name', { exact: true })).toBeVisible();
    await eventSection.locator('summary').click(); await expect(page.getByLabel('Event name', { exact: true })).toBeHidden();
    await page.locator('details.setup-section').filter({ has: page.getByRole('heading', { name: 'Program & stages', exact: true }) }).locator('summary').click();
    await page.locator('.competition-card').first().click();
    await expect(page.getByLabel('Select round to configure')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
    await expandSetup(page);
    await expect(page.getByRole('heading', { name: 'Program & stages', exact: true })).toBeVisible();
    await expect(page.getByLabel('Event name', { exact: true }).last()).toHaveValue(setup.name);
    await expect(page.getByRole('combobox', { name: 'Event head judge', exact: true })).toHaveValue(setup.headJudgeId);
    await expect(page.getByRole('button', { name: /^Remove .* competition$/ })).toHaveCount(4);
    await page.getByLabel('Select round to configure').selectOption(setup.rounds[0].id);
    await expect(page.locator('.shared-heat')).toHaveCount(3);
    page.once('dialog', (d) => void d.dismiss()); await page.getByRole('button', { name: 'Remove Heat 1', exact: true }).click(); await expect(page.locator('.shared-heat')).toHaveCount(3);
    page.once('dialog', (d) => void d.accept()); await page.getByRole('button', { name: 'Remove Heat 1', exact: true }).click();
    await expect(page.locator('.shared-heat')).toHaveCount(2);
    for (const id of setup.rounds[0].heats[0].subjectIds) {
      const s = setup.rounds[0].subjects.find((s) => s.id === id)!;
      const select = page.getByLabel(`Heat for bib ${s.number}`, { exact: true }); await expect(select).toHaveValue(''); await select.selectOption(setup.rounds[0].heats[1].id);
    }
    await page.getByRole('button', { name: 'Add heat', exact: true }).click();
    await expect(page.locator('.shared-heat')).toHaveCount(3);
    await expect(page.locator('.shared-heat h3').last()).toHaveText(/Heat 1/);
    await page.getByLabel('Venue', { exact: true }).last().fill('Parity venue');
    await page.getByRole('button', { name: 'Save setup', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
    await page.reload();
    if (page === local) await local.locator('.rail-item').nth(0).click(); await expandSetup(page);
    await expect(page.getByLabel('Venue', { exact: true }).last()).toHaveValue('Parity venue');
    await page.getByLabel('Select round to configure').selectOption(setup.rounds[0].id);
    const remove = page.getByRole('button', { name: 'Remove Strictly Beginner / Intermediate competition', exact: true });
    page.once('dialog', (d) => void d.dismiss()); await remove.click(); await expect(page.getByRole('button', { name: /^Remove .* competition$/ })).toHaveCount(4);
    page.once('dialog', (d) => void d.accept()); await remove.click(); await expect(page.getByRole('button', { name: /^Remove .* competition$/ })).toHaveCount(3);
    await expect(page.getByLabel('Select round to configure')).not.toHaveValue(setup.rounds[0].id);
    await page.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
  }
  const state = await local.evaluate(() => JSON.parse(localStorage.getItem('country-dance-judging:v2')!) as AppState);
  expect(state.competitions[0].scores).toEqual(legacy.competitions[1].scores); expect(state.competitions[0].revisions).toEqual(legacy.competitions[1].revisions);
  expect(state.removedCompetitions?.[0].scores).toEqual(legacy.competitions[0].scores);
  const saved = await api<LiveView>(token); expect(saved.setup.rounds.some((r) => r.competitionId === setup.competitions[0].id)).toBe(false);
  // Real private-link controls: cancellation, revocation, replacement and opening the new page.
  const judgeCard = shared.locator('.shared-inline').filter({ has: shared.getByRole('button', { name: 'Replace link', exact: true }) }).first();
  const oldLink = saved.judgeLinks![0].path;
  shared.once('dialog', (d) => void d.dismiss()); await judgeCard.getByRole('button', { name: 'Revoke', exact: true }).click();
  expect((await api<LiveView>(token)).judgeLinks![0].revoked).toBe(false);
  shared.once('dialog', (d) => void d.accept());
  const revoke = shared.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().postDataJSON()?.action === 'revoke-link');
  await judgeCard.getByRole('button', { name: 'Revoke', exact: true }).click(); expect((await revoke).status()).toBe(200); await expect(judgeCard.getByRole('button', { name: 'Copy judge link', exact: true })).toBeDisabled();
  await api(oldLink.split('/').at(-1)!, undefined, 403);
  shared.once('dialog', (d) => void d.accept());
  const replace = shared.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().postDataJSON()?.action === 'replace-link');
  await judgeCard.getByRole('button', { name: 'Replace link', exact: true }).click(); expect((await replace).status()).toBe(200); await expect(judgeCard.getByRole('button', { name: 'Copy judge link', exact: true })).toBeEnabled();
  const replaced = (await api<LiveView>(token)).judgeLinks![0].path; expect(replaced).not.toBe(oldLink);
  const popup = shared.waitForEvent('popup'); await judgeCard.getByRole('link', { name: 'Open judge page', exact: true }).click();
  const judgePage = await popup; await expect(judgePage).toHaveURL(base + replaced); await expect(judgePage.getByRole('heading', { level: 1, name: setup.name })).toBeVisible(); await judgePage.close();
  for (const page of [local, shared]) {
    for (const c of setup.competitions.slice(1)) { page.once('dialog', (d) => void d.accept()); await page.getByRole('button', { name: `Remove ${c.format} ${c.division} competition`, exact: true }).click(); }
    await page.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
    await page.reload(); if (page === local) await page.locator('.rail-item').nth(0).click(); await expandSetup(page);
    await expect(page.getByRole('button', { name: /^Remove .* competition$/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add competition', exact: true }).click(); await expandSetup(page);
    await expect(page.getByLabel('Select round to configure').locator('option')).toHaveCount(2);
    // Exercise roster addition and import controls on the freshly added J&J prelim.
    await page.getByLabel('Bib', { exact: true }).fill('701'); await page.getByLabel('Name', { exact: true }).last().fill('Synthetic Lead');
    await page.getByRole('button', { name: 'Add entrant', exact: true }).click();
    await expect(page.getByLabel('Heat for bib 701', { exact: true })).not.toHaveValue('');
    await page.getByText('Import roster CSV', { exact: true }).click(); await page.locator('textarea[name=csv]').fill('Number,Name,Role\n701,Synthetic Lead,Lead\n702,Synthetic Follow,Follow');
    page.once('dialog', (d) => void d.accept()); await page.getByRole('button', { name: 'Replace unopened roster', exact: true }).click();
    await expect(page.getByLabel('Heat for bib 702', { exact: true })).not.toHaveValue('');
    await page.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
  }
  expect(localPosts).toEqual([]);
  expect(await local.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await local.getByRole('heading', { name: 'Event-long private judge links', exact: true }).scrollIntoViewIfNeeded();
  expect((await local.locator('.local-setup > .form-panel').first().boundingBox())!.width).toBeGreaterThan(220);
  await local.screenshot({ path: 'test-results/local-setup-390.png', fullPage: false });
  await local.locator('.rail-item').nth(3).click();
  const download = local.waitForEvent('download'); await local.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const backup = JSON.parse(await readFile((await (await download).path())!, 'utf8')); expect(backup.event.version).toBe(2); expect(backup.event.removedCompetitions).toHaveLength(4);
  for (const contents of [backup, legacy]) {
    local.once('dialog', (d) => void d.accept());
    await local.locator('label').filter({ hasText: 'Restore JSON' }).locator('input[type=file]').setInputFiles({ name: 'v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contents)) });
    await expect(local.getByRole('heading', { level: 1, name: setup.name })).toBeVisible();
    const expected = 'event' in contents && 'version' in contents.event ? contents.event : contents;
    await expect.poll(() => local.evaluate(() => JSON.parse(localStorage.getItem('country-dance-judging:v2')!).competitions.map((c: { id: string }) => c.id))).toEqual(expected.competitions.map((c: { id: string }) => c.id));
  }
  await localContext.close(); await sharedContext.close();
});

test('local judge buttons create and reopen one persistent rehearsal, expose organizer links and keep v2 scores intact', async ({ browser }) => {
  const setup = stageFixture(undefined, 6);
  const legacy: AppState = { ...createDefaultState(), demoSetup: setup, event: { name: setup.name, venue: setup.venue, date: setup.date }, judges: setup.judges,
    competitions: setup.competitions.map((c) => { const r = setup.rounds.find((r) => r.competitionId === c.id && r.kind === 'prelims')!; return { ...c, name: c.format, round: 'Preliminary', entries: r.subjects.map((s) => ({ id: s.id, number: s.number, ...(s.role ? { name: s.primary, role: s.role } : { lead: s.primary, follow: s.secondary }) })), scores: {}, revisions: [] }; }), activeCompetitionId: setup.competitions[0].id };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const local = await context.newPage(); await local.goto(base);
  await local.evaluate((s) => { localStorage.removeItem('country-dance-judging:rehearsal'); localStorage.setItem('country-dance-judging:v2', JSON.stringify(s)); }, legacy);
  await local.reload(); await local.locator('.rail-item').nth(0).click();
  await expect(local.locator('details.setup-section[open]')).toHaveCount(0);
  await expandSetup(local);
  await expect(local.locator('label').filter({ has: local.getByRole('textbox', { name: 'Judge Synthetic head', exact: true }) })).toContainText('Head judge');
  const before = await local.evaluate(() => localStorage.getItem('country-dance-judging:v2'));
  const links = local.locator('details.setup-section').filter({ has: local.getByRole('heading', { name: 'Event-long private judge links', exact: true }) });
  const firstCard = links.locator('.shared-inline').first();
  let loseCreationResponse = true;
  await context.route('**/api/live', async (route) => {
    if (loseCreationResponse && route.request().postDataJSON()?.action === 'create') {
      loseCreationResponse = false; await route.fetch();
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic lost creation response' }) });
    } else await route.continue();
  });
  await firstCard.getByRole('button', { name: 'Open judge page', exact: true }).click();
  await expect(local.getByText('Synthetic lost creation response', { exact: true })).toBeVisible();
  await context.unroute('**/api/live');
  const opened = local.waitForEvent('popup'); await firstCard.getByRole('button', { name: 'Open judge page', exact: true }).click();
  const judge = await opened; await expect(judge.getByRole('heading', { level: 1, name: setup.name })).toBeVisible();
  const judgePath = new URL(judge.url()).pathname;
  const binding = await local.evaluate(() => JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!) as { path: string; nonce: string });
  const organizer = binding.path.split('/').at(-1)!;
  const view = await api<LiveView>(organizer); expect(view.setup).toEqual(setup); expect(view.judgeLinks).toHaveLength(3);
  expect((await api<LiveView>(judgePath.split('/').at(-1)!)).judgeLinks).toBeUndefined();
  await firstCard.getByRole('button', { name: 'Copy judge link', exact: true }).click();
  await expect.poll(() => local.evaluate(() => navigator.clipboard.readText())).toBe(base + judgePath);
  await local.getByRole('button', { name: 'Copy organizer link', exact: true }).click();
  await expect.poll(() => local.evaluate(() => navigator.clipboard.readText())).toBe(base + binding.path);
  const deskOpened = local.waitForEvent('popup'); await local.getByRole('button', { name: 'Open organizer page', exact: true }).click(); const desk = await deskOpened; await expandSetup(desk);
  await expect(desk).toHaveURL(base + binding.path); await expect(desk.getByRole('link', { name: 'Open judge page', exact: true })).toHaveCount(3);
  await desk.locator('.rail-item').nth(1).click();
  await desk.getByRole('button', { name: 'Start prelims stage', exact: true }).click();
  await expect.poll(async () => (await api<LiveView>(organizer)).rounds.length).toBe(4);
  await judge.reload(); await expect(judge.locator('.phone-row')).toHaveCount(2);
  const saveResponse = judge.waitForResponse((r) => r.request().postDataJSON()?.action === 'save-cell');
  await judge.locator('.phone-row').first().getByRole('button', { name: 'Bib 101: Yes', exact: true }).click(); expect((await saveResponse).status()).toBe(200);
  await local.reload(); await local.locator('.rail-item').nth(0).click(); await expandSetup(local);
  const again = local.waitForEvent('popup'); await firstCard.getByRole('button', { name: 'Open judge page', exact: true }).click(); const same = await again;
  await expect(same).toHaveURL(base + judgePath); expect((await api<LiveView>(organizer)).eventId).toBe(view.eventId);
  expect((await api<LiveView>(judgePath.split('/').at(-1)!)).ballots[0].cells).not.toEqual({});
  expect(await local.evaluate(() => localStorage.getItem('country-dance-judging:v2'))).toBe(before);
  local.once('dialog', (d) => void d.dismiss()); await local.getByRole('button', { name: 'Create another rehearsal', exact: true }).click();
  expect(await local.evaluate(() => JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!).path)).toBe(binding.path);
  await context.close();
});
