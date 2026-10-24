import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { api, base, command, save } from './stage-helpers';
import { createStage, receiver, localKey, owner } from './publication-helpers';
import { stageFixture } from './stage-fixture';
import { openResultManagement } from './setup-browser-helpers';
import { latestPublications, type PublicSnapshot } from '../lib/live/publication';
import { cellKey, type LiveView } from '../lib/live/types';

type PublicData = { records: { snapshot: PublicSnapshot }[]; current: Record<string, string> };
const privateNote = 'PRIVATE_EIGHT_JUDGE_NOTE', privateReason = 'PRIVATE_EIGHT_JUDGE_CORRECTION';
async function renderedRead(page: Page, response: Promise<import('@playwright/test').Response>) {
  await (await response).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function refresh(page: Page) {
  const read = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'GET');
  await page.evaluate(() => window.dispatchEvent(new Event('online'))); await renderedRead(page, read);
}
async function click(page: Page, target: Locator, action: string) {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === action);
  const read = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'GET');
  await target.click(); const result = await response; expect(result.status(), `${action}: ${await result.text()}`).toBe(200); await renderedRead(page, read);
}
async function submit(token: string) {
  const own = await api<LiveView>(token);
  await api(token, { action: 'submit-stage', blockId: own.context.blockId, acknowledged: true, expectedVersion: own.version, requestId: crypto.randomUUID(), ballotVersions: Object.fromEntries(own.ballots.map((b) => [b.roundKey, b.version])), roundVersions: Object.fromEntries(own.rounds.map((r) => [r.key, r.version])) });
}
async function capture(page: Page, name: string) {
  const directory = process.env.EIGHT_JUDGE_EVIDENCE;
  if (directory) { mkdirSync(directory, { recursive: true }); await page.screenshot({ path: `${directory}/${name}.png`, fullPage: false }); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('eight assigned judges complete mixed automatic stages, exact voting, actual draws and independently released correction', async ({ browser }) => {
  test.setTimeout(600000);
  const setup = stageFixture(undefined, 4);
  setup.name = 'Synthetic eight-judge mixed-format rehearsal';
  setup.competitions = setup.competitions.filter((c, i) => i === 0 || c.format === 'Jack & Jill');
  setup.rounds = setup.rounds.filter((r) => setup.competitions.some((c) => c.id === r.competitionId));
  setup.blocks = setup.blocks.map((b) => ({ ...b, roundIds: b.roundIds.filter((id) => setup.rounds.some((r) => r.id === id)) }));
  for (let i = 4; i <= 8; i++) setup.judges.push({ id: crypto.randomUUID(), name: `Synthetic judge ${i}`, participantId: crypto.randomUUID() });
  for (const round of setup.rounds) {
    round.judgeIds = setup.judges.map((j) => j.id);
    if (round.kind === 'prelims' && setup.competitions.find((c) => c.id === round.competitionId)!.format === 'Strictly') round.heats = [{ ...round.heats[0], subjectIds: round.subjects.map((s) => s.id) }];
  }
  const event = await createStage(setup);
  await command(event.organizer, { action: 'enable-auto-stages' });
  let view = await api<LiveView>(event.organizer);
  expect(event.tokens).toHaveLength(8); expect(new Set(setup.judges.map((j) => j.participantId)).size).toBe(8);
  expect(view.setup.rounds.every((r) => r.judgeIds.length === 8 && r.judgeIds.every((id) => setup.judges.some((j) => j.id === id)))).toBe(true);
  expect(view.context.blockId).toBe(setup.blocks[0].id);
  const prelims = view.rounds, strictly = prelims.find((r) => r.definition.format === 'Strictly')!, missing = strictly.definition.subjects[3];
  console.log('Eight-judge rehearsal: all eight assigned; scoring Prelims.');
  for (const [j, token] of event.tokens.entries()) for (const round of prelims) for (const [i, subject] of round.definition.subjects.entries()) {
    if (j === 0 && subject.id === missing.id) continue;
    await save(token, round, round.definition.heats[0].songs[0].id, subject.id, round.definition.format === 'Strictly' ? i < 3 ? 'Yes' : 'No' : i % 3 === 0 ? 'Yes' : 'A1', j === 0 && i === 0 ? privateNote : '');
  }
  const deskContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const judgeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const headContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const desk = await deskContext.newPage(), judge = await judgeContext.newPage(), head = await headContext.newPage(), admin = await adminContext.newPage(), site = await publicContext.newPage();
  const errors: string[] = [];
  for (const page of [desk, judge, head, admin, site]) page.on('pageerror', (e) => errors.push(e.message));
  try {
    await desk.goto(base + event.path); await desk.getByRole('button', { name: '02 Score', exact: true }).click();
    await judge.goto(base + view.judgeLinks![0].path); await head.goto(base + view.judgeLinks![2].path);
    await judge.getByRole('button', { name: 'Review & submit prelims', exact: true }).click();
    const submitPre = judge.getByRole('button', { name: 'Submit prelims', exact: true });
    await expect(submitPre).toBeDisabled();
    await expect(judge.getByRole('heading', { name: 'Scores needed before submission', exact: true })).toBeVisible();
    await judge.getByRole('button', { name: new RegExp(`Strictly · Beginner / Intermediate · Heat 1: #${missing.number}`) }).click();
    await click(judge, judge.getByRole('button', { name: `Bib ${missing.number}: No`, exact: true }), 'save-cell');
    await expect(judge.locator('.pending-panel')).toHaveCount(0);
    const noBallot = (await api<LiveView>(event.tokens[0])).ballots.find((b) => b.roundKey === strictly.key)!;
    expect(noBallot.cells[cellKey(strictly.definition.heats[0].songs[0].id, missing.id)].mark).toBe('No');
    await judge.getByRole('button', { name: 'Review & submit prelims', exact: true }).click();
    await judge.getByRole('checkbox', { name: /^My scheduled dancing is finished/ }).check();
    await capture(judge, 'eight-judge-ready-390'); await click(judge, submitPre, 'submit-stage');
    for (const token of event.tokens.slice(1, 7)) await submit(token);
    view = await api<LiveView>(event.organizer);
    expect(view.heatSubmissions!.filter((s) => prelims.some((r) => r.key === s.roundKey))).toHaveLength(21);
    expect(view.rounds.every((r) => !r.standings)).toBe(true);
    await refresh(desk); await expect(desk.locator('body')).toContainText('7 / 8');
    await submit(event.tokens[7]); await refresh(judge); await refresh(head);
    const tie = judge.getByRole('group', { name: 'Beginner / Intermediate · Couples advancement tie', exact: true });
    await expect(tie.getByRole('checkbox')).toHaveCount(3);
    await tie.getByRole('checkbox').nth(0).focus(); await judge.keyboard.press('Space');
    await tie.getByRole('checkbox').nth(1).check();
    await expect(tie.getByRole('button', { name: 'Submit advancement vote', exact: true })).toHaveAccessibleDescription('2 / 2 selected · Ready to submit.');
    await click(judge, tie.getByRole('button', { name: 'Submit advancement vote', exact: true }), 'vote');
    await expect(judge.locator('.judge-action-current')).toContainText('Waiting for 7 judges to submit advancement votes.');
    await capture(judge, 'eight-judge-vote-waiting-390');
    for (const token of event.tokens.slice(1)) {
      const own = await api<LiveView>(token), round = own.rounds.find((r) => r.id === strictly.id)!;
      await command(token, { action: 'vote', roundKey: round.key, roundVersion: round.version, fingerprint: round.standings!.fingerprint, tieKey: round.standings!.advancementTies![0].key, selected: strictly.definition.subjects.slice(0, 2).map((s) => s.id) });
    }
    view = await api<LiveView>(event.organizer);
    const resolved = view.rounds.find((r) => r.id === strictly.id)!;
    expect(resolved.standings!.advancementTies![0].votes).toHaveLength(8);
    expect(resolved.standings!.rows.map((r) => r.average)).toEqual([10, 10, 10, 0]);
    expect(JSON.stringify(view)).not.toContain(privateNote);
    expect(JSON.stringify(await api<LiveView>(event.tokens[0]))).toContain(privateNote);
    expect(JSON.stringify(await api<LiveView>(event.tokens[1]))).not.toContain(privateNote);
    await refresh(head);
    for (let i = 0; i < 3; i++) await click(head, head.getByRole('button', { name: 'Approve these exact submissions', exact: true }).first(), 'approve');
    console.log('Eight-judge rehearsal: exact panel vote and head approvals complete; recording both actual J&J draws.');
    await refresh(desk);
    view = await api<LiveView>(event.organizer);
    const draws = view.setup.rounds.filter((r) => r.kind === 'finals' && view.setup.competitions.find((c) => c.id === r.competitionId)!.format === 'Jack & Jill');
    const first = desk.getByLabel('Jack & Jill · Beginner / Intermediate · Finals pairing', { exact: true }), other = desk.getByLabel('Jack & Jill · Advanced · Finals pairing', { exact: true });
    await first.getByRole('combobox').selectOption(draws[0].finalistIds[1]);
    await other.locator(':scope > summary').click();
    await first.getByRole('button', { name: /Complete Advanced draw/ }).focus(); await desk.keyboard.press('Enter');
    await expect(other.getByRole('combobox')).toBeFocused();
    await other.getByRole('combobox').selectOption(draws[1].finalistIds[1]);
    await desk.getByRole('button', { name: '03 Results', exact: true }).click(); await desk.getByRole('button', { name: '02 Score', exact: true }).click();
    await expect(first.getByRole('combobox')).toHaveValue(draws[0].finalistIds[1]); await expect(other.getByRole('combobox')).toHaveValue(draws[1].finalistIds[1]);
    await capture(desk, 'eight-judge-draw-ready-1440');
    await click(desk, first.getByRole('button', { name: 'Save Finals pairings', exact: true }), 'setup');
    view = await api<LiveView>(event.organizer);
    expect(view.context.blockId).toBe(setup.blocks[1].id);
    const finals = view.rounds.filter((r) => r.definition.kind === 'finals'); expect(finals).toHaveLength(3);
    for (const r of finals.filter((r) => r.definition.format === 'Jack & Jill')) expect(r.definition.subjects[0].members).toEqual(draws.find((d) => d.id === r.id)!.finalistIds);
    await refresh(judge); await expect(judge.getByLabel('Assigned heats and songs', { exact: true })).toHaveValue(finals[0].definition.heats[0].songs[0].id);
    for (const [j, token] of event.tokens.entries()) for (const r of finals) for (const [i, subject] of r.definition.subjects.entries()) await save(token, r, r.definition.heats[0].songs[0].id, subject.id, i === 0 ? 'Yes' : 'A1', j === 0 && i === 0 ? privateNote : '');
    await refresh(judge); await judge.getByRole('button', { name: 'Review & submit finals', exact: true }).click();
    await judge.getByRole('checkbox', { name: /^My scheduled dancing is finished/ }).check();
    await click(judge, judge.getByRole('button', { name: 'Submit finals', exact: true }), 'submit-stage');
    for (const token of event.tokens.slice(1)) await submit(token);
    await refresh(head);
    for (let i = 0; i < 3; i++) await click(head, head.getByRole('button', { name: 'Approve these exact submissions', exact: true }).first(), 'approve');
    view = await api<LiveView>(event.organizer);
    expect(view.rounds.filter((r) => r.definition.kind === 'finals').every((r) => r.standings!.approved && r.standings!.required === 8 && r.standings!.submitted === 8)).toBe(true);
    const finalStrictly = view.rounds.find((r) => r.definition.kind === 'finals' && r.definition.format === 'Strictly')!, affected = finalStrictly.definition.subjects[1];
    expect(finalStrictly.standings!.rows.map((r) => r.average)).toEqual([10, 4.5]);
    for (const token of event.tokens) {
      const own = await api<LiveView>(token);
      for (const r of finals) {
        const ballot = own.ballots.find((b) => b.roundKey === r.key)!; expect(ballot.locked).toBe(true);
        for (const song of r.definition.heats[0].songs.slice(1)) for (const subject of r.definition.subjects) expect(ballot.cells[cellKey(song.id, subject.id)]?.mark ?? '').toBe('');
      }
    }
    console.log('Eight-judge rehearsal: Finals averages/blanks/locks verified; separate admin release of all three competitions.');
    await refresh(desk); await desk.getByRole('button', { name: '04 Publish', exact: true }).click();
    await click(desk, desk.getByRole('button', { name: 'Review results to publish', exact: true }), 'prepare-event-publication');
    await click(desk, desk.getByRole('button', { name: 'Send results for approval', exact: true }), 'approve-event-publication');
    view = await api<LiveView>(event.organizer); const originals = structuredClone(latestPublications(view.publications!)); expect(originals).toHaveLength(3);
    for (const publication of originals) for (const stage of publication.snapshot.stages) {
      expect(stage.judges).toHaveLength(8);
      for (const entrant of stage.entrants) {
        expect(entrant.observations).toBe(8);
        expect(entrant.judgeMeans.map((j) => j.observations)).toEqual(Array(8).fill(1));
      }
    }
    const eventId = originals[0].snapshot.eventId;
    await admin.goto(receiver + '/admin'); await admin.getByLabel('Admin access code', { exact: true }).fill(localKey('LOCAL_OWNER_KEY'));
    await admin.getByRole('button', { name: 'Sign in', exact: true }).click(); await admin.goto(receiver + '/admin?event=' + eventId);
    await admin.getByRole('button', { name: 'Approve & publish results', exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Results published', exact: true })).toBeVisible();
    const before = await (await fetch(receiver + '/api/public')).json() as PublicData;
    for (const p of originals) expect(before.current[eventId + '/' + p.snapshot.competitionId]).toBe(p.id);
    const originalStrictly = originals.find((p) => p.competitionId === finalStrictly.definition.competitionId)!;
    const source = view.heatSubmissions!.find((s) => s.roundKey === finalStrictly.key && s.judgeId === setup.judges[0].id)!;
    await openResultManagement(desk); await desk.getByLabel('Competition and round view', { exact: true }).selectOption(finalStrictly.id);
    await desk.getByText('Request a score correction', { exact: true }).click();
    await desk.getByLabel('Submitted heat / judge', { exact: true }).selectOption(source.id);
    await desk.getByLabel('Wrong or affected bib', { exact: true }).selectOption(affected.id);
    await desk.getByLabel('Corrected mark for affected bib', { exact: true }).selectOption('Yes');
    await desk.getByLabel('Correction reason', { exact: true }).fill(privateReason);
    await click(desk, desk.getByRole('button', { name: 'Request correction', exact: true }), 'request-correction');
    desk.once('dialog', (d) => void d.accept()); await click(desk, desk.getByRole('button', { name: 'Approve request as organizer', exact: true }), 'approve-request');
    await expect(desk.getByText('1 / 2 approvals · scores unchanged', { exact: true })).toBeVisible();
    expect((await api<LiveView>(event.organizer)).rounds.find((r) => r.id === finalStrictly.id)!.standings!.rows[1].average).toBe(4.5);
    await refresh(head); head.once('dialog', (d) => void d.accept()); await click(head, head.getByRole('button', { name: 'Approve request as head', exact: true }), 'approve-request');
    view = await api<LiveView>(event.organizer); const corrected = view.rounds.find((r) => r.id === finalStrictly.id)!;
    expect(corrected.standings!.approved).toBe(false); expect(corrected.standings!.rows[1].average).toBe(5.1875); expect(corrected.standings!.rows[1].place).toBe(2);
    expect(view.heatSubmissions!.find((s) => s.roundKey === finalStrictly.key && s.judgeId === source.judgeId)!.supersedes).toBe(source.id);
    await owner({ action: 'retry' });
    await site.goto(receiver + '/results/' + originalStrictly.id); await expect(site.getByRole('cell', { name: '4.5000', exact: true })).toBeVisible();
    await click(head, head.getByRole('button', { name: 'Approve these exact submissions', exact: true }), 'approve');
    await desk.getByRole('button', { name: '04 Publish', exact: true }).click();
    await click(desk, desk.getByRole('button', { name: 'Review results to publish', exact: true }), 'prepare-event-publication');
    await click(desk, desk.getByRole('button', { name: 'Send results for approval', exact: true }), 'approve-event-publication');
    view = await api<LiveView>(event.organizer); const revised = latestPublications(view.publications!); expect(revised).toHaveLength(3);
    const revision = revised.find((p) => p.competitionId === originalStrictly.competitionId)!; expect(revision.revision).toBe(2);
    for (const p of originals.filter((p) => p.id !== originalStrictly.id)) expect(revised.find((r) => r.competitionId === p.competitionId)!.id).toBe(p.id);
    await admin.goto(receiver + '/admin?event=' + eventId);
    await expect(admin.getByRole('cell', { name: '5.1875', exact: true })).toBeVisible();
    await admin.getByRole('button', { name: 'Approve & publish results', exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Results published', exact: true })).toBeVisible();
    await site.goto(receiver + '/results/' + revision.id);
    await expect(site.getByRole('cell', { name: '5.1875', exact: true })).toBeVisible();
    const comparison = site.locator('.public-comparison'); await expect(comparison).not.toHaveAttribute('open');
    await comparison.locator(':scope > summary').focus(); await site.keyboard.press('Enter');
    await expect(comparison.getByText('4.5000 → 5.1875', { exact: true })).toBeVisible();
    await capture(site, 'eight-judge-released-correction-390'); await site.setViewportSize({ width: 1440, height: 1000 }); await capture(site, 'eight-judge-released-correction-1440');
    const after = await (await fetch(receiver + '/api/public')).json() as PublicData;
    for (const p of originals) expect(after.records.find((r) => r.snapshot.id === p.id)!.snapshot).toEqual(before.records.find((r) => r.snapshot.id === p.id)!.snapshot);
    for (const p of revised) expect(after.current[eventId + '/' + p.snapshot.competitionId]).toBe(p.id);
    expect(JSON.stringify(after)).not.toContain(privateNote); expect(JSON.stringify(after)).not.toContain(privateReason);
    const backup = await command(event.organizer, { action: 'backup' }) as { history: { heatSubmissions: { id: string }[] } };
    expect(backup.history.heatSubmissions.some((s) => s.id === source.id)).toBe(true);
    expect(errors).toEqual([]);
    console.log('Eight-judge rehearsal complete: 4.5000 → 5.1875; original Strictly and both J&J snapshots unchanged.');
  } finally { await Promise.all([deskContext.close(), judgeContext.close(), headContext.close(), adminContext.close(), publicContext.close()]); }
});
