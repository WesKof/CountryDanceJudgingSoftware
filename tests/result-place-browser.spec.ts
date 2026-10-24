import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { api, base, command, save } from './stage-helpers';
import { createStage, exact, limitedStage } from './publication-helpers';
import { stageFixture } from './stage-fixture';
import { liveFixture } from './live-fixture';
import type { LiveSetup, LiveView } from '../lib/live/types';

async function submit(token: string) {
  const v = await api<LiveView>(token);
  await api(token, { action: 'submit-stage', requestId: crypto.randomUUID(), blockId: v.context.blockId, acknowledged: true, expectedVersion: v.version, ballotVersions: Object.fromEntries(v.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(v.rounds.map((r) => [r.key, r.version])) });
}
async function scored(setup: LiveSetup, mark: (i: number) => 'Yes' | 'No') {
  const event = await createStage(setup); await command(event.organizer, { action: 'enable-auto-stages' });
  const view = await api<LiveView>(event.organizer);
  for (const [j, token] of event.tokens.entries()) {
    for (const r of view.rounds) for (const [i, id] of r.definition.heats[0].subjectIds.entries()) await save(token, r, r.definition.heats[0].songs[0].id, id, mark(i), j === 0 && i === 0 ? 'PLACE_PRIVATE_NOTE' : '');
    await submit(token);
  }
  return { ...event, view: await api<LiveView>(event.organizer) };
}
async function layout(page: Page, sheet: Locator, name: string) {
  const directory = process.env.RESULT_PLACE_EVIDENCE;
  for (const width of [360, 390, 738, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const cells = sheet.locator('.result-group tbody tr > td:first-child');
    const fragments = await cells.evaluateAll((elements) => elements.flatMap((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), words: { word: string; pieces: number; outside: boolean; cellWidth: number }[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) for (const match of node.textContent!.matchAll(/[A-Za-z]+/g)) {
        const range = document.createRange(); range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].length);
        const cell = element.getBoundingClientRect(), word = range.getBoundingClientRect();
        words.push({ word: match[0], pieces: range.getClientRects().length, outside: word.left < cell.left - 0.5 || word.right > cell.right + 0.5, cellWidth: cell.width });
      }
      return words;
    }));
    expect(fragments.filter((word) => word.pieces !== 1 || word.outside), `${name} ${width}px: qualifier words must stay whole inside their Place cell`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const row of await sheet.locator('.result-group tbody tr').all()) {
      await expect(row.locator('td').first()).toHaveCSS('display', 'table-cell');
      expect(await row.locator('.result-place-number').evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length; })).toBe(1);
      expect(await row.locator('td').nth(1).evaluate((element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
      await expect(row.locator('td').nth(2)).toHaveText(/^(10\.0000|4\.5000|0\.0000)$/);
      expect(await row.locator('td').nth(2).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    if (directory && [390, 1440].includes(width)) {
      mkdirSync(directory, { recursive: true }); await sheet.locator('.result-group').first().evaluate((element) => element.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `${directory}/result-place-${name}-${width}.png`, fullPage: false });
    }
  }
}
async function names(sheet: Locator, round: import('../lib/live/types').RoundView) {
  for (const expected of round.standings!.rows) {
    const row = sheet.locator('.result-group tbody tr').filter({ hasText: `#${expected.number} ${expected.primary}` });
    await expect(row.locator('td').nth(1).locator('strong')).toHaveText(`#${expected.number} ${expected.primary}`);
    await expect(row.locator('td').nth(1).locator('small')).toHaveText(expected.secondary);
  }
}
function longNames(setup: LiveSetup) {
  for (const round of setup.rounds) for (const subject of round.subjects) {
    subject.primary = `Alexandria-Rose Montgomery-Wellington ${subject.number}`;
    if (subject.secondary) subject.secondary = `Maximiliano de la Cruz-Santiago ${subject.number}`;
  }
  return setup;
}

test('numeric/shared Prelim places and pending/decided Finals qualifiers stay readable with long couple names', async ({ browser }) => {
  const event = await scored(longNames(limitedStage(1, 12)), (i) => i < 10 ? 'Yes' : 'No');
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage();
  const writes: string[] = []; page.on('request', (r) => { if (r.method() === 'POST') writes.push(r.url()); });
  try {
    await page.goto(base + event.view.judgeLinks![2].path);
    const pre = event.view.rounds[0], sheet = page.locator('#round-result-' + pre.id);
    await expect(sheet).toBeVisible(); await expect(sheet.getByRole('cell', { name: '11 · equal average', exact: true })).toHaveCount(2);
    await names(sheet, pre);
    await layout(page, sheet, 'prelims');
    expect((await api<LiveView>(event.organizer)).version).toBe(event.view.version);
    const selected = pre.definition.subjects.slice(0, 2).map((s) => s.id);
    for (const token of event.tokens) {
      const current = (await api<LiveView>(token)).rounds[0];
      await command(token, { action: 'vote', roundKey: current.key, roundVersion: current.version, fingerprint: current.standings!.fingerprint, tieKey: current.standings!.advancementTies![0].key, selected });
    }
    await exact(event.head, pre.id, 'approve');
    let view = await api<LiveView>(event.organizer); const retainedPrelim = structuredClone(view.rounds.find((r) => r.id === pre.id)!);
    const final = view.rounds.find((r) => r.definition.kind === 'finals')!;
    for (const token of event.tokens) { for (const id of final.definition.heats[0].subjectIds) await save(token, final, final.definition.heats[0].songs[0].id, id, 'A1'); await submit(token); }
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const finals = page.locator('#round-result-' + final.id);
    await expect(finals.getByRole('cell', { name: '1 · tie pending', exact: true })).toHaveCount(2);
    await expect(finals.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toBeDisabled();
    view = await api<LiveView>(event.organizer); const pending = structuredClone(view.rounds.find((r) => r.id === final.id)!);
    await names(finals, pending);
    await layout(page, finals, 'pending-finals');
    expect((await api<LiveView>(event.organizer)).rounds.find((r) => r.id === final.id)).toEqual(pending);
    await exact(event.head, final.id, 'tie', { tieKey: pending.standings!.ties[0].key, order: [...selected].reverse(), shared: false, explanation: 'Synthetic exact Finals decision' });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(finals.getByRole('cell', { name: '1 · head decided', exact: true })).toBeVisible(); await expect(finals.getByRole('cell', { name: '2 · head decided', exact: true })).toBeVisible();
    await expect(finals.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toBeEnabled();
    await layout(page, finals, 'decided-finals');
    view = await api<LiveView>(event.organizer);
    expect(view.rounds.find((r) => r.id === final.id)!.standings!.rows.map((r) => [r.place, r.average])).toEqual([[1, 4.5], [2, 4.5]]);
    expect(view.rounds.find((r) => r.id === pre.id)).toEqual(retainedPrelim);
    expect(writes).toEqual([]); expect(await finals.innerText()).not.toContain('PLACE_PRIVATE_NOTE');
  } finally { await context.close(); }
});

test('legacy organizer result columns preserve the same readable place qualifiers without changing saved results', async ({ browser }) => {
  const setup = longNames(liveFixture(4)), competition = setup.competitions[0];
  setup.competitions = [competition]; setup.rounds = setup.rounds.filter((r) => r.competitionId === competition.id);
  setup.blocks = setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)) }));
  for (const r of setup.rounds) r.judgeIds = setup.judges.map((j) => j.id);
  const event = await createStage(setup); await command(event.organizer, { action: 'open-block', blockId: setup.blocks[0].id });
  let view = await api<LiveView>(event.organizer); const round = view.rounds[0], songs = round.definition.heats.flatMap((h) => h.songs);
  for (const [i, song] of songs.entries()) {
    const heat = round.definition.heats.find((h) => h.songs.some((s) => s.id === song.id))!;
    for (const token of event.tokens) for (const id of heat.subjectIds) await save(token, round, song.id, id, 'Yes');
    if (i < songs.length - 1) await command(event.organizer, { action: 'next' });
  }
  await command(event.organizer, { action: 'discussion' });
  for (const token of event.tokens) { const own = await api<LiveView>(token); await command(token, { action: 'submit', blockId: setup.blocks[0].id, ballotVersions: Object.fromEntries(own.ballots.map((b) => [b.roundKey, b.version])) }); }
  view = await api<LiveView>(event.organizer);
  const context = await browser.newContext(), page = await context.newPage(), writes: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST') writes.push(r.url()); });
  try {
    await page.goto(base + event.path); await page.getByRole('button', { name: '03 Results', exact: true }).click();
    const sheet = page.locator('#round-result-' + round.id); await expect(sheet.getByRole('cell', { name: '1 · tie pending', exact: true })).toHaveCount(4);
    await names(sheet, view.rounds[0]);
    await layout(page, sheet, 'legacy-organizer');
    const after = await api<LiveView>(event.organizer); expect(after.version).toBe(view.version); expect(after.rounds).toEqual(view.rounds); expect(writes).toEqual([]);
  } finally { await context.close(); }
});

test('J&J Lead and Follow shared-place groups retain full names, qualifiers and exact values at phone/tablet/desktop widths', async ({ browser }) => {
  const setup = stageFixture(), competition = setup.competitions.find((c) => c.format === 'Jack & Jill')!;
  setup.competitions = [competition]; setup.rounds = setup.rounds.filter((r) => r.competitionId === competition.id); setup.blocks = setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)) }));
  const event = await scored(longNames(setup), () => 'Yes'), context = await browser.newContext(), page = await context.newPage();
  const writes: string[] = []; page.on('request', (r) => { if (r.method() === 'POST') writes.push(r.url()); });
  try {
    await page.goto(base + event.view.judgeLinks![2].path); const sheet = page.locator('#round-result-' + event.view.rounds[0].id);
    await expect(sheet.locator('.result-group > h3')).toHaveText(['Leads', 'Follows']); await expect(sheet.getByRole('cell', { name: '1 · equal average', exact: true })).toHaveCount(6);
    await names(sheet, event.view.rounds[0]);
    await layout(page, sheet, 'jack-jill');
    const after = await api<LiveView>(event.organizer); expect(after.version).toBe(event.view.version); expect(after.rounds).toEqual(event.view.rounds); expect(writes).toEqual([]);
  } finally { await context.close(); }
});
