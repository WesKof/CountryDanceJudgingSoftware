export type DeliveryKind = 'release' | 'release-set' | 'status';
export type DeliveryEnvelope = { deliveryId: string; kind: DeliveryKind; payload: unknown };
export type DeliveryAcknowledgement = { version: 1; accepted: boolean; deliveryId: string; kind: DeliveryKind; envelopeDigest: string };

const kinds: readonly string[] = ['release', 'release-set', 'status'];
const fields = ['version', 'accepted', 'deliveryId', 'kind', 'envelopeDigest'];
export async function deliveryAcknowledgement(message: DeliveryEnvelope, accepted = true): Promise<DeliveryAcknowledgement> {
  if (!message || Object.keys(message).length !== 3 || !['deliveryId', 'kind', 'payload'].every((key) => Object.hasOwn(message, key)) || typeof message.deliveryId !== 'string' || !message.deliveryId.length || message.deliveryId.length > 200 || !kinds.includes(message.kind) || message.payload === undefined) throw new Error('Invalid delivery envelope.');
  const bytes = new TextEncoder().encode(JSON.stringify(message));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return { version: 1, accepted, deliveryId: message.deliveryId, kind: message.kind, envelopeDigest: Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('') };
}

// An HTTP success alone is not a receipt. Bound bytes and elapsed body-read time,
// including a chunked response that never finishes. Never return receiver text.
export async function readDeliveryReceipt(response: Response, expected: DeliveryAcknowledgement, timeoutMs = 2000): Promise<boolean | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !response.body) return null;
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) return null;
    const bodyReader = reader = response.body.getReader();
    const read = async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const next = await bodyReader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 1024) return null;
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const object = value as Record<string, unknown>;
      return Object.keys(object).length === fields.length && fields.every((key) => Object.hasOwn(object, key) && (key === 'accepted' ? typeof object.accepted === 'boolean' : object[key] === expected[key as keyof DeliveryAcknowledgement])) ? object.accepted as boolean : null;
    };
    return await Promise.race([read(), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
  } catch { return null; }
  finally {
    clearTimeout(timer);
    try { void (reader ? reader.cancel() : response.body?.cancel())?.catch(() => {}); } catch { /* A locked body cannot be cancelled by this reader. */ }
  }
}
export async function confirmsDelivery(response: Response, expected: DeliveryAcknowledgement, timeoutMs = 2000) {
  return await readDeliveryReceipt(response, expected, timeoutMs) === true;
}
