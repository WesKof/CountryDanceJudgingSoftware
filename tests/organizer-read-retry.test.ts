import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, harness } from './organizer-review-render-harness.mjs';
import type { LiveSetup } from '../lib/live/types.ts';

test('organizer read retry preserves selected page and unsaved setup draft/version without mutations', async () => {
  const h = await harness(fixture());
  try {
    h.env.page = 0; h.render();
    const editor = h.nodes().find(n => n.props.setup && typeof n.props.update === 'function' && 'frozenIds' in n.props)!;
    assert.ok(editor);
    const draft = structuredClone(editor.props.setup) as LiveSetup;
    draft.name = 'Synthetic unsaved organizer draft'; editor.props.update(draft); h.render();
    h.env.page = 2; h.env.error = 'Synthetic shared read failed'; h.render();
    const before = structuredClone(h.state()), view = structuredClone(h.env.view);
    const retry = h.nodes().find(n => n.type === 'button' && h.text(n) === 'Retry connection');
    assert.ok(retry, 'loaded organizer needs an explicit read retry');
    await retry.props.onClick();
    assert.equal(h.env.reads, 1); assert.equal(h.env.posts.length, 0); assert.equal(h.env.page, 2);
    assert.deepEqual(h.state(), before); assert.deepEqual(h.env.view, view);
    assert.ok(h.state().some(value => value && typeof value === 'object' && 'name' in value && value.name === draft.name));
    h.env.error = ''; h.render();
    assert.equal(h.nodes().find(n => n.type === 'button' && h.text(n) === 'Retry connection'), undefined);
    assert.deepEqual(h.state(), before);
  } finally { h.restore(); }
});
