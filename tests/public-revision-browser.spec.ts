import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { api, base, command } from './stage-helpers';
import { createStage, limitedStage, finish, owner, receiver, localKey } from './publication-helpers';
import { openResultManagement } from './setup-browser-helpers';
import type { LiveView } from '../lib/live/types';
import type { PublicSnapshot } from '../lib/live/publication';

type PublicData = { records: { snapshot: PublicSnapshot }[]; current: Record<string, string> };

test('published correction requires both roles and renewed release while the original public version stays intact', async ({ browser }) => {
  const setup = limitedStage(1, 4);
  setup.name = 'Synthetic published correction rehearsal';
  if (process.env.PUBLIC_HIERARCHY_LONG_NAMES === 'true') for (const round of setup.rounds) for (const entrant of round.subjects) {
    entrant.primary += ' Alexandra Montgomery-Wellington';
    if (entrant.secondary) entrant.secondary += ' Christopher Beaumont-Richardson';
  }
  const event = await createStage(setup);
  await finish(setup, event.organizer, event.tokens, event.head, false);
  await command(event.organizer, { action: 'prepare-event-publication' });
  let view = await api<LiveView>(event.organizer);
  const original = structuredClone(view.publications![0]);
  const publications = [{ publicationId: original.id, sourceFingerprint: original.sourceFingerprint }];
  await command(event.organizer, { action: 'approve-event-publication', publications });
  await owner({ action: 'release-event', publications });
  const publicBefore = await (await fetch(receiver + '/api/public')).json() as PublicData;
  const originalPublic = publicBefore.records.find((r: { snapshot: { id: string } }) => r.snapshot.id === original.id);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago' });
  const desk = await context.newPage(), head = await context.newPage(), site = await context.newPage();
  const errors: string[] = [];
  for (const page of [desk, head, site]) page.on('pageerror', (error) => errors.push(error.message));
  try {
    view = await api<LiveView>(event.organizer);
    const finals = view.rounds.find((r) => r.definition.kind === 'finals')!;
    const entrant = finals.definition.subjects[1];
    const source = view.heatSubmissions!.find((s) => s.roundKey === finals.key && s.judgeId === setup.judges[0].id)!;
    await desk.goto(base + event.path);
    await openResultManagement(desk);
    await desk.getByLabel('Competition and round view', { exact: true }).selectOption(finals.id);
    await desk.getByText('Request a score correction', { exact: true }).click();
    await desk.getByLabel('Submitted heat / judge', { exact: true }).selectOption(source.id);
    await desk.getByLabel('Wrong or affected bib', { exact: true }).selectOption(entrant.id);
    await desk.getByLabel('Corrected mark for affected bib', { exact: true }).selectOption('Yes');
    await desk.getByLabel('Correction reason', { exact: true }).fill('Synthetic recording error; retain original publication');
    await expect(desk.getByLabel('Correction preview')).toContainText('A1 → Yes');
    await desk.getByRole('button', { name: 'Request correction', exact: true }).click();
    await expect(desk.getByText('0 / 2 approvals · scores unchanged', { exact: true })).toBeVisible();
    desk.once('dialog', (dialog) => void dialog.accept());
    await desk.getByRole('button', { name: 'Approve request as organizer', exact: true }).click();
    await expect(desk.getByText('1 / 2 approvals · scores unchanged', { exact: true })).toBeVisible();
    view = await api<LiveView>(event.organizer);
    expect(view.rounds.find((r) => r.id === finals.id)!.standings!.rows.find((r) => r.subjectId === entrant.id)!.average).toBe(4.5);
    await head.goto(base + view.judgeLinks!.find((j) => j.path.endsWith(event.head))!.path);
    const approve = head.getByRole('button', { name: 'Approve these exact submissions', exact: true });
    // The old result is still approved until both roles apply the correction.
    await expect(approve).toHaveCount(0);
    head.once('dialog', (dialog) => void dialog.accept());
    await head.getByRole('button', { name: 'Approve request as head', exact: true }).click();
    await expect(approve).toBeEnabled();
    view = await api<LiveView>(event.organizer);
    const corrected = view.rounds.find((r) => r.id === finals.id)!;
    expect(corrected.standings!.approved).toBe(false);
    expect(corrected.standings!.rows.find((r) => r.subjectId === entrant.id)!.average).toBeCloseTo(19 / 3, 10);
    expect(view.heatSubmissions!.find((s) => s.roundKey === finals.key && s.judgeId === source.judgeId)!.supersedes).toBe(source.id);
    // The local adapter uses the existing delivery runner to synchronize queued notices.
    await owner({ action: 'retry' });
    await site.goto(receiver + '/results/' + original.id);
    await expect(site.getByText('A correction is under review. These are the previously approved results.', { exact: true })).toBeVisible();
    await expect(site.getByRole('cell', { name: '4.5000', exact: true })).toBeVisible();
    await approve.click();
    await expect.poll(async () => (await api<LiveView>(event.organizer)).rounds.find((r) => r.id === finals.id)!.standings!.approved).toBe(true);
    await desk.getByRole('button', { name: '04 Publish', exact: true }).click();
    await desk.getByRole('button', { name: 'Review results to publish', exact: true }).click();
    await desk.getByRole('button', { name: 'Send results for approval', exact: true }).click();
    await site.goto(receiver + '/admin');
    await site.getByLabel('Admin access code', { exact: true }).fill(localKey('LOCAL_OWNER_KEY'));
    await site.getByRole('button', { name: 'Sign in', exact: true }).click();
    await site.goto(receiver + '/admin?event=' + original.snapshot.eventId);
    await expect(site.getByRole('cell', { name: '6.3333', exact: true })).toBeVisible();
    await expect(site.locator('.public-comparison')).toHaveCount(0);
    await expect(site.locator('.public-supporting')).toHaveCount(0);
    await site.getByRole('button', { name: 'Approve & publish results', exact: true }).click();
    await expect(site.getByRole('heading', { name: 'Results published', exact: true })).toBeVisible();
    await site.getByRole('link', { name: 'View published results', exact: true }).click();
    await expect(site.getByRole('cell', { name: '6.3333', exact: true })).toBeVisible();
    await expect(site.getByText('What changed · 1 result entry', { exact: true })).toBeVisible();
    const comparison = site.locator('.public-comparison');
    await expect(comparison).not.toHaveAttribute('open');
    expect(await comparison.evaluate((element) => Boolean(document.querySelector('article.card table')!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    const hierarchy = [];
    for (const width of [390, 1264, 1440]) {
      await site.setViewportSize({ width, height: 900 });
      hierarchy.push(await site.evaluate(() => {
        const table = document.querySelector('article.card table')!.getBoundingClientRect();
        const change = document.querySelector('.public-comparison')!.getBoundingClientRect();
        const supporting = document.querySelector('.public-supporting, .public-scorecards')!.getBoundingClientRect();
        return { width: innerWidth, rankingBottom: table.bottom, comparisonTop: change.top, supportingTop: supporting.top, gap: change.top - table.bottom };
      }));
      if (process.env.PUBLIC_HIERARCHY_EVIDENCE) {
        mkdirSync(process.env.PUBLIC_HIERARCHY_EVIDENCE, { recursive: true });
        await site.screenshot({ path: `${process.env.PUBLIC_HIERARCHY_EVIDENCE}/corrected-${width}.png`, fullPage: true });
      }
    }
    if (process.env.PUBLIC_HIERARCHY_EVIDENCE) writeFileSync(`${process.env.PUBLIC_HIERARCHY_EVIDENCE}/hierarchy.json`, JSON.stringify(hierarchy, null, 2));
    expect(hierarchy.every((row) => row.comparisonTop < row.supportingTop)).toBe(true);
    expect(hierarchy.every((row) => row.gap >= 0 && row.gap < 90)).toBe(true);
    const publicPosts: string[] = []; site.on('request', (request) => { if (request.method() === 'POST') publicPosts.push(request.url()); });
    const supporting = site.locator('.public-supporting');
    await expect(supporting).toHaveCount(1); await expect(supporting).not.toHaveAttribute('open');
    const supportingSummary = supporting.locator(':scope > summary');
    await supportingSummary.focus(); await site.keyboard.press('Enter');
    await expect(supporting).toHaveAttribute('open');
    await expect(supporting.locator('.public-stage-records.public-prelims > table')).toBeVisible();
    for (const judge of setup.judges) await expect(supporting.locator('.public-judge-scorecards').getByRole('link', { name: judge.name, exact: true })).toBeVisible();
    await site.keyboard.press('Tab');
    const firstJudge = supporting.locator('.public-judge-scorecards > details').first();
    await expect(firstJudge.locator(':scope > summary')).toBeFocused();
    await site.keyboard.press('Enter'); await expect(firstJudge.locator('h4').first()).toBeVisible();
    if (process.env.PUBLIC_HIERARCHY_EVIDENCE) for (const width of [390, 1440]) {
      await site.setViewportSize({ width, height: 900 });
      expect(await site.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await supporting.screenshot({ path: `${process.env.PUBLIC_HIERARCHY_EVIDENCE}/supporting-open-${width}.png` });
    }
    await supportingSummary.focus(); await site.keyboard.press('Space');
    await expect(supporting).not.toHaveAttribute('open'); await expect(supportingSummary).toBeFocused();
    await comparison.locator(':scope > summary').focus(); await site.keyboard.press('Enter');
    await expect(comparison.getByText('4.5000 → 6.3333', { exact: true })).toBeVisible();
    await expect(comparison.getByText('Recorded scorecard changes · 1', { exact: true })).toBeVisible();
    await comparison.locator('.comparison-marks > summary').focus(); await site.keyboard.press('Enter');
    await expect(comparison.getByText('A1 → Yes', { exact: true })).toBeVisible();
    for (const width of [360, 390, 738, 1440]) {
      await site.setViewportSize({ width, height: 900 });
      expect(await site.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if ([390, 1440].includes(width)) await comparison.screenshot({ path: `test-results/public-comparison-${width}.png` });
    }
    const released = await (await fetch(receiver + '/api/public')).json() as PublicData;
    const currentId = released.current[original.snapshot.eventId + '/' + original.snapshot.competitionId];
    const published = released.records.find((record) => record.snapshot.id === currentId)!.snapshot;
    const finalStage = published.stages.find((stage) => stage.kind === 'finals')!;
    for (const entry of finalStage.entrants) {
      const name = `#${entry.number} ${entry.primary} ${entry.secondary}`;
      await expect(site.locator('.public-standings').getByRole('link', { name, exact: true })).toHaveText(name);
    }
    const affected = finalStage.entrants.find((entry) => entry.number === entrant.number)!;
    await site.goto(receiver + `/results/${currentId}/entrant/${affected.id}`);
    await comparison.locator(':scope > summary').click();
    await expect(comparison.locator('.comparison-list')).toContainText('#' + entrant.number);
    await expect(comparison.locator('.comparison-list')).not.toContainText('#101');
    await site.goto(receiver + `/results/${currentId}/entrant/${finalStage.entrants.find((entry) => entry.number === 101)!.id}`);
    await comparison.locator(':scope > summary').click();
    await expect(comparison).toContainText('No public result or recorded-scorecard changes for this entrant.');
    await site.goto(receiver + `/results/${currentId}/judge/${finalStage.judges[0].id}`);
    await comparison.locator(':scope > summary').click();
    await expect(comparison).toContainText('Recorded scorecard changes · 1');
    await site.goto(receiver + `/results/${currentId}/judge/${finalStage.judges[1].id}`);
    await comparison.locator(':scope > summary').click();
    await expect(comparison).toContainText('No recorded-scorecard changes for this judge.');
    await site.goto(receiver + '/results/' + currentId);
    await expect(site.locator('.public-supporting')).not.toHaveAttribute('open');
    await site.locator('.revision > details > summary').click();
    await site.getByRole('link', { name: 'Revision 1', exact: true }).click();
    await expect(site.getByText('You are viewing an earlier published version. Its original scores are preserved.', { exact: true })).toBeVisible();
    await expect(site.getByRole('cell', { name: '4.5000', exact: true })).toBeVisible();
    await expect(comparison).toHaveCount(0);
    await site.getByRole('link', { name: 'Current revision', exact: true }).click();
    await expect(site.getByRole('cell', { name: '6.3333', exact: true })).toBeVisible();
    for (const width of [390, 1440]) {
      await site.setViewportSize({ width, height: 900 });
      expect(await site.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await site.screenshot({ path: `test-results/public-corrected-${width}.png`, fullPage: false });
    }
    const after = await (await fetch(receiver + '/api/public')).json() as PublicData;
    expect(after.records.find((r) => r.snapshot.id === original.id)!.snapshot).toEqual(originalPublic!.snapshot);
    expect(after.current[original.snapshot.eventId + '/' + original.snapshot.competitionId]).toBe(currentId);
    expect(publicPosts).toEqual([]);
    const backup = await command(event.organizer, { action: 'backup' }) as { history: { heatSubmissions: { id: string }[] } };
    expect(backup.history.heatSubmissions.some((s) => s.id === source.id)).toBe(true);
    expect(JSON.stringify(after)).not.toContain('PUBLICATION_PRIVATE_NOTE_SENTINEL');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
