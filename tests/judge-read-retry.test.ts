import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './judge-render-harness.mjs';

test('loaded judge read failure offers refresh without changing saved marks or notes', async () => {
  let refreshes = 0;
  const h = await harness('stage', async () => { refreshes++; return null; });
  try {
    const cell = Object.values(h.env.view.ballots[0].cells)[0];
    cell.note = 'Synthetic retained note';
    const before = structuredClone(h.env.view);
    h.env.error = 'Synthetic read failed. Retry the connection.';
    h.render();
    // Seed the existing first empty local-notice slot in this controlled hook harness.
    const localSlot = h.state().findIndex(value => value === '');
    assert.ok(localSlot >= 0); h.state()[localSlot] = 'Synthetic cache could not be read'; h.render();
    const beforeState = structuredClone(h.state());
    const retry = h.button(/^Retry connection$/);
    assert.ok(retry, 'a loaded ballot read error needs an explicit refresh action');
    const readNotice = h.nodes().find(n => n.type === 'p' && n.props.role === 'status' && h.text(n).includes('Retry connection'));
    assert.ok(readNotice && h.text(readNotice).includes(h.env.error));
    assert.ok(!h.text(readNotice).includes('Synthetic cache could not be read'));
    assert.ok(h.nodes().some(n => n.type === 'p' && n.props.role === 'status' && h.text(n) === 'Synthetic cache could not be read'));
    assert.equal(h.button(/^Retry pending saves$/), undefined);
    await retry.props.onClick();
    assert.equal(refreshes, 1);
    assert.equal(h.env.posts.length, 0);
    assert.deepEqual(h.env.view, before);
    assert.deepEqual(h.state(), beforeState);
    h.env.error = ''; h.render();
    assert.ok(h.nodes().some(n => n.type === 'p' && n.props.role === 'status' && h.text(n) === 'Synthetic cache could not be read'));
    assert.equal(h.button(/^Retry connection$/), undefined);
    assert.deepEqual(h.env.view, before);
  } finally { h.restore(); }
});
