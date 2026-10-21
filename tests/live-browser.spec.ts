import { selectSetupRound, expandSetup, openJudgeAccess, openRecovery } from './setup-browser-helpers';
import { test, expect, type APIRequestContext, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { liveFixture } from './live-fixture';
import { cellKey, type LiveSetup, type LiveView } from '../lib/live/types';
import { createDefaultState } from '../lib/domain';

const base = process.env.LIVE_TEST_URL ?? 'http://127.0.0.1:3000';
async function api<T = Record<string, unknown>>(request: APIRequestContext, token: string, input?: Record<string, unknown>): Promise<T> {
  const response = input ? await request.post(`${base}/api/live`, { headers: { Authorization: `Bearer ${token}` }, data: input }) : await request.get(`${base}/api/live`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json(); expect(response.ok(), result.error ?? 'Local API failed').toBeTruthy(); return result as T;
}
async function command(request: APIRequestContext, token: string, input: Record<string, unknown>) {
  const v = await api<LiveView>(request, token); return api(request, token, { ...input, requestId: crypto.randomUUID(), expectedVersion: v.version });
}
async function clickCommand(page: Page, locator: Locator) {
  const post = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'POST', { timeout: 15000 });
  const get = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'GET', { timeout: 15000 });
  await locator.click(); expect((await post).status()).toBe(200); await get;
}
async function fillPerformance(request: APIRequestContext, tokens: string[], performanceId: string) {
  for (const token of tokens) {
    const v = await api<LiveView>(request, token), r = v.rounds.find((r) => r.definition.heats.some((h) => h.songs.some((p) => p.id === performanceId)))!;
    const h = r.definition.heats.find((h) => h.songs.some((p) => p.id === performanceId))!;
    const b = v.ballots.find((b) => b.roundKey === r.key)!;
    await Promise.all(h.subjectIds.map((subjectId, i) => api(request, token, { action: 'save-cell', requestId: crypto.randomUUID(), roundKey: r.key, performanceId, subjectId,
      mark: i < 2 ? 'Yes' : i === h.subjectIds.length - 1 ? 'No' : 'A1', note: b.cells[cellKey(performanceId, subjectId)]?.note ?? '', baseRevision: b.cells[cellKey(performanceId, subjectId)]?.revision ?? 0 })));
  }
}
async function finishBlock(request: APIRequestContext, organizer: string, tokens: string[]) {
  const v = await api<LiveView>(request, organizer);
  const block = v.setup.blocks.find((b) => b.id === v.context.blockId)!;
  const performances = block.roundIds.flatMap((id) => v.rounds.find((r) => r.id === id)!.definition.heats.flatMap((h) => h.songs));
  for (const p of performances.filter((p) => v.context.visited.includes(p.id))) await fillPerformance(request, tokens, p.id);
  let index = performances.findIndex((p) => p.id === v.context.performanceId);
  while (index < performances.length - 1) { await command(request, organizer, { action: 'next' }); index++; await fillPerformance(request, tokens, performances[index].id); }
}
async function submitAndApprove(pages: Page[], head: Page) {
  for (const page of pages) {
    const submit = page.getByRole('button', { name: 'Submit finalized scores for this block' });
    await expect(submit).toBeEnabled({ timeout: 15000 }); await clickCommand(page, submit); await expect(submit).toBeDisabled();
  }
  expect(await head.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await head.evaluate(() => innerWidth));
  const editors = head.locator('.tie-editor');
  for (let i = 0; i < await editors.count(); i++) {
    const editor = editors.nth(i); await editor.getByRole('checkbox', { name: 'Award an explicit shared place' }).check();
    await clickCommand(head, editor.getByRole('button', { name: 'Save head judge decision' }));
  }
  const approve = head.getByRole('button', { name: 'Approve these exact submissions' });
  while (await approve.count()) { const before = await approve.count(); await expect(approve.first()).toBeEnabled(); await clickCommand(head, approve.first()); await expect(approve).toHaveCount(before - 1); }
}

test('four isolated sessions: phone saves/reload/retry, focus-safe context changes, discussion, head approval and pair finals', async ({ browser, request }) => {
  const organizerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const judgeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const secondContext = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  const headContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desk = await organizerContext.newPage(), judge = await judgeContext.newPage(), second = await secondContext.newPage(), head = await headContext.newPage();
  const pageErrors: string[] = []; for (const page of [desk, judge, second, head]) page.on('pageerror', (error) => pageErrors.push(error.message));
  await desk.goto(`${base}/live/new`); await desk.getByLabel('Event name', { exact: true }).fill('Local browser rehearsal'); await desk.getByText('Venue & date (optional)',{exact:true}).click();await desk.getByLabel('Venue', { exact: true }).fill('Local test');
  await desk.getByRole('button', { name: 'Create shared event' }).click(); await expect(desk).toHaveURL(/\/live\/[a-f0-9]{64}$/);
  const organizer = desk.url().split('/').at(-1)!;
  const blank = await api<LiveView>(request, organizer); expect(blank.setup.judges).toHaveLength(0); expect(blank.setup.rounds).toHaveLength(0);
  const setup = liveFixture(22); setup.name = 'Local browser rehearsal'; setup.judges.push({ id: crypto.randomUUID(), name: 'Rehearsal Judge Two' });
  await command(request, organizer, { action: 'setup', setup }); await desk.reload(); await openJudgeAccess(desk);await expect(desk.getByRole('heading', { name: 'Event-long private judge links' })).toBeVisible();
  const ready = await api<LiveView>(request, organizer); const tokens = [ready.judgeLinks![0], ready.judgeLinks![2], ready.judgeLinks![1]].map((l) => l.path.split('/').at(-1)!);
  await desk.locator('.rail-item').nth(0).click(); await expandSetup(desk); await desk.getByRole('button',{name:'02 Score',exact:true}).click();await clickCommand(desk, desk.getByRole('button', { name: 'Start prelims judging', exact: true }));
  await Promise.all([judge.goto(`${base}${ready.judgeLinks![0].path}`), second.goto(`${base}${ready.judgeLinks![2].path}`), head.goto(`${base}${ready.judgeLinks![1].path}`)]);
  const firstRow = judge.locator('.phone-row').first(); await expect(firstRow).toBeVisible();
  const geometry = await judge.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, rail: document.querySelector('.side-rail')?.getBoundingClientRect().width ?? 0 }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.rail).toBe(0);
  for (const button of await firstRow.locator('.mark-button').all()) { const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44); }
  await firstRow.getByRole('button', { name: 'Bib 101: Yes', exact: true }).tap();
  await expect(judge.getByRole('status').filter({ hasText: 'Saved to shared event' })).toBeVisible();
  const firstView = await api<LiveView>(request, tokens[0]); const firstRound = firstView.rounds[0], firstSong = firstView.context.performanceId!, subjectId = firstRound.definition.subjects[0].id;
  const revision = firstView.ballots[0].cells[cellKey(firstSong, subjectId)].revision;
  await firstRow.getByRole('button', { name: 'Bib 101: Yes', exact: true }).tap();
  expect((await api<LiveView>(request, tokens[0])).ballots[0].cells[cellKey(firstSong, subjectId)].revision).toBe(revision);
  await firstRow.getByRole('button', { name: /^Note/ }).tap(); const note = firstRow.getByRole('textbox', { name: 'Note for bib 101' });
  await judgeContext.route('**/api/live', async (route) => { if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'save-cell') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated interrupted connection' }) }); else await route.continue(); });
  await judgeContext.setOffline(true); await note.fill('Recovered private note');
  await expect(judge.locator('.pending-panel')).toBeVisible();
  await judgeContext.setOffline(false); judge.on('dialog', (dialog) => void dialog.accept());
  await judge.reload(); await expect(judge.locator('.pending-panel')).toBeVisible();
  await judge.locator('.phone-row').first().getByRole('button', { name: /^Note/ }).tap();
  const recoveredNote = judge.getByRole('textbox', { name: 'Note for bib 101' }); await expect(recoveredNote).toHaveValue('Recovered private note');
  await judgeContext.unroute('**/api/live');
  await expect(judge.locator('.pending-panel')).toHaveCount(0, { timeout: 20000 });
  expect((await api<LiveView>(request, tokens[0])).ballots[0].cells[cellKey(firstSong, subjectId)].note).toBe('Recovered private note');
  expect(JSON.stringify(await api<LiveView>(request, tokens[1]))).not.toContain('Recovered private note');
  await recoveredNote.fill('Typing through the song change'); await recoveredNote.focus();
  const scroll = await judge.evaluate(() => scrollY);
  await clickCommand(desk, desk.getByRole('button', { name: 'Next song / heat' }));
  await expect(judge.getByRole('button', { name: 'Open current song' })).toBeVisible({ timeout: 10000 });
  await expect(recoveredNote).toBeFocused(); expect(await judge.evaluate(() => scrollY)).toBe(scroll);
  await recoveredNote.fill('Typing through the song change, still attached to song one');
  await expect(judge.locator('.pending-panel')).toHaveCount(0, { timeout: 15000 });
  expect((await api<LiveView>(request, tokens[0])).ballots[0].cells[cellKey(firstSong, subjectId)].note).toContain('still attached to song one');
  await judge.screenshot({ path: 'test-results/phone-ballot.png', fullPage: false });
  await judge.getByRole('button', { name: 'Open current song' }).tap(); await expect(judge.getByRole('textbox', { name: 'Note for bib 101' })).toHaveCount(0);
  await finishBlock(request, organizer, tokens);
  const beforeDiscussion = await api<LiveView>(request, organizer); const lastSong = beforeDiscussion.rounds.flatMap((r) => r.definition.heats.flatMap((h) => h.songs)).find((p) => p.id === beforeDiscussion.context.performanceId)!;
  await expect(desk.getByRole('heading', { name: lastSong.title, exact: true }).first()).toBeVisible({ timeout: 10000 });
  await clickCommand(desk, desk.getByRole('button', { name: 'Start discussion after all songs' }));
  await submitAndApprove([judge, second, head], head);
  await desk.reload(); await expandSetup(desk); await selectSetupRound(desk, setup, setup.rounds[5].id); await expandSetup(desk);
  await desk.getByLabel('Finalists per role / number of pairs').fill('2');
  for (const s of setup.rounds[4].subjects) await desk.getByRole('checkbox', { name: `#${s.number} ${s.primary} ${s.role}` }).check();
  await desk.getByLabel('#201 Dancer 1 pairs with').selectOption(setup.rounds[4].subjects[2].id); await desk.getByLabel('#202 Dancer 2 pairs with').selectOption(setup.rounds[4].subjects[3].id);
  await clickCommand(desk, desk.getByRole('button', { name: 'Save setup', exact: true }));await expect(desk.getByRole('button',{name:'Save setup',exact:true})).toHaveCount(0);await expect(desk.locator('#setup-saved-details')).not.toHaveAttribute('open');await expandSetup(desk);
  const latest = await api<LiveView>(request, organizer); const finalsSetup: LiveSetup = structuredClone(latest.setup);
  for (const finals of finalsSetup.rounds.filter((r) => r.kind === 'finals' && !r.subjects.length)) {
    const pre = finalsSetup.rounds.find((r) => r.id === finals.prelimRoundId)!; const c = finalsSetup.competitions.find((c) => c.id === finals.competitionId)!;
    finals.finalistCount = 2;
    if (c.format === 'Strictly') { finals.subjects = pre.subjects.slice(0, 2); finals.finalistIds = finals.subjects.map((s) => s.id); }
    else { finals.finalistIds = pre.subjects.map((s) => s.id); finals.subjects = [0, 1].map((i) => ({ id: crypto.randomUUID(), number: 401 + i, primary: pre.subjects[i].primary, secondary: pre.subjects[i + 2].primary, members: [pre.subjects[i].id, pre.subjects[i + 2].id] })); }
    finals.heats[0].subjectIds = finals.subjects.map((s) => s.id);
  }
  await command(request, organizer, { action: 'setup', setup: finalsSetup }); await desk.reload(); await desk.locator('.rail-item').nth(0).click(); await expandSetup(desk);
  await desk.getByRole('button',{name:'02 Score',exact:true}).click();await clickCommand(desk, desk.getByRole('button', { name: 'Start finals judging', exact: true })); await finishBlock(request, organizer, tokens);
  const finalView = await api<LiveView>(request, organizer); const finalSong = finalView.rounds.flatMap((r) => r.definition.heats.flatMap((h) => h.songs)).find((p) => p.id === finalView.context.performanceId)!;
  await expect(desk.getByRole('heading', { name: finalSong.title, exact: true }).first()).toBeVisible({ timeout: 10000 });
  await clickCommand(desk, desk.getByRole('button', { name: 'Start discussion after all songs' })); await submitAndApprove([judge, second, head], head);
  const approved = await api<LiveView>(request, organizer); expect(approved.rounds.every((r) => r.standings!.approved)).toBe(true);
  const finalRound = approved.rounds.find((r) => r.definition.kind === 'finals')!;
  head.once('dialog', (dialog) => void dialog.accept('Browser correction rehearsal'));
  await clickCommand(head, head.locator('.result-sheet').filter({ hasText: `${finalRound.definition.format} · ${finalRound.definition.division} · finals` }).getByRole('button', { name: 'Reopen for a correction' }));
  const reopened = (await api<LiveView>(request, organizer)).rounds.find((r) => r.id === finalRound.id)!;
  expect(reopened.generation).toBe(finalRound.generation + 1); expect(reopened.standings!.approved).toBe(false);
  await desk.locator('.rail-item').nth(3).click(); await expect(desk.getByRole('button',{name:/Export|Print|Send/})).toHaveCount(0);
  await Promise.all([organizerContext.close(), judgeContext.close(), secondContext.close(), headContext.close()]);
  expect(pageErrors).toEqual([]);
});

test('legacy v2 local storage and wrapped backups still restore', async ({ page }) => {
  const legacy = createDefaultState(); legacy.event.name = 'Legacy v2 rehearsal';
  await page.addInitScript((state) => { if (!localStorage.getItem('country-dance-judging:v2')) localStorage.setItem('country-dance-judging:v2', JSON.stringify(state)); }, legacy);
  await page.goto(base);
  await expect(page.getByRole('heading', { level: 1, name: 'Legacy v2 rehearsal' })).toBeVisible();
  await page.locator('.rail-item').nth(0).click(); await expandSetup(page);
  await openRecovery(page);await page.getByText('Legacy device backup & history',{exact:true}).click();
  const backupButton = page.getByRole('button', { name: 'Download JSON' });
  const downloaded = page.waitForEvent('download'); await backupButton.click();
  const file = await downloaded; const backup = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(backup.format).toBe('country-dance-judging-backup'); expect(backup.event.version).toBe(2);
  const restored = createDefaultState(); restored.event.name = 'Restored v2 rehearsal';
  page.on('dialog', (dialog) => void dialog.accept());
  await page.locator('label').filter({ hasText: 'Restore JSON' }).locator('input[type=file]').setInputFiles({ name: 'legacy-v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...backup, event: restored })) });
  await expect(page.getByRole('heading', { level: 1, name: 'Restored v2 rehearsal' })).toBeVisible();
});

test('heat removal preserves entrants, block readiness explains problems, and discussion waits for every song', async ({ page, request }) => {
  const setup = liveFixture(2), prelim = setup.rounds[0];
  const extraHeat = (number: number) => ({ ...structuredClone(prelim.heats[0]), id: crypto.randomUUID(), name: `Heat ${number}`, subjectIds: [], songs: prelim.heats[0].songs.map((p) => ({ ...p, id: crypto.randomUUID(), title: `Song ${number}`, partners: [] })) });
  prelim.heats.push(extraHeat(2), extraHeat(3));
  const advanced = setup.rounds[6], advancedSubjects = structuredClone(advanced.subjects), advancedHeats = structuredClone(advanced.heats);
  advanced.subjects = []; advanced.heats.forEach((h) => { h.subjectIds = []; h.songs.forEach((p) => { p.partners = []; }); });
  const created = await api<{ path: string }>(request, '', { action: 'create', requestId: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''), name: 'Heat editing regression', venue: 'Local test', date: '' });
  const organizer = created.path.split('/').at(-1)!;
  await command(request, organizer, { action: 'setup', setup }); await page.goto(`${base}${created.path}`); await expandSetup(page);
  await expect(page.locator('#setup-saved-details > summary')).toBeVisible();
  await page.getByRole('button', {name:'01 Set up',exact:true}).click(); await expandSetup(page);
  await page.getByRole('button',{name:'02 Score',exact:true}).click();
  const start = page.getByRole('button', { name: 'Start prelims judging', exact: true });
  await expect(start).toBeDisabled();
  await expect(page.getByText('Strictly · Beginner / Intermediate · prelims: Heat 2 has no entrants. Assign contestants or remove this heat.', { exact: true })).toBeVisible();
  await expect(page.getByText('Jack & Jill · Advanced · prelims: Add entrants to this round.', { exact: true })).toBeVisible();
  expect((await api<LiveView>(request, organizer)).rounds).toHaveLength(0);
  await page.getByRole('button', { name: '01 Set up', exact: true }).click(); await expandSetup(page);
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'Remove Heat 1', exact: true }).click();
  await expect(page.locator('.shared-heat')).toHaveCount(3);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Remove Heat 1', exact: true }).click();
  await expect(page.locator('.shared-heat')).toHaveCount(2);
  for (const subject of prelim.subjects) await expect(page.getByRole('combobox', { name: `Heat for bib ${subject.number}`, exact: true })).toHaveValue('');
  await clickCommand(page, page.getByRole('button', { name: 'Save setup', exact: true }));await expect(page.getByRole('button',{name:'Save setup',exact:true})).toHaveCount(0);await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');await expandSetup(page);
  let saved = (await api<LiveView>(request, organizer)).setup.rounds[0];
  expect(saved.subjects.map((s) => s.id)).toEqual(prelim.subjects.map((s) => s.id));
  expect(saved.heats.flatMap((h) => h.subjectIds)).toEqual([]);
  for (const subject of prelim.subjects) await page.getByRole('combobox', { name: `Heat for bib ${subject.number}`, exact: true }).selectOption(prelim.heats[1].id);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Remove Heat 3', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Heat 2', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Add heat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Heat 1', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Remove Heat 1', exact: true }).click();
  await clickCommand(page, page.getByRole('button', { name: 'Save setup', exact: true }));await expect(page.getByRole('button',{name:'Save setup',exact:true})).toHaveCount(0);await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');await expandSetup(page);
  const ready = await api<LiveView>(request, organizer);
  ready.setup.rounds[6].subjects = advancedSubjects; ready.setup.rounds[6].heats = advancedHeats;
  await command(request, organizer, { action: 'setup', setup: ready.setup }); await page.reload();
  await page.getByRole('button', {name:'01 Set up',exact:true}).click(); await expandSetup(page);
  await page.getByRole('button',{name:'02 Score',exact:true}).click();await expect(start).toBeEnabled(); await clickCommand(page, start);
  // SQL result order is not the running order; every status read must follow the configured block.
  await page.route('**/api/live', async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
    const response = await route.fetch(), body = await response.json();
    body.rounds.reverse(); await route.fulfill({ response, json: body });
  });
  await page.reload(); await page.getByRole('button', { name: '01 Set up', exact: true }).click(); await expect(page.locator('#setup-saved-details > summary')).toBeVisible();
  await page.getByRole('button', {name:'01 Set up',exact:true}).click(); await expandSetup(page);
  saved = (await api<LiveView>(request, organizer)).rounds[0].definition;
  expect(saved.heats).toHaveLength(1); expect(saved.heats[0].name).toBe('Heat 2');
  await page.getByRole('button',{name:'02 Score',exact:true}).click();
  const discussion = page.getByRole('button', { name: 'Start discussion after all songs', exact: true });
  await expect(discussion).toBeDisabled();
  const view = await api<LiveView>(request, organizer), count = view.rounds.flatMap((r) => r.definition.heats.flatMap((h) => h.songs)).length;
  for (let i = 1; i < count; i++) await clickCommand(page, page.getByRole('button', { name: 'Next song / heat', exact: true }));
  await expect(discussion).toBeEnabled(); await clickCommand(page, discussion);
  expect((await api<LiveView>(request, organizer)).rounds.every((r) => r.phase === 'discussion')).toBe(true);
  await page.getByRole('button', { name: '01 Set up', exact: true }).click(); await expandSetup(page);
  await expect(page.getByRole('button', { name: 'Remove Heat 2', exact: true })).toBeDisabled();
});

test('competition removal updates both blocks, persists, protects live work and permits a fresh program', async ({ page, request }) => {
  const setup = liveFixture(2);
  const created = await api<{ path: string }>(request, '', { action: 'create', requestId: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''), name: 'Competition editing regression', venue: 'Local test', date: '' });
  const organizer = created.path.split('/').at(-1)!;
  await command(request, organizer, { action: 'setup', setup }); await page.goto(`${base}${created.path}`); await expandSetup(page);
  await expect(page.locator('#setup-saved-details > summary')).toBeVisible();
  const removed = setup.competitions[0], removedRounds = setup.rounds.filter((r) => r.competitionId === removed.id);
  const originalLinks = (await api<LiveView>(request, organizer)).judgeLinks;
  await selectSetupRound(page, setup, removedRounds[0].id);
  const remove = page.getByRole('button', { name: `Remove ${removed.format} ${removed.division} competition`, exact: true });
  page.once('dialog', (d) => void d.dismiss()); await remove.click();
  await expect(page.locator('.competition-card')).toHaveCount(4);
  page.once('dialog', (d) => void d.accept()); await remove.click();
  await expect(page.locator('.competition-card')).toHaveCount(3);
  expect((await api<LiveView>(request, organizer)).setup.competitions).toHaveLength(4);
  await expect(page.getByRole('combobox', { name: 'Select round to configure', exact: true })).not.toHaveValue(removedRounds[0].id);
  await clickCommand(page, page.getByRole('button', { name: 'Save setup', exact: true }));await expect(page.getByRole('button',{name:'Save setup',exact:true})).toHaveCount(0);await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');await expandSetup(page);
  const saved = await api<LiveView>(request, organizer);
  expect(saved.setup.competitions).toEqual(setup.competitions.slice(1));
  expect(saved.setup.rounds.some((r) => r.competitionId === removed.id)).toBe(false);
  expect(saved.setup.blocks.flatMap((b) => b.roundIds).some((id) => removedRounds.some((r) => r.id === id))).toBe(false);
  expect(saved.judgeLinks).toEqual(originalLinks);
  await page.reload(); await expandSetup(page); await expect(page.locator('.competition-card')).toHaveCount(3);
  // Empty programs remain editable; default blocks can be reused when adding a new competition.
  for (const c of setup.competitions.slice(1)) {
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: `Remove ${c.format} ${c.division} competition`, exact: true }).click();
  }
  await clickCommand(page, page.getByRole('button', { name: 'Save setup', exact: true }));await expect(page.getByRole('button',{name:'Save setup',exact:true})).toHaveCount(0);await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');await expandSetup(page);
  expect((await api<LiveView>(request, organizer)).setup.rounds).toHaveLength(0);
  await page.getByRole('button', { name: '+ J&J', exact: true }).click(); await page.getByRole('button', { name: 'Add competition', exact: true }).click(); await expandSetup(page);
  await expect(page.getByRole('combobox', { name: 'Select round to configure', exact: true }).locator('option')).toHaveCount(2);
  await clickCommand(page, page.getByRole('button', { name: 'Save setup', exact: true }));await expect(page.getByRole('button',{name:'Save setup',exact:true})).toHaveCount(0);await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');await expandSetup(page);
  const fresh = await api<LiveView>(request, organizer); expect(fresh.setup.competitions).toHaveLength(1); expect(fresh.setup.blocks.every((b) => b.roundIds.length === 1)).toBe(true);
  await command(request, organizer, { action: 'setup', setup }); await command(request, organizer, { action: 'open-block', blockId: setup.blocks[0].id });
  await page.reload(); await expandSetup(page); await expect(page.getByRole('button', { name: /^Remove .* competition$/ }).first()).toBeDisabled();
  await page.getByText('Versioned setup correction', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Unlock frozen setup for an explicit correction', exact: true }).check();
  await page.getByRole('textbox', { name: 'Correction reason', exact: true }).fill('Remove a cancelled competition');
  page.once('dialog', (d) => void d.accept()); await remove.click();
  page.once('dialog', (d) => void d.accept()); await clickCommand(page, page.getByRole('button', { name: 'Save setup', exact: true }));await expect(page.getByRole('button',{name:'Save setup',exact:true})).toHaveCount(0);await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');await expandSetup(page);
  const corrected = await api<LiveView>(request, organizer);
  expect(corrected.rounds.some((r) => r.definition.competitionId === removed.id)).toBe(false);
  expect(corrected.rounds.every((r) => r.phase === 'setup')).toBe(true); expect(corrected.context.performanceId).toBeNull();
});
