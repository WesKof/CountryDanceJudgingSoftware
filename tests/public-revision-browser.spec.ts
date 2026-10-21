import { test, expect } from '@playwright/test';
import { api, base, command } from './stage-helpers';
import { createStage, limitedStage, finish, owner, receiver, localKey } from './publication-helpers';
import { openResultManagement } from './setup-browser-helpers';
import type { LiveView } from '../lib/live/types';
import type { PublicSnapshot } from '../lib/live/publication';

type PublicData = { records: { snapshot: PublicSnapshot }[] };

test('published correction requires both roles and renewed release while the original public version stays intact', async ({ browser }) => {
  const setup = limitedStage(1, 4);
  setup.name = 'Synthetic published correction rehearsal';
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
    await site.getByRole('button', { name: 'Approve & publish results', exact: true }).click();
    await expect(site.getByRole('heading', { name: 'Results published', exact: true })).toBeVisible();
    await site.getByRole('link', { name: 'View published results', exact: true }).click();
    await expect(site.getByRole('cell', { name: '6.3333', exact: true })).toBeVisible();
    await expect(site.locator('.public-scorecards').first()).not.toHaveAttribute('open');
    await site.locator('.revision > details > summary').click();
    await site.getByRole('link', { name: 'Revision 1', exact: true }).click();
    await expect(site.getByText('You are viewing an earlier published version. Its original scores are preserved.', { exact: true })).toBeVisible();
    await expect(site.getByRole('cell', { name: '4.5000', exact: true })).toBeVisible();
    await site.getByRole('link', { name: 'Current revision', exact: true }).click();
    await expect(site.getByRole('cell', { name: '6.3333', exact: true })).toBeVisible();
    for (const width of [390, 1440]) {
      await site.setViewportSize({ width, height: 900 });
      expect(await site.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await site.screenshot({ path: `test-results/public-corrected-${width}.png`, fullPage: false });
    }
    const after = await (await fetch(receiver + '/api/public')).json() as PublicData;
    expect(after.records.find((r) => r.snapshot.id === original.id)!.snapshot).toEqual(originalPublic!.snapshot);
    const backup = await command(event.organizer, { action: 'backup' }) as { history: { heatSubmissions: { id: string }[] } };
    expect(backup.history.heatSubmissions.some((s) => s.id === source.id)).toBe(true);
    expect(JSON.stringify(after)).not.toContain('PUBLICATION_PRIVATE_NOTE_SENTINEL');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
