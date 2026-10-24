import { test, expect } from '@playwright/test';
import { api, base, command, save } from './stage-helpers';
import { createStage, limitedStage, exact } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

async function approvedEventWithRequest() {
  const event = await createStage(limitedStage(1, 4));
  await command(event.organizer, { action: 'enable-auto-stages' });
  for (const kind of ['prelims', 'finals']) {
    const view = await api<LiveView>(event.organizer), round = view.rounds.find((round) => round.definition.kind === kind)!;
    const heat = round.definition.heats[0];
    for (const token of event.tokens) {
      for (const [index, subject] of round.definition.subjects.entries()) await save(token, round, heat.songs[0].id, subject.id, index === 0 ? 'Yes' : index === 1 ? 'A1' : 'No', index === 0 ? 'PRIVATE_PENDING_STATUS' : '');
      const own = await api<LiveView>(token);
      await api(token, { action: 'submit-stage', blockId: own.context.blockId, expectedVersion: own.version, requestId: crypto.randomUUID(), acknowledged: true, ballotVersions: Object.fromEntries(own.ballots.map((ballot) => [ballot.roundKey, ballot.version])), roundVersions: Object.fromEntries(own.rounds.map((round) => [round.key, round.version])) });
    }
    await exact(event.head, round.id, 'approve');
  }
  const view = await api<LiveView>(event.organizer), round = view.rounds.find((round) => round.definition.kind === 'finals')!;
  const source = view.heatSubmissions!.find((submission) => submission.roundKey === round.key && submission.judgeId === view.setup.judges[0].id)!;
  const request = await command(event.organizer, { action: 'request-correction', roundKey: round.key, heatId: source.heatId, judgeId: source.judgeId, submissionId: source.id, reason: 'Synthetic pending Finals request', changes: [{ performanceId: round.definition.heats[0].songs[0].id, subjectId: round.definition.subjects[0].id, after: 'A1' }] }) as { reviewRequestId: string };
  return { ...event, round, view, request };
}

test('a submitted judge sees the outstanding request approver instead of a misleading completed message', async ({ browser }) => {
  const event = await approvedEventWithRequest();
  await command(event.head, { action: 'approve-request', reviewRequestId: event.request.reviewRequestId, requestVersion: 1 });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  const posts: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/live')) posts.push(request.postDataJSON().action); });
  try {
    await page.goto(base + event.view.judgeLinks![0].path);
    const status = page.locator('.judge-action-current');
    await expect(status).toContainText('Waiting for the organizer to approve the pending request. Your submitted scores stay locked.', { timeout: 3000 });
    await expect(status).not.toContainText('Judging is complete. No further action needed.');
    await expect(page.getByRole('button', { name: 'Submit finals', exact: true })).toHaveCount(0);
    const before = await api<LiveView>(event.tokens[0]);
    expect(before.rounds.find((round) => round.key === event.round.key)!.standings!.rows[0].average).toBe(10);
    expect(before.reviewRequests!.find((request) => request.id === event.request.reviewRequestId)!.approvals.map((approval) => approval.role)).toEqual(['head']);
    await status.screenshot({ path: 'test-results/pending-judge-390.png' });
    const other = await context.newPage();
    await other.goto(base + event.view.judgeLinks![1].path);
    await expect(other.locator('.judge-action-current')).toContainText('Judging is complete. No further action needed.');
    expect((await api<LiveView>(event.tokens[1])).reviewRequests!.some((request) => request.id === event.request.reviewRequestId)).toBe(false);
    await command(event.organizer, { action: 'approve-request', reviewRequestId: event.request.reviewRequestId, requestVersion: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(status).toContainText('Waiting for head approval. Nothing else to do yet.');
    await exact(event.head, event.round.id, 'approve');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(status).toContainText('Judging is complete. No further action needed.');
    expect(posts).toEqual([]);
  } finally { await context.close(); }
});

test('organizer pending shortcuts identify their own approval duty and change to head waiting after exact approval', async ({ browser }) => {
  const event = await approvedEventWithRequest();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  try {
    await page.goto(base + event.path);
    await page.getByRole('button', { name: '03 Results', exact: true }).click();
    const pending = page.getByRole('region', { name: 'Pending review duties', exact: true });
    await expect(pending).toContainText('Your approval needed', { timeout: 3000 });
    await pending.getByRole('button', { name: /^Review request/ }).focus(); await page.keyboard.press('Enter');
    const request = page.locator(`#review-request-${event.request.reviewRequestId}`);
    await expect(request).toBeFocused(); await expect(request).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    const response = page.waitForResponse((response) => response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'approve-request');
    await request.getByRole('button', { name: 'Approve request as organizer', exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(pending).toContainText('Waiting for head approval');
    await pending.screenshot({ path: 'test-results/pending-organizer-390.png' });
    for (const width of [360, 738, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await pending.screenshot({ path: 'test-results/pending-organizer-1440.png' });
    const view = await api<LiveView>(event.organizer);
    expect(view.rounds.find((round) => round.key === event.round.key)!.standings!.rows[0].average).toBe(10);
    expect(JSON.stringify(view)).not.toContain('PRIVATE_PENDING_STATUS');
    expect(view.reviewRequests!.find((request) => request.id === event.request.reviewRequestId)!.approvals.map((approval) => approval.role)).toEqual(['organizer']);
  } finally { await context.close(); }
});
