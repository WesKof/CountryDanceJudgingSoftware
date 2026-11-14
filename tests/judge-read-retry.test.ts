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
    const beforeState = structuredClone(h.state());
    const retry = h.button(/^Retry connection$/);
    assert.ok(retry, 'a loaded ballot read error needs an explicit refresh action');
    assert.equal(h.button(/^Retry pending saves$/), undefined);
    await retry.props.onClick();
    assert.equal(refreshes, 1);
    assert.equal(h.env.posts.length, 0);
    assert.deepEqual(h.env.view, before);
    assert.deepEqual(h.state(), beforeState);
    h.env.error = ''; h.render();
    assert.equal(h.button(/^Retry connection$/), undefined);
    assert.deepEqual(h.env.view, before);
  } finally { h.restore(); }
});
