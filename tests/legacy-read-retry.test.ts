import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, harness } from './organizer-review-render-harness.mjs';
import type { LiveSetup } from '../lib/live/types.ts';

test('legacy read retry preserves setup correction, reason, draft/version and selected page', async () => {
  const view = fixture(); delete view.setup.workflow;
  const h = await harness(view, true);
  try {
    h.env.page = 0; h.render();
    const editor = h.nodes().find(n => n.props.setup && typeof n.props.update === 'function' && 'frozenIds' in n.props)!;
    assert.ok(editor);
    const draft = structuredClone(editor.props.setup) as LiveSetup; draft.name = 'Synthetic legacy draft';
    editor.props.update(draft);
    h.nodes().find(n => n.type === 'input' && n.props.type === 'checkbox')!.props.onChange({ target: { checked: true } });
    h.nodes().find(n => n.type === 'input' && n.props.maxLength === 500)!.props.onChange({ target: { value: 'Synthetic retained reason' } });
    h.env.page = 2; h.env.error = 'Synthetic shared read failure'; h.render();
    // Seed the existing first empty local-notice slot in this controlled hook harness.
    const localSlot = h.state().findIndex(value => value === '');
    assert.ok(localSlot >= 0); h.state()[localSlot] = 'Synthetic mutation notice'; h.render();
    const before = structuredClone(h.state()), beforeView = structuredClone(view);
    assert.ok(before.includes(true) && before.includes('Synthetic retained reason'));
    const retry = h.nodes().find(n => n.type === 'button' && h.text(n) === 'Retry connection');
    assert.ok(retry, 'loaded legacy desk needs manual read recovery');
    const readNotice = h.nodes().find(n => n.type === 'p' && n.props.role === 'status' && h.text(n).includes('Retry connection'));
    assert.ok(readNotice && h.text(readNotice).includes(h.env.error));
    assert.ok(!h.text(readNotice).includes('Synthetic mutation notice'));
    assert.ok(h.nodes().some(n => n.type === 'p' && n.props.role === 'status' && h.text(n) === 'Synthetic mutation notice'));
    await retry.props.onClick();
    assert.equal(h.env.reads, 1); assert.equal(h.env.posts.length, 0); assert.equal(h.env.page, 2);
    assert.deepEqual(h.state(), before); assert.deepEqual(view, beforeView);
    h.env.error = ''; h.render();
    assert.ok(h.nodes().some(n => n.type === 'p' && n.props.role === 'status' && h.text(n) === 'Synthetic mutation notice'));
    assert.equal(h.nodes().find(n => n.type === 'button' && h.text(n) === 'Retry connection'), undefined);
    assert.deepEqual(h.state(), before);
  } finally { h.restore(); }
});
