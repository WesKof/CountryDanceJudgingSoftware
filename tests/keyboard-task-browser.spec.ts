import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { api, base, command, save } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

async function tabTo(page: Page, target: Locator, backwards = false) {
  for (let i = 0; i < 70; i++) {
    if (await target.count() === 1 && await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
  }
  await expect(target).toBeFocused();
}
async function event() {
  const result = await createStage(limitedStage(1, 4));
  await command(result.organizer, { action: 'enable-auto-stages' });
  return { ...result, view: await api<LiveView>(result.organizer) };
}
async function capture(page: Page, name: string) {
  const directory = process.env.KEYBOARD_EVIDENCE;
  if (directory) { mkdirSync(directory, { recursive: true }); await page.screenshot({ path: `${directory}/${name}.png`, fullPage: false }); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('organizer native keyboard reaches setup guidance and every panel without a write or lost focus', async ({ browser }) => {
  const fixture = await event(), context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
  const writes: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/live')) writes.push(request.postDataJSON().action); });
  try {
    await page.goto(base + fixture.path);
    const setup = page.getByRole('button', { name: '01 Set up', exact: true }); await tabTo(page, setup); await page.keyboard.press('Enter');
    const tools = page.locator('#setup-saved-details > summary'); await tabTo(page, tools); await page.keyboard.press('Space');
    const picker = page.getByLabel('Go to section', { exact: true }); await tabTo(page, picker); await page.keyboard.press('j');
    const judges = page.locator('[data-section="Judges"] > summary'); await expect(judges).toBeFocused();
    await page.keyboard.press('Space'); await page.keyboard.press('Tab');
    // The running panel is frozen, so Tab skips disabled inputs to the next disclosure.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SUMMARY');
    await page.keyboard.press('Shift+Tab'); await expect(judges).toBeFocused();
    const score = page.getByRole('button', { name: '02 Score', exact: true }); await tabTo(page, score, true); await page.keyboard.press('Enter');
    for (const name of ['03 Results', '04 Publish']) { const button = page.getByRole('button', { name, exact: true }); await tabTo(page, button); await page.keyboard.press('Enter'); await expect(button).toBeFocused(); await expect(button).toHaveAttribute('aria-current', 'step'); }
    await capture(page, 'keyboard-organizer-publish-1440'); await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'keyboard-organizer-publish-390');
    expect(writes).toEqual([]); expect((await api<LiveView>(fixture.organizer)).version).toBe(fixture.view.version);
  } finally { await context.close(); }
});

test('judge Note controls identify their own bib during real keyboard navigation', async ({ browser }) => {
  const fixture = await event(), context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  try {
    await page.goto(base + fixture.view.judgeLinks![0].path);
    const row = page.locator('#judge-bib-101'), note = row.getByRole('button', { name: /^Note/ });
    await tabTo(page, note); await expect(note).toHaveAccessibleName('Note for bib 101');
    await page.keyboard.press('Space'); await expect(note).toHaveAttribute('aria-expanded', 'true');
    const editor = row.getByRole('textbox', { name: 'Note for bib 101', exact: true }); await tabTo(page, editor);
    await page.keyboard.insertText('PRIVATE_KEYBOARD_NOTE');
    await expect(page.locator('.pending-panel')).toHaveCount(0);
    const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'GET');
    await page.evaluate(() => window.dispatchEvent(new Event('online'))); await (await refreshed).finished();
    await expect(editor).toBeFocused(); await expect(editor).toHaveValue('PRIVATE_KEYBOARD_NOTE'); await page.keyboard.press('Shift+Tab');
    expect(JSON.stringify(await api<LiveView>(fixture.tokens[0]))).toContain('PRIVATE_KEYBOARD_NOTE');
    expect(JSON.stringify(await api<LiveView>(fixture.organizer))).not.toContain('PRIVATE_KEYBOARD_NOTE');
    for (const [i, button] of (await page.locator('.note-toggle').all()).entries()) await expect(button).toHaveAccessibleName(`Note for bib ${101 + i}`);
  } finally { await context.close(); }
});

for (const head of [false, true]) test(`${head ? 'last head' : 'ordinary'} acknowledged delayed submission respects a deliberate focus move to another persistent control`, async ({ browser }) => {
  const fixture = await event(), round = fixture.view.rounds[0], heat = round.definition.heats[0];
  const judge = head ? 2 : 0;
  if (head) for (const token of fixture.tokens.slice(0, 2)) {
    for (const id of heat.subjectIds) await save(token, round, heat.songs[0].id, id, 'No');
    const own = await api<LiveView>(token);
    await api(token, { action: 'submit-stage', blockId: own.context.blockId, acknowledged: true, requestId: crypto.randomUUID(), expectedVersion: own.version, ballotVersions: Object.fromEntries(own.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(own.rounds.map((r) => [r.key, r.version])) });
  }
  for (const id of heat.subjectIds) await save(fixture.tokens[judge], round, heat.songs[0].id, id, 'No');
  const context = await browser.newContext(), page = await context.newPage();
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); let pending = false;
  await context.route('**/api/live', async (route) => {
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'submit-stage') { pending = true; await held; }
    await route.continue();
  });
  try {
    await page.goto(base + fixture.view.judgeLinks![judge].path);
    await tabTo(page, page.getByRole('button', { name: 'Review & submit prelims', exact: true })); await page.keyboard.press('Enter');
    await page.keyboard.press('Tab'); await page.keyboard.press('Space'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await expect.poll(() => pending).toBe(true);
    const retained = head ? page.locator('[data-section="Completed judging & history"] > summary') : page.getByRole('link', { name: 'Organizer home', exact: true }); await tabTo(page, retained, !head);
    release(); await expect(head ? page.locator('#round-result-' + round.id) : page.locator('.judge-action-current')).toContainText(head ? 'Provisional results' : 'Your stage scores are submitted');
    await expect(retained).toBeFocused();
  } finally { release(); await context.close(); }
});

for (const head of [false, true]) test(`${head ? 'head' : 'ordinary'} keyboard stage submission moves focus from the removed button to the current task status`, async ({ browser }) => {
  const fixture = await event(), round = fixture.view.rounds[0], heat = round.definition.heats[0];
  const judge = head ? 2 : 0;
  if (head) for (const token of fixture.tokens.slice(0, 2)) {
    for (const [i, id] of heat.subjectIds.entries()) await save(token, round, heat.songs[0].id, id, i < 2 ? 'Yes' : 'No');
    const own = await api<LiveView>(token);
    await api(token, { action: 'submit-stage', blockId: own.context.blockId, acknowledged: true, requestId: crypto.randomUUID(), expectedVersion: own.version, ballotVersions: Object.fromEntries(own.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(own.rounds.map((r) => [r.key, r.version])) });
  }
  for (const [i, id] of heat.subjectIds.entries()) await save(fixture.tokens[judge], round, heat.songs[0].id, id, i < 2 ? 'Yes' : 'No', i === 0 ? 'PRIVATE_KEYBOARD_SUBMISSION' : '');
  const before = await api<LiveView>(fixture.tokens[judge]), context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  try {
    await page.goto(base + fixture.view.judgeLinks![judge].path);
    await tabTo(page, page.getByRole('button', { name: 'Review & submit prelims', exact: true })); await page.keyboard.press('Enter');
    const acknowledge = page.getByRole('checkbox', { name: /^My scheduled dancing is finished/ }); await page.keyboard.press('Tab'); await expect(acknowledge).toBeFocused(); await page.keyboard.press('Space');
    const submit = page.getByRole('button', { name: 'Submit prelims', exact: true }); await page.keyboard.press('Tab'); await expect(submit).toBeFocused(); await page.keyboard.press('Enter');
    const current = head ? page.locator('#round-result-' + round.id) : page.locator('.judge-action-current');
    await expect(current).toContainText(head ? 'Provisional results' : 'Your stage scores are submitted');
    await expect(current).toHaveAccessibleName(head ? 'Strictly · Beginner / Intermediate · prelims Provisional results' : 'Your stage scores are submitted');
    await expect(current, `Actual focus: ${await page.evaluate(() => document.activeElement?.tagName)}`).toBeFocused();
    await expect(current).toHaveAttribute('tabindex', '-1'); await expect(current).toBeInViewport(); await capture(page, `keyboard-${head ? 'head' : 'ordinary'}-submitted-task-390`);
    await page.setViewportSize({ width: 1440, height: 1000 }); await capture(page, `keyboard-${head ? 'head' : 'ordinary'}-submitted-task-1440`);
    await page.keyboard.press('Tab');
    await expect(head ? page.getByRole('button', { name: 'Approve these exact submissions', exact: true }) : page.locator('[data-section="Completed judging & history"] > summary')).toBeFocused();
    const after = await api<LiveView>(fixture.tokens[judge]); expect(after.ballots[0].cells).toEqual(before.ballots[0].cells); expect(after.ballots[0].locked).toBe(true); expect(after.heatSubmissions).toHaveLength(head ? 3 : 1);
  } finally { await context.close(); }
});

test('failed and stale keyboard submissions leave review controls usable and do not focus a success task', async ({ browser }) => {
  const fixture = await event(), round = fixture.view.rounds[0], heat = round.definition.heats[0];
  for (const id of heat.subjectIds) await save(fixture.tokens[0], round, heat.songs[0].id, id, 'No');
  const context = await browser.newContext(), page = await context.newPage(); let failure = 503;
  await context.route('**/api/live', async (route) => {
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'submit-stage') {
      await route.fulfill({ status: failure, contentType: 'application/json', body: JSON.stringify({ error: failure === 503 ? 'Synthetic submission interruption' : 'Synthetic stale stage; review again' }) }); return;
    }
    await route.continue();
  });
  try {
    await page.goto(base + fixture.view.judgeLinks![0].path);
    await tabTo(page, page.getByRole('button', { name: 'Review & submit prelims', exact: true })); await page.keyboard.press('Enter');
    const acknowledge = page.getByRole('checkbox', { name: /^My scheduled dancing is finished/ }); await page.keyboard.press('Tab'); await page.keyboard.press('Space');
    const submit = page.getByRole('button', { name: 'Submit prelims', exact: true }); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await expect(page.getByText('Synthetic submission interruption', { exact: true })).toBeVisible(); await expect(submit).toBeEnabled();
    await expect(page.locator('.judge-action-current')).not.toBeFocused();
    failure = 409; await tabTo(page, submit); await page.keyboard.press('Enter');
    await expect(page.getByText('Synthetic stale stage; review again', { exact: true })).toBeVisible(); await expect(submit).toBeEnabled(); await expect(acknowledge).toBeChecked();
    const after = await api<LiveView>(fixture.tokens[0]); expect(after.ballots[0].locked).toBe(false); expect(after.heatSubmissions).toHaveLength(0);
  } finally { await context.close(); }
});
