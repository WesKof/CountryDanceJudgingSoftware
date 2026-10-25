import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { api, base, command, nonce } from './stage-helpers';
import { limitedStage } from './publication-helpers';
import { selectSetupRound } from './setup-browser-helpers';
import { setupTasks } from '../lib/live/setup-guidance';
import type { LiveView } from '../lib/live/types';

const evidenceDirectory = process.env.PRELIMS_ROUTING_EVIDENCE;
const roleAttestation = 'I confirm that the organizer and each judge are distinct people with unique participant identifiers.';
const scenarios = ['later assignment', 'saved role prerequisite', 'draft role prerequisite', 'complete draft fallback'] as const;

async function preparation(sharedRole: boolean) {
  const setup = limitedStage(2, 4), later = setup.rounds.filter(round => round.kind === 'prelims')[1];
  setup.name = 'Synthetic Prelims preparation routing';
  const unassigned = later.heats[0].subjectIds.shift()!;
  if (sharedRole) setup.separationAttested = false;
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: setup.name, venue: '', date: '' }), organizer = created.path.split('/').at(-1)!;
  await command(organizer, { action: 'setup', setup, automaticStages: true });
  const view = await api<LiveView>(organizer); expect(view.rounds).toHaveLength(0); expect(view.context.automaticStages).toBe(true);
  return { organizer, path: created.path, view, later, unassigned };
}
async function backup(token: string) {
  const value = await api<Record<string, unknown>>(token, { action: 'backup', includeNotes: true, requestId: crypto.randomUUID() });
  delete value.exportedAt;
  expect(value.includesPrivateNotes).toBe(true);
  return value;
}
async function openSection(page: Page, name: string) {
  const details = page.locator('#setup-saved-details');
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  await page.getByLabel('Go to section', { exact: true }).selectOption(name);
}
async function routeEvidence(page: Page, section: string, name: string) {
  const target = page.locator(`details[data-section="${section}"]`), summary = target.locator(':scope > summary');
  await expect(target).toHaveAttribute('open'); await expect(summary).toBeFocused();
  const bounds = await summary.boundingBox(), viewport = page.viewportSize()!, toolbar = await page.locator('.setup-toolbar').boundingBox();
  const ancestors = await summary.evaluate(element => {
    const values: { section: string; open: boolean }[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) values.push({ section: parent.dataset.section ?? parent.id, open: parent.open });
    const range = document.createRange(); range.selectNodeContents(element); const box = element.getBoundingClientRect();
    return { values, textWithinSummary: [...range.getClientRects()].every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1) };
  });
  const measured = { bounds, toolbar, viewport, ...ancestors, noHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth) };
  if (evidenceDirectory) {
    mkdirSync(evidenceDirectory, { recursive: true }); writeFileSync(join(evidenceDirectory, name + '-focus.json'), JSON.stringify(measured, null, 2));
    await page.screenshot({ path: join(evidenceDirectory, name + '-focus.png'), fullPage: false });
  }
  expect(ancestors.values.every(value => value.open)).toBe(true); expect(ancestors.values.some(value => value.section === 'setup-saved-details')).toBe(true);
  expect(ancestors.textWithinSummary).toBe(true); expect(measured.noHorizontalOverflow).toBe(true);
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  expect(bounds!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height - 1);
  return measured;
}

for (const width of [390, 1440]) for (const scenario of scenarios) test(`Prelims preparation routing ${scenario} at ${width}`, async ({ browser }) => {
  const fixture = await preparation(scenario === 'saved role prerequisite'), originalBackup = await backup(fixture.organizer), draft = structuredClone(fixture.view.setup);
  const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage(), posts: string[] = [];
  let documents = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/live')) posts.push(request.postDataJSON()?.action); if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++; });
  try {
    await page.goto(base + fixture.path); await page.getByRole('button', { name: '01 Set up', exact: true }).click(); documents = 0;
    if (scenario !== 'later assignment') await selectSetupRound(page, fixture.view.setup, fixture.later.id);
    await openSection(page, 'Event details'); draft.venue = 'Retained unsaved routing venue ' + width;
    await page.getByLabel('Venue', { exact: true }).fill(draft.venue);
    if (scenario === 'draft role prerequisite') {
      await openSection(page, 'Judges'); const roles = page.locator('details[data-section="Role verification"]'); if (await roles.getAttribute('open') === null) await roles.locator(':scope > summary').click();
      await page.getByRole('checkbox', { name: roleAttestation, exact: true }).uncheck(); draft.separationAttested = false;
    }
    if (scenario === 'complete draft fallback') {
      await openSection(page, 'Roster'); const assignments = page.locator('details[data-section="Heat assignments"]'); if (await assignments.getAttribute('open') === null) await assignments.locator(':scope > summary').click();
      const subject = fixture.later.subjects.find(subject => subject.id === fixture.unassigned)!;
      await page.getByLabel('Heat for bib ' + subject.number, { exact: true }).selectOption(fixture.later.heats[0].id);
      draft.rounds.find(round => round.id === fixture.later.id)!.heats[0].subjectIds.push(fixture.unassigned);
      await expect(page.locator('.setup-hero')).toContainText('Review and save your setup');
    }
    const task = setupTasks(draft).find(task => !task.complete);
    const expectedSection = scenario === 'complete draft fallback' ? 'Round setup' : scenario.includes('role') ? 'Role verification' : 'Heat assignments';
    if (scenario === 'complete draft fallback') expect(task).toBeUndefined();
    else { expect(task?.section).toBe(expectedSection); expect(task?.roundId).toBe(scenario.includes('role') ? undefined : fixture.later.id); }
    await page.getByRole('button', { name: '02 Score', exact: true }).click(); const shortcut = page.getByRole('button', { name: 'Review prelims setup', exact: true }).first();
    if (width === 390) { await shortcut.focus(); await page.keyboard.press('Enter'); } else await shortcut.click();
    await routeEvidence(page, expectedSection, scenario.replaceAll(' ', '-') + '-' + width);
    await expect(page.getByLabel('Select round to configure', { exact: true })).toHaveValue(fixture.later.id);
    expect(await page.evaluate(eventId => sessionStorage.getItem('country-dance-judging:view:' + eventId), fixture.view.eventId)).toBe(fixture.later.id);
    await expect(page.getByLabel('Venue', { exact: true })).toHaveValue(draft.venue); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeEnabled();
    if (scenario === 'draft role prerequisite') await expect(page.getByRole('checkbox', { name: roleAttestation, exact: true })).not.toBeChecked();
    if (scenario === 'complete draft fallback') await expect(page.getByLabel('Heat for bib ' + fixture.later.subjects.find(subject => subject.id === fixture.unassigned)!.number, { exact: true })).toHaveValue(fixture.later.heats[0].id);
    expect(posts).toEqual([]); expect(documents).toBe(0); expect(await api<LiveView>(fixture.organizer)).toEqual(fixture.view); expect(await backup(fixture.organizer)).toEqual(originalBackup);
    if (evidenceDirectory) writeFileSync(join(evidenceDirectory, scenario.replaceAll(' ', '-') + '-' + width + '-state.json'), JSON.stringify({ section: expectedSection, correctLaterRound: true, currentDraftModelUsed: true, unsavedVenueAndAssignmentRetained: true, canonicalCompleteFallback: scenario === 'complete draft fallback', browserPosts: 0, documentNavigations: 0, savedViewAndPreparationBackupExact: true }, null, 2));
  } finally { await context.close(); }
});
