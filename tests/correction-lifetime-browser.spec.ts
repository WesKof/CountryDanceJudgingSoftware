import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { api, base, command } from './stage-helpers';
import { openResultManagement } from './setup-browser-helpers';
import { createStage, limitedStage, dance } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

async function fixture() {
  if (process.env.CORRECTION_NAV_RETAINED_FIXTURE) return JSON.parse(readFileSync(process.env.CORRECTION_NAV_RETAINED_FIXTURE, 'utf8')) as { event: Awaited<ReturnType<typeof createStage>>; A: string; B: string };
  const event = await createStage(limitedStage(2, 4));
  await command(event.organizer, { action: 'open-stage', kind: 'prelims' });
  const view = await api<LiveView>(event.organizer);
  for (const [index, round] of view.rounds.entries()) { await dance(event.organizer, event.tokens, round); if (index < view.rounds.length - 1) await command(event.organizer, { action: 'next' }); }
  await command(event.organizer, { action: 'conclude-stage' });
  const saved = await api<LiveView>(event.organizer);
  if (saved.context.automaticStages === undefined) await command(event.organizer, { action: 'enable-auto-stages' });
  return { event, A: view.rounds[0].id, B: view.rounds[1].id };
}
async function choose(page: Page, id: string) {
  const select = page.getByLabel('Competition and round view', { exact: true });
  const values = await select.locator('option:not([disabled])').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  expect(values).toContain(id); await select.focus(); await page.keyboard.press('Home');
  for (let n = 0; n < values.indexOf(id); n++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); await expect(select).toHaveValue(id);
}

for (const width of [390, 738]) test(`one event-owned correction survives page unmount and late transport at ${width}`, async ({ browser }) => {
  const { event, A, B } = await fixture(), view = await api<LiveView>(event.organizer);
  const original = view.rounds.find(round => round.id === A)!, source = view.heatSubmissions!.filter(submission => submission.roundKey === original.key).at(-1)!;
  const context = await browser.newContext({ viewport: { width, height: 589 } }), page = await context.newPage();
  const requests: Record<string, unknown>[] = [], errors: string[] = [];
  let mode: 'block' | 'delay' | 'failure' = 'block', projection: 'normal' | 'new-event' | 'replaced-source' = 'normal';
  let release: (() => void) | undefined, reads = 0;
  await context.route('**/*', async route => {
    const request = route.request(); if (new URL(request.url()).origin !== base) return route.abort('blockedbyclient');
    if (request.method() === 'GET') {
      if (request.url().includes('/api/live')) {
        reads++;
        if (projection !== 'normal') {
          const response = await route.fetch(), projected = await response.json() as LiveView;
          if (projection === 'new-event') { projected.eventId += '-controlled-boundary'; projected.setup.name = 'Controlled second event boundary'; }
          else projected.heatSubmissions = projected.heatSubmissions?.map(submission => submission.id === source.id ? { ...submission, id: source.id + '-replaced', version: submission.version + 1 } : submission);
          return route.fulfill({ response, json: projected });
        }
      }
      return route.continue();
    }
    const input = request.postDataJSON() as Record<string, unknown>; requests.push(input);
    if (input.action !== 'request-correction' || mode === 'block') return route.abort('blockedbyclient');
    if (mode === 'delay') { await new Promise<void>(resolve => { release = resolve; }); return route.fulfill({ status: 200, json: {} }); }
    return route.fulfill({ status: 503, json: { error: 'Fictional failed correction transport' } });
  });
  page.on('pageerror', error => errors.push(error.message));
  const panel = page.getByRole('region', { name: 'New correction draft', exact: true });
  const labels = ['Submitted heat / judge', 'Correction song', 'Wrong or affected bib', 'Corrected mark for affected bib', 'Intended bib for mistaken-bib transfer (optional)', 'Correction reason'];
  const fields = () => Promise.all(labels.map(label => panel.getByLabel(label, { exact: true }).inputValue()));
  async function openForm() {
    for (const text of ['Request a score correction', 'Mark entered against the wrong bib']) {
      const summary = panel.locator('details > summary').filter({ hasText: text }).first();
      if (await summary.evaluate(element => !(element.parentElement as HTMLDetailsElement).open)) await summary.click();
    }
  }
  async function fill(reason: string) {
    await openForm();
    for (const [label, value] of [[labels[0], source.id], [labels[1], original.definition.heats[0].songs[1].id], [labels[2], original.definition.subjects[1].id], [labels[3], 'A2'], [labels[4], original.definition.subjects[2].id]]) await panel.getByLabel(label, { exact: true }).selectOption(value);
    await panel.getByLabel(labels[5], { exact: true }).fill(reason);
  }
  async function returnResults() { await openResultManagement(page); await openForm(); }
  async function leave(name: 'Score' | 'Publish') {
    await page.getByRole('button', { name: name === 'Score' ? '02 Score' : '04 Publish', exact: true }).click();
    await expect(panel).toHaveCount(0);
  }
  async function capture(label: string) {
    const measure = await page.evaluate(() => {
      const clips: string[] = [], panel = document.querySelector('[aria-label="New correction draft"]')!;
      const hidden = (node: Element) => { for (let element: Element | null = node; element; element = element.parentElement) { const style = getComputedStyle(element); if (style.display === 'none' || style.visibility === 'hidden' || element instanceof HTMLDetailsElement && !element.open && !element.querySelector(':scope > summary')?.contains(node)) return true; } return false; };
      const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const node = walk.currentNode, element = node.parentElement; if (!element || !node.textContent?.trim() || hidden(element)) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (let parent: Element | null = element; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent); if (!/hidden|clip/.test(style.overflowX + style.overflowY)) continue;
          const box = parent.getBoundingClientRect();
          if ([...range.getClientRects()].some(rect => rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) { clips.push(node.textContent.trim().slice(0, 60)); break; }
        }
      }
      return { pageFits: document.documentElement.scrollWidth <= innerWidth, clips };
    });
    expect(measure.pageFits).toBe(true); expect(measure.clips).toEqual([]);
    if (process.env.CORRECTION_NAV_EVIDENCE) { const dir = process.env.CORRECTION_NAV_EVIDENCE; mkdirSync(dir, { recursive: true }); await panel.screenshot({ path: `${dir}/${label}-${width}.png` }); writeFileSync(`${dir}/${label}-${width}.json`, JSON.stringify(measure)); }
  }
  try {
    await page.goto(base + event.path); await openResultManagement(page); await choose(page, A); await fill('Exact cross-page intent ' + width); const filled = await fields();
    await choose(page, view.setup.rounds.find(round => round.kind === 'finals')!.id);
    await page.getByRole('button', { name: 'Go to Score', exact: true }).click(); await expect(panel).toHaveCount(0);
    await returnResults(); await choose(page, A); expect(await fields()).toEqual(filled);
    for (const name of ['Score', 'Publish'] as const) { await leave(name); await returnResults(); await choose(page, B); expect(await fields()).toEqual(filled); await expect(panel.getByRole('heading')).toContainText(original.definition.division); }
    expect(requests).toHaveLength(0); await capture('page-return');
    // The exact payload is intercepted, never forwarded or interpreted as an action receipt.
    mode = 'delay'; await panel.getByRole('button', { name: 'Request correction', exact: true }).click(); await expect.poll(() => Boolean(release)).toBe(true);
    await leave('Score'); release!(); release = undefined;
    await returnResults(); await expect(panel.getByRole('button', { name: 'Request correction', exact: true })).toBeEnabled();
    await expect(panel.getByText('Draft retained. Check Pending requests for confirmation.', { exact: true })).toBeVisible(); expect(await fields()).toEqual(filled);
    mode = 'failure'; await panel.getByRole('button', { name: 'Request correction', exact: true }).click(); await leave('Publish');
    await returnResults(); await expect(panel.getByRole('button', { name: 'Request correction', exact: true })).toBeEnabled();
    await expect(panel.getByText('Request not confirmed. Draft retained; review the event notice.', { exact: true })).toBeVisible(); expect(await fields()).toEqual(filled);
    // Keep an attempt outstanding while Results remounts; duplicate/discard remain blocked.
    mode = 'delay'; await panel.getByRole('button', { name: 'Request correction', exact: true }).click(); await expect.poll(() => Boolean(release)).toBe(true);
    await leave('Publish'); await returnResults(); expect(await fields()).toEqual(filled);
    await expect(panel.getByRole('button', { name: 'Requesting correction…', exact: true })).toBeDisabled(); await expect(panel.getByRole('button', { name: 'Discard correction draft', exact: true })).toBeDisabled();
    await panel.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit()); expect(requests).toHaveLength(3); release!(); release = undefined;
    await expect(panel.getByRole('button', { name: 'Request correction', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: 'Discard draft and use selected round', exact: true }).click(); await openForm();
    await expect(panel.getByLabel(labels[5], { exact: true })).toHaveValue(''); await expect(panel.getByText('Draft retained. Check Pending requests for confirmation.', { exact: true })).toHaveCount(0);
    await choose(page, A); await fill('Source version retained ' + width); projection = 'replaced-source';
    await expect(panel.getByLabel(labels[0], { exact: true })).toHaveValue(''); await expect(panel.getByText(/selected submitted heat was replaced/)).toBeVisible();
    await leave('Score'); await openResultManagement(page);
    const summary = panel.locator('details > summary').filter({ hasText: 'Request a score correction' }).first(); if (await summary.evaluate(element => !(element.parentElement as HTMLDetailsElement).open)) await summary.click();
    await expect(panel.getByText('Draft reason: Source version retained ' + width, { exact: true })).toBeVisible(); expect(requests).toHaveLength(3);
    projection = 'normal';
    // Equal-version merge retains the newer submitted version; choose it explicitly rather than silently rebasing.
    await expect(panel.getByLabel(labels[0], { exact: true })).toHaveValue('');
    await panel.getByLabel(labels[0], { exact: true }).selectOption(source.id + '-replaced'); await openForm();
    await panel.getByLabel(labels[1], { exact: true }).selectOption(original.definition.heats[0].songs[1].id);
    await panel.getByLabel(labels[2], { exact: true }).selectOption(original.definition.subjects[1].id);
    await panel.getByLabel(labels[4], { exact: true }).selectOption(original.definition.subjects[2].id);
    // Controlled event-ID projection tests the event-key owner boundary, not a backend event transition.
    mode = 'delay'; await panel.getByRole('button', { name: 'Request correction', exact: true }).click(); await expect.poll(() => Boolean(release)).toBe(true);
    projection = 'new-event'; await expect(page.getByText('Controlled second event boundary', { exact: true }).first()).toBeVisible();
    await returnResults(); await choose(page, A); await expect(panel.getByLabel(labels[5], { exact: true })).toHaveValue('');
    await fill('New event intent ' + width); const next = await fields(), readsBefore = reads; release!(); release = undefined;
    await expect.poll(() => page.getByRole('button', { name: 'Request correction', exact: true }).isEnabled()).toBe(true);
    await page.waitForTimeout(150); expect(reads).toBe(readsBefore); expect(await fields()).toEqual(next);
    await expect(panel.getByText('Draft retained. Check Pending requests for confirmation.', { exact: true })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Discard correction draft', exact: true }).click(); await openForm(); await panel.getByLabel(labels[5], { exact: true }).fill('New generation after discard');
    await leave('Score'); await returnResults(); await expect(panel.getByLabel(labels[5], { exact: true })).toHaveValue('New generation after discard');
    await capture('event-separated'); projection = 'normal'; await page.goto(base + event.path); await openResultManagement(page); await choose(page, A); await openForm();
    await expect(panel.getByLabel(labels[5], { exact: true })).toHaveValue(''); expect(errors).toEqual([]);
    const song = original.definition.heats[0].songs[1].id, affected = original.definition.subjects[1].id, intended = original.definition.subjects[2].id;
    const recorded = original.submittedMarks?.find(cell => cell.judgeId === source.judgeId && cell.performanceId === song && cell.subjectId === affected)?.mark ?? '';
    requests.forEach((input, index) => expect(input).toMatchObject({ action: 'request-correction', roundKey: original.key, heatId: source.heatId, judgeId: source.judgeId, submissionId: source.id + (index === 3 ? '-replaced' : ''), reason: index === 3 ? 'Source version retained ' + width : filled[5], changes: [{ performanceId: song, subjectId: affected, after: 'A2' }, { performanceId: song, subjectId: intended, after: recorded }] }));
    expect(requests).toHaveLength(4);
    if (process.env.CORRECTION_NAV_EVIDENCE) writeFileSync(`${process.env.CORRECTION_NAV_EVIDENCE}/lifetime-${width}.json`, JSON.stringify({ width, goToScoreAndRailTrips: true, navigationMutations: 0, interceptedNeverForwarded: requests.length, exactOriginalPayload: true, pendingAcrossUnmount: true, delayed200And503: true, sourceReplacementProjection: true, eventBoundaryProjectionAndLateNoRefresh: true, explicitDiscardAndReloadReset: true, errors }, null, 2));
  } finally { release?.(); await context.close(); }
});

test('pending correction revision retains its local field and exact request behavior', async ({ browser }) => {
  const { event, A } = await fixture(), view = await api<LiveView>(event.organizer), round = view.rounds.find(item => item.id === A)!;
  const sources = view.heatSubmissions!.filter(submission => submission.roundKey === round.key), source = sources.at(-1)!, next = sources[0];
  expect(next.id).not.toBe(source.id);
  const heat = round.definition.heats.find(item => item.id === source.heatId)!, nextHeat = round.definition.heats.find(item => item.id === next.heatId)!;
  const revision = { id: 'controlled-revision-compatibility', kind: 'correction' as const, version: 1, reason: 'Controlled revision field compatibility', requester: 'organizer', createdAt: new Date().toISOString(), approvals: [], payload: { roundKey: round.key, heatId: source.heatId, judgeId: source.judgeId, submissionId: source.id, changes: [{ performanceId: heat.songs[1].id, subjectId: heat.subjectIds[1], before: 'Yes' as const, after: 'A2' as const }, { performanceId: heat.songs[1].id, subjectId: heat.subjectIds[2], before: 'No' as const, after: 'Yes' as const }] } };
  const context = await browser.newContext({ viewport: { width: 390, height: 589 } }), page = await context.newPage(), requests: Record<string, unknown>[] = [];
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== base) return route.abort('blockedbyclient');
    if (route.request().url().includes('/api/live')) {
      if (route.request().method() === 'GET') { const response = await route.fetch(), projected = await response.json() as LiveView; projected.reviewRequests = [revision]; return route.fulfill({ response, json: projected }); }
      requests.push(route.request().postDataJSON()); return route.fulfill({ status: 200, json: {} });
    }
    return route.continue();
  });
  try {
    await page.goto(base + event.path); await openResultManagement(page); await choose(page, A);
    const form = page.locator('details').filter({ has: page.locator(':scope > summary', { hasText: 'Revise this pending correction' }) });
    await form.locator(':scope > summary').click();
    for (const [label, value] of [['Submitted heat / judge', source.id], ['Correction song', heat.songs[1].id], ['Wrong or affected bib', heat.subjectIds[1]], ['Corrected mark for affected bib', 'A2'], ['Intended bib for mistaken-bib transfer (optional)', heat.subjectIds[2]], ['Correction reason', revision.reason]]) await expect(form.getByLabel(label, { exact: true })).toHaveValue(value);
    await form.getByLabel('Submitted heat / judge', { exact: true }).selectOption(next.id);
    for (const [label, value] of [['Correction song', nextHeat.songs[0].id], ['Wrong or affected bib', nextHeat.subjectIds[0]], ['Corrected mark for affected bib', 'A2'], ['Intended bib for mistaken-bib transfer (optional)', ''], ['Correction reason', revision.reason]]) await expect(form.getByLabel(label, { exact: true })).toHaveValue(value);
    await form.getByRole('button', { name: 'Submit revised correction', exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toMatchObject({ action: 'request-correction', reviewRequestId: revision.id, roundKey: round.key, heatId: next.heatId, judgeId: next.judgeId, submissionId: next.id, reason: revision.reason, changes: [{ performanceId: nextHeat.songs[0].id, subjectId: nextHeat.subjectIds[0], after: 'A2' }] });
    await expect(form.getByLabel('Correction reason', { exact: true })).toHaveValue(revision.reason);
    if (process.env.CORRECTION_NAV_EVIDENCE) { mkdirSync(process.env.CORRECTION_NAV_EVIDENCE, { recursive: true }); writeFileSync(`${process.env.CORRECTION_NAV_EVIDENCE}/revision-compatibility.json`, JSON.stringify({ controlledPendingRequestProjection: true, allSixInitialFields: true, sourceChangeResetsAndRetains: true, exactRevisedPayload: true, interceptedNeverForwarded: 1 })); }
  } finally { await context.close(); }
});
