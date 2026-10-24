import {test,expect} from '@playwright/test';
import {api,base,command,save,submitHeat} from './stage-helpers';
import {limitedStage,createStage,dance,exact} from './publication-helpers';
import { selectSetupRound,expandSetup} from './setup-browser-helpers';
import type {LiveView} from '../lib/live/types';

test('configure top X in Prelims setup; head approval fills Finals and the actual Run control starts it',async({browser})=>{
  const setup=limitedStage(1,4),{organizer,tokens,path}=await createStage(setup);
  const context=await browser.newContext(),desk=await context.newPage();await desk.goto(base+path);await expandSetup(desk);
  await selectSetupRound(desk, setup, setup.rounds[0].id);
  await desk.getByLabel('Number of finalist couples',{exact:true}).fill('1');
  const saved=desk.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='setup');await desk.getByRole('button',{name:'Save setup',exact:true}).click();expect((await saved).status()).toBe(200);
  expect((await api<LiveView>(organizer)).setup.rounds[1].finalistCount).toBe(1);
  await command(organizer,{action:'open-stage',kind:'prelims'});let v=await api<LiveView>(organizer);await dance(organizer,tokens,v.rounds[0]);await command(organizer,{action:'conclude-stage'});
  const headContext=await browser.newContext(),headPage=await headContext.newPage();await headPage.goto(base+v.judgeLinks![2].path);
  await headPage.locator('.rail-item').click();const approval=headPage.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='approve');await headPage.getByRole('button',{name:'Approve these exact submissions',exact:true}).click();expect((await approval).status()).toBe(200);
  v=await api<LiveView>(organizer);expect(v.setup.rounds[1].finalistIds).toEqual([setup.rounds[0].subjects[0].id]);
  await desk.reload();await expandSetup(desk);await selectSetupRound(desk, setup, setup.rounds[1].id);await expandSetup(desk);
  await expect(desk.getByLabel('Approved finalists').getByText('#101 Entrant 0-0 1 & Partner 0-0 1',{exact:true})).toBeVisible();await expect(desk.getByLabel('Approved finalists').getByRole('checkbox')).toHaveCount(0);
  await desk.getByRole('button',{name:'02 Score',exact:true}).click();const start=desk.getByRole('button',{name:'Start finals stage',exact:true});await expect(start).toBeEnabled();const opened=desk.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='open-stage');await start.click();expect((await opened).status()).toBe(200);
  await desk.reload();v=await api<LiveView>(organizer);expect(v.rounds.find((r)=>r.definition.kind==='finals')!.definition.subjects.map((s)=>s.number)).toEqual([101]);
  await context.close();await headContext.close();
});

import {stageFixture} from './stage-fixture';
test('J&J approved dancers are visible before their actual draw; Run dropdowns and named judge links persist',async({browser})=>{
  const setup=stageFixture(),competition=setup.competitions[2];setup.competitions=[competition];setup.rounds=setup.rounds.filter((r)=>r.competitionId===competition.id);setup.blocks=setup.blocks.map((b)=>({...b,roundIds:b.roundIds.filter((id)=>setup.rounds.some((r)=>r.id===id))}));
  const pre=setup.rounds[0],final=setup.rounds[1],expected=[pre.subjects[0].id,pre.subjects[3].id];
  const {organizer,tokens,path,head}=await createStage(setup);await command(organizer,{action:'open-stage',kind:'prelims'});let view=await api<LiveView>(organizer);const round=view.rounds[0],heat=round.definition.heats[0];
  for(const token of tokens)for(const [i,subject]of pre.subjects.entries())await save(token,round,heat.songs[0].id,subject.id,i%3===0?'Yes':i%3===1?'A1':'A2');
  for(let i=1;i<heat.songs.length;i++)await command(organizer,{action:'next'});await command(organizer,{action:'lineup'});for(const token of tokens)await submitHeat(token,round,heat.id);await command(organizer,{action:'conclude-stage'});await exact(head,round.id,'approve');
  view=await api<LiveView>(organizer);expect(view.setup.rounds[1].finalistIds).toEqual(expected);expect(view.setup.rounds[1].subjects).toEqual([]);
  // Invalid drafts cannot be saved. Valid changes require a fresh explicit head decision.
  const contextCount=await browser.newContext(),countDesk=await contextCount.newPage(),countHead=await contextCount.newPage();await countDesk.goto(base+path);await expandSetup(countDesk);await selectSetupRound(countDesk, setup, final.id);await expandSetup(countDesk);
  const count=countDesk.getByLabel('Finalists per role / number of pairs',{exact:true});await expect(count).toHaveAttribute('max','3');const before=await api<LiveView>(organizer);await count.fill('4');await expect(count).toHaveAttribute('aria-invalid','true');await expect(countDesk.getByText(/4 per role.*3 eligible leads and 3 eligible follows/).first()).toBeVisible();await expect(countDesk.getByRole('button',{name:'Save setup',exact:true})).toBeDisabled();expect((await api<LiveView>(organizer)).version).toBe(before.version);
  await count.fill('2');let savedCount=countDesk.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='setup');await countDesk.getByRole('button',{name:'Save setup',exact:true}).click();expect((await savedCount).status()).toBe(200);
  // The POST acknowledgement precedes the refreshed view and save-triggered disclosure close.
  await expect(countDesk.getByText('Setup saved to the shared event.',{exact:true})).toBeVisible();
  await expect(countDesk.locator('#setup-saved-details')).not.toHaveAttribute('open');
  await expandSetup(countDesk);await expect(countDesk.getByLabel('Previous finalist selection')).toBeVisible();await expect(countDesk.getByLabel('Approved finalists')).toHaveCount(0);
  await countDesk.getByRole('button',{name:'02 Score',exact:true}).click();
  await expect(countDesk.getByRole('heading',{name:'Head approval needed',exact:true})).toBeVisible();
  await expect(countDesk.locator('#run-prelims')).not.toHaveAttribute('open');
  await expect(countDesk.locator('#run-submissions')).not.toHaveAttribute('open');
  await countDesk.locator('#run-submissions > summary').click();
  await expect(countDesk.getByRole('region',{name:'Heat submissions',exact:true})).toContainText('Synthetic one');
  await expect(countDesk.getByRole('region',{name:'Heat submissions',exact:true})).toContainText('Received');
  await countDesk.locator('#run-prelims > summary').click();
  await expect(countDesk.getByText(/Synthetic head must approve each current competition result/)).toBeVisible();
  await expect(countDesk.getByText(/Finals pairs must contain/)).toHaveCount(0);
  await expect(countDesk.getByRole('button',{name:'Start finals stage',exact:true})).toHaveCount(0);
  await expect(countDesk.locator('#run-finals > summary')).toContainText('awaiting Prelims approval');
  await countDesk.getByRole('button',{name:'Review prelims results',exact:true}).click();await expect(countDesk.getByRole('button',{name:'Approve these exact submissions',exact:true})).toHaveCount(0);
  await countHead.goto(base+view.judgeLinks![2].path);let approvedCount=countHead.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='approve');await countHead.getByRole('button',{name:'Approve these exact submissions',exact:true}).click();expect((await approvedCount).status()).toBe(200);
  await countDesk.getByRole('button',{name:'01 Set up',exact:true}).click();await expandSetup(countDesk);await selectSetupRound(countDesk, setup, final.id);await expandSetup(countDesk);await count.fill('1');savedCount=countDesk.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='setup');await countDesk.getByRole('button',{name:'Save setup',exact:true}).click();expect((await savedCount).status()).toBe(200);await countHead.reload();approvedCount=countHead.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='approve');await countHead.getByRole('button',{name:'Approve these exact submissions',exact:true}).click();expect((await approvedCount).status()).toBe(200);await contextCount.close();

  const rejected=await command(organizer,{action:'open-stage',kind:'finals'},400);expect(String(rejected.error)).toContain('actual Finals draw');
  const context=await browser.newContext(),desk=await context.newPage();await desk.goto(base+path);await desk.getByRole('button',{name:'02 Score',exact:true}).click();
  // The card uses a labelled section, so query the accessible label across HTML container types.
  await desk.getByRole('button',{name:'Set Finals pairings',exact:true}).click();
  const card=desk.getByLabel('Jack & Jill · Beginner / Intermediate · Finals pairing');
  await expect(card.locator('.shared-roster').getByText(/#201 Entrant/)).toBeHidden();await card.getByText('Selected dancers',{exact:true}).click();await expect(card.locator('.shared-roster').getByText(/#201 Entrant 1-0 1/)).toBeVisible();await expect(card.locator('.shared-roster').getByText(/#204 Entrant 1-0 4/)).toBeVisible();await expect(desk.getByText(/Add entrants to this round/)).toHaveCount(0);await expect(desk.getByText(/Heat 1 has no entrants/)).toHaveCount(0);await expect(desk.getByRole('button',{name:'Start finals stage',exact:true})).toHaveCount(0);
  const pair=card.getByLabel('#201 Entrant 1-0 1 pairs with',{exact:true});await pair.selectOption(expected[1]);await expect(desk.getByRole('button',{name:'Start finals stage',exact:true})).toHaveCount(0);await expect(card.getByText(/Unsaved pairing edits/)).toBeVisible();
  const saved=desk.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='setup');await card.getByRole('button',{name:'Save Finals pairings',exact:true}).click();expect((await saved).status()).toBe(200);await expect(desk.getByRole('button',{name:'02 Score',exact:true})).toHaveAttribute('aria-current','step');
  const start=desk.getByRole('button',{name:'Start finals stage',exact:true});await expect(start).toBeEnabled();const opened=desk.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='open-stage');await start.click();expect((await opened).status()).toBe(200);await desk.reload();view=await api<LiveView>(organizer);expect(view.rounds.find((r)=>r.id===final.id)!.definition.subjects[0].members).toEqual(expected);
  for(const [i,link]of view.judgeLinks!.entries()){const judgeContext=await browser.newContext({viewport:{width:390,height:844}}),page=await judgeContext.newPage();await page.goto(base+link.path);await expect(page.getByRole('heading',{level:1,name:(setup.judges[i].id===setup.headJudgeId?'Head Judge — ':'')+setup.judges[i].name,exact:true})).toBeVisible();await expect(page).toHaveTitle(setup.judges[i].name+' · '+setup.name);await page.reload();await expect(page.getByRole('heading',{level:1,name:(setup.judges[i].id===setup.headJudgeId?'Head Judge — ':'')+setup.judges[i].name,exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await judgeContext.close();}
  await context.close();
});


test('Run pairs the remaining finalists, retains an existing draw, persists drafts and rejects stale editing',async({browser})=>{
  const setup=stageFixture(),competition=setup.competitions[2];setup.competitions=[competition];setup.rounds=setup.rounds.filter((r)=>r.competitionId===competition.id);setup.blocks=setup.blocks.map((b)=>({...b,roundIds:b.roundIds.filter((id)=>setup.rounds.some((r)=>r.id===id))}));setup.rounds[1].finalistCount=2;
  const pre=setup.rounds[0],ids=[pre.subjects[0].id,pre.subjects[1].id,pre.subjects[3].id,pre.subjects[4].id];
  const {organizer,tokens,head,path}=await createStage(setup);await command(organizer,{action:'open-stage',kind:'prelims'});let view=await api<LiveView>(organizer);const r=view.rounds[0],heat=r.definition.heats[0];
  for(const token of tokens)for(const [i,subject]of pre.subjects.entries())await save(token,r,heat.songs[0].id,subject.id,i%3===0?'Yes':i%3===1?'A1':'A2');for(let i=1;i<heat.songs.length;i++)await command(organizer,{action:'next'});await command(organizer,{action:'lineup'});for(const token of tokens)await submitHeat(token,r,heat.id);await command(organizer,{action:'conclude-stage'});await exact(head,r.id,'approve');
  view=await api<LiveView>(organizer);expect(view.setup.rounds[1].finalistIds).toEqual(ids);const partial=structuredClone(view.setup),final=partial.rounds[1];final.subjects=[{id:'existing-actual-pair',number:201,primary:pre.subjects[0].primary,secondary:pre.subjects[3].primary,members:[ids[0],ids[2]]}];final.heats[0].subjectIds=['existing-actual-pair'];await command(organizer,{action:'setup',setup:partial});await command(tokens[0],{action:'setup',setup:partial},403);
  const before=await api<LiveView>(organizer),fingerprint=before.rounds[0].standings!.fingerprint,submissions=before.heatSubmissions;
  const context=await browser.newContext({viewport:{width:390,height:844}}),desk=await context.newPage();await desk.goto(base+path);await desk.getByRole('button',{name:'02 Score',exact:true}).click();await desk.getByRole('button',{name:'Set Finals pairings',exact:true}).click();const card=desk.getByLabel('Jack & Jill · Beginner / Intermediate · Finals pairing'),first=card.getByLabel('#201 Entrant 1-0 1 pairs with',{exact:true}),second=card.getByLabel('#202 Entrant 1-0 2 pairs with',{exact:true});
  await expect(first).toHaveValue(ids[2]);await expect(second).toHaveValue('');await expect(second.locator(`option[value="${ids[2]}"]`)).toHaveAttribute('disabled','');await expect(second.locator('option')).toHaveCount(3);await expect(card.getByRole('button',{name:'Save Finals pairings',exact:true})).toBeDisabled();
  const missing=card.getByRole('button',{name:'Choose missing follow',exact:true});await missing.focus();await desk.keyboard.press('Enter');await expect(second).toBeFocused();await expect(first).toHaveValue(ids[2]);
  await second.selectOption(ids[3]);await expect(desk.getByRole('button',{name:'Start finals stage',exact:true})).toHaveCount(0);await desk.getByRole('button',{name:'03 Results',exact:true}).click();await desk.getByRole('button',{name:'02 Score',exact:true}).click();await desk.locator('#run-finals > summary').click();await expect(second).toHaveValue(ids[3]);await card.getByRole('button',{name:'Discard pairing edits',exact:true}).click();await expect(second).toHaveValue('');await expect(first).toHaveValue(ids[2]);expect((await api<LiveView>(organizer)).version).toBe(before.version);
  await second.selectOption(ids[3]);await command(organizer,{action:'setup',setup:structuredClone(before.setup)});await expect(card.getByText(/event changed while you edited/)).toBeVisible({timeout:10000});await expect(card.getByRole('button',{name:'Save Finals pairings',exact:true})).toBeDisabled();await card.getByRole('button',{name:'Discard pairing edits',exact:true}).click();await second.selectOption(ids[3]);
  const response=desk.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='setup');await card.getByRole('button',{name:'Save Finals pairings',exact:true}).click();expect((await response).status()).toBe(200);await expect(desk.getByRole('button',{name:'Start finals stage',exact:true})).toBeEnabled();await desk.reload();await desk.getByRole('button',{name:'02 Score',exact:true}).click();await desk.locator('#run-finals > summary').click();await expect(card.locator(':scope')).not.toHaveAttribute('open');await card.locator(':scope > summary').click();await expect(first).toHaveValue(ids[2]);await expect(second).toHaveValue(ids[3]);expect(await desk.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  view=await api<LiveView>(organizer);const saved=view.setup.rounds[1];expect(saved.subjects.find((s)=>s.id==='existing-actual-pair')).toEqual(final.subjects[0]);expect(saved.subjects.map((s)=>s.members)).toEqual([[ids[0],ids[2]],[ids[1],ids[3]]]);expect(saved.heats[0].songs).toEqual(final.heats[0].songs);expect(saved.finalistIds).toEqual(ids);expect(saved.finalistCount).toBe(2);expect(view.rounds[0].standings!.approved).toBe(true);expect(view.rounds[0].standings!.fingerprint).toBe(fingerprint);expect(view.heatSubmissions).toEqual(submissions);
  const started=desk.waitForResponse((r)=>r.url().endsWith('/api/live')&&r.request().postDataJSON()?.action==='open-stage');await desk.getByRole('button',{name:'Start finals stage',exact:true}).click();expect((await started).status()).toBe(200);await expect(card).toHaveCount(0);await desk.reload();view=await api<LiveView>(organizer);expect(view.rounds.find((r)=>r.definition.kind==='finals')!.definition.subjects.map((s)=>s.members)).toEqual([[ids[0],ids[2]],[ids[1],ids[3]]]);await command(organizer,{action:'setup',setup:partial},423);await context.close();
});
