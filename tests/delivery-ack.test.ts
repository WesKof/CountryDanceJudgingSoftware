import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryAcknowledgement, confirmsDelivery, readDeliveryReceipt, type DeliveryEnvelope } from '../lib/live/delivery-ack.ts';

const message: DeliveryEnvelope = { deliveryId: 'fictional-delivery', kind: 'release-set', payload: [{ id: 'first', revision: 1, fingerprint: 'a' }, { id: 'second', revision: 2, fingerprint: 'b' }] };
test('acknowledgement binds the full ordered envelope, status scope and exact replay', async () => {
  const ack = await deliveryAcknowledgement(message);
  assert.deepEqual(await deliveryAcknowledgement(JSON.parse(JSON.stringify(message))), ack);
  for (const changed of [ { ...message, deliveryId: 'other' }, { ...message, kind: 'release' as const }, { ...message, payload: [...message.payload as unknown[]].reverse() }, { ...message, payload: [ (message.payload as unknown[])[0] ] } ]) assert.notEqual((await deliveryAcknowledgement(changed)).envelopeDigest, ack.envelopeDigest);
  const status: DeliveryEnvelope = { deliveryId: 'notice', kind: 'status', payload: { id: 'revision', revision: 2, eventId: 'event', competitionId: 'competition' } };
  assert.notEqual((await deliveryAcknowledgement(status)).envelopeDigest, (await deliveryAcknowledgement({ ...status, payload: { ...status.payload as object, eventId: 'foreign' } })).envelopeDigest);
  await assert.rejects(deliveryAcknowledgement({ ...message, extra: true } as DeliveryEnvelope));
});
test('only a strict matching versioned accepted acknowledgement confirms delivery', async () => {
  const ack = await deliveryAcknowledgement(message);
  assert.equal(await confirmsDelivery(Response.json(ack), ack), true);
  for (const value of [{}, null, [], { ...ack, version: 2 }, { ...ack, accepted: 'true' }, { ...ack, accepted: false }, { ...ack, deliveryId: 'other' }, { ...ack, kind: 'status' }, { ...ack, envelopeDigest: '0'.repeat(64) }, { ...ack, extra: true }, Object.fromEntries(Object.entries(ack).filter(([key]) => key !== 'kind'))]) assert.equal(await confirmsDelivery(Response.json(value), ack), false);
  for (const response of [new Response('bad', { headers: { 'content-type': 'application/json' } }), new Response(JSON.stringify(ack)), new Response(null), Response.json(ack, { status: 409 }), new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '1025' } }), new Response(' '.repeat(1025), { headers: { 'content-type': 'application/json' } })]) assert.equal(await confirmsDelivery(response, ack), false);
});
test('chunked acknowledgements enforce actual bytes, UTF-8, stream errors and body deadlines', async () => {
  const ack = await deliveryAcknowledgement(message), bytes = new TextEncoder().encode(JSON.stringify(ack));
  const response = (stream: ReadableStream<Uint8Array>) => new Response(stream, { headers: { 'content-type': 'application/json' } });
  assert.equal(await confirmsDelivery(response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 7)); c.enqueue(bytes.slice(7)); c.close(); } })), ack), true);
  assert.equal(await confirmsDelivery(response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(700)); c.enqueue(new Uint8Array(700)); c.close(); } })), ack), false);
  assert.equal(await confirmsDelivery(response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([255])); c.close(); } })), ack), false);
  assert.equal(await confirmsDelivery(response(new ReadableStream({ start(c) { c.error(new Error('stream failed')); } })), ack), false);
  let cancelled = false;
  assert.equal(await confirmsDelivery(response(new ReadableStream({ start(c) { c.enqueue(bytes); }, cancel() { cancelled = true; } })), ack, 20), false);
  assert.equal(cancelled, true);
});
test('rejected headers cancel their body and locked bodies safely fail confirmation', async () => {
  const ack = await deliveryAcknowledgement(message);
  for (const headers of [{ 'content-type': 'text/html' }, { 'content-type': 'application/json', 'content-length': '99999' }] as Record<string, string>[]) {
    let cancelled = false;
    assert.equal(await confirmsDelivery(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers }), ack), false);
    assert.equal(cancelled, true);
  }
  const response = Response.json(ack), reader = response.body!.getReader();
  assert.equal(await confirmsDelivery(response, ack), false);
  reader.releaseLock();
  await response.body!.cancel();
});
test('receipt lookup distinguishes exact absence from unknown and ordinary delivery success', async () => {
  const expected = await deliveryAcknowledgement(message), absent = { ...expected, accepted: false };
  assert.equal(await readDeliveryReceipt(Response.json(absent), expected), false);
  assert.equal(await confirmsDelivery(Response.json(absent), expected), false);
  for (const response of [Response.json({}), Response.json({ ...absent, deliveryId: 'other' }), Response.json(absent, { status: 403 }), Response.json(absent, { status: 409 }), Response.json({ ...absent, accepted: 'false' })]) assert.equal(await readDeliveryReceipt(response, expected), null);
});
