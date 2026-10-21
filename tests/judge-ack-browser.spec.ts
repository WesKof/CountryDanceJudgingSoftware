import { test, expect } from '@playwright/test';
import { api, base, command } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import { cellKey, type LiveView } from '../lib/live/types';

test('an empty or incomplete HTTP 200 save response cannot discard a private pending edit or count as acknowledgement', async ({ browser }) => {
  const event = await createStage(limitedStage(1, 4));
  await command(event.organizer, { action: 'enable-auto-stages' });
  const view = await api<LiveView>(event.organizer), round = view.rounds[0], heat = round.definition.heats[0];
  const subject = round.definition.subjects.find((entry) => entry.id === heat.subjectIds[0])!;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  let fail = true, acknowledgement = 'empty';
  const requests: string[] = [], errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/live', async (route) => {
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'save-cell') {
      const input = route.request().postDataJSON(); requests.push(input.requestId);
      if (fail) {
        const cell = { revision: input.baseRevision + 1, mark: input.mark, note: input.note, mutationId: input.requestId };
        const response = acknowledgement === 'empty' ? {} : { roundKey: input.roundKey, performanceId: input.performanceId, subjectId: acknowledgement === 'different-score' ? 'different-subject' : input.subjectId, cell: acknowledgement === 'partial' ? { revision: cell.revision, mark: cell.mark, note: cell.note } : cell };
        await route.fulfill({ status: 200, json: response }); return;
      }
    }
    await route.continue();
  });
  try {
    await page.goto(base + view.judgeLinks![0].path);
    const row = page.locator(`.phone-row[data-bib="${subject.number}"]`);
    await row.getByRole('button', { name: /^Note/ }).click();
    await row.getByRole('textbox').fill('PRIVATE_UNACKNOWLEDGED_EDIT');
    await row.getByRole('button', { name: `Bib ${subject.number}: Yes`, exact: true }).click();
    await expect(page.locator('.pending-panel > summary')).toContainText('Waiting to reconnect', { timeout: 5000 });
    await page.locator('.pending-panel > summary').click();
    for (const invalid of ['empty', 'partial', 'different-score']) {
      acknowledgement = invalid;
      const response = page.waitForResponse((result) => result.request().method() === 'POST' && result.status() === 200);
      await page.getByRole('button', { name: 'Retry pending saves', exact: true }).click(); await response;
      await expect(page.locator('.pending-panel')).toBeVisible();
      const cache = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('country-dance-live:pending:')).map(([, value]) => value).join(''));
      expect(cache).toContain('PRIVATE_UNACKNOWLEDGED_EDIT');
      expect((await api<LiveView>(event.tokens[0])).ballots[0].cells[cellKey(heat.songs[0].id, subject.id)]?.mark ?? '').toBe('');
    }
    fail = false;
    await page.getByRole('button', { name: 'Retry pending saves', exact: true }).click();
    await expect(page.locator('.pending-panel')).toHaveCount(0, { timeout: 10000 });
    const saved = await api<LiveView>(event.tokens[0]);
    expect(saved.ballots[0].cells[cellKey(heat.songs[0].id, subject.id)]).toMatchObject({ mark: 'Yes', note: 'PRIVATE_UNACKNOWLEDGED_EDIT' });
    expect(new Set(requests).size).toBe(1);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
