import { test, expect } from '@playwright/test';
import { api, base, command, save } from './stage-helpers';
import { createStage, limitedStage } from './publication-helpers';
import type { LiveView } from '../lib/live/types';

async function tiedStage() {
  const event = await createStage(limitedStage(1, 4));
  await command(event.organizer, { action: 'enable-auto-stages' });
  const view = await api<LiveView>(event.organizer), round = view.rounds[0], heat = round.definition.heats[0];
  for (const token of event.tokens) {
    for (const subject of round.definition.subjects) await save(token, round, heat.songs[0].id, subject.id, 'Yes', 'PRIVATE_VOTE_GUIDANCE');
    const own = await api<LiveView>(token);
    await api(token, { action: 'submit-stage', blockId: own.context.blockId, acknowledged: true, expectedVersion: own.version, requestId: crypto.randomUUID(), ballotVersions: Object.fromEntries(own.ballots.map((ballot) => [ballot.roundKey, ballot.version])), roundVersions: Object.fromEntries(own.rounds.map((round) => [round.key, round.version])) });
  }
  const current = await api<LiveView>(event.organizer);
  return { ...event, view: current, round: current.rounds[0], ids: round.definition.subjects.map((subject) => subject.id) };
}

async function vote(token: string, selected: string[], status = 200) {
  const view = await api<LiveView>(token), round = view.rounds[0];
  return command(token, { action: 'vote', roundKey: round.key, roundVersion: round.version, fingerprint: round.standings!.fingerprint, tieKey: round.standings!.advancementTies![0].key, selected }, status);
}

test('exact-count guidance explains disabled voting and keyboard selection submits one immutable panel vote', async ({ browser }) => {
  const event = await tiedStage(), context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  const posts: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/live')) posts.push(request.postDataJSON().action); });
  try {
    await page.goto(base + event.view.judgeLinks![0].path);
    const group = page.getByRole('group', { name: 'Beginner / Intermediate · Couples advancement tie', exact: true });
    const submit = group.getByRole('button', { name: 'Submit advancement vote', exact: true });
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAccessibleDescription('0 / 2 selected · Choose 2 more.', { timeout: 3000 });
    await group.getByRole('checkbox').nth(0).focus(); await page.keyboard.press('Space');
    await expect(submit).toHaveAccessibleDescription('1 / 2 selected · Choose 1 more.');
    await group.getByRole('checkbox').nth(1).check(); await group.getByRole('checkbox').nth(2).check();
    await expect(submit).toBeDisabled(); await expect(submit).toHaveAccessibleDescription('3 / 2 selected · Remove 1 choice.');
    await submit.evaluate((button: HTMLButtonElement) => button.click());
    expect(posts).toEqual([]);
    await vote(event.organizer, event.ids.slice(0, 2), 403);
    await vote(event.tokens[0], event.ids.slice(0, 3), 400);
    await group.getByRole('checkbox').nth(2).uncheck();
    await expect(submit).toBeEnabled(); await expect(submit).toHaveAccessibleDescription('2 / 2 selected · Ready to submit.');
    const response = page.waitForResponse((response) => response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'vote');
    await submit.focus(); await page.keyboard.press('Enter'); expect((await response).status()).toBe(200);
    await expect(page.locator('.judge-action-current')).toContainText('Waiting for Synthetic two, Synthetic head to submit advancement votes.');
    await page.locator('[data-section="Completed judging & history"] > summary').click();
    const finalized = group.getByRole('button', { name: 'Vote finalized', exact: true });
    await expect(finalized).toBeDisabled(); await expect(finalized).toHaveAccessibleDescription('2 / 2 selected · Vote finalized.');
    for (const checkbox of await group.getByRole('checkbox').all()) await expect(checkbox).toBeDisabled();
    await vote(event.tokens[0], event.ids.slice(1, 3), 400);
    expect(posts).toEqual(['vote']);
    const view = await api<LiveView>(event.organizer), tie = view.rounds[0].standings!.advancementTies![0];
    expect(tie.votes).toHaveLength(1); expect(tie.votes[0].selected).toEqual(event.ids.slice(0, 2));
    expect(view.rounds[0].standings!.rows.every((row) => row.average === 10)).toBe(true);
  } finally { await context.close(); }
});

test('Strictly advancement choices identify both partners for ordinary and head judges without exposing private notes', async ({ browser }) => {
  const event = await tiedStage(), context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    for (const judge of [0, 2]) {
      const page = await context.newPage(); await page.goto(base + event.view.judgeLinks![judge].path);
      const group = page.getByRole('group', { name: 'Beginner / Intermediate · Couples advancement tie', exact: true });
      const first = event.round.definition.subjects[0];
      await expect(group.getByRole('checkbox', { name: `#${first.number} ${first.primary} & ${first.secondary}`, exact: true })).toBeVisible({ timeout: 3000 });
      for (const width of [360, 738, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await group.screenshot({ path: `test-results/vote-choice-${judge}-1440.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await group.screenshot({ path: `test-results/vote-choice-${judge}-390.png` });
    }
    expect(JSON.stringify(await api<LiveView>(event.organizer))).not.toContain('PRIVATE_VOTE_GUIDANCE');
  } finally { await context.close(); }
});

test('a finalized ordinary vote waits for the remaining panel and leaves full-panel deadlock resolution with the head', async ({ browser }) => {
  const event = await tiedStage(); await vote(event.tokens[0], [event.ids[0], event.ids[1]]);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  try {
    await page.goto(base + event.view.judgeLinks![0].path);
    const status = page.locator('.judge-action-current');
    await expect(status).toContainText('Waiting for Synthetic two, Synthetic head to submit advancement votes.', { timeout: 3000 });
    await vote(event.tokens[1], [event.ids[0], event.ids[2]]); await vote(event.head, [event.ids[0], event.ids[3]]);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(status).toContainText('Waiting for the head judge to resolve the advancement tie. Your submitted scores stay locked.');
    await expect(page.getByRole('button', { name: 'Save head judge decision', exact: true })).toHaveCount(0);
    const head = await context.newPage(); await head.goto(base + event.view.judgeLinks![2].path);
    await expect(head.getByText('Full panel is tied. The head judge must resolve the remaining vote tie.', { exact: true })).toBeVisible();
    await expect(head.getByRole('button', { name: 'Save head judge decision', exact: true })).toBeEnabled();
    await expect(head.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toBeDisabled();
    const view = await api<LiveView>(event.organizer);
    expect(view.rounds[0].standings!.advancementTies![0].deadlocked).toBe(true);
    const round = view.rounds[0];
    await command(event.tokens[0], { action: 'tie', roundKey: round.key, roundVersion: round.version, fingerprint: round.standings!.fingerprint, tieKey: round.standings!.advancementTies![0].key, order: event.ids, shared: false }, 403);
    expect(view.rounds[0].standings!.rows.every((row) => row.average === 10)).toBe(true);
  } finally { await context.close(); }
});
