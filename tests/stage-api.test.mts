import test from 'node:test';
import assert from 'node:assert/strict';
import { stageFixture } from './stage-fixture.ts';
import { api, command, nonce, observedMark, save, submitHeat } from './stage-helpers.ts';
import type { LiveView, ReviewRequest } from '../lib/live/types.ts';

test('local D1 stage rehearsal: 44 couples, rotations, heat snapshots, votes, amendments, finals and withdrawal', { timeout: 300000 }, async (t) => {
  const created = await api<{ path: string }>('', { action: 'create', requestId: nonce(), name: 'Isolated stage API rehearsal', venue: 'Synthetic', date: '' });
  const organizer = created.path.split('/').at(-1)!, setup = stageFixture();
  await t.test('separate participants, head role and stage readiness are checked on the server', async () => {
    const wrong = structuredClone(setup); wrong.judges[0].participantId = wrong.organizerParticipantId;
    await command(organizer, { action: 'setup', setup: wrong }, 400);
    const unattested = { ...setup, separationAttested: false };
    await command(organizer, { action: 'setup', setup: unattested });
    await command(organizer, { action: 'open-stage', kind: 'prelims' }, 400);
    const excludedHead = structuredClone(setup); excludedHead.rounds[0].judgeIds = setup.judges.slice(0, 2).map((j) => j.id);
    await command(organizer, { action: 'setup', setup: excludedHead });
    await command(organizer, { action: 'open-stage', kind: 'prelims' }, 400);
    await command(organizer, { action: 'setup', setup });
    await command(organizer, { action: 'open-stage', kind: 'finals' }, 400);
    await command(organizer, { action: 'open-stage', kind: 'prelims' });
    await command(organizer, { action: 'lineup' }, 400);
    await command(organizer, { action: 'conclude-stage' }, 400);
    const v = await api<LiveView>(organizer), r = v.rounds[0];
    await api(organizer, { action: 'save-cell', requestId: crypto.randomUUID(), roundKey: r.key, performanceId: v.context.performanceId, subjectId: r.definition.subjects[0].id, mark: 'Yes', note: '', baseRevision: 0 }, 403);
  });
  let desk = await api<LiveView>(organizer);
  const tokens = desk.judgeLinks!.map((l) => l.path.split('/').at(-1)!); const head = tokens[2], judge = tokens[0];
  const originalLinks = desk.judgeLinks;
  await t.test('cell conflicts, own-note privacy and heat-end coverage/submission locks', async () => {
    const v = await api<LiveView>(judge), r = v.rounds[0], p = v.context.performanceId!, id = r.definition.subjects[0].id;
    const input = { action: 'save-cell', requestId: crypto.randomUUID(), roundKey: r.key, performanceId: p, subjectId: id, mark: 'Yes', note: 'PRIVATE_STAGE_NOTE', baseRevision: 0 };
    const first = await api(judge, input); assert.deepEqual(await api(judge, input), first);
    const statuses = await Promise.all(['A1', 'A2'].map(async (mark) => {
      const response = await fetch(`${process.env.LIVE_TEST_URL ?? 'http://127.0.0.1:3000'}/api/live`, { method: 'POST', headers: { Authorization: `Bearer ${judge}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, mark, baseRevision: 1, requestId: crypto.randomUUID() }) }); return response.status;
    })); assert.deepEqual(statuses.sort(), [200, 409]);
    assert.ok(!JSON.stringify(await api<LiveView>(head)).includes('PRIVATE_STAGE_NOTE'));
    assert.ok(!JSON.stringify(await api<LiveView>(organizer)).includes('PRIVATE_STAGE_NOTE'));
    assert.ok(!JSON.stringify(await api<LiveView>(judge)).includes('PRIVATE_SELECTION_SENTINEL'));
    assert.ok((await api<LiveView>(head)).rounds.every((r) => r.standings === undefined && r.submittedMarks === undefined));
    await submitHeat(judge, r, r.definition.heats[0].id, 400);
  });
  let firstHeat = true;
  while (true) {
    desk = await api<LiveView>(organizer);
    const r = desk.rounds.find((r) => r.definition.heats.some((h) => h.songs.some((p) => p.id === desk.context.performanceId)))!, h = r.definition.heats.find((h) => h.songs.some((p) => p.id === desk.context.performanceId))!;
    for (let song = 0; song < h.songs.length; song++) {
      if (song > 0) await command(organizer, { action: 'next' });
      for (const [j, token] of tokens.entries()) {
        for (const [i, subjectId] of h.subjectIds.entries()) {
          if (song === 0) {
            if (firstHeat && j === 0 && i === 2) { await save(token, r, h.songs[song].id, subjectId, '', 'Uncovered observation reminder'); continue; }
            const mark = firstHeat && j === 0 && i === 0 ? '' : firstHeat && j === 0 && i === 1 ? 'Yes' : observedMark(r, subjectId);
            await save(token, r, h.songs[song].id, subjectId, mark, firstHeat && j === 0 && i === 0 ? 'PRIVATE_STAGE_NOTE' : '');
          } else if (song === 1 && ((firstHeat && j === 0 && i < 2) || i === h.subjectIds.length - 1)) await save(token, r, h.songs[song].id, subjectId, observedMark(r, subjectId));
        }
      }
    }
    await command(organizer, { action: 'lineup' });
    if (firstHeat) {
      await submitHeat(judge, r, h.id, 400);
      await save(judge, r, h.songs[0].id, h.subjectIds[2], 'A1');
      const current = await api<LiveView>(judge), b = current.ballots.find((b) => b.roundKey === r.key)!;
      await api(judge, { action: 'submit-heat', requestId: crypto.randomUUID(), roundKey: r.key, heatId: h.id, ballotVersion: b.version }, 400);
      await api(judge, { action: 'submit-heat', requestId: crypto.randomUUID(), roundKey: r.key, heatId: h.id, ballotVersion: b.version - 1, acknowledged: true }, 409);
      const input = { action: 'submit-heat', requestId: crypto.randomUUID(), roundKey: r.key, heatId: h.id, ballotVersion: b.version, acknowledged: true };
      const ack = await api(judge, input); assert.deepEqual(await api(judge, input), ack);
      assert.ok((await api<LiveView>(judge)).heatSubmissions!.find((s) => s.heatId === h.id)!.acknowledgedAt);
      await command(organizer, { action: 'next' }, 400);
      await save(judge, r, h.songs[0].id, h.subjectIds[0], 'A2', '', 423);
      await submitHeat(tokens[1], r, h.id); await submitHeat(head, r, h.id);
      assert.ok((await api<LiveView>(organizer)).rounds.every((r) => r.standings === undefined));
    } else await Promise.all(tokens.map((token) => submitHeat(token, r, h.id)));
    firstHeat = false;
    desk = await api<LiveView>(organizer);
    const order = setup.blocks[0].roundIds.flatMap((rid) => desk.rounds.find((r) => r.id === rid)!.definition.heats);
    if (h.id === order.at(-1)!.id) break;
    await command(organizer, { action: 'next' });
  }
  await command(organizer, { action: 'conclude-stage' });
  await t.test('read-only stage cards, dual exact-version approvals and mistaken-bib amendment history', async () => {
    const v = await api<LiveView>(judge), r = v.rounds[0], h = r.definition.heats[0], sub = v.heatSubmissions!.find((s) => s.roundKey === r.key && s.heatId === h.id)!;
    assert.ok(v.rounds.every((r) => r.standings?.complete));
    assert.ok(v.rounds[0].submittedMarks!.some((c) => c.mark === ''));
    await save(judge, r, h.songs[1].id, h.subjectIds[0], 'A2', '', 423);
    await command(organizer, { action: 'reopen', roundKey: r.key, reason: 'Forbidden single-role unlock' }, 400);
    const correction = { action: 'request-correction', roundKey: r.key, heatId: h.id, judgeId: setup.judges[0].id, submissionId: sub.id, reason: 'Wrong contestant: observed bib 101 Yes recorded on bib 102.', changes: [{ performanceId: h.songs[0].id, subjectId: h.subjectIds[1], after: '' }, { performanceId: h.songs[0].id, subjectId: h.subjectIds[0], after: 'Yes' }] };
    await command(tokens[1], correction, 403);
    const requested = await command(judge, correction) as { reviewRequestId: string };
    await command(organizer, { action: 'approve-request', reviewRequestId: requested.reviewRequestId, requestVersion: 1 });
    assert.equal((await api<LiveView>(organizer)).heatSubmissions!.find((s) => s.id === sub.id)!.version, 1);
    await command(judge, { ...correction, reviewRequestId: requested.reviewRequestId, reason: correction.reason + ' Confirmed during review.' });
    await command(head, { action: 'approve-request', reviewRequestId: requested.reviewRequestId, requestVersion: 1 }, 409);
    const revised = (await api<LiveView>(organizer)).reviewRequests!.find((q) => q.id === requested.reviewRequestId)!;
    assert.equal(revised.version, 2); assert.equal(revised.approvals.length, 0);
    await command(head, { action: 'approve-request', reviewRequestId: revised.id, requestVersion: 2 });
    assert.ok(!(await api<LiveView>(organizer)).reviewRequests!.find((q) => q.id === revised.id)!.appliedAt);
    await command(organizer, { action: 'approve-request', reviewRequestId: revised.id, requestVersion: 2 });
    const applied = (await api<LiveView>(organizer)).reviewRequests!.find((q) => q.id === revised.id)!;
    assert.ok(applied.appliedAt); assert.equal(new Set(applied.approvals.map((a) => a.participantId)).size, 2);
    assert.equal(applied.payload.changes![0].before, 'Yes'); assert.equal(applied.payload.changes![0].after, '');
    const results = (await api<LiveView>(organizer)).rounds[0].standings!;
    assert.equal(results.rows[0].average, 10); assert.equal(results.rows.find((r) => r.number === 102)!.average, 4.5);
    assert.equal(results.advancementTies![0].slots, 1);
  });
  await t.test('panel votes at the cutoff, organizer exclusions, stale versions and approved advancement', async () => {
    for (const rid of setup.blocks[0].roundIds) {
      let v = await api<LiveView>(head), r = v.rounds.find((r) => r.id === rid)!;
      for (const tie of r.standings!.advancementTies ?? []) {
        await command(organizer, { action: 'vote', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint, tieKey: tie.key, selected: [tie.subjectIds[0]] }, 403);
        await command(head, { action: 'tie', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint, tieKey: tie.key, order: tie.subjectIds, shared: false }, 400);
        for (const token of tokens) {
          v = await api<LiveView>(token); r = v.rounds.find((r) => r.id === rid)!;
          const chosen = r.definition.subjects.filter((s) => tie.subjectIds.includes(s.id)).sort((a, b) => a.number - b.number)[0].id;
          await command(token, { action: 'vote', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint, tieKey: tie.key, selected: [chosen] });
        }
      }
      v = await api<LiveView>(head); r = v.rounds.find((r) => r.id === rid)!;
      await command(organizer, { action: 'approve', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint }, 403);
      await command(head, { action: 'approve', roundKey: r.key, roundVersion: r.version, fingerprint: 'stale' }, 409);
      await command(head, { action: 'approve', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint });
    }
    desk = await api<LiveView>(organizer);
    assert.deepEqual(desk.judgeLinks, originalLinks);
    assert.deepEqual(desk.rounds[0].standings!.advancingIds!.map((id) => desk.rounds[0].definition.subjects.find((s) => s.id === id)!.number), [101, 102]);
  });
  await t.test('approved finalists, J&J fixed pairs, final heat submissions and final results', async () => {
    desk = await api<LiveView>(organizer); const next = structuredClone(desk.setup);
    for (const f of next.rounds.filter((r) => r.kind === 'finals')) {
      const pre = desk.rounds.find((r) => r.id === f.prelimRoundId)!; f.finalistIds = pre.standings!.advancingIds!;
      const picked = pre.definition.subjects.filter((s) => f.finalistIds.includes(s.id));
      if (pre.definition.format === 'Strictly') f.subjects = picked;
      else { const lead = picked.find((s) => s.role === 'Lead')!, follow = picked.find((s) => s.role === 'Follow')!; f.subjects = [{ id: crypto.randomUUID(), number: lead.number, primary: lead.primary, secondary: follow.primary, members: [lead.id, follow.id] }]; }
      f.heats[0].subjectIds = f.subjects.map((s) => s.id);
    }
    await command(organizer, { action: 'setup', setup: next }); await command(organizer, { action: 'open-stage', kind: 'finals' });
    for (const rid of next.blocks[1].roundIds) {
      desk = await api<LiveView>(organizer); const r = desk.rounds.find((r) => r.id === rid)!, h = r.definition.heats[0];
      for (let song = 0; song < h.songs.length; song++) {
        if (song > 0) await command(organizer, { action: 'next' });
        if (song === 0) for (const token of tokens) for (const id of h.subjectIds) await save(token, r, h.songs[0].id, id, observedMark(r, id));
      }
      await command(organizer, { action: 'lineup' }); await Promise.all(tokens.map((token) => submitHeat(token, r, h.id)));
      if (rid !== next.blocks[1].roundIds.at(-1)) await command(organizer, { action: 'next' });
    }
    await command(organizer, { action: 'conclude-stage' });
    for (const rid of next.blocks[1].roundIds) {
      const v = await api<LiveView>(head), r = v.rounds.find((r) => r.id === rid)!;
      assert.equal(r.standings!.rows[0].average, 10);
      await command(head, { action: 'approve', roundKey: r.key, roundVersion: r.version, fingerprint: r.standings!.fingerprint });
    }
    assert.ok((await api<LiveView>(organizer)).rounds.every((r) => r.standings!.approved));
  });
  await t.test('withdrawal requires both roles, retains submitted history and invalidates affected approvals; backup/restore and revocation', async () => {
    const c = setup.competitions[0];
    const request = await command(organizer, { action: 'request-withdrawal', competitionId: c.id, reason: 'Synthetic withdrawal rehearsal' }) as { reviewRequestId: string };
    await command(organizer, { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    assert.ok((await api<LiveView>(organizer)).setup.competitions.some((x) => x.id === c.id));
    await command(head, { action: 'approve-request', reviewRequestId: request.reviewRequestId, requestVersion: 1 });
    assert.ok(!(await api<LiveView>(organizer)).setup.competitions.some((x) => x.id === c.id));
    const backup = await command(organizer, { action: 'backup' });
    assert.ok(!JSON.stringify(backup).includes('PRIVATE_STAGE_NOTE')); assert.ok(!JSON.stringify(backup).includes(tokens[0]));
    const history = backup.history as { heatSubmissions: unknown[]; approvals: unknown[]; reviewRequests: ReviewRequest[] };
    assert.ok(history.heatSubmissions.length > 30); assert.ok(history.approvals.length >= 8); assert.ok(history.reviewRequests.some((q) => q.appliedAt));
    assert.ok((await api<LiveView>(organizer)).rounds.every((r) => !r.standings!.approved));
    const restored = await api<{ path: string }>('', { action: 'restore', backup, requestId: nonce() });
    const restoredView = await api<LiveView>(restored.path.split('/').at(-1)!); assert.equal(restoredView.rounds.length, 0); assert.ok(restoredView.restoredHistory);
    await command(organizer, { action: 'revoke-link', judgeId: setup.judges[0].id }); await api(judge, undefined, 403);
  });
});
