import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { testEndpoint } from './test-endpoints';
import type { PublicSnapshot } from '../lib/live/publication';

type PublicData = { records: { snapshot: PublicSnapshot; releasedAt: string }[]; current: Record<string, string> };

test('public comparison previous links retain available entrant and judge scope without writes', async ({ browser }) => {
  const receiver = testEndpoint('receiver', true), store = process.env.LOCAL_TEST_RECEIVER_STORE;
  if (!store) throw new Error('Set the owned receiver store for preservation proof.');
  const hash = () => createHash('sha256').update(readFileSync(store)).digest('hex');
  const beforeHash = hash(), data = await (await fetch(receiver + '/api/public')).json() as PublicData;
  const current = data.records.find(record => Object.values(data.current).includes(record.snapshot.id) && record.snapshot.revision > 1)!.snapshot;
  const previous = data.records.filter(record => record.snapshot.eventId === current.eventId && record.snapshot.competitionId === current.competitionId && record.snapshot.revision < current.revision).sort((a, b) => b.snapshot.revision - a.snapshot.revision)[0].snapshot;
  const stage = current.stages.find(stage => stage.kind === 'finals')!, oldStage = previous.stages.find(old => old.id === stage.id)!;
  const cell = stage.marks.find(mark => oldStage.marks.some(old => old.entrantId === mark.entrantId && old.judgeId === mark.judgeId && old.songId === mark.songId && old.mark !== mark.mark))!;
  expect(Boolean(cell)).toBe(true);
  const oldMark = oldStage.marks.find(old => old.entrantId === cell.entrantId && old.judgeId === cell.judgeId && old.songId === cell.songId)!.mark;
  const entrant = oldStage.entrants.find(entry => entry.id === cell.entrantId)!, judge = oldStage.judges.find(judge => judge.id === cell.judgeId)!;
  const observe = process.env.PUBLIC_COMPARISON_OBSERVE === '1', evidence = process.env.PUBLIC_COMPARISON_EVIDENCE;
  if (evidence) mkdirSync(evidence, { recursive: true });
  const context = await browser.newContext({ timezoneId: 'America/Chicago' }), page = await context.newPage();
  const nonGets: string[] = [], errors: string[] = [], results: object[] = [];
  page.on('request', request => { if (request.method() !== 'GET') nonGets.push(request.method()); });
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const scope of ['entrant', 'judge'] as const) {
        const id = scope === 'entrant' ? entrant.id : judge.id;
        const currentPath = `/results/${current.id}/${scope}/${id}`, oldPath = `/results/${previous.id}/${scope}/${id}`;
        await page.goto(receiver + currentPath);
        const comparison = page.locator('.public-comparison');
        await comparison.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
        const link = comparison.getByRole('link', { name: `published revision ${previous.revision}`, exact: true });
        expect(await link.getAttribute('href') === (observe ? `/results/${previous.id}` : oldPath)).toBe(true);
        expect(await link.evaluate(element => {
          const range = document.createRange(); range.selectNodeContents(element);
          const parent = element.closest('p')!.getBoundingClientRect();
          return [...range.getClientRects()].every(rect => rect.left >= parent.left - 1 && rect.right <= parent.right + 1);
        })).toBe(true);
        if (evidence) await comparison.screenshot({ path: `${evidence}/comparison-${scope}-${width}.png` });
        await link.focus(); await page.keyboard.press('Enter');
        await expect.poll(() => new URL(page.url()).pathname === (observe ? `/results/${previous.id}` : oldPath)).toBe(true);
        let extraFindingActions = 0;
        if (observe) {
          if (scope === 'judge') { await page.locator('.public-supporting > summary').click(); extraFindingActions++; }
          const destination = page.locator(`a[href="${oldPath}"]`).first();
          await destination.click(); extraFindingActions++;
        }
        await expect.poll(() => new URL(page.url()).pathname === oldPath).toBe(true);
        await expect(page.getByText('You are viewing an earlier published version. Its original scores are preserved.', { exact: true })).toBeVisible();
        await expect(page.locator('.public-comparison')).toHaveCount(0);
        const scorecards = page.locator('.public-scorecards');
        for (const card of await scorecards.all()) await expect(card).toHaveAttribute('open');
        if (scope === 'judge') {
          for (const card of await scorecards.all()) {
            await expect(card.locator(':scope > details')).toHaveCount(1);
            await expect(card.getByRole('link', { name: judge.name, exact: true })).toBeVisible();
          }
        } else {
          const ids = await page.locator('main table tbody a').evaluateAll(links => links.map(link => (link as HTMLAnchorElement).pathname.split('/').at(-1)));
          expect(ids.length > 0 && ids.every(id => id === entrant.id)).toBe(true);
        }
        expect((await scorecards.allTextContents()).join(' ')).toContain(': ' + oldMark);
        expect((await page.locator('main table').allTextContents()).join(' ')).toContain(entrant.average!.toFixed(4));
        const bounds = await page.evaluate(() => ({ pageFits: document.documentElement.scrollWidth <= innerWidth,
          linksFit: [...document.querySelectorAll('main a')].filter(link => link.getClientRects().length).every(link => [...link.getClientRects()].every(rect => rect.left >= 0 && rect.right <= innerWidth)) }));
        expect(bounds.pageFits && bounds.linksFit).toBe(true);
        if (evidence) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/${scope}-${width}.png`, fullPage: true }); }
        results.push({ width, scope, extraFindingActions, originalMarkPresent: true, originalAveragePresent: true, ...bounds });
      }
      if (!observe) {
        await page.goto(receiver + `/results/${current.id}/entrant/absent-couple`);
        await page.locator('.public-comparison > summary').click();
        const link = page.locator('.public-comparison').getByRole('link', { name: `published revision ${previous.revision}`, exact: true });
        expect(await link.getAttribute('href') === `/results/${previous.id}`).toBe(true);
        await link.click(); expect(new URL(page.url()).pathname === `/results/${previous.id}`).toBe(true);
        await expect(page.getByRole('heading', { name: 'Final places', exact: true })).toBeVisible();
      }
    }
    expect(nonGets).toEqual([]); expect(errors).toEqual([]); expect(hash() === beforeHash).toBe(true);
    const after = await (await fetch(receiver + '/api/public')).json(); expect(JSON.stringify(after) === JSON.stringify(data)).toBe(true);
    expect(JSON.stringify(after)).not.toMatch(/PUBLICATION_PRIVATE_NOTE_SENTINEL|PRIVATE_REASON_NEVER_RENDER|UNRELEASED_SECRET/);
    if (evidence) writeFileSync(`${evidence}/result.json`, JSON.stringify({ observe, results, nonGets, errors, publicStoreBytesUnchanged: true, publicDataUnchanged: true }, null, 2));
  } finally { await context.close(); }
});
