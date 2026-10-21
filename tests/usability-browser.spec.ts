import { selectSetupRound } from './setup-browser-helpers';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { api, base, command, nonce, save } from './stage-helpers';
import { createStage, limitedStage, dance, exact, finish, receiver, localKey } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

const tab = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
async function click(page: Page, button: Locator, action: string) {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === action);
  await button.click(); expect((await response).status()).toBe(200);
}
async function layouts(page: Page, stem: string) {
  for (const width of [360, 390, 727, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const table of await page.locator('.result-group .table-wrap').all()) expect(await table.evaluate((t) => t.scrollWidth <= t.clientWidth), await table.evaluate((t) => JSON.stringify({ viewport: innerWidth, visible: !!t.getClientRects().length, scroll: t.scrollWidth, client: t.clientWidth, cells: [...t.querySelectorAll('th')].map((c) => c.getBoundingClientRect().width) }))).toBe(true);
    await page.screenshot({ path: `test-results/usability-${stem}-${width}.png`, fullPage: false });
  }
}

test('blank setup has an actionable section route, descriptive keyboard navigation and no navigation writes', async ({ browser }) => {
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: 'Synthetic blank usability', venue: '', date: '' });
  const organizer = created.path.split('/').at(-1)!;
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(base + created.path);
  await expect(page.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  expect(await page.locator('details.setup-main-card[open]').count()).toBe(0);
  const before = await api<LiveView>(organizer); const posts: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/live') && r.method() === 'POST') posts.push(r.postDataJSON().action); });
  const run = page.getByRole('button', { name: '02 Score', exact: true });
  await expect(run).toHaveAccessibleDescription('Judges & rounds');
  await run.focus(); await run.press('Enter');
  await expect(run).toHaveAttribute('aria-current', 'step');
  for (const id of ['run-prelims','run-finals','run-judge-access','run-submissions']) await expect(page.locator('#'+id)).not.toHaveAttribute('open');
  await page.locator('#score-supporting-details > summary').click();
  const hero = (await page.locator('.score-current').boundingBox())!, selector = (await page.locator('.round-context').boundingBox())!;
  expect(selector.y).toBeGreaterThanOrEqual(hero.y + hero.height);
  await page.locator('#run-submissions > summary').click();
  await expect(page.locator('#run-submissions')).toHaveAttribute('open');
  await expect(page.locator('#run-submissions > summary')).toBeFocused();
  await expect(page.locator('#run-submissions > summary')).toContainText('Not started');
  await page.locator('#run-submissions > summary').press('Enter');

  await expect(page.getByRole('button', { name: 'Start prelims stage', exact: true })).toHaveCount(0);
  await expect(page.locator('.score-current').getByText('Add competitions and save setup.', { exact: true })).toBeVisible();
  await page.locator('.score-current').getByRole('button', { name: 'Review prelims setup', exact: true }).click();
  const program = page.locator('details[data-section="Program & stages"]');
  await expect(program).toHaveAttribute('open');
  await expect(program.locator(':scope > summary')).toBeFocused();
  await program.locator(':scope > summary').press('Enter'); await expect(program).not.toHaveAttribute('open');
  await layouts(page, 'blank-setup');
  await expect(page.getByRole('heading', { name: 'Set up the desk once', exact: true })).toBeVisible();
  const eventCard = page.locator('[data-section="Event details"]');
  const programCard = page.locator('[data-section="Program & stages"]');
  const eventBox = (await eventCard.boundingBox())!, programBox = (await programCard.boundingBox())!;
  expect(programBox.x).toBeGreaterThan(eventBox.x + eventBox.width);
  expect(programBox.y).toBe(eventBox.y);
  await eventCard.locator(':scope > summary').press('Enter');
  await expect(page.getByLabel('Event name', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/online-layout-setup-desktop.png', fullPage: false });
  expect((await api<LiveView>(organizer)).version).toBe(before.version); expect(posts).toEqual([]);
  await context.close();
});

test('Run progress uses the assigned panel and view selection preserves the actual heat, drafts and event isolation', async ({ browser }) => {
  const setup = limitedStage(2, 4); setup.rounds[0].judgeIds = [setup.judges[0].id, setup.headJudgeId];
  const { organizer, tokens, path } = await createStage(setup);
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(base + path); await tab(page, '02 Score');
  await layouts(page, 'score-ready');
  for (const id of ['run-prelims','run-finals','run-judge-access','run-submissions']) await expect(page.locator('#'+id)).not.toHaveAttribute('open');
  await click(page, page.getByRole('button', { name: 'Start prelims stage', exact: true }), 'open-stage');
  let view = await api<LiveView>(organizer); const round = view.rounds[0], heat = round.definition.heats[0];
  await expect(page.getByText(/0 \/ 3 judges submitted the stage/)).toBeVisible();
  for (const id of heat.subjectIds) await save(tokens[0], round, heat.songs[0].id, id, 'Yes');
  await command(organizer, { action: 'open-stage-review', acknowledged: true });
  const own = await api<LiveView>(tokens[0]);
  for (const r of own.rounds.filter((r) => r.key !== round.key)) for (const h of r.definition.heats) for (const id of h.subjectIds) await save(tokens[0], r, h.songs[0].id, id, 'No');
  const ready = await api<LiveView>(tokens[0]);
  await api(tokens[0], { action: 'submit-stage', requestId: crypto.randomUUID(), acknowledged: true, blockId: ready.context.blockId, expectedVersion: ready.version, ballotVersions: Object.fromEntries(ready.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(ready.rounds.map((r) => [r.key, r.version])) });
  await page.reload(); await tab(page, '02 Score');
  await expect(page.getByText(/1 \/ 3 judges submitted the stage/)).toBeVisible();
  await expect(page.getByText(/Waiting for Synthetic two, Synthetic head\./)).toBeVisible();
  await expect(page.getByText(/Results open when all judges submit/)).toBeVisible();
  const posts: string[] = []; page.on('request', (r) => { if (r.url().endsWith('/api/live') && r.method() === 'POST') posts.push(r.postDataJSON().action); });
  const before = await api<LiveView>(organizer), other = setup.rounds.find((r) => r.competitionId === setup.competitions[1].id && r.kind === 'finals')!;
  await page.getByLabel('Competition and round view', { exact: true }).selectOption(other.id);
  await tab(page, '03 Results'); await expect(page.getByLabel('Competition and round view', { exact: true })).toHaveValue(other.id);
  await expect(page.locator('.results-highlights')).toHaveCount(0); await page.reload(); await tab(page, '02 Score');
  await expect(page.getByLabel('Competition and round view', { exact: true })).toHaveValue(other.id);
  await expect(page.locator('.hero-panel').getByText(/prelims · 2 competitions/)).toBeVisible();
  await page.locator('#run-judge-access > summary').click();
  await expect(page.locator('#run-judge-access')).toHaveAttribute('open');
  await expect(page.locator('#run-judge-access > summary')).toBeFocused();
  await expect(page.locator('#run-judge-access .judge-link-maintenance[open]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Copy judge link',exact:true}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Revoke',exact:true}).first()).toBeHidden();
  await page.locator('#run-submissions > summary').click();
  await expect(page.locator('#run-judge-access')).toHaveAttribute('open');
  const heatDetails=page.getByRole('region',{name:'Heat submissions',exact:true});
  await expect(heatDetails.locator('.score-detail-group').first().locator('.score-progress-row')).toHaveCount(2);
  await expect(heatDetails.locator('.score-detail-group').first()).not.toContainText('Synthetic two');
  await expect(heatDetails.locator('.score-detail-group').first()).toContainText('Received');
  await expect(heatDetails.locator('.score-detail-group').first()).toContainText('Awaiting submission');
  await expect(page.getByRole('region',{name:'Scoring coverage',exact:true})).toContainText('at least one recorded mark');
  await page.route('**/api/live',route=>route.request().method()==='GET'?route.abort():route.continue());
  await expect(page.locator('#run-submissions > summary')).toContainText('Last connected status',{timeout:10000});
  await expect(page.locator('.score-current')).toContainText('Last connected status');
  await page.unroute('**/api/live');

  await layouts(page, 'missing-submission');
  view = await api<LiveView>(organizer); expect(view.context).toEqual(before.context); expect(view.version).toBe(before.version); expect(posts).toEqual([]);
  await tab(page, '01 Set up');
  const roundSection = page.locator('details[data-section="Round setup"]');
  await expect(roundSection).not.toHaveAttribute('open');
  await page.getByLabel('Go to section').selectOption('Program & stages');
  await expect(page.getByLabel('Select round to configure', { exact: true })).toHaveValue(other.id);
  await selectSetupRound(page, setup, setup.rounds[2].id);
  const eventSection = page.locator('details[data-section="Event details"]');
  await page.getByLabel('Go to section').selectOption('Event details');
  await expect(eventSection).toHaveAttribute('open');
  await page.getByLabel('Event name', { exact: true }).fill('Unsaved synthetic event name');
  await tab(page, '02 Score');
  await expect(page.getByLabel('Competition and round view', { exact: true })).toHaveValue(setup.rounds[2].id);
  await expect(page.getByText('Save setup before starting judging.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next heat / division', exact: true })).toHaveCount(0);
  await page.screenshot({path:'test-results/score-unsaved-setup.png',fullPage:false});
  await tab(page, '03 Results'); await tab(page, '01 Set up');
  await page.getByLabel('Go to section').selectOption('Event details');
  await expect(eventSection).toHaveAttribute('open');
  await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('Unsaved synthetic event name');
  page.once('dialog', (d) => void d.accept()); await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
  expect((await api<LiveView>(organizer)).version).toBe(before.version); expect(posts).toEqual([]);
  // A second event with the same setup identifiers must not inherit the first event's selected view.
  const second = await createStage(setup); await page.goto(base + second.path); await tab(page, '03 Results');
  await expect(page.getByLabel('Competition and round view', { exact: true })).toHaveValue(setup.rounds[0].id);
  await context.close();
});

test('focused Results expose pending work elsewhere and route into the exact retained request without widening approval', async ({ browser }) => {
  const setup = limitedStage(2, 4), { organizer, tokens, head, path } = await createStage(setup);
  await command(organizer, { action: 'open-stage', kind: 'prelims' });
  let view = await api<LiveView>(organizer); const rounds = view.rounds;
  for (const [i, r] of rounds.entries()) { await dance(organizer, tokens, r); if (i < rounds.length - 1) await command(organizer, { action: 'next' }); }
  await command(organizer, { action: 'conclude-stage' }); await exact(head, rounds[1].id, 'approve');
  view = await api<LiveView>(organizer); const round = view.rounds[0], source = view.heatSubmissions!.find((s) => s.roundKey === round.key)!;
  const result = await command(organizer, { action: 'request-correction', roundKey: round.key, heatId: source.heatId, judgeId: source.judgeId, submissionId: source.id, reason: 'Synthetic pending request in another competition', changes: [{ performanceId: round.definition.heats[0].songs[0].id, subjectId: round.definition.subjects[0].id, after: 'A1' }] }) as { reviewRequestId: string };
  const context = await browser.newContext(), page = await context.newPage(); await page.goto(base + path); await tab(page, '03 Results');
  await page.getByLabel('Competition and round view', { exact: true }).selectOption(rounds[1].id);
  await expect(page.locator('.results-highlights')).toHaveCount(1);
  await expect(page.locator('.results-highlights')).toContainText('Strictly · Advanced');
  await expect(page.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toHaveCount(0);
  const management = page.locator('details[data-section="Corrections & withdrawals"]'); await expect(management).not.toHaveAttribute('open');
  await page.getByRole('button', { name: 'Review request · Beginner / Intermediate · prelims', exact: true }).click();
  await expect(management).toHaveAttribute('open'); await expect(page.locator(`#review-request-${result.reviewRequestId}`)).toBeFocused();
  await click(page, page.getByRole('button', { name: 'Cancel request', exact: true }), 'cancel-request');
  await expect(page.getByRole('region', { name: 'Pending review duties' })).toHaveCount(0);
  view = await api<LiveView>(organizer); expect(view.rounds[0].standings!.approved).toBe(false); expect(view.rounds[1].standings!.approved).toBe(true); expect(view.rounds[0].standings!.rows[0].average).toBe(10);
  await page.getByLabel('Competition and round view', { exact: true }).selectOption(round.id);
  await page.getByRole('button', { name: 'Review finalist count', exact: true }).click();
  await expect(page.getByLabel('Select round to configure', { exact: true })).toHaveValue(setup.rounds.find((r) => r.prelimRoundId === round.id)!.id);
  await expect(page.locator('details[data-section="Finalists & pairings"]')).toHaveAttribute('open');
  await expect(page.locator('details[data-section="Finalists & pairings"] > summary')).toBeFocused();
  await context.close();
});

test('unfinished competition routes to exact Finals; complete-event preview precedes recovery and independent admin release', async ({ browser }) => {
  const setup = limitedStage(2, 4), { organizer, tokens, head, path } = await createStage(setup);
  await finish(setup, organizer, tokens, head, true);
  const context = await browser.newContext(), page = await context.newPage(), headPage = await context.newPage();
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path); await tab(page, '02 Score');
  await expect(page.getByRole('button', { name: /^Start .* stage$/ })).toHaveCount(0);
  await tab(page, '04 Publish'); await expect(page.getByRole('button', { name: 'Review results to publish', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Open Strictly · Advanced · Results', exact: true }).click();
  const finalId = setup.rounds.find((r) => r.competitionId === setup.competitions[1].id && r.kind === 'finals')!.id;
  await expect(page.getByLabel('Competition and round view', { exact: true })).toHaveValue(finalId);
  await expect(page.locator('.results-highlights')).toHaveCount(1); await expect(page.locator('.results-highlights')).toContainText('Strictly · Advanced');
  await expect(page.locator('.results-highlights').getByText('10.0000', { exact: true })).toBeVisible();
  await page.getByText('All competitions & pending work', { exact: true }).click();
  await expect(page.locator('.round-overview-list')).toContainText('Head review needed');
  await page.getByText('All competitions & pending work', { exact: true }).click();
  await layouts(page, 'focused-results');
  let view = await api<LiveView>(organizer); await headPage.goto(base + view.judgeLinks!.find((j) => j.path.endsWith(head))!.path);
  const headResult = headPage.locator('.result-sheet').filter({ hasText: 'Strictly · Advanced · finals' });
  await click(headPage, headResult.getByRole('button', { name: 'Approve these exact submissions', exact: true }), 'approve');
  await page.reload(); await tab(page, '04 Publish'); await click(page, page.getByRole('button', { name: 'Review results to publish', exact: true }), 'prepare-event-publication');
  const previews = page.locator('[data-publication-id]'); await expect(previews).toHaveCount(2);
  for (const preview of await previews.all()) { await expect(preview).not.toHaveAttribute('open'); await preview.locator(':scope > summary').click(); }
  await expect(previews.nth(0)).toHaveAttribute('open'); await expect(previews.nth(1)).toHaveAttribute('open');
  expect(await page.locator('details[data-section="Data & recovery"]').evaluate((recovery) => [...document.querySelectorAll('[data-publication-id]')].every((preview) => Boolean(preview.compareDocumentPosition(recovery) & Node.DOCUMENT_POSITION_FOLLOWING)))).toBe(true);
  await layouts(page, 'publication-preview');
  await click(page, page.getByRole('button', { name: 'Send results for approval', exact: true }), 'approve-event-publication');
  await expect(page.getByText(/Sent for approval\. The website admin/)).toBeVisible();
  expect((await api<LiveView>(organizer)).publications!.every((p) => p.status === 'requested')).toBe(true);
  const adminContext = await browser.newContext(), admin = await adminContext.newPage(); await admin.goto(receiver + '/admin');
  await admin.getByLabel('Admin access code', { exact: true }).fill(localKey('LOCAL_OWNER_KEY')); await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  view = await api<LiveView>(organizer); const eventId = view.publications![0].snapshot.eventId;
  await admin.locator(`[data-event-id="${eventId}"]`).getByRole('button', { name: 'Approve & publish results', exact: true }).click();
  await expect(admin.getByText('Approved and published. The results are now on this website.', { exact: true })).toBeVisible();
  await expect(page.getByText('Published. The approved results are available on the results website.', { exact: true })).toBeVisible({ timeout: 15000 });
  // No public URL is carried by LiveView; the organizer must not invent one.
  await expect(page.getByRole('link', { name: 'View published results', exact: true })).toHaveCount(0);
  await command(organizer, { action: 'archive' }); await page.reload(); await tab(page, '02 Score');
  await expect(page.getByRole('heading', { name: 'Archived event', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Start .* stage$/ })).toHaveCount(0);
  await layouts(page, 'archived-run');
  view = await api<LiveView>(organizer); expect(view.publications!.every((p) => p.status === 'released')).toBe(true); expect(view.heatSubmissions).toHaveLength(12); expect(errors).toEqual([]);
  await Promise.all([context.close(), adminContext.close()]);
});


test('refresh restores each event page and round without writing event data; invalid or blocked storage falls back safely', async ({ browser }) => {
  const one = await createStage(limitedStage(2, 4)), two = await createStage(limitedStage(1, 4));
  const context = await browser.newContext(), page = await context.newPage();
  const before = await api<LiveView>(one.organizer), otherRound = before.setup.rounds.at(-1)!.id;
  const posts: string[] = []; page.on('request', (r) => { if (r.url().endsWith('/api/live') && r.method() === 'POST') posts.push(r.postDataJSON().action); });
  await page.goto(base + one.path); await expect(page.getByRole('button', { name: '01 Set up', exact: true })).toHaveAttribute('aria-current', 'step');
  await tab(page, '02 Score'); await page.getByLabel('Competition and round view', { exact: true }).selectOption(otherRound);
  for (const name of ['02 Score', '03 Results', '04 Publish', '01 Set up']) {
    await tab(page, name); await page.reload(); await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'step');
    if (name === '02 Score' || name === '03 Results') await expect(page.getByLabel('Competition and round view', { exact: true })).toHaveValue(otherRound);
  }
  await tab(page, '04 Publish'); await page.goto(base + two.path); await expect(page.getByRole('button', { name: '01 Set up', exact: true })).toHaveAttribute('aria-current', 'step');
  await tab(page, '03 Results'); await page.goto(base + one.path); await expect(page.getByRole('button', { name: '04 Publish', exact: true })).toHaveAttribute('aria-current', 'step');
  await page.goto(base + two.path); await expect(page.getByRole('button', { name: '03 Results', exact: true })).toHaveAttribute('aria-current', 'step');
  const second = await api<LiveView>(two.organizer);
  await page.evaluate((id) => sessionStorage.setItem(`country-dance-judging:page:${id}`, '99'), second.eventId); await page.reload();
  await expect(page.getByRole('button', { name: '01 Set up', exact: true })).toHaveAttribute('aria-current', 'step');
  expect(posts).toEqual([]); expect((await api<LiveView>(one.organizer)).version).toBe(before.version);
  const blockedContext = await browser.newContext(); await blockedContext.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Synthetic unavailable storage'); } }); });
  const blocked = await blockedContext.newPage(); await blocked.goto(base + one.path); await tab(blocked, '04 Publish'); await blocked.reload();
  await expect(blocked.getByRole('button', { name: '01 Set up', exact: true })).toHaveAttribute('aria-current', 'step');
  await Promise.all([context.close(), blockedContext.close()]);
});
