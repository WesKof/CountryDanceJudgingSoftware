import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './judge-render-harness.mjs';
import { cellKey } from '../lib/live/types.ts';

test('note accessible name follows its song while same-bib saved notes survive navigation without writes', async () => {
  const h = await harness('stage', async () => null);
  try {
    const view = h.env.view, round = view.rounds[0], heat = round.definition.heats[0];
    const subject = round.definition.subjects.find(s => heat.subjectIds.includes(s.id))!;
    const ballot = view.ballots.find(b => b.roundKey === round.key)!;
    const songs = heat.songs.slice(0, 2);
    assert.equal(songs.length, 2);
    songs[0].title = 'First song'; songs[1].title = 'Second song';
    songs.forEach((song, index) => { ballot.cells[cellKey(song.id, subject.id)].note = `Synthetic saved note ${index + 1}`; });
    const before = structuredClone(view);
    h.render();
    for (const song of [songs[0], songs[1], songs[0]]) {
      const select = h.nodes().find(n => n.type === 'select' && n.props['aria-label'] === 'Assigned heats and songs')!;
      select.props.onChange({ target: { value: song.id } }); h.render();
      const toggle = h.nodes().find(n => n.type === 'button' && n.props['aria-label'] === `Note for bib ${subject.number}`)!;
      assert.ok(toggle);
      if (!toggle.props['aria-expanded']) { toggle.props.onClick(); h.render(); }
      const editor = h.nodes().find(n => n.type === 'textarea' && n.props['aria-label'] === `Note for bib ${subject.number} on ${song.title}`);
      assert.ok(editor, 'the explicit textarea name must retain its song context');
      assert.equal(editor.props.value, ballot.cells[cellKey(song.id, subject.id)].note);
      assert.equal(h.nodes().filter(n => n.type === 'textarea' && n.props['aria-label'] === `Note for bib ${subject.number}`).length, 0);
      assert.equal(h.env.posts.length, 0);
    }
    assert.deepEqual(view, before);
  } finally { h.restore(); }
});
