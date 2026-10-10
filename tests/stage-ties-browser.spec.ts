import { test, expect, type Page, type Locator } from '@playwright/test';
import { api, base, command, nonce, save, submitHeat } from './stage-helpers';
import { stageFixture } from './stage-fixture';
import type { LiveView, RoundView } from '../lib/live/types';

async function click(page: Page, locator: Locator, action: string) {
  const post = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === action);
  await locator.click(); expect((await post).status()).toBe(200);
}
async function heat(organizer: string, tokens: string[], r: RoundView, value: 'Yes' | 'A1') {
  const h = r.definition.heats[0];
  for (const token of tokens) for (const id of h.subjectIds) await save(token, r, h.songs[0].id, id, value);
  for (let i = 1; i < h.songs.length; i++) await command(organizer, { action: 'next' });
  await command(organizer, { action: 'lineup' }); await Promise.all(tokens.map((token) => submitHeat(token, r, h.id))); await command(organizer, { action: 'conclude-stage' });
}

test('stage head buttons resolve a full-panel vote deadlock and a finals placement tie without changing averages', async ({ browser }) => {
  const setup = stageFixture(undefined, 4), competition = setup.competitions[0];
  setup.competitions = [competition]; setup.rounds = setup.rounds.filter((r) => r.competitionId === competition.id);
  setup.blocks = setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)) }));
  for (const r of setup.rounds) r.heats = [{ ...r.heats[0], subjectIds: r.subjects.map((s) => s.id), songs: r.heats[0].songs.slice(0, 2) }];
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: 'Synthetic head decisions', venue: '', date: '' }), organizer = created.path.split('/').at(-1)!;
  await command(organizer, { action: 'setup', setup }); let v = await api<LiveView>(organizer); const tokens = v.judgeLinks!.map((l) => l.path.split('/').at(-1)!);
  await command(organizer, { action: 'open-stage', kind: 'prelims' }); v = await api<LiveView>(organizer); let r = v.rounds[0]; await heat(organizer, tokens, r, 'Yes');
  v = await api<LiveView>(organizer); r = v.rounds[0]; const ids = r.definition.subjects.map((s) => s.id), tie = r.standings!.advancementTies![0];
  for (const [i, token] of tokens.entries()) {
    const current = (await api<LiveView>(token)).rounds[0];
    await command(token, { action: 'vote', roundKey: current.key, roundVersion: current.version, fingerprint: current.standings!.fingerprint, tieKey: tie.key, selected: [ids[0], ids[i + 1]] });
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), head = await context.newPage(); const errors: string[] = []; head.on('pageerror', (e) => errors.push(e.message));
  await head.goto(base + v.judgeLinks![2].path); await head.locator('.rail-item').nth(0).click();
  await expect(head.getByText('Full panel is tied. The head judge must resolve the remaining vote tie.', { exact: true })).toBeVisible();
  const recordedVote = head.getByRole('group', { name: 'Beginner / Intermediate · Couples advancement tie', exact: true });
  await expect(recordedVote.locator('input:checked')).toHaveCount(2);
  await expect(head.getByText(/3 \/ 3 heat submissions acknowledged/)).toBeVisible();
  const editor = head.getByRole('group', { name: 'Couples · equal averages', exact: true });
  await expect(editor.getByRole('checkbox', { name: 'Award an explicit shared place', exact: true })).toHaveCount(0);
  await expect(head.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toBeDisabled();
  for (let i = 0; i < 3; i++) await editor.locator('.shared-inline').filter({ hasText: '#104 ' }).getByRole('button', { name: 'Move up', exact: true }).click();
  await editor.getByLabel('Decision explanation (optional)', { exact: true }).fill('Synthetic panel deadlock resolution');
  await click(head, editor.getByRole('button', { name: 'Save head judge decision', exact: true }), 'tie');
  await expect(head.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toBeEnabled();
  await click(head, head.getByRole('button', { name: 'Approve these exact submissions', exact: true }), 'approve');
  await expect(head.getByText(/tie pending/)).toHaveCount(0);
  v = await api<LiveView>(organizer); expect(new Set(v.rounds[0].standings!.advancingIds)).toEqual(new Set([ids[0], ids[3]])); expect(v.rounds[0].standings!.rows.every((s) => s.average === 10)).toBe(true);
  const next = structuredClone(v.setup), final = next.rounds.find((r) => r.kind === 'finals')!; final.finalistIds = v.rounds[0].standings!.advancingIds!; final.subjects = v.rounds[0].definition.subjects.filter((s) => final.finalistIds.includes(s.id)); final.heats[0].subjectIds = final.subjects.map((s) => s.id);
  await command(organizer, { action: 'setup', setup: next }); await command(organizer, { action: 'open-stage', kind: 'finals' }); v = await api<LiveView>(organizer); r = v.rounds.find((r) => r.definition.kind === 'finals')!; await heat(organizer, tokens, r, 'A1');
  await head.reload(); await head.locator('.rail-item').nth(0).click(); await expect(editor).toBeVisible();
  await expect(head.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toBeDisabled();
  await editor.locator('.shared-inline').filter({ hasText: '#104 ' }).getByRole('button', { name: 'Move up', exact: true }).click();
  await editor.getByLabel('Decision explanation (optional)', { exact: true }).fill('Synthetic finals placement resolution'); await click(head, editor.getByRole('button', { name: 'Save head judge decision', exact: true }), 'tie');
  await expect(head.getByRole('button', { name: 'Approve these exact submissions', exact: true })).toBeEnabled(); await click(head, head.getByRole('button', { name: 'Approve these exact submissions', exact: true }), 'approve');
  v = await api<LiveView>(organizer); r = v.rounds.find((r) => r.definition.kind === 'finals')!;
  expect(r.standings!.rows.map((s) => [s.number, s.place, s.average])).toEqual([[104, 1, 4.5], [101, 2, 4.5]]);
  await head.screenshot({ path: 'test-results/stage-head-ties-390.png', fullPage: false }); await context.close(); expect(errors).toEqual([]);
});
