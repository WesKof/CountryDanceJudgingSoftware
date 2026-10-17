import { test, expect } from '@playwright/test';
import { expandSetup, openJudgeAccess, openRecovery } from './setup-browser-helpers';
import { readFile } from 'node:fs/promises';
import { createDefaultState, type AppState } from '../lib/domain';
import { stageFixture } from './stage-fixture';
import { api, command, base, nonce } from './stage-helpers';
import type { LiveView } from '../lib/live/types';

test('equivalent local/shared setup buttons, confirmations, persistence, empty program and v2 backup history', async ({ browser }) => {
  const setup = stageFixture(undefined, 6);
  const legacy: AppState = { ...createDefaultState(), event: { name: setup.name, venue: setup.venue, date: setup.date }, judges: setup.judges, demoSetup: setup, activeCompetitionId: setup.competitions[0].id,
    competitions: setup.competitions.map((c) => { const r = setup.rounds.find((r) => r.competitionId === c.id && r.kind === 'prelims')!; return { ...c, name: c.format, round: 'Preliminary', entries: r.subjects.map((s) => ({ id: s.id, number: s.number, ...(s.role ? { name: s.primary, role: s.role } : { lead: s.primary, follow: s.secondary }) })), scores: Object.fromEntries(r.subjects.map((s) => [s.id, Object.fromEntries(setup.judges.map((j) => [j.id, 'Yes' as const]))])), revisions: [{ id: 'retained-v2-revision', createdAt: '2026-10-08', label: 'Historical totals', rows: [] }] }; }) };
  const localContext = await browser.newContext({ viewport: { width: 390, height: 844 } }), sharedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const local = await localContext.newPage(), shared = await sharedContext.newPage();
  const localPosts: string[] = []; local.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/live')) localPosts.push(r.postData() ?? ''); });
  await localContext.addInitScript((s) => { if (!localStorage.getItem('country-dance-judging:v2')) localStorage.setItem('country-dance-judging:v2', JSON.stringify(s)); }, legacy); await local.goto(base); await local.locator('.rail-item').nth(0).click();
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: setup.name, venue: '', date: '' }), token = created.path.split('/').at(-1)!;
  await command(token, { action: 'setup', setup }); await shared.goto(base + created.path);
  const openedLocal = await local.evaluate(()=>JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!) as {path:string});
  const localSetupCopy = (await api<LiveView>(openedLocal.path.split('/').at(-1)!)).setup;
  for (const page of [local, shared]) {
    const pageSetup = page===local ? localSetupCopy : setup;
    await expect(page.locator('details.setup-section[open]')).toHaveCount(0);
    await expect(page.getByLabel('Event name', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Event overview · legacy ballots', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: page === local ? 'test-results/local-setup-collapsed-390.png' : 'test-results/shared-setup-collapsed-1440.png' });
    const eventSection = page.locator('details.setup-section').filter({ has: page.getByRole('heading', { name: 'Event details', exact: true }) });
    await eventSection.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('Event name', { exact: true })).toBeVisible();
    await eventSection.locator('summary').click(); await expect(page.getByLabel('Event name', { exact: true })).toBeHidden();
    await page.locator('details.setup-section').filter({ has: page.getByRole('heading', { name: 'Program & stages', exact: true }) }).locator('summary').click();
    await page.locator('.competition-card').first().click();
    await expect(page.getByLabel('Select round to configure')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
    await expandSetup(page);
    await expect(page.getByRole('heading', { name: 'Program & stages', exact: true })).toBeVisible();
    await expect(page.getByLabel('Event name', { exact: true }).last()).toHaveValue(pageSetup.name);
    await expect(page.getByRole('combobox', { name: 'Event head judge', exact: true })).toHaveValue(pageSetup.headJudgeId);
    await expect(page.getByRole('button', { name: /^Remove .* competition$/ })).toHaveCount(4);
    await page.getByLabel('Select round to configure').selectOption(pageSetup.rounds[0].id);
    await expect(page.locator('.shared-heat')).toHaveCount(3);
    page.once('dialog', (d) => void d.dismiss()); await page.getByRole('button', { name: 'Remove Heat 1', exact: true }).click(); await expect(page.locator('.shared-heat')).toHaveCount(3);
    page.once('dialog', (d) => void d.accept()); await page.getByRole('button', { name: 'Remove Heat 1', exact: true }).click();
    await expect(page.locator('.shared-heat')).toHaveCount(2);
    for (const id of pageSetup.rounds[0].heats[0].subjectIds) {
      const s = pageSetup.rounds[0].subjects.find((s) => s.id === id)!;
      const select = page.getByLabel(`Heat for bib ${s.number}`, { exact: true }); await expect(select).toHaveValue(''); await select.selectOption(pageSetup.rounds[0].heats[1].id);
    }
    await page.getByRole('button', { name: 'Add heat', exact: true }).click();
    await expect(page.locator('.shared-heat')).toHaveCount(3);
    await expect(page.locator('.shared-heat h3').last()).toHaveText(/Heat 1/);
    await page.getByLabel('Venue', { exact: true }).last().fill('Parity venue');
    await page.getByRole('button', { name: 'Save setup', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
    await page.reload();
    if (page === local) await local.locator('.rail-item').nth(0).click(); await expandSetup(page);
    await expect(page.getByLabel('Venue', { exact: true }).last()).toHaveValue('Parity venue');
    await page.getByLabel('Select round to configure').selectOption(pageSetup.rounds[0].id);
    const remove = page.getByRole('button', { name: 'Remove Strictly Beginner / Intermediate competition', exact: true });
    page.once('dialog', (d) => void d.dismiss()); await remove.click(); await expect(page.getByRole('button', { name: /^Remove .* competition$/ })).toHaveCount(4);
    page.once('dialog', (d) => void d.accept()); await remove.click(); await expect(page.getByRole('button', { name: /^Remove .* competition$/ })).toHaveCount(3);
    await expect(page.getByLabel('Select round to configure')).not.toHaveValue(pageSetup.rounds[0].id);
    await page.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
  }
  // Main-page setup now saves to D1. The legacy archive remains byte-for-byte intact.
  expect(await local.evaluate(() => JSON.parse(localStorage.getItem('country-dance-judging:v2')!))).toEqual(legacy);
  const localBinding = await local.evaluate(() => JSON.parse(localStorage.getItem('country-dance-judging:rehearsal')!) as { path: string });
  const localToken = localBinding.path.split('/').at(-1)!;
  expect((await api<LiveView>(localToken)).setup.competitions).toHaveLength(3);
  const saved = await api<LiveView>(token); expect(saved.setup.rounds.some((r) => r.competitionId === setup.competitions[0].id)).toBe(false);
  // Real private-link controls: cancellation, revocation, replacement and opening the new page.
  await openJudgeAccess(shared);
  const judgeCard = shared.locator('details.setup-section').filter({has: shared.getByRole('heading',{name:'Event-long private judge links',exact:true})}).locator('.form-body > .shared-inline').first();
  await judgeCard.getByText('Manage link', { exact: true }).click();
  const oldLink = saved.judgeLinks![0].path;
  shared.once('dialog', (d) => void d.dismiss()); await judgeCard.getByRole('button', { name: 'Revoke', exact: true }).click();
  expect((await api<LiveView>(token)).judgeLinks![0].revoked).toBe(false);
  shared.once('dialog', (d) => void d.accept());
  const revoke = shared.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().postDataJSON()?.action === 'revoke-link');
  await judgeCard.getByRole('button', { name: 'Revoke', exact: true }).click(); expect((await revoke).status()).toBe(200); await expect(judgeCard.getByRole('button', { name: 'Copy judge link', exact: true })).toBeDisabled();
  await api(oldLink.split('/').at(-1)!, undefined, 403);
  shared.once('dialog', (d) => void d.accept());
  const replace = shared.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().postDataJSON()?.action === 'replace-link');
  await judgeCard.getByRole('button', { name: 'Replace link', exact: true }).click(); expect((await replace).status()).toBe(200); await expect(judgeCard.getByRole('button', { name: 'Copy judge link', exact: true })).toBeEnabled();
  const replaced = (await api<LiveView>(token)).judgeLinks![0].path; expect(replaced).not.toBe(oldLink);
  const popup = shared.waitForEvent('popup'); await judgeCard.getByRole('link', { name: 'Open judge page', exact: true }).click();
  const judgePage = await popup; await expect(judgePage).toHaveURL(base + replaced); await expect(judgePage.getByRole('heading', { level: 1, name: setup.judges[0].name, exact: true })).toBeVisible(); await judgePage.close();
  for (const page of [local, shared]) {
    await page.getByRole('button',{name:'01 Set up',exact:true}).click();await expandSetup(page);
    for (const c of setup.competitions.slice(1)) { page.once('dialog', (d) => void d.accept()); await page.getByRole('button', { name: `Remove ${c.format} ${c.division} competition`, exact: true }).click(); }
    await page.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
    await page.reload(); if (page === local) await page.locator('.rail-item').nth(0).click(); await expandSetup(page);
    await expect(page.getByRole('button', { name: /^Remove .* competition$/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add competition', exact: true }).click(); await expandSetup(page);
    await expect(page.getByLabel('Select round to configure').locator('option')).toHaveCount(2);
    // Exercise roster addition and import controls on the freshly added J&J prelim.
    await page.getByLabel('Bib', { exact: true }).fill('701'); await page.getByLabel('Name', { exact: true }).last().fill('Synthetic Lead');
    await page.getByRole('button', { name: 'Add entrant', exact: true }).click();
    await expect(page.getByLabel('Heat for bib 701', { exact: true })).not.toHaveValue('');
    await page.getByText('Import roster CSV', { exact: true }).click(); await page.locator('textarea[name=csv]').fill('Number,Name,Role\n701,Synthetic Lead,Lead\n702,Synthetic Follow,Follow');
    page.once('dialog', (d) => void d.accept()); await page.getByRole('button', { name: 'Replace unopened roster', exact: true }).click();
    await expect(page.getByLabel('Heat for bib 702', { exact: true })).not.toHaveValue('');
    await page.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect(page.getByRole('button', { name: 'Save setup', exact: true })).toBeDisabled();
  }
  expect(localPosts.filter((p) => JSON.parse(p).action === 'create')).toHaveLength(1);
  expect(await local.evaluate(() => document.documentElement.scrollWidth),JSON.stringify(await local.evaluate(()=>Array.from(document.querySelectorAll('main *')).filter((e)=>e.getBoundingClientRect().right>391).map((e)=>({tag:e.tagName,css:e.className,text:e.textContent?.slice(0,70),right:e.getBoundingClientRect().right}))))).toBeLessThanOrEqual(390);
  expect((await local.locator('.setup-editor-grid').first().boundingBox())!.width).toBeGreaterThan(220);
  await local.screenshot({ path: 'test-results/local-setup-390.png', fullPage: false });
  await openRecovery(local);
  await local.getByText('Legacy device backup & history',{exact:true}).click();
  const download = local.waitForEvent('download'); await local.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const backup = JSON.parse(await readFile((await (await download).path())!, 'utf8')); expect(backup.event.version).toBe(2); expect(backup.event).toEqual({...legacy,publisherUrl:''});
  await local.getByText('Legacy device backup & history',{exact:true}).click();
  for (const contents of [backup, legacy]) {
    await openRecovery(local);await local.getByText('Legacy device backup & history',{exact:true}).click();
    local.once('dialog', (d) => void d.accept());
    await local.locator('label').filter({ hasText: 'Restore JSON' }).locator('input[type=file]').setInputFiles({ name: 'v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contents)) });
    await expect(local.getByRole('heading', { level: 1, name: setup.name })).toBeVisible();
    const expected = 'event' in contents && 'version' in contents.event ? contents.event : contents;
    await expect.poll(() => local.evaluate(() => JSON.parse(localStorage.getItem('country-dance-judging:v2')!).competitions.map((c: { id: string }) => c.id))).toEqual(expected.competitions.map((c: { id: string }) => c.id));
  }
  await localContext.close(); await sharedContext.close();
});

test('main-page organizer reopens existing events and keeps judge links separate', async ({ browser }) => {
  const setup=stageFixture(undefined,6);
  const created=await api<{path:string}>('',{action:'create',requestId:nonce(),name:setup.name,venue:'',date:''});
  const token=created.path.split('/').at(-1)!;await command(token,{action:'setup',setup});
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
  await context.addInitScript(({path,nonce})=>localStorage.setItem('country-dance-judging:rehearsal',JSON.stringify({path,nonce,configured:true})),{path:created.path,nonce:nonce()});
  const creations:string[]=[];page.on('request',(r)=>{if(r.method()==='POST'&&r.url().endsWith('/api/live')&&r.postDataJSON()?.action==='create')creations.push(r.url());});
  await page.goto(base);await expect(page.getByRole('heading',{level:1,name:setup.name})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open organizer page',exact:true})).toHaveCount(0);
  await expect(page.locator('details.setup-section[open]')).toHaveCount(0);await expandSetup(page);
  await page.getByRole('button',{name:'Copy organizer link',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(base+'/?event='+token);
  await openJudgeAccess(page);const judgeOpen=page.waitForEvent('popup');await page.getByRole('link',{name:'Open judge page',exact:true}).first().click();
  const judge=await judgeOpen;await expect(judge).toHaveURL(/\/judge\//);await expect(judge.locator('.rail-item')).toHaveCount(1);
  await page.getByRole('button',{name:'02 Score',exact:true}).click();await page.getByRole('button',{name:'Start prelims stage',exact:true}).click();
  await judge.reload();await expect(judge.locator('.phone-row')).toHaveCount(2);
  const response=judge.waitForResponse((r)=>r.request().postDataJSON()?.action==='save-cell');
  await judge.locator('.phone-row').first().getByRole('button',{name:'Bib 101: Yes',exact:true}).click();expect((await response).status()).toBe(200);
  const judgeToken=new URL(judge.url()).pathname.split('/').at(-1)!;const before=await api<LiveView>(judgeToken);await page.reload();await expect(page).toHaveURL(base+'/');
  await expect(page.getByRole('heading',{level:1,name:setup.name})).toBeVisible();
  const after=await api<LiveView>(judgeToken);expect(after.eventId).toBe(before.eventId);expect(after.ballots).toEqual(before.ballots);expect(Object.values(after.ballots[0].cells)[0].mark).toBe('Yes');expect(creations).toEqual([]);
  await context.close();
});
