import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { api, command, save, base } from './stage-helpers';
import { createStage, exact } from './publication-helpers';
import { sampleSetup } from '../lib/sample-setup';
import { setFinalsPair } from '../lib/live/finalists';
import type { LiveView } from '../lib/live/types';

async function submitStage(token: string) {
  const view = await api<LiveView>(token);
  await api(token, { action: 'submit-stage', requestId: crypto.randomUUID(), blockId: view.context.blockId, expectedVersion: view.version, acknowledged: true,
    ballotVersions: Object.fromEntries(view.ballots.map(ballot => [ballot.roundKey, ballot.version])), roundVersions: Object.fromEntries(view.rounds.map(round => [round.key, round.version])) });
}
async function scoreStage(organizer: string, tokens: string[]) {
  const view = await api<LiveView>(organizer), rounds = view.rounds.filter(round => round.phase === 'dancing');
  for (const token of tokens) {
    for (const round of rounds) for (const heat of round.definition.heats) for (const [index, id] of heat.subjectIds.entries()) {
      const mark = round.definition.format === 'Jack & Jill' && round.definition.kind === 'prelims' ? index % 2 === 0 ? 'Yes' : 'No' : index === 0 ? 'Yes' : index === 1 ? 'A1' : 'No';
      await save(token, round, heat.songs[0].id, id, mark);
    }
    await submitStage(token);
  }
}
async function publish(page: Page) { await page.getByRole('button', { name: '04 Publish', exact: true }).click(); }

test('Publish shortcuts follow actual automatic prerequisites to preparation, Score, exact head review and saved J&J draw', async ({ browser }) => {
  const setup = sampleSetup(); setup.name = 'Synthetic Publish prerequisite navigation';
  const incomplete = structuredClone(setup); incomplete.rounds.find(round => round.kind === 'prelims')!.heats[0].subjectIds = [];
  const event = await createStage(incomplete); await command(event.organizer, { action: 'setup', setup: incomplete, automaticStages: true });
  const apiEventId=(await api<LiveView>(event.organizer)).eventId;
  const strictPre = setup.rounds.find(round => round.kind === 'prelims' && round.competitionId === setup.competitions[0].id)!, final = setup.rounds.find(round => round.kind === 'finals' && round.competitionId === setup.competitions[1].id)!;
  const context = await browser.newContext(), page = await context.newPage(), errors: string[] = [], posts: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  async function evidence(name: string) {
    if (process.env.PUBLICATION_GUIDANCE_EVIDENCE) { mkdirSync(process.env.PUBLICATION_GUIDANCE_EVIDENCE, { recursive: true }); await page.screenshot({ path: `${process.env.PUBLICATION_GUIDANCE_EVIDENCE}/${name}.png`, fullPage: false }); }
  }
  try {
    await page.setViewportSize({ width: 390, height: 900 }); await page.goto(base + event.path); await publish(page);
    const task = page.locator('.publication-task');
    await expect(task.getByRole('button', { name: 'Review results to publish', exact: true })).toBeDisabled();
    const missing = task.locator('.publication-blockers li').first(); await expect(missing).toContainText('finish Prelims preparation');
    await missing.getByRole('button').focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('Select round to configure', { exact: true })).toHaveValue(strictPre.id);
    await command(event.organizer, { action: 'setup', setup, automaticStages: true }); await page.reload();
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await publish(page);
      const issue = task.locator('.publication-blockers li').first(); await expect(issue).toContainText('submit the Prelims stage');
      await expect(task).not.toContainText(' in Run'); await expect(task).not.toContainText('conclude the stage');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await evidence('prelims-scoring-' + width);
      await issue.getByRole('button').focus(); await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(eventId => sessionStorage.getItem('country-dance-judging:view:' + eventId), apiEventId)).toBe(strictPre.id);
    }
    await scoreStage(event.organizer, event.tokens); let view = await api<LiveView>(event.organizer); await page.reload(); await publish(page);
    await expect(task.locator('.publication-blockers li')).toHaveCount(2);
    await expect(task.locator('.publication-blockers li').first().getByRole('button')).toHaveCount(1);
    const dependency = task.locator('.publication-blockers li').filter({ hasText: 'Finals waits for the head judge' }).first();
    await dependency.getByRole('button').focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('Competition and round view', { exact: true })).toHaveValue(strictPre.id);
    const headLink = page.getByRole('link', { name: /^Open Head Judge/ }); await expect(headLink).toHaveAttribute('href', view.judgeLinks!.find(link => link.id === view.setup.headJudgeId)!.path);
    const nextPage = context.waitForEvent('page'); await headLink.focus(); await page.keyboard.press('Enter'); const headPage = await nextPage;
    await expect(headPage.getByRole('button', { name: 'Approve these exact submissions', exact: true }).first()).toBeVisible(); await headPage.close();
    for (const round of view.rounds) await exact(event.head, round.id, 'approve');
    view = await api<LiveView>(event.organizer); expect(view.rounds.every(round => round.definition.kind === 'prelims')).toBe(true);
    const beforeNavigation = structuredClone(view); await page.reload(); await publish(page);
    const draw = task.locator('.publication-blockers li').filter({ hasText: 'enter the actual Finals draw' }); await draw.getByRole('button').focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('Select round to configure', { exact: true })).toHaveValue(final.id);
    await expect(page.locator('details[data-section="Roster"]')).toHaveAttribute('open');
    await expect(page.locator('details[data-section="Roster"] > summary')).toBeFocused();
    await expect(page.getByRole('combobox', { name: /pairs with/ })).toBeVisible(); await expect(page.getByRole('combobox', { name: /pairs with/ })).toBeEnabled(); await evidence('actual-draw-setup');
    expect((await api<LiveView>(event.organizer)).version).toBe(beforeNavigation.version);
    const current = view.setup.rounds.find(round => round.id === final.id)!, pre = view.setup.rounds.find(round => round.id === current.prelimRoundId)!;
    const lead = pre.subjects.find(subject => subject.role === 'Lead' && current.finalistIds.includes(subject.id))!, follow = pre.subjects.find(subject => subject.role === 'Follow' && current.finalistIds.includes(subject.id))!;
    await command(event.organizer, { action: 'setup', setup: setFinalsPair(view.setup, final.id, lead.id, follow.id), automaticStages: true });
    await page.reload(); await publish(page); await expect(task.locator('.publication-blockers li').filter({ hasText: 'submit the Finals stage' }).first()).toBeVisible();
    await scoreStage(event.organizer, event.tokens); await page.reload(); await publish(page);
    const finalReview = task.locator('.publication-blockers li').filter({ hasText: 'Jack & Jill' }); await expect(finalReview).toContainText('approve current Finals');
    await finalReview.getByRole('button').focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('Competition and round view', { exact: true })).toHaveValue(final.id);
    await expect(page.getByRole('link', { name: /^Open Head Judge/ })).toHaveAttribute('href', view.judgeLinks!.find(link => link.id === view.setup.headJudgeId)!.path);
    await evidence('exact-finals-review'); expect((await api<LiveView>(event.organizer)).publications ?? []).toEqual([]);
    expect(posts).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
