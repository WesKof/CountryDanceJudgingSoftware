import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

// Follow the development host's real dependency edge, rather than adding a direct package.
const pluginRequire = createRequire(import.meta.resolve('@cloudflare/vite-plugin'));
const miniflareRequire = createRequire(pluginRequire.resolve('miniflare'));
const undici = miniflareRequire('undici') as {
  Headers: typeof Headers;
  fetch: typeof fetch;
  getSetCookies: (headers: Headers) => { name: string; value: string; sameSite?: string; secure?: boolean; httpOnly?: boolean }[];
};

test('Miniflare cookie parsing retains encoded delimiters instead of producing header controls', () => {
  const value = '%0D%0Ainjected%3Dvalue%3Bnext%00';
  const cookies = undici.getSetCookies(new undici.Headers({ 'set-cookie': 'sample=' + value }));
  assert.equal(cookies[0].name, 'sample');
  assert.equal(cookies[0].value, value);
  assert.doesNotMatch(cookies[0].value, /[\r\n\0]/);
});

test('Miniflare does not downgrade an invalid SameSite substring into None', () => {
  const cookies = undici.getSetCookies(new undici.Headers({ 'set-cookie': 'sample=value; SameSite=NoneOfYourBusiness' }));
  assert.equal(cookies[0].sameSite, undefined);
});

test('Miniflare preserves exact valid cookie attributes', () => {
  const cookies = undici.getSetCookies(new undici.Headers({ 'set-cookie': 'sample=value; SameSite=Strict; Secure; HttpOnly' }));
  assert.equal(cookies[0].value, 'value');
  assert.equal(cookies[0].sameSite, 'Strict');
  assert.equal(cookies[0].secure, true);
  assert.equal(cookies[0].httpOnly, true);
});

const expected = 'synthetic integrity fixture';
const hash = createHash('sha256').update(expected).digest('base64');
for (const algorithm of ['SHA256', 'Sha256']) {
  test(`Miniflare fetch rejects wrong bytes with ${algorithm} integrity metadata`, async () => {
    // Data URLs keep this regression entirely in memory, away from any service or fixture store.
    await assert.rejects(undici.fetch('data:text/plain,different', { integrity: `${algorithm}-${hash}` }), TypeError);
  });
}

test('Miniflare fetch accepts correct bytes for lowercase and mixed-case integrity algorithms', async () => {
  for (const algorithm of ['sha256', 'SHA256', 'Sha256']) {
    const response = await undici.fetch('data:text/plain,' + encodeURIComponent(expected), { integrity: `${algorithm}-${hash}` });
    assert.equal(await response.text(), expected);
  }
});
