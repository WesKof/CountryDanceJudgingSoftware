import { localKey, receiver } from './publication-helpers';
import { selectSetupRound, expandSetup, openRecovery, openResultManagement } from './setup-browser-helpers';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { api, command, base, observedMark } from './stage-helpers';
import { stageFixture } from './stage-fixture';
import { cellKey, type LiveView, type RoundView } from '../lib/live/types';

async function click(page: Page, locator: Locator, action: string) {
  if (['open-stage','next','lineup','conclude-stage'].includes(action) && await page.locator('.rail-item').count()>1) await page.getByRole('button',{name:'02 Score',exact:true}).click();
  const ack = page.waitForResponse((r) => r.url().endsWith('/api/live') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === action);
  await locator.click(); const response = await ack; expect(response.status(), JSON.stringify(await response.json())).toBe(200);
  if(action==='conclude-stage') await expect(page.getByRole('button',{name:'03 Results',exact:true})).toHaveAttribute('aria-current','step');
}
async function rail(page: Page, n: number) { const judge=await page.locator('.rail-item').count()===1; await page.locator('.rail-item').nth(judge?0:n).click(); if(n===0 && !judge) await expandSetup(page); if(n===2 && !judge) await openResultManagement(page); }
async function mark(page: Page, bib: number, value: string) {
  await page.getByRole('button', { name: `Bib ${bib}: ${value}`, exact: true }).click();
}
async function saved(page: Page) { await expect(page.locator('.pending-panel')).toHaveCount(0, { timeout: 20000 }); }
async function currentSong(page: Page) { const open = page.getByRole('button', { name: 'Open current song', exact: true }); if (await open.isVisible()) await open.click(); }

test('full isolated stage UI rehearsal: heat lineup/submission, organizer correction, votes, finals and recovery', async ({ browser }) => {
  test.setTimeout(600000);
  const organizerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), oneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), twoContext = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true }), headContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desk = await organizerContext.newPage(), one = await oneContext.newPage(), two = await twoContext.newPage(), head = await headContext.newPage(), pages = [one, two, head];
  const errors: string[] = []; for (const p of [desk, ...pages]) p.on('pageerror', (e) => errors.push(e.message));
  await desk.goto(base + '/live/new'); await desk.getByLabel('Event name', { exact: true }).fill('Browser stage rehearsal'); await desk.getByLabel('Venue', { exact: true }).fill('Synthetic venue');
  await desk.getByRole('button', { name: 'Create shared event', exact: true }).click(); await expect(desk).toHaveURL(/\/live\/[a-f0-9]{64}$/);
  const organizer = desk.url().split('/').at(-1)!;
  // Equivalent setup controls are exercised in local-browser.spec; the full fixture is seeded
  // only into this new synthetic event to keep the extensive multi-session rehearsal bounded.
  const setup = stageFixture(undefined, 9); setup.name = 'Browser stage rehearsal';
  await command(organizer, { action: 'setup', setup }); await desk.reload();
  let v = await api<LiveView>(organizer); const tokens = v.judgeLinks!.map((j) => j.path.split('/').at(-1)!);
  await Promise.all(pages.map((p, i) => p.goto(base + v.judgeLinks![i].path)));
  await rail(desk, 0); await click(desk, desk.getByRole('button', { name: 'Start prelims stage', exact: true }), 'open-stage');
  await expect(desk.getByRole('button', { name: 'Conclude stage & open review', exact: true })).toBeDisabled();
  let first = true;
  async function runHeat(r: RoundView, firstHeat: boolean) {
    const current = await api<LiveView>(organizer), h = r.definition.heats.find((h) => h.songs.some((p) => p.id === current.context.performanceId))!;
    await Promise.all(pages.map((p) => p.reload()));
    for (const p of pages) { await expect(p.locator('.phone-row')).toHaveCount(h.subjectIds.length); expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await p.evaluate(() => innerWidth)); }
    for (let song = 0; song < h.songs.length; song++) {
      if (song > 0) {
        await click(desk, desk.getByRole('button', { name: 'Next song', exact: true }), 'next');
        for (const p of pages) { await expect(p.getByRole('button', { name: 'Open current song', exact: true })).toBeVisible({ timeout: 10000 }); await currentSong(p); }
      }
      for (const [j, p] of pages.entries()) for (const [i, id] of h.subjectIds.entries()) {
        const s = r.definition.subjects.find((s) => s.id === id)!;
        if (song === 0) {
          if (firstHeat && j === 0 && (i === 0 || i === 2)) continue;
          await mark(p, s.number, firstHeat && j === 0 && i === 1 ? 'Yes' : observedMark(r, id));
        } else if (song === 1 && !(firstHeat && j === 0 && i === 2) && ((firstHeat && j === 0 && i < 2) || i === h.subjectIds.length - 1)) await mark(p, s.number, observedMark(r, id));
      }
      if (firstHeat && song === 0) {
        const row = one.locator('.phone-row').first(); await row.getByRole('button', { name: /^Note/ }).click();
        const note = row.getByRole('textbox', { name: 'Note for bib 101', exact: true });
        await oneContext.route('**/api/live', async (route) => { if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'save-cell') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic connection failure' }) }); else await route.continue(); });
        await note.fill('PRIVATE_BROWSER_STAGE_NOTE'); await expect(one.locator('.pending-panel')).toBeVisible();
        one.once('dialog', (d) => void d.accept()); await one.reload(); await expect(one.locator('.pending-panel')).toBeVisible();
        await oneContext.unroute('**/api/live'); await saved(one);
        await one.locator('.phone-row').first().getByRole('button', { name: /^Note/ }).click();
        const recovered = one.getByRole('textbox', { name: 'Note for bib 101', exact: true }); await expect(recovered).toHaveValue('PRIVATE_BROWSER_STAGE_NOTE');
        await recovered.focus(); const scroll = await one.evaluate(() => scrollY);
        // Advance room while the old note remains focused. The edit target must stay stable.
        await click(desk, desk.getByRole('button', { name: 'Next song', exact: true }), 'next');
        await expect(one.getByRole('button', { name: 'Open current song', exact: true })).toBeVisible({ timeout: 10000 });
        await expect(recovered).toBeFocused(); expect(await one.evaluate(() => scrollY)).toBe(scroll);
        await recovered.fill('PRIVATE_BROWSER_STAGE_NOTE retained on song one'); await saved(one);
        expect(JSON.stringify(await api<LiveView>(tokens[1]))).not.toContain('PRIVATE_BROWSER_STAGE_NOTE');
        for (const p of pages) await currentSong(p);
        // Song 2 has been opened for the focus test; score its permitted observations here.
        for (const [j, p] of pages.entries()) for (const [i, id] of h.subjectIds.entries()) if (!(j === 0 && i === 2) && ((j === 0 && i < 2) || i === h.subjectIds.length - 1)) await mark(p, r.definition.subjects.find((s) => s.id === id)!.number, observedMark(r, id));
        song = 1;
      }
      for (const p of pages) await saved(p);
    }
    await click(desk, desk.getByRole('button', { name: 'Open heat-end lineup', exact: true }), 'lineup');
    for (const p of pages) await expect(p.getByRole('heading', { name: 'Heat-end lineup check', exact: true })).toBeVisible({ timeout: 10000 });
    if (firstHeat) {
      await expect(one.getByRole('button', { name: 'Submit this heat', exact: true })).toBeDisabled(); await expect(one.getByText(/Uncovered bibs: 103/)).toBeVisible();
      await one.getByLabel('Current and past songs', { exact: true }).selectOption(h.songs[0].id); await mark(one, 103, 'A1'); await saved(one);
      await expect(one.getByRole('button', { name: 'Submit this heat', exact: true })).toBeDisabled();
      const acknowledge = one.getByRole('checkbox', { name: 'I checked the bibs and song marks for this heat and understand that submission locks them.', exact: true });
      await acknowledge.check(); await expect(one.getByRole('button', { name: 'Submit this heat', exact: true })).toBeEnabled();
      // Cancelling final confirmation must leave every entry editable and create no submission.
      one.once('dialog', (d) => { expect(d.message()).toContain('Beginner / Intermediate'); expect(d.message()).toContain('Heat 1'); void d.dismiss(); });
      await one.getByRole('button', { name: 'Submit this heat', exact: true }).click();
      expect((await api<LiveView>(tokens[0])).heatSubmissions!.length).toBe(0);
      await mark(one, 103, 'A2'); await expect(acknowledge).not.toBeChecked(); await mark(one, 103, 'A1'); await saved(one);
      await one.screenshot({ path: 'test-results/stage-lineup-390.png', fullPage: false });
    }
    for (const p of pages) {
      await p.getByRole('checkbox', { name: 'I checked the bibs and song marks for this heat and understand that submission locks them.', exact: true }).check();
      await expect(p.getByRole('button', { name: 'Submit this heat', exact: true })).toBeEnabled({ timeout: 10000 });
      p.once('dialog', (d) => void d.accept());
      try { await click(p, p.getByRole('button', { name: 'Submit this heat', exact: true }), 'submit-heat'); } catch(error) { throw new Error(String(error)+'; status='+await p.locator('.notice').allTextContents()+'; acknowledgement='+await p.getByRole('checkbox',{name:/I checked the bibs/}).isChecked()); }
      await expect(p.locator('.phone-row')).toHaveCount(0); await expect(p.getByText(/Heat submission acknowledged/)).toBeVisible();
    }
    expect((await api<LiveView>(organizer)).rounds.filter((round) => round.definition.kind === r.definition.kind).every((round) => round.standings === undefined)).toBe(true);
  }
  const prelimHeats = setup.blocks[0].roundIds.flatMap((rid) => setup.rounds.find((r) => r.id === rid)!.heats);
  for (const [i, h] of prelimHeats.entries()) {
    v = await api<LiveView>(organizer); const r = v.rounds.find((r) => r.definition.heats.some((heat) => heat.id === h.id))!;
    await runHeat(r, first); first = false;
    if (i < prelimHeats.length - 1) { await expect(desk.getByRole('button', { name: 'Next heat / division', exact: true })).toBeEnabled({ timeout: 10000 }); await click(desk, desk.getByRole('button', { name: 'Next heat / division', exact: true }), 'next'); }
  }
  await expect(desk.getByRole('button', { name: 'Conclude stage & open review', exact: true })).toBeEnabled(); await click(desk, desk.getByRole('button', { name: 'Conclude stage & open review', exact: true }), 'conclude-stage');
  await one.reload(); await rail(one, 1); await expect(one.getByText('Strictly · Beginner / Intermediate · submitted scorecards are read only', { exact: true })).toBeVisible();
  expect(await one.getByRole('button', { name: /^Bib \d+: / }).count()).toBe(0);
  await desk.reload(); await rail(desk,2);
  const correction = desk.getByText('Request a genuine recording-error correction', { exact: true }).first().locator('..');
  await correction.locator(':scope > summary').click();
  await correction.getByLabel('Correction song', { exact: true }).selectOption(setup.rounds[0].heats[0].songs[0].id);
  await correction.getByLabel('Wrong or affected bib', { exact: true }).selectOption(setup.rounds[0].subjects[1].id);
  await correction.getByLabel('Corrected mark for affected bib', { exact: true }).selectOption('');
  await correction.getByLabel('Intended bib for mistaken-bib transfer (optional)', { exact: true }).selectOption(setup.rounds[0].subjects[0].id);
  await correction.getByLabel('Correction reason', { exact: true }).fill('Observed bib 101 recorded as bib 102');
  await click(desk, correction.getByRole('button', { name: 'Request correction', exact: true }), 'request-correction');
  await desk.reload(); await rail(desk, 2); desk.once('dialog', (d) => void d.accept()); await click(desk, desk.getByRole('button', { name: 'Approve request as organizer', exact: true }), 'approve-request');
  expect((await api<LiveView>(organizer)).reviewRequests![0].appliedAt).toBeUndefined();
  await head.reload(); await rail(head, 1); head.once('dialog', (d) => void d.accept()); await click(head, head.getByRole('button', { name: 'Approve request as head', exact: true }), 'approve-request');
  expect((await api<LiveView>(organizer)).reviewRequests![0].appliedAt).toBeTruthy();
  // Ordinary judges and head vote through their own buttons; organizer has no vote action.
  for (const [j, p] of pages.entries()) {
    await p.reload(); await rail(p, 1);
    await expect(p.getByRole('heading', { name: 'Strictly · Beginner / Intermediate · submitted scorecards are read only', exact: true })).toBeVisible();
    const votes = p.locator('.tie-editor').filter({ has: p.getByRole('button', { name: 'Submit advancement vote', exact: true }) });
    await expect(votes).toHaveCount(2);
    while (await votes.count()) {
      const count = await votes.count();
      const ballot = votes.first(); await ballot.getByRole('checkbox').nth(j === 1 ? 1 : 0).check();
      await click(p, ballot.getByRole('button', { name: 'Submit advancement vote', exact: true }), 'vote');
      await expect(votes).toHaveCount(count - 1);
    }
  }
  await head.reload(); await rail(head, 1);
  const approve = head.getByRole('button', { name: 'Approve these exact submissions', exact: true });
  await expect(approve).toHaveCount(4);
  while (await approve.count()) { await expect(approve.first()).toBeEnabled(); const count = await approve.count(); await click(head, approve.first(), 'approve'); await expect(approve).toHaveCount(count - 1); }
  v = await api<LiveView>(organizer); expect(v.rounds.every((r) => r.standings!.approved)).toBe(true);
  // Approved finalists populate automatically; enter only the actual fixed J&J draw through setup controls.
  await desk.reload(); await expandSetup(desk);
  for (const f of v.setup.rounds.filter((r) => r.kind === 'finals')) {
    await selectSetupRound(desk, v.setup, f.id); await expandSetup(desk);
    const pre = v.rounds.find((r) => r.id === f.prelimRoundId)!;
    expect(f.finalistIds).toEqual(pre.standings!.advancingIds!);
    for (const id of f.finalistIds) {
      const subject = pre.definition.subjects.find((s) => s.id === id)!;
      await expect(desk.getByLabel('Approved finalists').getByText(`#${subject.number} ${subject.primary} ${subject.role ?? `& ${subject.secondary}`}`, {exact:true})).toBeVisible();
    }
    await expect(desk.getByLabel('Approved finalists').getByRole('checkbox')).toHaveCount(0);
    if (pre.definition.format === 'Jack & Jill') {
      const chosen = pre.definition.subjects.filter((s) => pre.standings!.advancingIds!.includes(s.id)), lead = chosen.find((s) => s.role === 'Lead')!, follow = chosen.find((s) => s.role === 'Follow')!;
      await desk.getByLabel(`#${lead.number} ${lead.primary} pairs with`, { exact: true }).selectOption(follow.id);
    }
  }
  await click(desk, desk.getByRole('button', { name: 'Save setup', exact: true }), 'setup'); await rail(desk, 0);
  await click(desk, desk.getByRole('button', { name: 'Start finals stage', exact: true }), 'open-stage');
  v = await api<LiveView>(organizer); const finals = v.rounds.filter((r) => r.definition.kind === 'finals');
  for (const [i, r] of finals.entries()) {
    await runHeat(r, false);
    if (i < finals.length - 1) { await expect(desk.getByRole('button', { name: 'Next heat / division', exact: true })).toBeEnabled({ timeout: 10000 }); await click(desk, desk.getByRole('button', { name: 'Next heat / division', exact: true }), 'next'); }
  }
  await click(desk, desk.getByRole('button', { name: 'Conclude stage & open review', exact: true }), 'conclude-stage');
  await head.reload(); await rail(head, 1);
  await expect(approve).toHaveCount(4);
  while (await approve.count()) { await expect(approve.first()).toBeEnabled(); const count = await approve.count(); await click(head, approve.first(), 'approve'); await expect(approve).toHaveCount(count - 1); }
  v = await api<LiveView>(organizer); expect(v.rounds.every((r) => r.standings!.approved)).toBe(true); expect(v.rounds.filter((r) => r.definition.kind === 'finals').every((r) => r.standings!.rows[0].average === 10)).toBe(true);
  await desk.reload(); await rail(desk, 3);
  await expect(desk.getByRole('button', {name:/Export|Print results|Send head-approved/})).toHaveCount(0);
  await openRecovery(desk);
  const backupDownload = desk.waitForEvent('download'); await desk.getByRole('button', { name: 'Download shared backup', exact: true }).click();
  const backup = JSON.parse(await readFile((await (await backupDownload).path())!, 'utf8')); expect(JSON.stringify(backup)).not.toContain('PRIVATE_BROWSER_STAGE_NOTE'); expect(backup.history.heatSubmissions.length).toBeGreaterThan(30);
  await rail(desk, 2); await desk.screenshot({ path: 'test-results/stage-results-desktop.png', fullPage: false });
  const firstSource = setup.rounds[0].heats[0].songs[0].id, firstSubject = setup.rounds[0].subjects[0].id;
  expect((await api<LiveView>(tokens[0])).ballots[0].cells[cellKey(firstSource, firstSubject)].note).toContain('retained on song one');
  // Complete the isolated multi-division mock through separate organizer/owner publication and revision.
  const ownerContext=await browser.newContext({viewport:{width:1440,height:1000}}),publicContext=await browser.newContext({viewport:{width:390,height:844}});
  const ownerPage=await ownerContext.newPage(),publicPage=await publicContext.newPage();
  await rail(desk,1);await expect(desk.getByRole('heading',{name:'Event results approved',exact:true})).toBeVisible();await expect(desk.getByRole('button',{name:/^Bib \d+:/})).toHaveCount(0);await expect(desk.getByRole('button',{name:'Submit this heat',exact:true})).toHaveCount(0);await rail(desk,3);
  const firstCompetition=setup.competitions[0];const prepare=desk.getByRole('button',{name:'Review results to publish',exact:true});
  await click(desk,prepare,'prepare-event-publication');v=await api<LiveView>(organizer);const releaseOne=v.publications!.find((p)=>p.competitionId===firstCompetition.id)!;
  const previewOne=desk.locator(`[data-publication-id="${releaseOne.id}"]`);await expect(previewOne.getByRole('heading',{name:`${firstCompetition.format} · ${firstCompetition.division}`,exact:true})).toBeVisible();expect(JSON.stringify(releaseOne.snapshot)).not.toContain('PRIVATE_BROWSER_STAGE_NOTE');expect(releaseOne.snapshot.stages[1].entrants[0].average).toBe(10);
  await click(desk,desk.getByRole('button',{name:'Send results for approval',exact:true}),'approve-event-publication');
  await ownerPage.goto(receiver+'/admin');await ownerPage.getByLabel('Admin access code',{exact:true}).fill(localKey('LOCAL_OWNER_KEY'));await ownerPage.getByRole('button',{name:'Sign in',exact:true}).click();
  const ownerEvent=ownerPage.locator(`[data-event-id="${releaseOne.snapshot.eventId}"]`);await ownerEvent.getByRole('button',{name:'Approve & publish results',exact:true}).click();await expect(ownerPage.getByText('Approved and published. The results are now on this website.',{exact:true})).toBeVisible();
  await publicPage.goto(receiver);await expect(publicPage.getByRole('heading',{name:'A little country. A lot of community.',exact:true})).toBeVisible();await publicPage.getByRole('link',{name:'Leaderboard',exact:true}).click();
  const publicCard=publicPage.locator(`article[data-publication-id="${releaseOne.id}"]`);await expect(publicCard.getByText(/Revision 1/).first()).toBeVisible();await publicCard.getByRole('link',{name:/#101 Entrant/}).first().click();await expect(publicPage.getByRole('heading',{name:'prelims',exact:true})).toBeVisible();await expect(publicPage.getByRole('heading',{name:'finals',exact:true})).toBeVisible();await expect(publicPage.getByText(/Blank · Not observed/).first()).toBeVisible();await publicPage.getByRole('link',{name:'Synthetic head',exact:true}).first().click();await expect(publicPage.getByText(/Head judge/).first()).toBeVisible();expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await publicPage.screenshot({path:'test-results/public-judge-390.png',fullPage:false});
  // Same finalist membership, one genuine recording error. Values remain unchanged under revision 1.
  await desk.reload();await rail(desk,2);v=await api<LiveView>(organizer);const finalSource=v.rounds.find((r)=>r.definition.competitionId===firstCompetition.id&&r.definition.kind==='finals')!,finalHeat=finalSource.definition.heats[0],ownSubmission=v.heatSubmissions!.find((s)=>s.roundKey===finalSource.key&&s.judgeId===setup.judges[0].id)!;

  // There are separate prelim/finals cards; select the exact source submission on the finals card.
  const finalCorrection=desk.getByText('Request a genuine recording-error correction',{exact:true}).locator('..').filter({has:desk.locator(`option[value="${ownSubmission.id}"]`)}).first();
  await finalCorrection.locator(':scope > summary').click();await finalCorrection.getByLabel('Submitted heat / judge',{exact:true}).selectOption(ownSubmission.id);await finalCorrection.getByLabel('Correction song',{exact:true}).selectOption(finalHeat.songs[0].id);await finalCorrection.getByLabel('Wrong or affected bib',{exact:true}).selectOption(finalHeat.subjectIds[0]);await finalCorrection.getByLabel('Corrected mark for affected bib',{exact:true}).selectOption('A1');await finalCorrection.getByLabel('Correction reason',{exact:true}).fill('PRIVATE_REVISION_REASON_SENTINEL');await click(desk,finalCorrection.getByRole('button',{name:'Request correction',exact:true}),'request-correction');
  const requestArticle=desk.locator('article').filter({hasText:'PRIVATE_REVISION_REASON_SENTINEL'});desk.once('dialog',(d)=>void d.accept());await click(desk,requestArticle.getByRole('button',{name:'Approve request as organizer',exact:true}),'approve-request');await head.reload();const headRequest=head.locator('article').filter({hasText:'PRIVATE_REVISION_REASON_SENTINEL'});head.once('dialog',(d)=>void d.accept());await click(head,headRequest.getByRole('button',{name:'Approve request as head',exact:true}),'approve-request');
  await ownerPage.getByText('Sending & website controls',{exact:true}).click();await ownerPage.getByRole('button',{name:'Retry sending',exact:true}).click();await publicPage.goto(receiver+'/results/'+releaseOne.id);await expect(publicPage.getByText(/Under review/).first()).toBeVisible();expect(await publicPage.locator('main').innerText()).not.toContain('PRIVATE_REVISION_REASON_SENTINEL');
  const finalHeadCard=head.locator('.result-sheet').filter({hasText:`${firstCompetition.format} · ${firstCompetition.division} · finals`});await click(head,finalHeadCard.getByRole('button',{name:'Approve these exact submissions',exact:true}),'approve');await desk.reload();await rail(desk,3);await click(desk,prepare,'prepare-event-publication');v=await api<LiveView>(organizer);const releaseTwo=v.publications!.find((p)=>p.competitionId===firstCompetition.id&&p.revision===2)!;expect(releaseTwo.snapshot.stages[1].entrants[0].average).toBeCloseTo((4.5+10+10)/3,9);
  await click(desk,desk.getByRole('button',{name:'Send results for approval',exact:true}),'approve-event-publication');await ownerPage.goto(receiver+'/admin');await ownerPage.locator(`[data-event-id="${releaseTwo.snapshot.eventId}"]`).getByRole('button',{name:'Approve & publish results',exact:true}).click();await expect(ownerPage.getByText('Approved and published. The results are now on this website.',{exact:true})).toBeVisible();
  await publicPage.goto(receiver+'/competition/'+releaseTwo.snapshot.eventId+'/'+releaseTwo.snapshot.competitionId);await expect(publicPage.getByText(/Revision 2/).first()).toBeVisible();await expect(publicPage.getByText('8.1667',{exact:true}).first()).toBeVisible();await publicPage.goto(receiver+'/results/'+releaseOne.id);await expect(publicPage.getByText(/Superseded/).first()).toBeVisible();await publicPage.getByRole('link',{name:'Current revision',exact:true}).click();await expect(publicPage.getByText(/Revision 2/).first()).toBeVisible();await publicPage.screenshot({path:'test-results/public-revision-390.png',fullPage:false});
  // Publish a completed J&J competition and follow the fixed pair back to both original dancers.
  v=await api<LiveView>(organizer);const jjCompetition=setup.competitions[2],jjRelease=v.publications!.find((p)=>p.competitionId===jjCompetition.id&&p.status==='released')!;expect(jjRelease).toBeTruthy();const pair=jjRelease.snapshot.stages.find((s)=>s.kind==='finals')!.entrants[0];await publicPage.goto(receiver+'/results/'+jjRelease.id+'/entrant/'+pair.id);await expect(publicPage.getByRole('heading',{name:'prelims',exact:true})).toBeVisible();await expect(publicPage.getByRole('heading',{name:'finals',exact:true})).toBeVisible();for(const member of pair.members){const person=jjRelease.snapshot.stages.find((s)=>s.kind==='prelims')!.entrants.find((e)=>e.id===member)!;await expect(publicPage.getByRole('link',{name:new RegExp('#'+person.number+' '+person.primary)}).first()).toBeVisible();}expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await publicPage.screenshot({path:'test-results/public-jj-identity-390.png',fullPage:false});
  await Promise.all([ownerContext.close(),publicContext.close()]);
  // Started withdrawal needs both actual role buttons and retains the existing submissions.
  await rail(desk, 2); await desk.getByRole('heading',{name:'Withdraw a started competition',exact:true}).locator('..').click(); const withdrawn = setup.competitions.at(-1)!;
  await desk.getByLabel('Competition to withdraw', { exact: true }).selectOption(withdrawn.id); await desk.locator('form').filter({has:desk.getByLabel('Competition to withdraw',{exact:true})}).getByLabel('Withdrawal reason',{exact:true}).fill('Synthetic browser withdrawal');
  desk.once('dialog', (d) => void d.dismiss()); await desk.getByRole('button', { name: 'Request competition withdrawal', exact: true }).click();
  expect((await api<LiveView>(organizer)).reviewRequests!.filter((q) => q.kind === 'withdrawal')).toHaveLength(0);
  desk.once('dialog', (d) => void d.accept()); await click(desk, desk.getByRole('button', { name: 'Request competition withdrawal', exact: true }), 'request-withdrawal');
  await expect(desk.getByRole('button', { name: 'Approve request as organizer', exact: true })).toBeVisible();
  desk.once('dialog', (d) => void d.accept()); await click(desk, desk.getByRole('button', { name: 'Approve request as organizer', exact: true }), 'approve-request');
  expect((await api<LiveView>(organizer)).setup.competitions).toHaveLength(4);
  await head.reload(); await rail(head, 1); head.once('dialog', (d) => void d.accept()); await click(head, head.getByRole('button', { name: 'Approve request as head', exact: true }), 'approve-request');
  expect((await api<LiveView>(organizer)).setup.competitions).toHaveLength(3);
  await desk.reload(); await openRecovery(desk); const historyDownload = desk.waitForEvent('download'); await desk.getByRole('button', { name: 'Download shared backup', exact: true }).click();
  const withdrawalBackup = JSON.parse(await readFile((await (await historyDownload).path())!, 'utf8')); expect(withdrawalBackup.history.heatSubmissions.length).toBe(backup.history.heatSubmissions.length+1); for(const original of backup.history.heatSubmissions)expect(withdrawalBackup.history.heatSubmissions.some((s:{id:string})=>s.id===original.id)).toBe(true); expect(JSON.stringify(withdrawalBackup)).not.toContain('synthetic-key');
  const oldPath = desk.url(); desk.once('dialog', (d) => void d.accept());
  await desk.locator('label').filter({ hasText: 'Restore as a new shared event' }).locator('input[type=file]').setInputFiles({ name: 'shared-stage.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withdrawalBackup)) });
  await expect(desk).not.toHaveURL(oldPath); await expect(desk.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  const restored = await api<LiveView>(new URL(desk.url()).searchParams.get('event')!); expect(restored.rounds).toHaveLength(0); expect(restored.restoredHistory).toBeTruthy(); expect(restored.judgeLinks!.some((l) => tokens.includes(l.path.split('/').at(-1)!))).toBe(false);
  await Promise.all([organizerContext.close(), oneContext.close(), twoContext.close(), headContext.close()]);
  expect(errors).toEqual([]);
});
