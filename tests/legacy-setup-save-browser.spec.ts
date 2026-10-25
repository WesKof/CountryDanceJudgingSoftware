import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { api, base, command, nonce, save } from './stage-helpers';
import { liveFixture } from './live-fixture';
import type { LiveView } from '../lib/live/types';

const uncertainty = 'Setup save was not confirmed. Your edits are still here.';
const confirmation = 'Apply this versioned setup correction? Current submissions and approvals will be invalidated; previous work stays in history.';
const evidenceDirectory = process.env.LEGACY_SETUP_EVIDENCE;
type Cell = { mark?: unknown; note?: unknown };
type Ballot = { cells: Record<string, Cell> };
type LegacyBackup = Record<string, unknown> & { history: { submissions: Ballot[]; roundVersions: Record<string, unknown>[] }; privateNotes: Ballot[]; ballots: Ballot[] };

async function backup(token: string) {
  const result = await api<LegacyBackup>(token, { action: 'backup', includeNotes: true, requestId: crypto.randomUUID() });
  delete result.exportedAt;
  expect(result.includesPrivateNotes).toBe(true);
  expect(result.privateNotes.some(ballot => Object.values(ballot.cells).some(cell => cell.note === 'PRIVATE_LEGACY_SAVE_RETAINED'))).toBe(true);
  expect(result.ballots.some(ballot => Object.values(ballot.cells).some(cell => cell.mark === 'No'))).toBe(true);
  expect(result.history.submissions.length).toBeGreaterThan(0);
  expect(result.history.submissions.some(submission => Object.values(submission.cells).some(cell => cell.mark === 'No'))).toBe(true);
  return result;
}
async function retainedLegacy() {
  const setup = liveFixture(2), competition = setup.competitions[0];
  setup.name = 'Synthetic retained legacy setup'; setup.competitions = [competition];
  setup.rounds = setup.rounds.filter(round => round.competitionId === competition.id);
  setup.blocks = setup.blocks.map(block => ({ ...block, roundIds: block.roundIds.filter(id => setup.rounds.some(round => round.id === id)) }));
  for (const round of setup.rounds) for (const heat of round.heats) heat.songs = heat.songs.slice(0, 2);
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: setup.name, venue: 'Synthetic legacy fixture', date: '' });
  const organizer = created.path.split('/').at(-1)!;
  await command(organizer, { action: 'setup', setup });
  let view = await api<LiveView>(organizer); expect(view.setup.workflow).toBeUndefined(); expect(view.rounds).toHaveLength(0);
  const tokens = view.judgeLinks!.map(link => link.path.split('/').at(-1)!);
  await command(organizer, { action: 'open-block', blockId: setup.blocks[0].id }); view = await api<LiveView>(organizer);
  const round = view.rounds[0], songs = round.definition.heats[0].songs;
  for (const [index, song] of songs.entries()) {
    for (const token of tokens) for (const [subjectIndex, subject] of round.definition.subjects.entries()) await save(token, round, song.id, subject.id, subjectIndex === 0 ? 'No' : 'A1', 'PRIVATE_LEGACY_SAVE_RETAINED');
    if (index < songs.length - 1) await command(organizer, { action: 'next' });
  }
  await command(organizer, { action: 'discussion' }); const judge = await api<LiveView>(tokens[0]);
  await api(tokens[0], { action: 'submit', blockId: setup.blocks[0].id, ballotVersions: Object.fromEntries(judge.ballots.map(ballot => [ballot.roundKey, ballot.version])), expectedVersion: judge.version, requestId: crypto.randomUUID() });
  return { organizer, path: created.path, view: await api<LiveView>(organizer), backup: await backup(organizer) };
}
async function openEditor(page: Page) {
  await page.getByRole('button', { name: '01 Set up', exact: true }).click();
  const drawer = page.locator('#setup-saved-details'); if (await drawer.getAttribute('open') === null) await drawer.locator(':scope > summary').click();
  const summary = page.getByText('Versioned setup correction', { exact: true }); if (await summary.locator('..').getAttribute('open') === null) await summary.click();
  return drawer;
}
async function editCorrection(page: Page, title: string) {
  await openEditor(page); await page.getByRole('checkbox', { name: 'Unlock frozen setup for an explicit correction', exact: true }).check();
  await page.getByLabel('Go to section', { exact: true }).selectOption('Round setup');
  const songs = page.locator('details[data-section="Heats, songs & partner rotations"]'); if (await songs.getAttribute('open') === null) await songs.locator(':scope > summary').click();
  await songs.getByLabel('title', { exact: true }).first().fill(title);
  return songs;
}
function acceptCorrection(page: Page) { page.once('dialog', async dialog => { expect(dialog.message()).toBe(confirmation); await dialog.accept(); }); }
async function evidence(page: Page, name: string, details: Record<string, unknown>) {
  if (!evidenceDirectory) return;
  mkdirSync(evidenceDirectory, { recursive: true }); writeFileSync(join(evidenceDirectory, name + '.json'), JSON.stringify(details, null, 2));
  await page.screenshot({ path: join(evidenceDirectory, name + '.png'), fullPage: true });
}
async function immediateFeedback(page: Page, name: string) {
  const notice = page.locator('#legacy-setup-save-error'), control = page.getByRole('button', { name: 'Save setup', exact: true });
  const bounds = await notice.boundingBox(), controlBounds = await control.boundingBox(), viewport = page.viewportSize()!;
  const inside = (box: typeof bounds) => Boolean(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
  const contained = await notice.evaluate(element => {
    const box = element.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(element);
    const contains = (parent: DOMRect, child: DOMRect) => child.left >= parent.left - 1 && child.right <= parent.right + 1 && child.top >= parent.top - 1 && child.bottom <= parent.bottom + 1;
    return { textWithinStatus: [...range.getClientRects()].every(rect => contains(box, rect)), withinControls: contains(element.closest('.setup-save-controls')!.getBoundingClientRect(), box), withinToolbar: contains(element.closest('.setup-toolbar')!.getBoundingClientRect(), box) };
  });
  if (evidenceDirectory) {
    mkdirSync(evidenceDirectory, { recursive: true }); writeFileSync(join(evidenceDirectory, name + '.json'), JSON.stringify({ bounds, controlBounds, viewport, noticeInViewport: inside(bounds), controlInViewport: inside(controlBounds), ...contained, scrollY: await page.evaluate(() => scrollY) }, null, 2));
    await page.screenshot({ path: join(evidenceDirectory, name + '.png'), fullPage: false });
  }
  expect(inside(bounds)).toBe(true); expect(inside(controlBounds)).toBe(true);
  expect(contained).toEqual({ textWithinStatus: true, withinControls: true, withinToolbar: true });
  await expect(control).toHaveAccessibleDescription((await notice.innerText()).trim());
}

for (const width of [390, 1440]) {
  test(`legacy unconfirmed corrections retain reason, unlock and private history at ${width}`, async ({ browser }) => {
    const fixture = await retainedLegacy(), context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
    const replies = [{ status: 200, json: {} }, { status: 200, json: { ok: false } }, { status: 200, json: { ok: 'true' } }, { status: 200, json: { ok: 1 } }, { status: 503, json: { error: 'Synthetic legacy save unavailable' } }, { status: 0, json: {} }];
    let reply = replies[0], posts = 0, hold = false, release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/live', async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'setup') {
        posts++; const input = route.request().postDataJSON(); expect(input.correction).toBe(true); expect(input.reason).toBe('Retained correction reason ' + width); expect(input.automaticStages).toBeUndefined();
        if (hold) await held;
        if (reply.status === 0) await route.abort('failed'); else await route.fulfill(reply);
      } else await route.continue();
    });
    try {
      await page.goto(base + fixture.path); const title = 'Unsaved legacy song correction ' + width, songs = await editCorrection(page, title);
      await expect(page.locator('#legacy-setup-save-error')).toHaveCount(0);
      await page.getByRole('button', { name: 'Save setup', exact: true }).click(); expect(posts).toBe(0);
      await page.getByLabel('Correction reason', { exact: true }).fill('Retained correction reason ' + width);
      page.once('dialog', async dialog => { expect(dialog.message()).toBe(confirmation); await dialog.dismiss(); }); await page.getByRole('button', { name: 'Save setup', exact: true }).click(); expect(posts).toBe(0);
      for (const [index, payload] of replies.entries()) {
        reply = payload; acceptCorrection(page); await page.getByRole('button', { name: 'Save setup', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeEnabled();
        await expect(page.locator('#legacy-setup-save-error')).toContainText(payload.status === 503 ? 'Synthetic legacy save unavailable' : payload.status === 0 ? 'Connection interrupted' : uncertainty);
        await expect(songs.getByLabel('title', { exact: true }).first()).toHaveValue(title);
        await expect(page.getByRole('checkbox', { name: 'Unlock frozen setup for an explicit correction', exact: true })).toBeChecked();
        await expect(page.getByLabel('Correction reason', { exact: true })).toHaveValue('Retained correction reason ' + width);
        await expect(page.locator('#setup-saved-details')).toHaveAttribute('open'); await expect(songs).toHaveAttribute('open');
        await expect(page.getByText('Setup saved to the shared event.', { exact: true })).toHaveCount(0);
        if (index === 0 || payload.status !== 200) await immediateFeedback(page, `feedback-${width}-${index}`);
      }
      const beforeCancel = posts;
      page.once('dialog', dialog => void dialog.dismiss()); await page.getByRole('button', { name: 'Save setup', exact: true }).click();
      expect(posts).toBe(beforeCancel); await expect(page.locator('#legacy-setup-save-error')).toContainText('Connection interrupted');
      reply = replies[0]; hold = true; acceptCorrection(page); await page.getByRole('button', { name: 'Save setup', exact: true }).click();
      await expect.poll(() => posts).toBe(replies.length + 1); await expect(page.locator('#legacy-setup-save-error')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
      release(); await expect(page.locator('#legacy-setup-save-error')).toHaveText(uncertainty); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '02 Score', exact: true }).click(); await page.getByRole('button', { name: 'Go to Set up', exact: true }).click();
      await expect(page.locator('#legacy-setup-save-error')).toHaveText(uncertainty); await expect(songs.getByLabel('title', { exact: true }).first()).toHaveValue(title);
      expect(await api<LiveView>(fixture.organizer)).toEqual(fixture.view); expect(await backup(fixture.organizer)).toEqual(fixture.backup);
      await evidence(page, 'retained-' + width, { malformedHttpTransportCases: replies.length, missingReasonAndCancelNoPost: true, correctionIntentReasonDraftAndReviewRetained: true, noFalseSuccessOrAutomaticRetry: true, privateBackupAndSavedViewExact: true });
      page.once('dialog', dialog => void dialog.accept()); await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
      await openEditor(page); await expect(page.locator('#legacy-setup-save-error')).toHaveCount(0);
      await expect(page.getByRole('checkbox', { name: 'Unlock frozen setup for an explicit correction', exact: true })).toBeChecked(); await expect(page.getByLabel('Correction reason', { exact: true })).toHaveValue('Retained correction reason ' + width);
      expect(await api<LiveView>(fixture.organizer)).toEqual(fixture.view);
    } finally { release(); await context.close(); }
  });

  test(`legacy accepted correction with a missing reply retains intent and rejects stale retry at ${width}`, async ({ browser }) => {
    const fixture = await retainedLegacy(), context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage(); let posts = 0;
    await page.route('**/api/live', async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'setup') { posts++; const response = await route.fetch(); expect(response.status()).toBe(posts === 1 ? 200 : 409); if (posts === 1) await route.fulfill({ status: 200, json: {} }); else await route.fulfill({ response }); }
      else await route.continue();
    });
    try {
      await page.goto(base + fixture.path); const title = 'Accepted legacy correction ' + width, reason = 'Accepted but unconfirmed reason ' + width, songs = await editCorrection(page, title);
      await page.getByLabel('Correction reason', { exact: true }).fill(reason); acceptCorrection(page); await page.getByRole('button', { name: 'Save setup', exact: true }).click();
      await expect(page.locator('#legacy-setup-save-error')).toHaveText(uncertainty); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeEnabled();
      await expect(page.getByRole('checkbox', { name: 'Unlock frozen setup for an explicit correction', exact: true })).toBeChecked(); await expect(page.getByLabel('Correction reason', { exact: true })).toHaveValue(reason); await expect(songs.getByLabel('title', { exact: true }).first()).toHaveValue(title);
      const accepted = await api<LiveView>(fixture.organizer), acceptedBackup = await backup(fixture.organizer);
      expect(accepted.version).toBeGreaterThan(fixture.view.version); expect(accepted.setup.rounds[0].heats[0].songs[0].title).toBe(title); expect(accepted.rounds.every(round => round.phase === 'setup')).toBe(true); expect(accepted.context.performanceId).toBeNull();
      expect(acceptedBackup.history.submissions).toEqual(fixture.backup.history.submissions); expect(acceptedBackup.privateNotes).toEqual(fixture.backup.privateNotes); expect(acceptedBackup.ballots).toEqual(fixture.backup.ballots);
      const refreshed = page.waitForResponse(response => response.url().endsWith('/api/live') && response.request().method() === 'GET'); await page.evaluate(() => window.dispatchEvent(new Event('online'))); await (await refreshed).finished(); expect(posts).toBe(1);
      acceptCorrection(page); await page.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect.poll(() => posts).toBe(2); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeEnabled();
      await expect(page.locator('#legacy-setup-save-error')).not.toBeEmpty(); await expect(page.getByLabel('Correction reason', { exact: true })).toHaveValue(reason); await expect(songs.getByLabel('title', { exact: true }).first()).toHaveValue(title);
      expect(await api<LiveView>(fixture.organizer)).toEqual(accepted); expect(await backup(fixture.organizer)).toEqual(acceptedBackup);
      await evidence(page, 'accepted-unconfirmed-' + width, { acceptedServerCorrectionVerified: true, clientDraftReasonAndIntentRetained: true, oldSnapshotsNotesExact: true, noAutomaticRetry: true, deliberateStaleRetry409: true });
      page.once('dialog', dialog => void dialog.accept()); await page.getByRole('button', { name: 'Discard edits', exact: true }).click(); await openEditor(page);
      await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toHaveCount(0); await expect(page.locator('#legacy-setup-save-error')).toHaveCount(0); await expect(page.getByRole('checkbox', { name: 'Unlock frozen setup for an explicit correction', exact: true })).toBeChecked(); await expect(page.getByLabel('Correction reason', { exact: true })).toHaveValue(reason);
      await page.getByLabel('Go to section', { exact: true }).selectOption('Round setup'); if (await songs.getAttribute('open') === null) await songs.locator(':scope > summary').click(); await expect(songs.getByLabel('title', { exact: true }).first()).toHaveValue(title);
    } finally { await context.close(); }
  });

  test(`legacy confirmed correction retains history and manual controls and clears stale success at ${width}`, async ({ browser }) => {
    const fixture = await retainedLegacy(), context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage(); let posts = 0;
    page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/live') && request.postDataJSON()?.action === 'setup') { posts++; expect(request.postDataJSON().automaticStages).toBeUndefined(); } });
    try {
      await page.goto(base + fixture.path); const title = 'Confirmed legacy correction ' + width, reason = 'Recorded explicit legacy reason ' + width; await editCorrection(page, title); await page.getByLabel('Correction reason', { exact: true }).fill(reason); acceptCorrection(page);
      const response = page.waitForResponse(response => response.url().endsWith('/api/live') && response.request().postDataJSON()?.action === 'setup'); await page.getByRole('button', { name: 'Save setup', exact: true }).click(); expect(await (await response).json()).toEqual({ ok: true });
      await expect(page.getByText('Setup saved to the shared event.', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toHaveCount(0); await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');
      const saved = await api<LiveView>(fixture.organizer), savedBackup = await backup(fixture.organizer); expect(saved.setup.workflow).toBeUndefined(); expect(saved.setup.rounds[0].heats[0].songs[0].title).toBe(title); expect(saved.context.performanceId).toBeNull(); expect(saved.context.blockId).toBeNull(); expect(saved.rounds.every(round => round.phase === 'setup')).toBe(true);
      expect(savedBackup.history.submissions).toEqual(fixture.backup.history.submissions); expect(savedBackup.privateNotes).toEqual(fixture.backup.privateNotes); expect(savedBackup.ballots).toEqual(fixture.backup.ballots); expect(savedBackup.history.roundVersions).toEqual(expect.arrayContaining(fixture.backup.history.roundVersions)); expect(savedBackup.history.roundVersions.some(row => row.reason === reason)).toBe(true); expect(posts).toBe(1);
      await openEditor(page); await expect(page.getByRole('checkbox', { name: 'Unlock frozen setup for an explicit correction', exact: true })).not.toBeChecked(); await expect(page.getByLabel('Correction reason', { exact: true })).toHaveValue('');
      await page.getByRole('button', { name: '02 Score', exact: true }).click(); await expect(page.getByRole('button', { name: 'Start prelims judging', exact: true })).toBeEnabled(); expect((await api<LiveView>(fixture.organizer)).rounds.every(round => round.phase === 'setup')).toBe(true);
      await evidence(page, 'confirmed-manual-' + width, { typedTrueClearsDraftReasonUnlock: true, explicitReasonAppended: true, priorMarksNotesSubmissionsAndVersionsRetained: true, manualStartStillRequired: true });
      await openEditor(page); await page.getByLabel('Go to section', { exact: true }).selectOption('Event details'); await page.getByLabel('Venue', { exact: true }).fill('Unconfirmed non-correction legacy venue');
      await page.route('**/api/live', async route => { if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'setup') { expect(route.request().postDataJSON().correction).toBe(false); await route.fulfill({ status: 200, json: {} }); } else await route.continue(); });
      await page.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect(page.locator('#legacy-setup-save-error')).toHaveText(uncertainty); await expect(page.getByText('Setup saved to the shared event.', { exact: true })).toHaveCount(0); await expect(page.getByLabel('Venue', { exact: true })).toHaveValue('Unconfirmed non-correction legacy venue'); expect(await api<LiveView>(fixture.organizer)).toEqual(saved);
    } finally { await context.close(); }
  });
}
