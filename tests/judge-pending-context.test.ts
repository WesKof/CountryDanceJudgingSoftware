import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './judge-render-harness.mjs';

test('same-bib same-song pending conflicts have distinct round context without changing recovery values', async () => {
  const h = await harness('stage', async () => null);
  try {
    const rounds = h.env.view.rounds.filter(r => r.definition.heats.length).slice(0, 2);
    assert.equal(rounds.length, 2);
    const entries = rounds.map((round, index) => {
      const heat = round.definition.heats[0], song = heat.songs[0];
      const subject = round.definition.subjects.find(s => heat.subjectIds.includes(s.id))!;
      subject.number = 901; song.title = 'Shared song'; round.definition.division = `Synthetic division ${index + 1}`;
      return { round, heat, song, subject };
    });
    h.render();
    for (const { song, subject } of entries) {
      h.nodes().find(n => n.type === 'select' && n.props['aria-label'] === 'Assigned heats and songs')!.props.onChange({ target: { value: song.id } }); h.render();
      h.nodes().find(n => n.type === 'button' && n.props['aria-label'] === `Bib ${subject.number}: A1`)!.props.onClick(); h.render();
    }
    type Pending = { roundKey: string; performanceId: string; subjectId: string; baseRevision: number; blocked?: boolean; note: string; saved?: { mark: string; note: string; revision: number; mutationId: string } };
    const queue = h.state().find(value => value && typeof value === 'object' && Object.values(value).some(cell => cell && typeof cell === 'object' && 'baseRevision' in cell)) as Record<string, Pending>;
    assert.equal(Object.keys(queue).length, 2);
    entries.forEach(({ round }, index) => {
      const pending = Object.values(queue).find(p => p.roundKey === round.key)!;
      pending.blocked = true; pending.note = `Synthetic pending ${index + 1}`;
      pending.saved = { mark: 'No', note: `Synthetic saved ${index + 1}`, revision: 2, mutationId: 'synthetic' };
    });
    const beforeQueue = structuredClone(queue), beforeView = structuredClone(h.env.view);
    h.env.posts.length = 0; h.render();
    const articles = h.nodes().filter(n => n.type === 'article' && n.props.className === 'pending-edit');
    assert.equal(articles.length, 2);
    for (const [index, { round, heat }] of entries.entries()) {
      const name = `Pending edit for #901 on Shared song · ${round.definition.format} · ${round.definition.division} · ${round.definition.kind === 'finals' ? 'Finals' : 'Prelims'} · ${heat.name}`;
      const article = articles.find(n => n.props['aria-label'] === name);
      assert.ok(article, 'each accessible name must include its exact visible round and heat context');
      assert.ok(h.text(article).includes(`Pending note: Synthetic pending ${index + 1}`));
      assert.ok(h.text(article).includes(`Saved mark: No · saved note: Synthetic saved ${index + 1}`));
      assert.ok(!name.includes('Synthetic pending') && !name.includes('Synthetic saved'));
    }
    assert.notEqual(articles[0].props['aria-label'], articles[1].props['aria-label']);
    assert.deepEqual(queue, beforeQueue); assert.deepEqual(h.env.view, beforeView); assert.equal(h.env.posts.length, 0);
  } finally { h.restore(); }
});
