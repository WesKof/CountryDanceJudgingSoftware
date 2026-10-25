import { test, expect } from '@playwright/test';
import { api, base, command } from './stage-helpers';
import { createStage, limitedStage, dance } from './publication-helpers';
import { openResultManagement } from './setup-browser-helpers';
import type { LiveView } from '../lib/live/types';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

async function navigationFixture() {
  const retained = process.env.CORRECTION_NAV_RETAINED_FIXTURE;
  if (retained) return JSON.parse(readFileSync(retained, 'utf8')) as { event: Awaited<ReturnType<typeof createStage>>; A: string; B: string; head: string };
  const event = await createStage(limitedStage(2, 4)); await command(event.organizer, { action: 'open-stage', kind: 'prelims' });
  const view = await api<LiveView>(event.organizer);
  for (const [index, round] of view.rounds.entries()) { await dance(event.organizer, event.tokens, round); if (index < view.rounds.length - 1) await command(event.organizer, { action: 'next' }); }
  await command(event.organizer, { action: 'conclude-stage' });
  const saved = await api<LiveView>(event.organizer); if (saved.context.automaticStages === undefined) await command(event.organizer, { action: 'enable-auto-stages' });
  return { event, A: view.rounds[0].id, B: view.rounds[1].id, head: event.tokens[2] };
}

async function chooseResultsRound(page: Page, id: string) {
  const select = page.getByLabel('Competition and round view', { exact: true });
  const values = await select.locator('option:not([disabled])').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  const index = values.indexOf(id); expect(index).toBeGreaterThanOrEqual(0);
  await select.focus(); await page.keyboard.press('Home'); for (let n = 0; n < index; n++) await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await expect(select).toHaveValue(id);
}

for (const width of [390, 738]) test(`one exact correction draft survives Results navigation and explicit recovery at ${width}`, async ({ browser }) => {
  const { event, A, B } = await navigationFixture(), view = await api<LiveView>(event.organizer), original = view.rounds.find(round => round.id === A)!;
  const source = view.heatSubmissions!.filter(submission => submission.roundKey === original.key).at(-1)!;
  const context = await browser.newContext({ viewport: { width, height: 589 } }), page = await context.newPage();
  const requests: Record<string, unknown>[] = [], errors: string[] = []; let availability: 'normal' | 'missing' | 'archived' = 'normal', mode: 'block' | 'delay' | 'failure' | 'real' = 'block';
  let release: (() => void) | undefined;
  await context.route('**/*', async route => {
    const request = route.request(); if (new URL(request.url()).origin !== base) return route.abort('blockedbyclient');
    if (request.method() === 'GET') {
      if (request.url().includes('/api/live') && availability !== 'normal') {
        const response = await route.fetch(), projected = await response.json() as LiveView;
        if (availability === 'missing') projected.rounds = projected.rounds.filter(round => round.key !== original.key); else projected.status = 'archived';
        return route.fulfill({ response, json: projected });
      }
      return route.continue();
    }
    const input = request.postDataJSON() as Record<string, unknown>; requests.push(input);
    if (input.action !== 'request-correction' || mode === 'block') return route.abort('blockedbyclient');
    if (mode === 'delay') { await new Promise<void>(resolve => { release = resolve; }); return route.fulfill({ status: 200, json: {} }); }
    if (mode === 'failure') return route.fulfill({ status: 503, json: { error: 'Fictional unconfirmed correction request' } });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  const panel = page.getByRole('region', { name: 'New correction draft', exact: true });
  const labels = ['Submitted heat / judge', 'Correction song', 'Wrong or affected bib', 'Corrected mark for affected bib', 'Intended bib for mistaken-bib transfer (optional)', 'Correction reason'];
  const fields = async () => Object.fromEntries(await Promise.all(labels.map(async label => [label, await panel.getByLabel(label, { exact: true }).inputValue()])));
  async function openForm() { const summary = panel.locator('details > summary').filter({ hasText: 'Request a score correction' }).first(); if (await summary.evaluate(element => !(element.parentElement as HTMLDetailsElement).open)) await summary.click(); }
  async function fillDraft() {
    await openForm(); await panel.getByLabel(labels[0], { exact: true }).selectOption(source.id);
    await panel.getByLabel(labels[1], { exact: true }).selectOption(original.definition.heats[0].songs[1].id);
    await panel.getByLabel(labels[2], { exact: true }).selectOption(original.definition.subjects[1].id);
    await panel.getByLabel(labels[3], { exact: true }).selectOption('A2');
    const transfer = panel.locator('details > summary').filter({ hasText: 'Mark entered against the wrong bib' }); if (await transfer.evaluate(element => !(element.parentElement as HTMLDetailsElement).open)) await transfer.click();
    await panel.getByLabel(labels[4], { exact: true }).selectOption(original.definition.subjects[2].id);
    await panel.getByLabel(labels[5], { exact: true }).fill('Retained fictional correction intent ' + width);
  }
  const evidence = process.env.CORRECTION_NAV_EVIDENCE;
  async function capture(label: string) {
    const measured = await page.evaluate(() => {
      const hidden = (node: Element) => { for (let e: Element | null = node; e; e = e.parentElement) { const style = getComputedStyle(e); if (style.display === 'none' || style.visibility === 'hidden') return true; if (e instanceof HTMLDetailsElement && !e.open && !e.querySelector(':scope > summary')?.contains(node)) return true; } return false; };
      const clips: string[] = [], walk = document.createTreeWalker(document.querySelector('[aria-label="New correction draft"]')!, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) { const node = walk.currentNode, element = node.parentElement; if (!element || !node.textContent?.trim() || hidden(element)) continue; const range = document.createRange(); range.selectNodeContents(node); for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) { const style = getComputedStyle(ancestor); if (!/hidden|clip/.test(style.overflowX + style.overflowY)) continue; const box = ancestor.getBoundingClientRect(); if ([...range.getClientRects()].some(rect => rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) { clips.push(node.textContent.trim().slice(0, 60)); break; } } }
      const active = document.activeElement!, box = active.getBoundingClientRect(), painted = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
      return { pageFits: document.documentElement.scrollWidth <= innerWidth, clips, focusedText: active.textContent?.trim().slice(0, 80), focusExposed: active === document.body || active === painted || active.contains(painted) };
    });
    expect(measured.pageFits).toBe(true); expect(measured.clips).toEqual([]); expect(measured.focusExposed).toBe(true);
    if (evidence) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/${label}-${width}.png` }); writeFileSync(`${evidence}/${label}-${width}.json`, JSON.stringify(measured)); }
  }
  try {
    await page.goto(base + event.path); await openResultManagement(page); await chooseResultsRound(page, A); await fillDraft(); const filled = await fields();
    await chooseResultsRound(page, B); await expect(panel.getByRole('heading')).toContainText(original.definition.division); expect(await fields()).toEqual(filled); await chooseResultsRound(page, A); expect(await fields()).toEqual(filled); await capture('retained');
    const noStandings = view.setup.rounds.find(round => round.kind === 'finals')!; await chooseResultsRound(page, noStandings.id); expect(await fields()).toEqual(filled); await expect(panel.getByRole('heading')).toContainText(original.definition.division);
    await chooseResultsRound(page, B); await panel.getByRole('button', { name: 'Discard draft and use selected round', exact: true }).click(); await openForm(); await expect(panel.getByLabel('Correction reason', { exact: true })).toHaveValue('');
    await chooseResultsRound(page, A); await fillDraft(); const retained = await fields();
    availability = 'missing'; await expect(panel.getByText('This correction target is unavailable or read only. Your draft is retained. Discard it or explicitly choose an available round.', { exact: true })).toBeVisible(); await expect(panel.getByLabel('Correction reason', { exact: true })).toHaveValue(retained['Correction reason']); await expect(panel.getByRole('button', { name: 'Request correction', exact: true })).toBeDisabled();
    await panel.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit()); expect(requests).toHaveLength(0);
    availability = 'archived'; await expect(page.getByRole('heading', { name: 'Archived results · read only', exact: true })).toBeVisible(); await expect(panel.getByLabel('Correction reason', { exact: true })).toHaveValue(retained['Correction reason']);
    availability = 'normal'; await expect(panel.getByRole('button', { name: 'Request correction', exact: true })).toBeEnabled(); expect(await fields()).toEqual(retained); expect(requests).toHaveLength(0);
    await panel.getByRole('button', { name: 'Discard correction draft', exact: true }).click(); await openForm(); await expect(panel.getByLabel('Correction reason', { exact: true })).toHaveValue(''); await fillDraft();
    if (width === 738) {
      await panel.getByLabel('Correction song', { exact: true }).selectOption(original.definition.heats[0].songs[0].id); await panel.getByLabel(labels[4], { exact: true }).selectOption(''); const submitted = await fields(), before = await api<LiveView>(event.organizer);
      mode = 'delay'; await panel.getByRole('button', { name: 'Request correction', exact: true }).click(); await expect.poll(() => Boolean(release)).toBe(true); await expect(panel.getByRole('button', { name: 'Requesting correction…', exact: true })).toBeDisabled(); await expect(panel.getByRole('button', { name: 'Discard correction draft', exact: true })).toBeDisabled();
      await chooseResultsRound(page, B); await expect(panel.getByRole('button', { name: 'Discard draft and use selected round', exact: true })).toBeDisabled(); release!();
      await expect(panel.getByText('Draft retained. Check Pending requests for confirmation.', { exact: true })).toBeVisible(); expect(await fields()).toEqual(submitted); expect((await api<LiveView>(event.organizer)).reviewRequests).toEqual(before.reviewRequests);
      mode = 'failure'; await panel.getByRole('button', { name: 'Request correction', exact: true }).click(); await expect(panel.getByText('Request not confirmed. Draft retained; review the event notice.', { exact: true })).toBeVisible(); expect(await fields()).toEqual(submitted); await capture('unconfirmed');
      mode = 'real'; const response = page.waitForResponse(response => response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'request-correction'); await panel.getByRole('button', { name: 'Request correction', exact: true }).click(); expect((await response).status()).toBe(200); await expect(panel.getByRole('button', { name: 'Request correction', exact: true })).toBeEnabled();
      const after = await api<LiveView>(event.organizer), added = after.reviewRequests!.filter(request => !before.reviewRequests?.some(old => old.id === request.id)); expect(added).toHaveLength(1); expect(added[0].payload.roundKey).toBe(original.key); expect(added[0].payload.submissionId).toBe(source.id); expect(added[0].reason).toBe(submitted['Correction reason']); expect(added[0].approvals).toEqual([]); expect(after.rounds).toEqual(before.rounds); expect(after.heatSubmissions).toEqual(before.heatSubmissions); expect(await fields()).toEqual(submitted); expect(requests).toHaveLength(3);
      await command(event.tokens[0], { ...requests[2], requestId: undefined, expectedVersion: undefined }, 403); await command(event.organizer, { action: 'save-cell', roundKey: original.key }, 403);
      await capture('requested-original-target');
      await panel.getByRole('button', { name: 'Discard correction draft', exact: true }).click(); await openForm(); await panel.getByLabel('Correction reason', { exact: true }).fill('Fresh draft for the deliberately selected round'); await expect(panel.getByText('Draft retained. Check Pending requests for confirmation.', { exact: true })).toHaveCount(0); await expect(panel.getByRole('heading')).toContainText(view.rounds.find(round => round.id === B)!.definition.division); expect(requests).toHaveLength(3);
    }
    expect(errors).toEqual([]);
    if (evidence) writeFileSync(`${evidence}/result-${width}.json`, JSON.stringify({ width, allSixFieldsRetained: true, noStandingsSelectionRetained: true, explicitDiscardAndChangeTarget: true, missingArchivedProjectionUIOnly: true, navigationWrites: 0, requestAttempts: requests.length, realRequests: width === 738 ? 1 : 0, malformedDelayedAnd503Retain: width === 738, errors }, null, 2));
  } finally { release?.(); await context.close(); }
});

test('a replaced submitted heat requires an explicit current-version choice and retains the correction draft reason', async ({ browser }) => {
  const setup = limitedStage(1, 4);
  setup.judges = [setup.judges[2]];
  setup.rounds = setup.rounds.map((round) => ({ ...round, judgeIds: [setup.headJudgeId] }));
  const event = await createStage(setup);
  await command(event.organizer, { action: 'open-stage', kind: 'prelims' });
  let view = await api<LiveView>(event.organizer);
  const round = view.rounds[0];
  await dance(event.organizer, event.tokens, round);
  await command(event.organizer, { action: 'conclude-stage' });
  view = await api<LiveView>(event.organizer);
  const original = view.heatSubmissions![0], song = round.definition.heats[0].songs[0], subject = round.definition.subjects[0];
  type Backup = { history: { heatSubmissions: { id: string; supersedes?: string; cells: Record<string, { mark: string }> }[] } };
  const before = await command(event.organizer, { action: 'backup' }) as Backup;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  const errors: string[] = [], posts: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/live')) posts.push(request.postDataJSON().action); });
  try {
    await page.goto(base + event.path);
    await openResultManagement(page);
    const form = page.locator('#results-management details').filter({ has: page.locator(':scope > summary', { hasText: 'Request a score correction' }) });
    await form.locator(':scope > summary').click();
    await form.getByLabel('Corrected mark for affected bib', { exact: true }).selectOption('A2');
    await form.getByLabel('Correction reason', { exact: true }).fill('Retained draft reason after another exact correction');
    const request = await command(event.organizer, {
      action: 'request-correction', roundKey: round.key, heatId: original.heatId, judgeId: original.judgeId, submissionId: original.id,
      reason: 'Synthetic first immutable version replacement', changes: [{ performanceId: song.id, subjectId: subject.id, after: 'A1' }],
    }) as { reviewRequestId: string };
    await command(event.organizer, { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    await command(event.tokens[0], { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(form.getByText(/selected submission is no longer current|submitted heat was replaced/)).toBeVisible();
    const current = (await api<LiveView>(event.organizer)).heatSubmissions![0];
    expect(current.id).not.toBe(original.id);
    const selection = form.getByLabel('Submitted heat / judge', { exact: true });
    await expect(selection).toHaveValue('', { timeout: 3000 });
    await expect(selection).toHaveAttribute('aria-invalid', 'true');
    await expect(selection).toHaveAccessibleDescription(/submitted heat was replaced/);
    await expect(form.getByRole('button', { name: 'Request correction', exact: true })).toHaveCount(0);
    expect(posts).toEqual([]);
    await form.screenshot({ path: 'test-results/correction-recovery-390.png' });
    for (const width of [360, 738, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await form.screenshot({ path: 'test-results/correction-recovery-1440.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await selection.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await expect(selection).toHaveValue(current.id);
    await expect(selection).not.toHaveAttribute('aria-invalid');
    await expect(form.getByLabel('Correction reason', { exact: true })).toHaveValue('Retained draft reason after another exact correction');
    await expect(form.getByLabel('Corrected mark for affected bib', { exact: true })).toHaveValue('A2');
    await expect(form.getByLabel('Correction preview', { exact: true })).toContainText('A1 → A2');
    const posted = page.waitForResponse((response) => response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'request-correction');
    await form.getByRole('button', { name: 'Request correction', exact: true }).click();
    expect((await posted).status()).toBe(200);
    const pending = (await api<LiveView>(event.organizer)).reviewRequests!.find((request) => !request.appliedAt && !request.cancelledAt)!;
    expect(pending.payload.submissionId).toBe(current.id);
    expect(pending.reason).toBe('Retained draft reason after another exact correction');
    expect(pending.approvals).toEqual([]);
    const after = await command(event.organizer, { action: 'backup' }) as Backup;
    expect(after.history.heatSubmissions.find((submission) => submission.id === original.id)).toEqual(before.history.heatSubmissions[0]);
    expect(after.history.heatSubmissions.find((submission) => submission.id === current.id)?.supersedes).toBe(original.id);
    expect(after.history.heatSubmissions).toHaveLength(2);
    expect(JSON.stringify(after)).not.toContain('PUBLICATION_PRIVATE_NOTE_SENTINEL');
    expect(posts).toEqual(['request-correction']);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
