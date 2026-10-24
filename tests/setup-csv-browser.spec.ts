import { test, expect } from '@playwright/test';
import { api, base } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import { stageFixture } from './stage-fixture';
import { expandSetup, selectSetupRound } from './setup-browser-helpers';
import type { LiveView } from '../lib/live/types';

for (const fixture of [
  { name: 'header-only roster', csv: 'Number,Lead,Follow', error: 'Add at least one entrant below the CSV header.', jj: false },
  { name: 'extra Strictly roster column', csv: 'Number,Lead,Follow\n901,First,Second,Unexpected', error: 'CSV row 2 needs exactly 3 columns. Put names containing commas in double quotes.', jj: false },
  { name: 'extra J&J roster column', csv: 'Number,Name,Role\n901,First,Lead,Unexpected', error: 'CSV row 2 needs exactly 3 columns. Put names containing commas in double quotes.', jj: true },
]) {
  test(`rejects ${fixture.name} before confirming replacement and preserves the existing setup`, async ({ browser }) => {
    const setup = fixture.jj ? stageFixture(undefined, 3) : limitedStage(1, 4);
    const round = setup.rounds.find((round) => round.kind === 'prelims' && (!fixture.jj || setup.competitions.find((competition) => competition.id === round.competitionId)?.format === 'Jack & Jill'))!;
    const event = await createStage(setup), before = await api<LiveView>(event.organizer);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
    let dialogs = 0;
    page.on('dialog', async (dialog) => { dialogs++; await dialog.accept(); });
    try {
      await page.goto(base + event.path);
      await expandSetup(page); await selectSetupRound(page, setup, round.id); await expandSetup(page);
      const csv = page.getByLabel(fixture.jj ? 'Number,Name,Role' : 'Number,Lead,Follow', { exact: true });
      await csv.fill(fixture.csv);
      await page.getByRole('button', { name: 'Replace unopened roster', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText(fixture.error, { timeout: 3000 });
      expect(dialogs).toBe(0);
      await expect(csv).toHaveValue(fixture.csv);
      await expect(page.getByLabel(`Name for bib ${round.subjects[0].number}`, { exact: true })).toHaveValue(round.subjects[0].primary);
      await expect(page.locator('.setup-toolbar')).toHaveCount(0);
      expect((await api<LiveView>(event.organizer)).setup).toEqual(before.setup);
    } finally { await context.close(); }
  });
}

test('rejects extra judge columns without replacing names, panel assignments or head selection', async ({ browser }) => {
  const event = await createStage(limitedStage(1, 4)), before = await api<LiveView>(event.organizer);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  let dialogs = 0;
  page.on('dialog', async (dialog) => { dialogs++; await dialog.accept(); });
  try {
    await page.goto(base + event.path); await expandSetup(page);
    const csv = page.getByLabel('Judge CSV · Name,ParticipantId', { exact: true });
    const input = 'Name,ParticipantId\nFirst,distinct-first,Unexpected\nSecond,distinct-second';
    await csv.fill(input); await page.getByRole('button', { name: 'Validate judge import', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('CSV row 2 needs exactly 2 columns. Put names containing commas in double quotes.', { timeout: 3000 });
    expect(dialogs).toBe(0); await expect(csv).toHaveValue(input);
    await expect(page.getByLabel('Event head judge', { exact: true })).toHaveValue(before.setup.headJudgeId);
    await expect(page.locator('.setup-toolbar')).toHaveCount(0);
    expect((await api<LiveView>(event.organizer)).setup).toEqual(before.setup);
  } finally { await context.close(); }
});

test('quoted commas and multiline names still import through explicit replacement and Save setup', async ({ browser }) => {
  const event = await createStage(limitedStage(1, 4)), before = await api<LiveView>(event.organizer);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  try {
    await page.goto(base + event.path); await expandSetup(page);
    await page.getByLabel('Number,Lead,Follow', { exact: true }).fill('Number,Lead,Follow\n901,"Last, First","Partner\nName"\n902,Other,Partner');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: 'Replace unopened roster', exact: true }).click();
    await expect(page.getByLabel('Name for bib 101', { exact: true })).toHaveValue(before.setup.rounds[0].subjects[0].primary);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Replace unopened roster', exact: true }).click();
    await expect(page.getByLabel('Name for bib 901', { exact: true })).toHaveValue('Last, First');
    expect((await api<LiveView>(event.organizer)).setup).toEqual(before.setup);
    await page.getByRole('button', { name: 'Save setup', exact: true }).click();
    await expect(page.locator('.setup-toolbar')).toHaveCount(0);
    const saved = await api<LiveView>(event.organizer), subjects = saved.setup.rounds[0].subjects;
    expect(subjects.map((subject) => [subject.number, subject.primary, subject.secondary])).toEqual([[901, 'Last, First', 'Partner\nName'], [902, 'Other', 'Partner']]);
    expect(saved.setup.rounds[0].heats[0].subjectIds).toEqual(subjects.map((subject) => subject.id));
    await page.reload(); await expandSetup(page);
    await expect(page.getByLabel('Name for bib 901', { exact: true })).toHaveValue('Last, First');
  } finally { await context.close(); }
});
