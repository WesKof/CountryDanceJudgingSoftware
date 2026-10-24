import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { api, base, command, save } from './stage-helpers';
import { createStage, exact } from './publication-helpers';
import { stageFixture } from './stage-fixture';
import type { LiveView } from '../lib/live/types';

const evidence = process.env.FINALS_GUIDANCE_EVIDENCE;
async function screenshot(page: Page, name: string) {
  if (!evidence) return;
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
}
async function drawStage() {
  const setup = stageFixture();
  setup.competitions = setup.competitions.filter((c) => c.format === 'Jack & Jill');
  setup.rounds = setup.rounds.filter((r) => setup.competitions.some((c) => c.id === r.competitionId));
  setup.blocks = setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)) }));
  const event = await createStage(setup);
  await command(event.organizer, { action: 'enable-auto-stages' });
  const view = await api<LiveView>(event.organizer);
  for (const token of event.tokens) {
    for (const round of view.rounds) for (const [i, subject] of round.definition.subjects.entries()) {
      await save(token, round, round.definition.heats[0].songs[0].id, subject.id, i % 3 === 0 ? 'Yes' : 'A1', 'PRIVATE_FINALS_GUIDANCE');
    }
    const own = await api<LiveView>(token);
    await api(token, { action: 'submit-stage', blockId: own.context.blockId, acknowledged: true, expectedVersion: own.version, requestId: crypto.randomUUID(), ballotVersions: Object.fromEntries(own.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(own.rounds.map((r) => [r.key, r.version])) });
  }
  for (const round of view.rounds) await exact(event.head, round.id, 'approve');
  const before = await api<LiveView>(event.organizer);
  expect(before.rounds).toHaveLength(2);
  const finals = before.setup.rounds.filter((r) => r.kind === 'finals');
  for (const f of finals) {
    const pre = setup.rounds.find((r) => r.id === f.prelimRoundId)!;
    expect(f.finalistIds).toEqual([pre.subjects[0].id, pre.subjects[3].id]);
    expect(f.subjects).toEqual([]);
  }
  return { ...event, before, finals };
}
function card(page: Page, division: string) { return page.getByLabel(`Jack & Jill · ${division} · Finals pairing`, { exact: true }); }
const beginner = 'Beginner / Intermediate', advanced = 'Advanced';

test('a complete draw names the other unfinished division and keyboard shortcut reveals its exact pairing', async ({ browser }) => {
  const event = await drawStage(), context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  const judgeBallots = await Promise.all(event.tokens.map(async (token) => (await api<LiveView>(token)).ballots));
  const posts: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/live')) posts.push(r.postDataJSON().action); });
  try {
    await page.goto(base + event.path); await page.getByRole('button', { name: '02 Score', exact: true }).click();
    const first = card(page, beginner), other = card(page, advanced);
    await first.getByRole('combobox').selectOption(event.finals[0].finalistIds[1]);
    await expect(first.getByRole('button', { name: 'Save Finals pairings', exact: true })).toBeDisabled();
    await expect(first.getByRole('status')).toContainText('Advanced');
    await expect(first.getByRole('button', { name: 'Save Finals pairings', exact: true })).toHaveAccessibleDescription(/Advanced/);
    for (const width of [360, 390, 738, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 390 || width === 1440) await screenshot(page, `finals-blocker-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const shortcut = first.getByRole('button', { name: /Complete Advanced draw/ });
    await other.locator(':scope > summary').click(); await expect(other.getByRole('combobox')).toBeHidden();
    await shortcut.focus(); await page.keyboard.press('Enter');
    await expect(other.getByRole('combobox')).toBeFocused();
    await expect(other.getByRole('status')).toContainText('#201 Entrant 1-1 1');
    await expect(other.getByRole('button', { name: 'Choose missing follow', exact: true })).toHaveCount(0);
    await other.getByRole('combobox').selectOption(event.finals[1].finalistIds[1]);
    const ready = first.getByRole('button', { name: 'Save Finals pairings', exact: true });
    await expect(ready).toBeEnabled();
    await page.getByRole('button', { name: '03 Results', exact: true }).click();
    await page.getByRole('button', { name: '02 Score', exact: true }).click();
    await expect(first.getByRole('combobox')).toHaveValue(event.finals[0].finalistIds[1]);
    await expect(other.getByRole('combobox')).toHaveValue(event.finals[1].finalistIds[1]);
    expect(posts).toEqual([]);
    const response = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().postDataJSON()?.action === 'setup');
    await ready.click(); expect((await response).status()).toBe(200);
    const after = await api<LiveView>(event.organizer);
    expect(posts).toEqual(['setup']);
    const opened = after.rounds.filter((r) => r.definition.kind === 'finals'); expect(opened).toHaveLength(2);
    for (const [i, round] of opened.entries()) {
      expect(round.definition.subjects[0].members).toEqual(event.finals[i].finalistIds);
      expect(round.definition.heats[0].subjectIds).toEqual([round.definition.subjects[0].id]);
    }
    expect(after.heatSubmissions).toEqual(event.before.heatSubmissions);
    expect(after.rounds.filter((r) => r.definition.kind === 'prelims')).toEqual(event.before.rounds);
    for (const [i, token] of event.tokens.entries()) {
      const current = await api<LiveView>(token);
      expect(current.ballots.filter((b) => judgeBallots[i].some((old) => old.roundKey === b.roundKey))).toEqual(judgeBallots[i]);
    }
    const frozen = structuredClone(after.setup); frozen.rounds.find((r) => r.id === opened[0].id)!.subjects[0].secondary = 'Changed frozen partner';
    await command(event.organizer, { action: 'setup', setup: frozen, automaticStages: true }, 423);
  } finally { await context.close(); }
});

test('stale whole-draw edits stay visible and disabled until explicit discard and current-version recovery', async ({ browser }) => {
  const event = await drawStage(), context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto(base + event.path); await page.getByRole('button', { name: '02 Score', exact: true }).click();
    const first = card(page, beginner), other = card(page, advanced);
    await first.getByRole('combobox').selectOption(event.finals[0].finalistIds[1]);
    await other.getByRole('combobox').selectOption(event.finals[1].finalistIds[1]);
    await expect(first.getByRole('button', { name: 'Save Finals pairings', exact: true })).toBeEnabled();
    await command(event.organizer, { action: 'setup', setup: structuredClone(event.before.setup), automaticStages: true });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(first.getByRole('status')).toContainText('event changed while you edited');
    for (const [i, section] of [first, other].entries()) {
      await expect(section.getByRole('combobox')).toHaveValue(event.finals[i].finalistIds[1]);
      await expect(section.getByRole('combobox')).toBeDisabled();
      await expect(section.getByRole('button', { name: 'Save Finals pairings', exact: true })).toBeDisabled();
      await expect(section.getByRole('button', { name: /Complete .* draw|Choose missing follow|Review .* setup/ })).toHaveCount(0);
    }
    await first.getByRole('button', { name: 'Discard pairing edits', exact: true }).click();
    await expect(first.getByRole('combobox')).toHaveValue(''); await expect(other.getByRole('combobox')).toHaveValue('');
    await expect(first.getByRole('combobox')).toBeEnabled();
    await first.getByRole('combobox').selectOption(event.finals[0].finalistIds[1]);
    await other.getByRole('combobox').selectOption(event.finals[1].finalistIds[1]);
    const response = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().postDataJSON()?.action === 'setup');
    await first.getByRole('button', { name: 'Save Finals pairings', exact: true }).click(); expect((await response).status()).toBe(200);
    const current = await api<LiveView>(event.organizer);
    expect(current.rounds.filter((r) => r.definition.kind === 'finals')).toHaveLength(2);
    expect(current.heatSubmissions).toEqual(event.before.heatSubmissions);
  } finally { await context.close(); }
});

test('another preparation failure retains the actual reason and keyboard route to the right setup section', async ({ browser }) => {
  const event = await drawStage(), incomplete = structuredClone(event.before.setup);
  incomplete.rounds.find((r) => r.id === event.finals[1].id)!.judgeIds = incomplete.judges.slice(0, 2).map((j) => j.id);
  await command(event.organizer, { action: 'setup', setup: incomplete, automaticStages: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  try {
    await page.goto(base + event.path); await page.getByRole('button', { name: '02 Score', exact: true }).click();
    const first = card(page, beginner), other = card(page, advanced);
    await first.getByRole('combobox').selectOption(event.finals[0].finalistIds[1]);
    await other.getByRole('combobox').selectOption(event.finals[1].finalistIds[1]);
    await expect(first.getByRole('status')).toHaveText('Advanced setup needs attention before saving.');
    await expect(first.getByRole('button', { name: 'Save Finals pairings', exact: true })).toBeDisabled();
    await first.getByText('Preparation issue', { exact: true }).click();
    await expect(first.getByText(/Include the event head judge among this stage’s required judges/)).toBeVisible();
    await screenshot(page, 'finals-preparation-390');
    const review = first.getByRole('button', { name: 'Review Advanced setup', exact: true });
    await review.focus(); await page.keyboard.press('Enter');
    const judges = page.locator('details[data-section="Required judges"]');
    await expect(judges.locator(':scope > summary')).toBeFocused();
    await expect(judges.getByRole('checkbox', { name: /Synthetic head/ })).not.toBeChecked();
    await page.getByRole('button', { name: '02 Score', exact: true }).click();
    await expect(first.getByRole('combobox')).toHaveValue(event.finals[0].finalistIds[1]);
    await expect(other.getByRole('combobox')).toHaveValue(event.finals[1].finalistIds[1]);
    const after = await api<LiveView>(event.organizer);
    expect(after.rounds).toEqual(event.before.rounds); expect(after.heatSubmissions).toEqual(event.before.heatSubmissions);
    expect(after.setup.rounds.filter((r) => r.kind === 'finals').every((r) => !r.subjects.length)).toBe(true);
  } finally { await context.close(); }
});
