import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { api, base, command, nonce, save } from './stage-helpers';
import { exact, limitedStage } from './publication-helpers';
import { sampleSetup } from '../lib/sample-setup';
import type { LiveSetup, LiveView } from '../lib/live/types';

const uncertainty = 'Setup save was not confirmed. Your edits are still here.';
const evidenceDirectory = process.env.SETUP_ACK_EVIDENCE;
async function evidence(page: Page, name: string, details: Record<string, unknown>) {
  if (!evidenceDirectory) return;
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(join(evidenceDirectory, name + '.json'), JSON.stringify(details, null, 2));
  await page.screenshot({ path: join(evidenceDirectory, name + '.png'), fullPage: true });
}
async function recoveryPresentation(page: Page, saveName: string, name: string) {
  const notice = page.getByText(uncertainty, { exact: true }), control = page.getByRole('button', { name: saveName, exact: true });
  const noticeBounds = await notice.boundingBox(), controlBounds = await control.boundingBox(), viewport = page.viewportSize()!;
  const inViewport = (bounds: typeof noticeBounds) => Boolean(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
  if (evidenceDirectory) {
    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(join(evidenceDirectory, name + '.json'), JSON.stringify({ noticeBounds, controlBounds, viewport, noticeFullyInViewport: inViewport(noticeBounds), controlFullyInViewport: inViewport(controlBounds), scrollY: await page.evaluate(() => scrollY), activeTag: await page.evaluate(() => document.activeElement?.tagName) }, null, 2));
    await page.screenshot({ path: join(evidenceDirectory, name + '.png'), fullPage: false });
  }
  expect(inViewport(noticeBounds), 'Save failure text must be in the current viewport').toBe(true);
  expect(inViewport(controlBounds), 'The associated save action must stay in the current viewport').toBe(true);
  await expect(control).toHaveAccessibleDescription(new RegExp(uncertainty.replaceAll('.', '\\.')));
}
async function event(setup = limitedStage(1, 4)) {
  setup.name = 'Synthetic setup acknowledgement';
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: setup.name, venue: '', date: '' });
  const organizer = created.path.split('/').at(-1)!;
  await command(organizer, { action: 'setup', setup, automaticStages: true });
  const view = await api<LiveView>(organizer);
  return { organizer, path: created.path, view, tokens: view.judgeLinks!.map(link => link.path.split('/').at(-1)!) };
}
async function submitStage(token: string) {
  const own = await api<LiveView>(token);
  await api(token, { action: 'submit-stage', blockId: own.context.blockId, acknowledged: true, expectedVersion: own.version, requestId: crypto.randomUUID(), ballotVersions: Object.fromEntries(own.ballots.map(ballot => [ballot.roundKey, ballot.version])), roundVersions: Object.fromEntries(own.rounds.map(round => [round.key, round.version])) });
}
async function retainedEvent() {
  const fixture = await event(), round = fixture.view.rounds[0];
  for (const subject of round.definition.subjects) await save(fixture.tokens[0], round, round.definition.heats[0].songs[0].id, subject.id, 'No', 'PRIVATE_SETUP_ACK_RETAINED');
  await submitStage(fixture.tokens[0]);
  return fixture;
}
async function backup(token: string) {
  const result = await api<Record<string, unknown>>(token, { action: 'backup', includeNotes: true, requestId: crypto.randomUUID() });
  delete result.exportedAt;
  type Cell = { mark?: unknown; note?: unknown };
  type Ballot = { cells: Record<string, Cell> };
  expect(result.includesPrivateNotes).toBe(true);
  const notes = result.privateNotes as Ballot[], ballots = result.ballots as Ballot[], history = result.history as { heatSubmissions: Ballot[] };
  expect(notes.some(ballot => Object.values(ballot.cells).some(cell => typeof cell.note === 'string' && cell.note.startsWith('PRIVATE_')))).toBe(true);
  expect(ballots.some(ballot => Object.values(ballot.cells).some(cell => cell.mark === 'No'))).toBe(true);
  expect(history.heatSubmissions.length).toBeGreaterThan(0);
  expect(history.heatSubmissions.some(submission => Object.values(submission.cells).some(cell => cell.mark === 'No'))).toBe(true);
  return result;
}
async function editVenue(page: Page, venue: string) {
  await page.getByRole('button', { name: '01 Set up', exact: true }).click();
  const drawer = page.locator('#setup-saved-details');
  if (await drawer.getAttribute('open') === null) await drawer.locator(':scope > summary').click();
  await page.getByLabel('Go to section', { exact: true }).selectOption('Event details');
  await page.getByLabel('Venue', { exact: true }).fill(venue);
  await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeEnabled();
}

for (const width of [390, 1440]) {
  test(`unconfirmed setup responses retain edits and review context at ${width}`, async ({ browser }) => {
    const fixture = await retainedEvent(), original = await api<LiveView>(fixture.organizer), originalBackup = await backup(fixture.organizer);
    const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
    const responses = [{}, { ok: false }, { ok: 'true' }, { ok: 1 }, { error: 'Unconfirmed synthetic response' }];
    let response: object = {}, intercepted = 0;
    await page.route('**/api/live', async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'setup') { intercepted++; await route.fulfill({ status: 200, json: response }); }
      else await route.continue();
    });
    try {
      await page.goto(base + fixture.path);
      const draft = 'Retained unsaved venue ' + width;
      await editVenue(page, draft);
      const round = page.getByLabel('Select round to configure', { exact: true }), selectedRound = await round.inputValue();
      for (const payload of responses) {
        response = payload;
        await page.getByRole('button', { name: 'Save setup', exact: true }).click();
        await expect(page.getByText(uncertainty, { exact: true })).toBeVisible();
        if (payload === responses[0]) await recoveryPresentation(page, 'Save setup', 'setup-immediate-feedback-' + width);
        await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Discard edits', exact: true })).toBeVisible();
        await expect(page.locator('#setup-saved-details')).toHaveAttribute('open');
        await expect(page.locator('details[data-section="Event details"]')).toHaveAttribute('open');
        await expect(page.getByLabel('Venue', { exact: true })).toHaveValue(draft);
        await expect(round).toHaveValue(selectedRound);
        await expect(page.getByText('Setup saved to the shared event.', { exact: true })).toHaveCount(0);
      }
      expect(intercepted).toBe(responses.length);
      await page.getByRole('button', { name: '02 Score', exact: true }).click();
      await expect(page.locator('.score-blocker')).toContainText('Save setup');
      await page.getByRole('button', { name: 'Go to Set up', exact: true }).click();
      await expect(page.getByLabel('Venue', { exact: true })).toHaveValue(draft);
      expect(await api<LiveView>(fixture.organizer)).toEqual(original);
      expect(await backup(fixture.organizer)).toEqual(originalBackup);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await evidence(page, 'malformed-' + width, { responseCases: responses.length, intercepted, draftAndReviewRetained: true, successAbsent: true, savedViewAndPrivateBackupExact: true, noAutomaticRetry: true });
      page.once('dialog', dialog => void dialog.accept()); await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
      await editVenue(page, 'A new draft after explicit discard');
      await expect(page.getByText(uncertainty, { exact: true })).toHaveCount(0);
      expect(await api<LiveView>(fixture.organizer)).toEqual(original);
    } finally { await context.close(); }
  });

  test(`an accepted setup with an unconfirmed reply retains draft and version recovery at ${width}`, async ({ browser }) => {
    const fixture = await retainedEvent(), original = await api<LiveView>(fixture.organizer), originalBackup = await backup(fixture.organizer);
    const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
    let posts = 0;
    await page.route('**/api/live', async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'setup') {
        posts++; const response = await route.fetch();
        if (posts === 1) { expect(response.status()).toBe(200); await route.fulfill({ status: 200, json: {} }); }
        else { expect(response.status()).toBe(409); await route.fulfill({ response }); }
      } else await route.continue();
    });
    try {
      await page.goto(base + fixture.path); const draft = 'Actually saved but unconfirmed ' + width;
      await editVenue(page, draft); await page.getByRole('button', { name: 'Save setup', exact: true }).click();
      await expect(page.getByText(uncertainty, { exact: true })).toBeVisible();
      await expect(page.getByText(/Event changed; discard and review the saved version/)).toBeVisible();
      await expect(page.getByLabel('Venue', { exact: true })).toHaveValue(draft);
      await expect(page.getByRole('button', { name: 'Discard edits', exact: true })).toBeVisible();
      await expect(page.getByText('Setup saved to the shared event.', { exact: true })).toHaveCount(0);
      const accepted = await api<LiveView>(fixture.organizer);
      expect(accepted.setup.venue).toBe(draft); expect(accepted.version).toBeGreaterThan(original.version);
      const acceptedBackup = await backup(fixture.organizer);
      for (const key of ['ballots', 'privateNotes', 'history', 'context', 'status']) expect(acceptedBackup[key]).toEqual(originalBackup[key]);
      await page.getByRole('button', { name: '02 Score', exact: true }).click(); await page.getByRole('button', { name: 'Go to Set up', exact: true }).click();
      expect(posts).toBe(1); // Refresh/navigation never resubmits an uncertain write.
      await page.getByRole('button', { name: 'Save setup', exact: true }).click();
      await expect.poll(() => posts).toBe(2); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeEnabled();
      await expect(page.getByLabel('Venue', { exact: true })).toHaveValue(draft);
      expect(await api<LiveView>(fixture.organizer)).toEqual(accepted);
      await evidence(page, 'accepted-unconfirmed-' + width, { acceptedWriteVerified: true, retainedDraft: true, existingVersionRecovery: true, noAutomaticRetry: true, deliberateStaleRetryRejected: true, savedScoresNotesSubmissionsHistoryExact: true });
      page.once('dialog', dialog => void dialog.accept()); await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toHaveCount(0);
      expect((await api<LiveView>(fixture.organizer)).setup.venue).toBe(draft);
      await evidence(page, 'accepted-reviewed-' + width, { explicitDiscardReviewsAcceptedSetup: true, acceptedServerVenueRetained: true });
    } finally { await context.close(); }
  });

  test(`a confirmed preparation save clears its draft and opens automatic Prelims at ${width}`, async ({ browser }) => {
    const setup = limitedStage(1, 4), pre = setup.rounds[0], unassigned = pre.heats[0].subjectIds.shift()!;
    const fixture = await event(setup); expect(fixture.view.rounds).toHaveLength(0);
    const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
    let posts = 0, acceptedSetup: LiveSetup | undefined;
    page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/live') && request.postDataJSON()?.action === 'setup') { posts++; acceptedSetup = request.postDataJSON().setup; } });
    try {
      await page.goto(base + fixture.path); await page.getByRole('button', { name: 'Open this step', exact: true }).focus(); await page.keyboard.press('Enter');
      const assignments = page.locator('details[data-section="Heat assignments"]');
      await expect(assignments.locator(':scope > summary')).toBeFocused();
      await page.getByLabel('Heat for bib ' + pre.subjects.find(subject => subject.id === unassigned)!.number, { exact: true }).selectOption(pre.heats[0].id);
      await expect(page.locator('.setup-freeze-note')).toContainText('opens scoring automatically');
      const response = page.waitForResponse(response => response.url().endsWith('/api/live') && response.request().postDataJSON()?.action === 'setup');
      await page.getByRole('button', { name: 'Save setup', exact: true }).click(); expect(await (await response).json()).toEqual({ ok: true });
      await expect(page.getByText('Setup saved to the shared event.', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toHaveCount(0); await expect(page.locator('#setup-saved-details')).not.toHaveAttribute('open');
      await expect(page.locator('.setup-hero')).toContainText('Prelims is ready for judges');
      const saved = await api<LiveView>(fixture.organizer); expect(saved.setup).toEqual(acceptedSetup); expect(saved.context.automaticStages).toBe(true); expect(saved.context.stageSubmission).toBe(true); expect(saved.rounds[0].phase).toBe('dancing'); expect(posts).toBe(1);
      await page.getByRole('button', { name: 'Open judging desk', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.score-current')).toContainText('Judging in progress');
      await evidence(page, 'confirmed-' + width, { exactAcknowledgedSetup: true, draftCleared: true, automaticPrelimsOpen: true, stageSubmissionPreserved: true, keyboardTaskRoutePreserved: true });
      await editVenue(page, 'Unconfirmed draft after a successful save');
      await page.route('**/api/live', async route => { if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'setup') await route.fulfill({ status: 200, json: {} }); else await route.continue(); });
      await page.getByRole('button', { name: 'Save setup', exact: true }).click();
      await expect(page.getByText(uncertainty, { exact: true })).toBeVisible(); await expect(page.getByText('Setup saved to the shared event.', { exact: true })).toHaveCount(0);
      expect(await api<LiveView>(fixture.organizer)).toEqual(saved);
      await evidence(page, 'prior-success-cleared-' + width, { previousSuccessNoticeCleared: true, laterUnconfirmedDraftRetained: true, savedServerViewExact: true });
    } finally { await context.close(); }
  });

  test(`unconfirmed Finals pairing save retains the actual draw and later confirmed save opens Finals at ${width}`, async ({ browser }) => {
    const setup = sampleSetup(), competition = setup.competitions.find(competition => competition.format === 'Jack & Jill')!;
    setup.competitions = [competition]; setup.rounds = setup.rounds.filter(round => round.competitionId === competition.id); setup.blocks = setup.blocks.map(block => ({ ...block, roundIds: block.roundIds.filter(id => setup.rounds.some(round => round.id === id)) }));
    const fixture = await event(setup), round = fixture.view.rounds[0], seen = new Set<string>();
    const advancing = new Set(round.definition.subjects.filter(subject => { if (seen.has(subject.role!)) return false; seen.add(subject.role!); return true; }).map(subject => subject.id));
    for (const token of fixture.tokens) {
      for (const subject of round.definition.subjects) await save(token, round, round.definition.heats[0].songs[0].id, subject.id, advancing.has(subject.id) ? 'Yes' : 'No', 'PRIVATE_FINALS_ACK_RETAINED');
      await submitStage(token);
    }
    await exact(fixture.tokens[2], round.id, 'approve');
    const original = await api<LiveView>(fixture.organizer), originalBackup = await backup(fixture.organizer), final = original.setup.rounds.find(round => round.kind === 'finals')!;
    expect(original.rounds.some(round => round.definition.kind === 'finals')).toBe(false);
    const lead = original.setup.rounds[0].subjects.find(subject => final.finalistIds.includes(subject.id) && subject.role === 'Lead')!, follow = original.setup.rounds[0].subjects.find(subject => final.finalistIds.includes(subject.id) && subject.role === 'Follow')!;
    const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage(); let malformed = true, posts = 0;
    await page.route('**/api/live', async route => { if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'setup') { posts++; if (malformed) await route.fulfill({ status: 200, json: {} }); else await route.continue(); } else await route.continue(); });
    try {
      await page.goto(base + fixture.path); await page.getByRole('button', { name: '02 Score', exact: true }).click();
      const draw = page.locator('#pending-finals-draw'), select = draw.getByLabel(`#${lead.number} ${lead.primary} pairs with`, { exact: true });
      await select.selectOption(follow.id); await expect(draw.getByText('Unsaved pairing edits · Save applies every division’s draw together.', { exact: true })).toBeVisible(); await draw.getByRole('button', { name: 'Save Finals pairings', exact: true }).click();
      await expect(page.getByText(uncertainty, { exact: true })).toBeVisible(); await recoveryPresentation(page, 'Save Finals pairings', 'pairing-immediate-feedback-' + width); await expect(select).toHaveValue(follow.id);
      await expect(draw.getByRole('button', { name: 'Discard pairing edits', exact: true })).toBeVisible(); await expect(draw.getByRole('button', { name: 'Save Finals pairings', exact: true })).toBeEnabled(); await expect(draw.locator('details.form-panel').first()).toHaveAttribute('open');
      expect(await api<LiveView>(fixture.organizer)).toEqual(original); expect(await backup(fixture.organizer)).toEqual(originalBackup); expect(posts).toBe(1);
      await evidence(page, 'pairing-unconfirmed-' + width, { pairingDraftAndSelectionRetained: true, drawOpen: true, serverAndPrivateBackupExact: true, noFinalsOpened: true });
      await draw.getByRole('button', { name: 'Discard pairing edits', exact: true }).click();
      await expect(page.getByText(uncertainty, { exact: true })).toHaveCount(0); await expect(select).toHaveValue('');
      await select.selectOption(follow.id); await expect(page.getByText(uncertainty, { exact: true })).toHaveCount(0);
      malformed = false; await draw.getByRole('button', { name: 'Save Finals pairings', exact: true }).click();
      await expect(page.getByText('Finals pairings saved. Scoring opens automatically when every division is ready.', { exact: true })).toBeVisible(); await expect(page.locator('.score-current')).toContainText('Judging in progress'); await expect(page.locator('#pending-finals-draw')).toHaveCount(0);
      const saved = await api<LiveView>(fixture.organizer), savedFinal = saved.rounds.find(round => round.definition.kind === 'finals')!;
      expect(savedFinal.phase).toBe('dancing'); expect(savedFinal.definition.subjects[0].members).toEqual([lead.id, follow.id]); expect(savedFinal.definition.subjects).toHaveLength(1); expect(posts).toBe(2);
      const savedBackup = await backup(fixture.organizer), originalHistory = originalBackup.history as Record<string, unknown[]>, savedHistory = savedBackup.history as Record<string, unknown[]>;
      for (const key of Object.keys(originalHistory)) {
        if (key === 'roundVersions') expect(savedHistory[key]).toEqual(expect.arrayContaining(originalHistory[key]));
        else expect(savedHistory[key]).toEqual(originalHistory[key]);
      }
      expect(saved.rounds.find(item => item.id === round.id)).toEqual(original.rounds.find(item => item.id === round.id));
      await evidence(page, 'pairing-confirmed-' + width, { actualPairMembersPreserved: true, automaticFinalsOpened: true, preFinalsSubmissionsApprovalsHistoryExact: true, noReplacementPolicy: true });
    } finally { await context.close(); }
  });
}
