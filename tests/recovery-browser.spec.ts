import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { api, base, command, save } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import { liveFixture } from './live-fixture';
import { openRecovery } from './setup-browser-helpers';
import type { LiveView } from '../lib/live/types';

async function fixture(legacy = false) {
  const setup = legacy ? liveFixture(4) : limitedStage(1, 4), event = await createStage(setup);
  if (legacy) {
    for (const round of setup.rounds) round.judgeIds = setup.judges.map((j) => j.id);
    await command(event.organizer, { action: 'setup', setup });
  }
  await command(event.organizer, legacy ? { action: 'open-block', blockId: setup.blocks[0].id } : { action: 'open-stage', kind: 'prelims' });
  const view = await api<LiveView>(event.organizer), round = view.rounds[0], heat = round.definition.heats[0];
  await save(event.tokens[0], round, heat.songs[0].id, heat.subjectIds[0], 'Yes', 'RECOVERY_TASK_PRIVATE_NOTE');
  return event;
}
async function open(page: Page, path: string) { await page.goto(base + path); await openRecovery(page); return page.locator('details[data-section="Data & recovery"]'); }
async function capture(page: Page, name: string) {
  const directory = process.env.RECOVERY_EVIDENCE;
  if (directory) { mkdirSync(directory, { recursive: true }); await page.screenshot({ path: `${directory}/${name}.png`, fullPage: false }); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const legacy of [false, true]) test(`${legacy ? 'legacy' : 'stage'} backup in progress blocks duplicate download and announces current privacy near the controls`, async ({ browser }) => {
  const event = await fixture(legacy), context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); let requests = 0;
  await context.route('**/api/live', async (route) => {
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'backup') { requests++; await held; }
    await route.continue();
  });
  try {
    const recovery = await open(page, event.path), button = recovery.getByRole('button', { name: 'Download event backup', exact: true });
    await recovery.getByText('Backup options', { exact: true }).click();
    await button.click(); await expect.poll(() => requests).toBe(1);
    await button.evaluate((element: HTMLButtonElement) => element.click());
    await expect(button).toBeDisabled();
    await expect(recovery.getByRole('status')).toContainText('Preparing backup');
    await expect(recovery.getByRole('checkbox')).toBeDisabled();
    if (!legacy) {
      await page.getByRole('button', { name: '01 Set up', exact: true }).click(); await openRecovery(page);
      await expect(button).toBeDisabled(); await expect(recovery.getByRole('status')).toContainText('Preparing backup');
    }
    await capture(page, `recovery-${legacy ? 'legacy' : 'stage'}-backup-pending-390`);
    expect(requests).toBe(1);
    const downloaded = page.waitForEvent('download'); release();
    const backup = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'));
    expect(backup.includesPrivateNotes).toBe(false); expect(JSON.stringify(backup)).not.toContain('RECOVERY_TASK_PRIVATE_NOTE'); expect(JSON.stringify(backup)).not.toContain(event.organizer);
    await expect(recovery.getByRole('status')).toContainText('download started');
    await expect(button).toBeEnabled();
  } finally { release(); await context.close(); }
});

test('note-inclusive backup clearly updates the visible privacy statement', async ({ browser }) => {
  const event = await fixture(), context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  try {
    const recovery = await open(page, event.path);
    await recovery.getByText('Backup options', { exact: true }).click(); await recovery.getByRole('checkbox').check();
    await expect(recovery.locator('.recovery-backup-privacy')).toContainText('Private judge notes will be included');
    const downloaded = page.waitForEvent('download'); await recovery.getByRole('button', { name: 'Download event backup', exact: true }).click();
    const backup = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'));
    expect(backup.includesPrivateNotes).toBe(true); expect(JSON.stringify(backup)).toContain('RECOVERY_TASK_PRIVATE_NOTE'); expect(JSON.stringify(backup)).not.toContain(event.organizer);
    await expect(recovery.getByRole('status')).toContainText('Private judge notes included');
    await capture(page, 'recovery-notes-included-390');
  } finally { await context.close(); }
});

for (const legacy of [false, true]) {
  const mode = legacy ? 'legacy' : 'stage';
  test(`${mode} backup failure stays beside the control, rejects unverifiable downloads and retries`, async ({ browser }) => {
    const event = await fixture(legacy), context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
    let attempts = 0, downloads = 0; page.on('download', () => downloads++);
    await context.route('**/api/live', async (route) => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'backup') {
        attempts++;
        if (attempts === 1) { await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic backup interruption"}' }); return; }
        if (attempts === 2) { await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); return; }
      }
      await route.continue();
    });
    try {
      const recovery = await open(page, event.path), before = await api<LiveView>(event.organizer), button = recovery.getByRole('button', { name: 'Download event backup', exact: true });
      await button.focus(); await page.keyboard.press('Enter');
      await expect(recovery.getByRole('alert')).toContainText('Synthetic backup interruption'); await expect(button).toBeEnabled();
      await capture(page, `recovery-${mode}-error-390`);
      await button.click(); await expect(recovery.getByRole('alert')).toContainText('could not be verified'); expect(downloads).toBe(0);
      const downloaded = page.waitForEvent('download'); await button.click(); await downloaded;
      await expect(recovery.getByRole('status')).toContainText('download started'); await expect(recovery.getByRole('alert')).toHaveCount(0);
      const after = await api<LiveView>(event.organizer); expect(after.version).toBe(before.version); expect(after.rounds).toEqual(before.rounds);
      expect(attempts).toBe(3);
    } finally { await context.close(); }
  });

  test(`${mode} restore cancellation, invalid files and interrupted-response same-file retry preserve one new event and the source`, async ({ browser }) => {
    const event = await fixture(legacy), context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
    const backup = await api<Record<string, unknown>>(event.organizer, { action: 'backup', requestId: crypto.randomUUID() });
    const file = { name: 'synthetic-recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) };
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    const requests: string[] = []; let acceptedPath = '';
    await context.route('**/api/live', async (route) => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'restore') {
        requests.push(route.request().postDataJSON().requestId);
        if (requests.length === 1) {
          const response = await route.fetch(); expect(response.status()).toBe(200); acceptedPath = (await response.json()).path;
          await held; await route.abort('failed'); return;
        }
      }
      await route.continue();
    });
    try {
      const recovery = await open(page, event.path); await recovery.getByText('Restore from backup', { exact: true }).click();
      const input = recovery.getByLabel('Restore as a new shared event'), before = await api<LiveView>(event.organizer);
      await input.focus(); await expect(input).toBeFocused(); await expect(recovery.locator('label.file-button')).toHaveCSS('outline-style', 'solid');
      page.once('dialog', (d) => void d.dismiss()); await input.setInputFiles(file);
      await expect(input).toHaveValue(''); expect(requests).toHaveLength(0);
      await expect(recovery.getByRole('status')).toContainText('Restore canceled');
      page.once('dialog', (d) => void d.accept()); await input.setInputFiles({ ...file, buffer: Buffer.from('invalid JSON') });
      await expect(recovery.getByRole('alert')).toContainText('Choose the same file to retry'); expect(requests).toHaveLength(0);
      page.once('dialog', (d) => void d.accept()); await input.setInputFiles({ ...file, buffer: Buffer.alloc(1500001, ' ') });
      await expect(recovery.getByRole('alert')).toContainText('Backup is too large'); expect(requests).toHaveLength(0);
      page.once('dialog', (d) => void d.accept()); await input.setInputFiles(file);
      await expect.poll(() => acceptedPath.length > 0).toBe(true);
      await expect(input).toBeDisabled(); await expect(recovery.getByRole('button', { name: 'Download event backup', exact: true })).toBeDisabled();
      await expect(recovery.getByRole('status')).toContainText('Restoring as a new event');
      await expect(recovery.getByRole('status')).toBeInViewport();
      // A programmatic repeat must also be refused while the first request is unresolved.
      page.once('dialog', (d) => void d.accept()); await input.setInputFiles(file);
      await capture(page, `recovery-${mode}-restore-pending-390`); expect(requests).toHaveLength(1);
      release(); await expect(recovery.getByRole('alert')).toContainText('Connection interrupted'); await expect(input).toBeEnabled();
      await expect(recovery.getByRole('alert')).toBeInViewport();
      await capture(page, `recovery-${mode}-restore-error-390`);
      if (!legacy) { await page.setViewportSize({ width: 1440, height: 1000 }); await capture(page, 'recovery-stage-restore-error-1440'); await page.setViewportSize({ width: 390, height: 844 }); }
      // Removing the unused repeat-dialog handler keeps the explicit retry confirmation singular.
      page.removeAllListeners('dialog'); page.once('dialog', (d) => void d.accept()); await input.setInputFiles(file);
      await expect(page).toHaveURL(legacy ? base + acceptedPath : base + '/?event=' + acceptedPath.split('/').at(-1));
      expect(requests).toHaveLength(2); expect(requests[1]).toBe(requests[0]);
      const restoredToken = legacy ? page.url().split('/').at(-1)! : new URL(page.url()).searchParams.get('event')!;
      expect(restoredToken).toBe(acceptedPath.split('/').at(-1));
      const restored = await api<LiveView>(restoredToken);
      expect(restored.eventId).not.toBe(before.eventId); expect(restored.restoredHistory).toBeTruthy();
      expect(restored.rounds.every((r) => !r.standings?.approved)).toBe(true);
      expect(restored.judgeLinks!.every((j) => !event.tokens.includes(j.path.split('/').at(-1)!))).toBe(true);
      const after = await api<LiveView>(event.organizer);
      expect(after.version).toBe(before.version); expect(after.context).toEqual(before.context); expect(after.rounds).toEqual(before.rounds); expect(after.heatSubmissions).toEqual(before.heatSubmissions);
      expect(JSON.stringify(await api<LiveView>(event.tokens[0]))).toContain('RECOVERY_TASK_PRIVATE_NOTE');
      const retained = await api<Record<string, unknown>>(event.organizer, { action: 'backup', requestId: crypto.randomUUID() });
      delete retained.exportedAt; delete backup.exportedAt; expect(retained).toEqual(backup);
    } finally { release(); await context.close(); }
  });
}

test('a different backup file after an interrupted restore gets a distinct creation identity', async ({ browser }) => {
  const event = await fixture(), context = await browser.newContext(), page = await context.newPage();
  const backup = await api<Record<string, unknown>>(event.organizer, { action: 'backup', requestId: crypto.randomUUID() });
  const requests: string[] = [], paths: string[] = [];
  await context.route('**/api/live', async (route) => {
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'restore') {
      requests.push(route.request().postDataJSON().requestId);
      const response = await route.fetch(); expect(response.status()).toBe(200); paths.push((await response.json()).path);
      if (requests.length === 1) await route.abort('failed'); else await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  try {
    const recovery = await open(page, event.path); await recovery.getByText('Restore from backup', { exact: true }).click();
    const input = recovery.getByLabel('Restore as a new shared event');
    page.once('dialog', (d) => void d.accept()); await input.setInputFiles({ name: 'first.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(recovery.getByRole('alert')).toContainText('Connection interrupted');
    const changed = structuredClone(backup); (changed.setup as { name: string }).name = 'Synthetic different recovery preparation';
    page.once('dialog', (d) => void d.accept()); await input.setInputFiles({ name: 'different.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
    await expect(page).toHaveURL(/\?event=/);
    expect(requests).toHaveLength(2); expect(requests[1]).not.toBe(requests[0]); expect(paths[1]).not.toBe(paths[0]);
    const restored = await api<LiveView>(new URL(page.url()).searchParams.get('event')!);
    expect(restored.setup.name).toBe('Synthetic different recovery preparation');
  } finally { await context.close(); }
});
