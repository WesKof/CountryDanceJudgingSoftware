import { latestPublications, type PublicationRecord } from './publication.ts';

type Check = (value: unknown) => boolean;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const string: Check = (v) => typeof v === 'string' && v.length <= 10000;
const id: Check = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;
const boolean: Check = (v) => typeof v === 'boolean';
const number: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const count: Check = (v) => Number.isSafeInteger(v) && Number(v) >= 0;
const state: Check = (v) => typeof v === 'string' && ['enabled', 'suspended', 'shutdown'].includes(v);
const array = (check: Check): Check => (v) => Array.isArray(v) && v.every(check);
const nullable = (check: Check): Check => (v) => v === null || check(v);
const shape = (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => (v) => object(v) && Object.entries(required).every(([key, check]) => Object.hasOwn(v, key) && check(v[key])) && Object.keys(v).every((key) => {
  const check = Object.hasOwn(required, key) ? required[key] : Object.hasOwn(optional, key) ? optional[key] : undefined;
  return Boolean(check && check(v[key]));
});
const strings = array(string), ids = array(id);
const song = shape({ id, title: string, partners: array(ids) });
const heat = shape({ id, name: string, entrants: ids, songs: array(song) });
const judge = shape({ id, name: string, head: boolean });
const mean = shape({ judgeId: id, average: number, observations: count });
const entrant = shape({ id, number: count, primary: string, secondary: string, role: string, members: ids, withdrawn: boolean, average: nullable(number), numericPlace: nullable(count), place: nullable(count), observations: count, judgeMeans: array(mean) });
const mark = shape({ judgeId: id, songId: id, entrantId: id, mark: (v) => typeof v === 'string' && ['', 'Yes', 'A1', 'A2', 'No'].includes(v) });
const stage = shape({ id, kind: string, judges: array(judge), entrants: array(entrant), heats: array(heat), marks: array(mark), advancing: ids, decisions: array(shape({ order: ids, shared: boolean })) });
const snapshot = shape({ schemaVersion: (v) => v === 1, scoringVersion: (v) => v === 'equal-judge-stage-v1', id, eventId: id, competitionId: id, revision: (v) => count(v) && Number(v) > 0, supersedes: nullable(id), event: shape({ name: string, venue: string, date: string }), competition: shape({ format: string, division: string }), sourceFingerprint: id, preparedAt: string, headApproval: strings, changeSummary: string, stages: array(stage) });
const publication: Check = (v) => shape({ id, competitionId: id, revision: (n) => count(n) && Number(n) > 0, sourceFingerprint: id, snapshot, status: (s) => typeof s === 'string' && ['prepared', 'requested', 'queued', 'released', 'stale'].includes(s) }, { organizerApprovedAt: string, ownerApprovedAt: string, releasedAt: string, underReview: boolean, lastSynchronizedAt: string })(v) && object(v) && object(v.snapshot) && v.id === v.snapshot.id && v.revision === v.snapshot.revision && v.sourceFingerprint === v.snapshot.sourceFingerprint;

export type AdminAcknowledgement = { version: 1; accepted: true; requestId: string; action: string; requestDigest: string };
export type AdminReply = { adminAcknowledgement: AdminAcknowledgement; publications?: PublicationRecord[]; events?: Record<string, { competitionIds: string[]; active: boolean }>; enabled?: boolean; serviceState?: string; ok?: true; state?: string; delivered?: number; pending?: number };
export const ADMIN_CONFIRMATION_ERROR = 'The judging app did not confirm this check. Return to review to check the current status.';

// No credentials enter this envelope: the nonce binds a response to this exact
// operation/target, independently of the separate Authorization header.
export async function adminAcknowledgement(input: Record<string, unknown>): Promise<AdminAcknowledgement> {
  const context = input.adminRequest;
  if (!shape({ version: (v) => v === 1, id: (v) => typeof v === 'string' && v.length===64 && /^[a-f0-9]{64}$/.test(v) })(context) || !object(context)) throw new Error(ADMIN_CONFIRMATION_ERROR);
  const base = { action: (v: unknown) => v === input.action, adminRequest: (v: unknown) => v === context };
  const target = shape({ publicationId: id, sourceFingerprint: id });
  const valid = input.action === 'list' || input.action === 'retry' ? shape(base)(input) : input.action === 'service' ? shape({ ...base, state })(input) : input.action === 'release-event' && shape({ ...base, eventId: id, publications: (v) => array(target)(v) && Array.isArray(v) && v.length > 0 && v.length <= 8 && new Set(v.map((p) => p.publicationId)).size === v.length })(input);
  if (!valid) throw new Error(ADMIN_CONFIRMATION_ERROR);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  return { version: 1, accepted: true, requestId: context.id as string, action: String(input.action), requestDigest: Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('') };
}

// Structural render validation only. Authoritative scoring/approval checks stay
// on the judging server; this adapter cannot reinterpret their calculations.
export function validateAdminReply(value: unknown, input: Record<string, unknown>, expected: AdminAcknowledgement): AdminReply {
  const ack: Check = (v) => shape(Object.fromEntries(Object.entries(expected).map(([key, item]) => [key, (actual: unknown) => actual === item])))(v);
  const events: Check = (v) => object(v) && Object.values(v).every(shape({ competitionIds: (x) => ids(x) && Array.isArray(x) && new Set(x).size === x.length, active: boolean }));
  const valid = input.action === 'list' ? shape({ adminAcknowledgement: ack, publications: array(publication), events, enabled: boolean, serviceState: state })(value) : input.action === 'service' ? shape({ adminAcknowledgement: ack, ok: (v) => v === true, state: (v) => v === input.state })(value) : shape({ adminAcknowledgement: ack, ok: (v) => v === true, delivered: count, pending: count })(value);
  if (!valid || !object(value)) throw new Error(ADMIN_CONFIRMATION_ERROR);
  if (input.action === 'list') {
    const reply = value as unknown as AdminReply;
    if (reply.enabled !== (reply.serviceState === 'enabled') || new Set(reply.publications!.map((p) => p.id)).size !== reply.publications!.length || reply.publications!.some((p) => !Object.hasOwn(reply.events!,p.snapshot.eventId))) throw new Error(ADMIN_CONFIRMATION_ERROR);
  }
  return value as unknown as AdminReply;
}

export async function readAdminReply(response: Response, input: Record<string, unknown>, expected: AdminAcknowledgement, timeoutMs = 2000): Promise<AdminReply> {
  const limit = input.action === 'list' ? 8 * 1024 * 1024 : 4096;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const length = response.headers.get('content-length');
    if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !response.body || length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new Error(ADMIN_CONFIRMATION_ERROR);
    const bodyReader = reader = response.body.getReader();
    const read = async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const chunk = await bodyReader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > limit) throw new Error(ADMIN_CONFIRMATION_ERROR); chunks.push(chunk.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return validateAdminReply(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), input, expected);
    };
    return await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(ADMIN_CONFIRMATION_ERROR)), timeoutMs); })]);
  } catch { throw new Error(ADMIN_CONFIRMATION_ERROR); }
  finally { clearTimeout(timer); try { void (reader ? reader.cancel() : response.body?.cancel())?.catch(() => {}); } catch { /* Unusable body remains a failed check. */ } }
}

export function releaseNotice(reply: AdminReply, eventId: string, manifest: { publicationId: string; sourceFingerprint: string }[]) {
  if (!reply.events || !Object.hasOwn(reply.events,eventId) || !Array.isArray(manifest) || manifest.length===0 || manifest.length>8 || new Set(manifest.map((p)=>p.publicationId)).size!==manifest.length) return 'Publication is unconfirmed. Open review to check its current status.';
  const current=latestPublications((reply.publications??[]).filter((p)=>p.snapshot.eventId===eventId));
  const scope = reply.events?.[eventId], records = manifest.map((target) => current.find((p) => p.id === target.publicationId && p.sourceFingerprint === target.sourceFingerprint));
  if (!scope?.active || records.some((p) => !p) || scope.competitionIds.length !== records.length || new Set(records.map((p) => p!.competitionId)).size !== records.length || records.some((p) => !scope.competitionIds.includes(p!.competitionId) || p!.underReview || p!.status === 'stale')) return 'The event changed or its publication is unconfirmed. Open review to check its current status.';
  if (records.every((p) => p!.status === 'released' && Boolean(p!.releasedAt && p!.organizerApprovedAt && p!.ownerApprovedAt))) return 'Confirmed: this event’s results are published.';
  if (records.every((p) => ['released','queued'].includes(p!.status) && Boolean(p!.organizerApprovedAt && p!.ownerApprovedAt))) return 'This event’s approval is confirmed. Sending is pending; use Retry sending.';
  return 'Publication is not yet confirmed. Open review to check delivery before approving again.';
}
