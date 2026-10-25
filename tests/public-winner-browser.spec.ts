import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { testEndpoint } from './test-endpoints';
import type { PublicSnapshot } from '../lib/live/publication';

test('public winner cards retain full content, link bounds, average tokens and place circles at phone and desktop widths', async ({ browser }) => {
  const receiver = testEndpoint('receiver', true), file = process.env.LOCAL_TEST_RECEIVER_STORE;
  if (!file) throw new Error('Set LOCAL_TEST_RECEIVER_STORE to the owned fictional receiver store.');
  const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex'), before = hash();
  const data = await (await fetch(receiver + '/api/public')).json() as { records: { snapshot: PublicSnapshot }[]; current: Record<string, string> };
  const context = await browser.newContext(), page = await context.newPage(), errors: string[] = [], posts: string[] = [], measurements = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  try {
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(receiver + '/');
      await expect(page.getByRole('heading', { level: 1, name: 'Celebrate the dancers. Find your results.' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const cards = page.locator('.winner-card'); expect(await cards.count()).toBeGreaterThan(0);
      for (const card of await cards.all()) {
        const target = await card.locator('.result-link').getAttribute('href'), parts = target!.split('/');
        const id = data.current[parts[2] + '/' + parts[3]], snapshot = data.records.find(record => record.snapshot.id === id)!.snapshot;
        await expect(card.locator('h3')).toHaveText(snapshot.event.name);
        await expect(card.locator('.eyebrow')).toHaveText(snapshot.competition.format + ' · ' + snapshot.competition.division);
        const winners = snapshot.stages.filter(stage => stage.kind === 'finals').flatMap(stage => stage.entrants).filter(entrant => !entrant.withdrawn && entrant.place !== null && entrant.place <= 3).sort((a, b) => a.place! - b.place! || a.number - b.number);
        const entries = card.locator('.podium li'); await expect(entries).toHaveCount(winners.length);
        for (const [index, entrant] of winners.entries()) {
          const entry = entries.nth(index), link = entry.locator('a');
          await expect(link).toHaveAttribute('href', `/results/${snapshot.id}/entrant/${entrant.id}`);
          await expect(link).toContainText(entrant.primary + (entrant.secondary ? ' & ' + entrant.secondary : ''));
          await expect(entry.locator('.place')).toHaveText(String(entrant.place));
          await expect(entry.locator('small')).toHaveText(`#${entrant.number} · ${entrant.average === null ? '—' : entrant.average.toFixed(4)}`);
        }
      }
      const metrics = await page.evaluate(() => {
        const overflow: string[] = [], circles: number[] = [], averages: number[] = [];
        for (const [index, card] of [...document.querySelectorAll('.winner-card')].entries()) {
          const bounds = card.getBoundingClientRect(), style = getComputedStyle(card);
          const left = bounds.left + parseFloat(style.paddingLeft) + 1, right = bounds.right - parseFloat(style.paddingRight) - 1;
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) if (walker.currentNode.textContent?.trim()) {
            const range = document.createRange(); range.selectNodeContents(walker.currentNode);
            if ([...range.getClientRects()].some(rect => rect.left < left - 1 || rect.right > right + 1)) overflow.push(`card ${index}: ${walker.currentNode.textContent.slice(0, 60)}`);
          }
          for (const link of card.querySelectorAll('.podium a')) {
            const rect = link.getBoundingClientRect(); if (rect.left < left - 1 || rect.right > right + 1) overflow.push(`card ${index}: link box`);
          }
          for (const place of card.querySelectorAll('.place')) circles.push(place.getBoundingClientRect().width);
          for (const small of card.querySelectorAll('.podium small')) {
            const node = small.firstChild!, token = /(?:\d+\.\d{4}|—)$/.exec(node.textContent!)!;
            const range = document.createRange(); range.setStart(node, token.index); range.setEnd(node, node.textContent!.length); averages.push(range.getClientRects().length);
          }
        }
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow, circles, averages, columns: getComputedStyle(document.querySelector('.winners-grid')!).gridTemplateColumns.split(' ').length };
      });
      measurements.push(metrics);
      if (process.env.PUBLIC_WINNER_EVIDENCE) {
        mkdirSync(process.env.PUBLIC_WINNER_EVIDENCE, { recursive: true });
        await page.screenshot({ path: `${process.env.PUBLIC_WINNER_EVIDENCE}/home-${width}.png`, fullPage: false });
        const lengths = await cards.locator('h3').allTextContents(), longest = lengths.indexOf([...lengths].sort((a, b) => b.length - a.length)[0]);
        await cards.nth(longest).screenshot({ path: `${process.env.PUBLIC_WINNER_EVIDENCE}/card-${width}.png` });
      }
    }
    if (process.env.PUBLIC_WINNER_EVIDENCE) writeFileSync(`${process.env.PUBLIC_WINNER_EVIDENCE}/measurements.json`, JSON.stringify(measurements, null, 2));
    for (const row of measurements) {
      expect(row.scrollWidth, JSON.stringify(row)).toBeLessThanOrEqual(row.width);
      expect(row.overflow).toEqual([]); expect(row.circles.every(width => Math.abs(width - 39) < 0.1)).toBe(true);
      expect(row.averages.every(lines => lines === 1)).toBe(true); expect(row.columns).toBe(row.width < 760 ? 1 : 2);
    }
    expect(hash()).toBe(before); expect(await (await fetch(receiver + '/api/public')).json()).toEqual(data);
    expect(posts).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
