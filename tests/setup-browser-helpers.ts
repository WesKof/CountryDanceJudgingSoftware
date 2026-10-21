import { expect, type Page } from '@playwright/test';
import type { LiveSetup } from '../lib/live/types';

export async function selectSetupRound(page: Page, setup: LiveSetup, roundId: string) {
  const round = setup.rounds.find((r) => r.id === roundId)!;
  const competition = setup.competitions.find((c) => c.id === round.competitionId)!;
  const saved = page.locator('#setup-saved-details');
  if(await saved.count() && await saved.getAttribute('open')===null) await saved.locator(':scope > summary').click();
  const program = page.locator('details[data-section="Program & stages"]');
  if (await program.getAttribute('open') === null) await program.locator(':scope > summary').click();
  await program.locator('.competition-card').filter({ has: page.locator('strong', { hasText: competition.format }) }).filter({ has: page.locator('small', { hasText: competition.division }) }).click();
  await page.getByLabel('Select round to configure', { exact: true }).selectOption(roundId);
}

// Navigate the real accordion controls, including nested sections after changing rounds.
export async function expandSetup(page: Page) {
  await page.getByRole('button', { name: '01 Set up', exact: true }).click();
  const saved = page.locator('#setup-saved-details');
  if(await saved.count() && await saved.getAttribute('open')===null) await saved.locator(':scope > summary').click();
  await expect(page.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  const closed = page.locator('details.setup-section:not([open]) > summary');
  while (await closed.count()) await closed.first().click();
}

export async function openJudgeAccess(page: Page) {
  await page.getByRole('button', {name:'02 Score',exact:true}).click();
  const supporting = page.locator('#score-supporting-details');
  if (await supporting.count() && await supporting.getAttribute('open') === null) await supporting.locator(':scope > summary').click();
  const section=page.locator('details.setup-section').filter({has:page.getByRole('heading',{name:/^(Judge access|Event-long private judge links)$/,exact:true})});
  if (await section.getAttribute('open') === null) await section.locator(':scope > summary').click();
}

export async function openRecovery(page: Page) {
  await page.getByRole('button', {name:'04 Publish',exact:true}).click();
  await openPublicationContext(page);
  const section=page.locator('details.setup-section').filter({has:page.getByRole('heading',{name:'Data & recovery',exact:true})});
  if (await section.getAttribute('open') === null) await section.locator(':scope > summary').click();
}

export async function openResultManagement(page: Page) {
  await page.getByRole('button', {name:'03 Results',exact:true}).click();
  await openResultsContext(page);
  const section=page.locator('details.setup-section').filter({has:page.getByRole('heading',{name:'Corrections & withdrawals',exact:true})});
  if (await section.getAttribute('open') === null) await section.locator(':scope > summary').click();
}

export async function openSetupNavigation(page: Page) {
  if (!(await page.getByLabel('Go to section').isVisible())) await page.locator('.setup-navigation > summary').click();
}

export async function openResultsContext(page: Page) {
 const drawer=page.locator('#results-supporting');
 if(await drawer.count() && await drawer.getAttribute('open')===null) await drawer.locator(':scope > summary').click();
}
export async function openPublicationContext(page: Page) {
 const drawer=page.locator('#publication-supporting');
 if(await drawer.count() && await drawer.getAttribute('open')===null) await drawer.locator(':scope > summary').click();
}
