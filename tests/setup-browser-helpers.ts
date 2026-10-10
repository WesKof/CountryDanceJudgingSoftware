import { expect, type Page } from '@playwright/test';

// Navigate the real accordion controls, including nested sections after changing rounds.
export async function expandSetup(page: Page) {
  await expect(page.getByRole('heading', { name: 'Event details', exact: true })).toBeVisible();
  const closed = page.locator('details.setup-section:not([open]) > summary');
  while (await closed.count()) await closed.first().click();
}

export async function openJudgeAccess(page: Page) {
  await page.getByRole('button', {name:'02 Run',exact:true}).click();
  const section=page.locator('details.setup-section').filter({has:page.getByRole('heading',{name:'Event-long private judge links',exact:true})});
  if (await section.getAttribute('open') === null) await section.locator(':scope > summary').click();
}

export async function openRecovery(page: Page) {
  await page.getByRole('button', {name:'04 Publish',exact:true}).click();
  const section=page.locator('details.setup-section').filter({has:page.getByRole('heading',{name:'Data & recovery',exact:true})});
  if (await section.getAttribute('open') === null) await section.locator(':scope > summary').click();
}

export async function openResultManagement(page: Page) {
  await page.getByRole('button', {name:'03 Results',exact:true}).click();
  const section=page.locator('details.setup-section').filter({has:page.getByRole('heading',{name:'Amendments & withdrawals',exact:true})});
  if (await section.getAttribute('open') === null) await section.locator(':scope > summary').click();
}
