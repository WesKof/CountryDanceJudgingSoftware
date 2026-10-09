import { expect, type Page } from '@playwright/test';

// Navigate the real accordion controls, including nested sections after changing rounds.
export async function expandSetup(page: Page) {
  await expect(page.getByRole('heading', { name: 'Event details', exact: true })).toBeVisible();
  const closed = page.locator('details.setup-section:not([open]) > summary');
  while (await closed.count()) await closed.first().click();
}
