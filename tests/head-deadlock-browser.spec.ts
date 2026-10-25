import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { api, base, command } from './stage-helpers';
import { createStage, limitedStage, dance } from './publication-helpers';
import type { LiveView, RoundView, AdvancementTie } from '../lib/live/types';

async function fixture() {
  if (process.env.CORRECTION_NAV_RETAINED_FIXTURE) return JSON.parse(readFileSync(process.env.CORRECTION_NAV_RETAINED_FIXTURE, 'utf8')) as { event: Awaited<ReturnType<typeof createStage>>; A: string; B: string };
  const event = await createStage(limitedStage(2, 4)); await command(event.organizer, { action: 'open-stage', kind: 'prelims' });
  const view = await api<LiveView>(event.organizer);
  for (const [index, round] of view.rounds.entries()) { await dance(event.organizer, event.tokens, round); if (index < view.rounds.length - 1) await command(event.organizer, { action: 'next' }); }
  await command(event.organizer, { action: 'conclude-stage' });
  return { event, A: view.rounds[0].id, B: view.rounds[1].id };
}

type State = 'incomplete' | 'deadlocked' | 'complete' | 'archived' | 'mixed' | 'groups';
function project(view: LiveView, state: State, headId: string, rounds: string[]) {
  const projected = structuredClone(view); projected.context.stageSubmission = true; projected.reviewRequests = [];
  projected.status = state === 'archived' ? 'archived' : 'active';
  projected.rounds = projected.rounds.filter(round => rounds.includes(round.id));
  for (const round of projected.rounds) {
    const result = round.standings!, subjects = round.definition.subjects.slice(0, 3), ids = [...round.definition.judgeIds.filter(id => id !== headId), headId];
    const tie: AdvancementTie = { key: 'controlled-head-duty-tie', group: result.rows[0].group, subjectIds: subjects.map(subject => subject.id), slots: 1, votes: ids.slice(0, state === 'incomplete' ? 2 : 3).map((judgeId, index) => ({ roundKey: round.key, fingerprint: result.fingerprint, tieKey: 'controlled-head-duty-tie', judgeId, selected: [subjects[index].id], createdAt: '2026-10-25T15:00:00Z' })), selected: state === 'complete' ? [subjects[0].id] : [], deadlocked: state !== 'incomplete' && state !== 'complete', complete: state === 'complete' };
    round.phase = 'discussion'; round.standings = { ...result, approved: false, approvedAt: undefined, complete: true, finalistCount: 1, advancingIds: tie.selected, decisions: [], advancementTies: [tie], ties: [{ key: tie.key, group: tie.group, subjectIds: tie.subjectIds }], rows: result.rows.map(row => tie.subjectIds.includes(row.subjectId) ? { ...row, average: 4.5, place: 1, tied: true, decided: state === 'complete' } : row) };
    if (state === 'mixed' || state === 'groups') {
      // Fictional GET-only J&J vote groups, derived from the retained round; no backend fixture is created.
      const projectedSubjects = (['Lead', 'Follow'] as const).flatMap(role => subjects.map(subject => ({ ...subject, id: subject.id + '-' + role, number: subject.number + (role === 'Lead' ? 1000 : 2000), secondary: '', role })));
      round.definition = { ...round.definition, format: 'Jack & Jill', subjects: projectedSubjects, heats: round.definition.heats.map(heat => ({ ...heat, subjectIds: projectedSubjects.map(subject => subject.id) })) };
      const groupTies = (['Leads', 'Follows'] as const).map((group, index): AdvancementTie => { const groupIds = projectedSubjects.slice(index * 3, index * 3 + 3).map(subject => subject.id), full = state === 'groups' || index === 0, key = tie.key + '-' + group; return { ...tie, key, group, subjectIds: groupIds, deadlocked: full, complete: false, selected: [], votes: ids.slice(0, full ? 3 : 2).map((judgeId, n) => ({ roundKey: round.key, fingerprint: result.fingerprint, tieKey: key, judgeId, selected: [groupIds[n]], createdAt: '2026-10-25T15:00:00Z' })) }; });
      round.standings.advancementTies = groupTies; round.standings.ties = groupTies.map(item => ({ key: item.key, group: item.group, subjectIds: item.subjectIds }));
      round.standings.rows = projectedSubjects.map(subject => ({ ...result.rows[0], subjectId: subject.id, number: subject.number, primary: subject.primary, secondary: '', group: subject.role === 'Lead' ? 'Leads' : 'Follows', average: 4.5, place: 1, tied: true, decided: false }));
      const competition = projected.setup.competitions.find(item => item.id === round.definition.competitionId); if (competition) competition.format = 'Jack & Jill';
      const setupRound = projected.setup.rounds.find(item => item.id === round.id); if (setupRound) { setupRound.subjects = round.definition.subjects; setupRound.heats = round.definition.heats; }
    }
  }
  return projected;
}

for (const width of [390, 738]) test(`head deadlock guidance opens the exact existing decision without a mutation at ${width}`, async ({ browser }) => {
  const { event, A, B } = await fixture(), org = await api<LiveView>(event.organizer), headId = org.setup.headJudgeId!;
  const link = org.judgeLinks!.find(item => item.id === headId)!, context = await browser.newContext({ viewport: { width, height: 589 } }), page = await context.newPage();
  let state: State = 'deadlocked', visibleRounds = [B]; const writes: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== base) return route.abort('blockedbyclient');
    if (route.request().method() !== 'GET') { writes.push(route.request().postDataJSON()?.action); return route.abort('blockedbyclient'); }
    if (route.request().url().includes('/api/live')) { const response = await route.fetch(), view = await response.json() as LiveView; return route.fulfill({ response, json: project(view, state, headId, visibleRounds) }); }
    return route.continue();
  });
  const sheet = (id: string) => page.locator(`[id="round-result-${id}"]`);
  async function openDecision(round: RoundView, keyboard: boolean, group = round.standings!.rows[0].group, tieKey = 'controlled-head-duty-tie') {
    const action = sheet(round.id).getByRole('button', { name: `Open ${group} decision`, exact: true }), targetId = await action.getAttribute('aria-controls');
    expect(targetId).toBe(`head-tie-${round.key}-${tieKey}`);
    if (keyboard) { await action.focus(); await page.keyboard.press('Enter'); } else await action.click();
    const target = page.locator(`[id="${targetId}"]`); await expect(target).toBeFocused();
    await expect(target).toHaveText(`${group} · equal averages`);
    await expect(target).toHaveAccessibleDescription(`${round.definition.format} · ${round.definition.division} · ${round.definition.kind} ${group} vote tied. Your head decision is needed.`);
    await expect(sheet(round.id).getByRole('group', { name: `${group} · equal averages`, exact: true })).toHaveCount(1);
    const bounds = await target.evaluate(element => { const b = element.getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(element); const painted = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2); return { fullyVisible: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, exposed: painted === element || element.contains(painted), textFits: [...r.getClientRects()].every(rect => rect.left >= b.left - 1 && rect.right <= b.right + 1), pageFits: document.documentElement.scrollWidth <= innerWidth }; });
    expect(bounds).toEqual({ fullyVisible: true, exposed: true, textFits: true, pageFits: true });
    if (process.env.HEAD_DUTY_EVIDENCE) { const dir = process.env.HEAD_DUTY_EVIDENCE; mkdirSync(dir, { recursive: true }); await page.screenshot({ path: `${dir}/head-target-${round.id}-${width}.png` }); writeFileSync(`${dir}/target-${round.id}-${width}.json`, JSON.stringify(bounds)); }
  }
  try {
    await page.goto(base + link.path); const round = org.rounds.find(item => item.id === B)!;
    const action = sheet(B).getByRole('button', { name: /^Open .+ decision$/ });
    await expect(action).toBeVisible(); await expect(sheet(B).getByText(/vote tied\. Your head decision is needed\./)).toBeVisible();
    await expect(sheet(B).getByText('Every assigned judge must vote below. A remaining vote tie needs the head judge’s decision before approval.', { exact: true })).toHaveCount(0);
    const actionBounds = await action.evaluate(element => { const b = element.getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(element); return { top: b.top, bottom: b.bottom, fullyVisible: b.top >= 0 && b.bottom <= innerHeight, textFits: [...r.getClientRects()].every(rect => rect.left >= b.left - 1 && rect.right <= b.right + 1) }; });
    expect(actionBounds.fullyVisible && actionBounds.textFits).toBe(true);
    if (process.env.HEAD_DUTY_EVIDENCE) { mkdirSync(process.env.HEAD_DUTY_EVIDENCE, { recursive: true }); await page.screenshot({ path: `${process.env.HEAD_DUTY_EVIDENCE}/head-duty-${width}.png` }); }
    await expect(sheet(B).getByRole('button', { name: 'Approve these exact submissions', exact: true })).toBeDisabled();
    await openDecision(round, true); await page.keyboard.press('Tab');
    const editor = sheet(B).locator('fieldset.tie-editor').last(); await expect(editor.getByRole('button', { name: 'Move up', exact: true }).nth(1)).toBeFocused();
    const initialOrder = await editor.locator('.shared-inline > span').allTextContents(); await page.keyboard.press('Enter');
    const editedOrder = await editor.locator('.shared-inline > span').allTextContents(); expect(editedOrder).not.toEqual(initialOrder);
    await editor.getByLabel('Decision explanation (optional)', { exact: true }).fill('Retained local head decision intent');
    await openDecision(round, false); expect(await editor.locator('.shared-inline > span').allTextContents()).toEqual(editedOrder); await expect(editor.getByLabel('Decision explanation (optional)', { exact: true })).toHaveValue('Retained local head decision intent');
    // Multiple current round sheets must route each shortcut to its own round and group.
    visibleRounds = [A, B]; await expect(page.getByRole('button', { name: /^Open .+ decision$/ })).toHaveCount(2);
    await openDecision(org.rounds.find(item => item.id === A)!, true); await openDecision(round, false);
    visibleRounds = [B]; state = 'mixed';
    await expect(sheet(B).getByRole('button', { name: 'Open Leads decision', exact: true })).toBeVisible(); await expect(sheet(B).getByRole('button', { name: 'Open Follows decision', exact: true })).toHaveCount(0);
    await expect(sheet(B).getByText('Every assigned judge must vote below. A remaining vote tie needs the head judge’s decision before approval.', { exact: true })).toBeVisible();
    const groupedRound = project(org, 'groups', headId, [B]).rounds[0]; await openDecision(groupedRound, true, 'Leads', 'controlled-head-duty-tie-Leads');
    state = 'groups'; await expect(sheet(B).getByRole('button', { name: 'Open Follows decision', exact: true })).toBeVisible();
    await expect(sheet(B).getByText('Every assigned judge must vote below. A remaining vote tie needs the head judge’s decision before approval.', { exact: true })).toHaveCount(0);
    await openDecision(groupedRound, true, 'Follows', 'controlled-head-duty-tie-Follows'); await openDecision(groupedRound, false, 'Leads', 'controlled-head-duty-tie-Leads');
    state = 'incomplete'; await expect(page.getByRole('button', { name: /^Open .+ decision$/ })).toHaveCount(0);
    await expect(sheet(B).getByText('Every assigned judge must vote below. A remaining vote tie needs the head judge’s decision before approval.', { exact: true })).toBeVisible();
    state = 'complete'; await expect(sheet(B).getByRole('button', { name: 'Approve these exact submissions', exact: true })).toBeEnabled(); await expect(page.getByRole('button', { name: /^Open .+ decision$/ })).toHaveCount(0);
    state = 'archived'; await expect(page.getByRole('heading', { name: 'Archived event · read only', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: /^Open .+ decision$/ })).toHaveCount(0);
    expect(writes).toEqual([]); expect(errors).toEqual([]);
    if (process.env.HEAD_DUTY_EVIDENCE) writeFileSync(`${process.env.HEAD_DUTY_EVIDENCE}/result-${width}.json`, JSON.stringify({ width, controlledGETProjection: true, actionBounds, exactRoundAndGroup: true, keyboardEnterClickAndNextTab: true, localOrderAndExplanationRetained: true, multipleRoundTargets: true, mixedPanelDutyPreserved: true, separateLeadsFollowsTargets: true, incompleteCompleteArchivedHideShortcut: true, postAttempts: writes.length, errors }));
  } finally { await context.close(); }
});

test('head decision keeps its established group identity', async ({ browser }) => {
  const { event, B } = await fixture(), org = await api<LiveView>(event.organizer), headId = org.setup.headJudgeId!;
  const context = await browser.newContext({ viewport: { width: 390, height: 589 } }), page = await context.newPage();
  const round = org.rounds.find(item => item.id === B)!, group = round.standings!.rows[0].group;
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== base || route.request().method() !== 'GET') return route.abort('blockedbyclient');
    if (route.request().url().includes('/api/live')) { const response = await route.fetch(), view = await response.json() as LiveView; return route.fulfill({ response, json: project(view, 'deadlocked', headId, [B]) }); }
    return route.continue();
  });
  try {
    await page.goto(base + org.judgeLinks!.find(item => item.id === headId)!.path);
    await expect(page.getByRole('button', { name: `Open ${group} decision`, exact: true })).toBeVisible();
    const count = await page.getByRole('group', { name: `${group} · equal averages`, exact: true }).count();
    if (process.env.HEAD_DUTY_EVIDENCE) { mkdirSync(process.env.HEAD_DUTY_EVIDENCE, { recursive: true }); writeFileSync(`${process.env.HEAD_DUTY_EVIDENCE}/fieldset-identity.json`, JSON.stringify({ establishedName: `${group} · equal averages`, matchingGroups: count, probeOnly: process.env.HEAD_DUTY_IDENTITY_PROBE === '1' })); }
    if (process.env.HEAD_DUTY_IDENTITY_PROBE !== '1') expect(count).toBe(1);
  } finally { await context.close(); }
});
