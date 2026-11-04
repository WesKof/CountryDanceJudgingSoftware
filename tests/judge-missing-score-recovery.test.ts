import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './judge-render-harness.mjs';
import { cellKey, type RoundView } from '../lib/live/types.ts';
import { missingScoreDestination } from '../lib/live/judge-recovery.ts';

async function scenario(kind: 'ordinary' | 'later' | 'unavailable') {
  const h = await harness('stage', async () => null);
  const view = h.env.view;
  const round = view.rounds.find(r => r.definition.format === 'Jack & Jill')! as RoundView;
  const heat = round.definition.heats[0], subject = round.definition.subjects.find(s => heat.subjectIds.includes(s.id) && s.role === 'Lead')!;
  const ballot = view.ballots.find(b => b.roundKey === round.key)!;
  assert.ok(heat.songs.length >= 2);
  for (const song of heat.songs) {
    ballot.cells[cellKey(song.id, subject.id)].mark = '';
    if (kind !== 'ordinary') {
      song.pairingRevised = true;
      if (kind === 'unavailable' || song === heat.songs[0]) song.partners = song.partners.filter(pair => !pair.includes(subject.id));
    }
  }
  // The existing fixture gives every other entrant coverage. Only this bib is missing.
  h.render();
  const select = () => h.nodes().find(n => n.type === 'select' && n.props['aria-label'] === 'Assigned heats and songs')!;
  select().props.onChange({ target: { value: heat.songs[0].id } }); h.render();
  return { h, view, round, heat, subject, select };
}

for (const path of ['next', 'review'] as const) for (const kind of ['ordinary', 'later'] as const) {
  test(`${path} missing-score shortcut opens ${kind === 'ordinary' ? 'ordinary first' : 'later eligible'} song and resets hidden role without losing pending intent`, async () => {
    const { h, heat, subject, select } = await scenario(kind);
    try {
      const other = h.env.view.rounds.flatMap(r => r.definition.subjects).find(s => s.id !== subject.id && heat.subjectIds.includes(s.id))!;
      // A real component edit queues a pending mark with its existing private note.
      h.nodes().find(n => n.type === 'button' && n.props['aria-label'] === `Bib ${other.number}: A1`)!.props.onClick(); h.render();
      const queued = () => h.state().find(value => value && typeof value === 'object' && Object.values(value).some(cell => cell && typeof cell === 'object' && 'baseRevision' in cell));
      assert.ok(queued()); const before = JSON.stringify(queued());
      assert.ok(other);
      h.button(/^Follows$/)!.props.onClick(); const hidden = h.render();
      assert.ok(!hidden.includes(`id="judge-bib-${subject.number}"`));
      if (path === 'review') { h.button(/^Review & submit/)!.props.onClick(); h.render(); }
      const shortcut = path === 'next' ? h.button(/^Score next bib/) : h.nodes().find(n => n.type === 'button' && n.props.className === 'result-card-link' && h.text(n).includes(`#${subject.number}`));
      assert.ok(shortcut); shortcut.props.onClick(); const recovered = h.render();
      assert.equal(select().props.value, heat.songs[kind === 'later' ? 1 : 0].id);
      assert.ok(recovered.includes(`id="judge-bib-${subject.number}"`));
      assert.equal(h.nodes().find(n => n.type === 'button' && n.props['aria-label'] === `Bib ${subject.number}: Yes`)!.props.disabled, false);
      assert.ok(h.state().some(value => value && typeof value === 'object' && 'bib' in value && value.bib === subject.number));
      assert.ok(!recovered.includes('aria-label="Review entire stage"'));
      assert.equal(JSON.stringify(queued()), before);
      assert.equal(h.env.posts.length, 0);
    } finally { h.restore(); }
  });
}

test('both missing-score surfaces explain an unavailable assignment without offering a disabled-song destination', async () => {
  const { h, subject } = await scenario('unavailable');
  try {
    let html = h.render(); assert.match(html, new RegExp(`No available song for bib #${subject.number}`));
    assert.match(html, /Ask the organizer to check this assignment/); assert.match(html, /Your marks and notes are kept/);
    assert.equal(h.button(/^Score next bib/), undefined);
    h.button(/^Review & submit/)!.props.onClick(); html = h.render();
    assert.match(html, new RegExp(`No available song for bib #${subject.number}`));
    assert.equal(h.nodes().filter(n => n.type === 'button' && n.props.className === 'result-card-link' && h.text(n).includes(`#${subject.number}`)).length, 0);
    assert.equal(h.button(/^Submit prelims$/)!.props.disabled, true); assert.equal(h.env.posts.length, 0);
  } finally { h.restore(); }
});

test('destination selector excludes unselectable, withdrawn and out-of-heat subjects without changing coverage data', async () => {
  const { h, round, heat, subject } = await scenario('ordinary');
  try {
    const before = JSON.stringify(h.env.view);
    assert.equal(missingScoreDestination(round, heat, subject.id, new Set([heat.songs[1].id]))?.id, heat.songs[1].id);
    assert.equal(missingScoreDestination(round, heat, subject.id, new Set()), undefined);
    assert.equal(missingScoreDestination(round, heat, 'not-in-heat', new Set(heat.songs.map(s => s.id))), undefined);
    assert.equal(missingScoreDestination(round, { ...heat, withdrawnIds: [subject.id] }, subject.id, new Set(heat.songs.map(s => s.id))), undefined);
    assert.equal(JSON.stringify(h.env.view), before);
  } finally { h.restore(); }
});
