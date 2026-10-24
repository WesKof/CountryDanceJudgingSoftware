import { test, expect } from '@playwright/test';
import { api, base, command } from './stage-helpers';
import { createStage, limitedStage, dance } from './publication-helpers';
import { openResultManagement } from './setup-browser-helpers';
import type { LiveView } from '../lib/live/types';

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
