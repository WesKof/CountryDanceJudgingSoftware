import { test, expect } from '@playwright/test';
import { liveFixture } from './live-fixture';
import { createStage } from './publication-helpers';
import { api, base } from './stage-helpers';
import type { LiveView } from '../lib/live/types';

test('legacy setup distinguishes manually selected finalists from head-approved advancement', async ({ browser }) => {
  const setup = liveFixture(2), prelim = setup.rounds[0], finals = setup.rounds[1];
  finals.finalistCount = 2;
  finals.finalistIds = prelim.subjects.map((s) => s.id);
  finals.subjects = structuredClone(prelim.subjects);
  finals.heats[0].subjectIds = finals.subjects.map((s) => s.id);
  const { organizer, path } = await createStage(setup);
  const before = await api<LiveView>(organizer);
  expect(before.rounds).toHaveLength(0);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  await page.goto(base + path);
  await page.getByLabel('Go to section').selectOption('Round setup');
  const summary = page.locator('details[data-section="Finalists & pairings"] > summary');
  await expect(summary).toContainText('Finalists selected manually');
  await expect(summary).not.toContainText('Advancement approved');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/usability-review-legacy-390.png', fullPage: false });
  expect((await api<LiveView>(organizer)).version).toBe(before.version);
  await context.close();
});
