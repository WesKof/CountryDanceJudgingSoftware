import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SOCIAL_IMAGE_BASE64 } from '../lib/social-image.ts';

// Resolve the parser Vinext actually consumes, without adding a direct dependency.
const vinextEntry = import.meta.resolve('vinext');
const vinextRequire = createRequire(vinextEntry);
const parser = vinextRequire.resolve('image-size');
const { imageSize } = vinextRequire('image-size') as {
  imageSize: (bytes: Uint8Array) => { width: number; height: number; type: string };
};

function box(type: string, payload = Buffer.alloc(0), declaredSize = payload.length + 8) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(declaredSize);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

const malformed = {
  ICNS: Buffer.concat([Buffer.from('icns'), Buffer.from([0, 0, 0, 16]), Buffer.from('is32'), Buffer.alloc(4)]),
  HEIF: Buffer.concat([
    box('ftyp', Buffer.from('avif\0\0\0\0', 'binary')),
    box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', box('ispe', Buffer.alloc(12), 0)))])),
  ]),
  JXL: Buffer.concat([
    box('JXL ', Buffer.from([13, 10, 135, 10])),
    box('ftyp', Buffer.from('jxl \0\0\0\0', 'binary')),
    box('jxlp', Buffer.alloc(4), 0),
  ]),
};

for (const [format, bytes] of Object.entries(malformed)) {
  test(`Vinext image parser rejects a zero-length ${format} entry without blocking the caller`, () => {
    // A broken parser loops synchronously. Bound it in a disposable child, never the test runner.
    const child = spawnSync(process.execPath, ['--max-old-space-size=64', '--eval', `
      const { imageSize } = require(${JSON.stringify(parser)});
      try { imageSize(Buffer.from(${JSON.stringify(bytes.toString('hex'))}, 'hex')); process.exit(2); }
      catch { process.exit(0); }
    `], { timeout: 1500, maxBuffer: 2048, windowsHide: true });
    assert.equal(child.error, undefined, `${format} parser exceeded the bounded child execution`);
    assert.equal(child.status, 0, `${format} malformed input must be rejected`);
  });
}

test('Vinext image parsing retains repository JPEG and social-image dimensions', () => {
  for (const [file, width, height] of [
    ['public/kickinit-community-logo.jpg', 150, 150],
    ['public-site/assets/community-night.jpg', 640, 449],
    ['public-site/assets/community-friends.jpg', 640, 480],
  ] as const) {
    const dimensions = imageSize(readFileSync(new URL('../' + file, import.meta.url)));
    assert.deepEqual(dimensions, { type: 'jpg', width, height }, file);
  }
  const social = imageSize(Buffer.from(SOCIAL_IMAGE_BASE64, 'base64'));
  assert.equal(social.type, 'jpg');
  assert.equal(social.width, 1200);
  assert.equal(social.height, 630);
});

test('Vinext metadata entry generation retains an actual static image and its dimensions', async () => {
  const { createMetadataRouteEntryData } = await import(new URL('./server/metadata-route-build-data.js', vinextEntry).href);
  const bytes = readFileSync(new URL('../public/kickinit-community-logo.jpg', import.meta.url));
  const entry = createMetadataRouteEntryData({
    filePath: fileURLToPath(new URL('../public/kickinit-community-logo.jpg', import.meta.url)),
    servedUrl: '/opengraph-image.jpg', type: 'opengraph-image', contentType: 'image/jpeg', isDynamic: false,
  });
  assert.equal(entry.headData.kind, 'openGraph');
  assert.equal(entry.headData.width, 150);
  assert.equal(entry.headData.height, 150);
  assert.equal(entry.fileDataBase64, bytes.toString('base64'));
});
