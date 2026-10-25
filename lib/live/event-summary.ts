import type { EventSummary } from './types.ts';

type KnownSummary = { eventId?: string; summaryVersion?: number };
/** Read only the organizer summary contract; never replace saved metadata with a partial reply. */
export function checkedEventSummary(value: unknown, known: KnownSummary = {}): EventSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const summary = value as Partial<EventSummary>;
  if (typeof summary.eventId !== 'string' || !summary.eventId.trim() || summary.eventId !== summary.eventId.trim() || known.eventId && summary.eventId !== known.eventId ||
    !Number.isSafeInteger(summary.version) || summary.version! < 1 || known.summaryVersion !== undefined && summary.version! < known.summaryVersion ||
    summary.status !== 'active' && summary.status !== 'archived' || typeof summary.name !== 'string' || typeof summary.venue !== 'string' || typeof summary.date !== 'string' ||
    !Number.isSafeInteger(summary.competitionCount) || summary.competitionCount! < 0) return null;
  return { eventId: summary.eventId, version: summary.version!, status: summary.status, name: summary.name, venue: summary.venue, date: summary.date, competitionCount: summary.competitionCount! };
}

/** An HTTP success alone cannot confirm an archive/reactivation or authorize a reload. */
export function eventChangeState(acknowledgement: unknown, before: EventSummary, after: EventSummary | null, action: 'archive' | 'reactivate'): 'confirmed' | 'unchanged' | 'changed-again' | 'unconfirmed' {
  if (!after || after.eventId !== before.eventId) return 'unconfirmed';
  if (!acknowledgement || typeof acknowledgement !== 'object' || Array.isArray(acknowledgement) || (acknowledgement as { ok?: unknown }).ok !== true) return after.version === before.version && after.status === before.status && before.status === (action === 'archive' ? 'active' : 'archived') ? 'unchanged' : 'unconfirmed';
  if (after.version > before.version + 1) return 'changed-again';
  return after.version === before.version + 1 && after.status === (action === 'archive' ? 'archived' : 'active') ? 'confirmed' : 'unconfirmed';
}
