import type { LiveView } from './types.ts';

// A status read started before an acknowledgement must not roll back a saved cell.
export function mergeLiveView(current: LiveView | null, incoming: LiveView): LiveView {
  if (!current || current.eventId !== incoming.eventId) return incoming;
  if (current.version > incoming.version) return current;
  return { ...incoming, ballots: incoming.ballots.map((ballot) => {
    const previous = current.ballots.find((b) => b.roundKey === ballot.roundKey && b.judgeId === ballot.judgeId);
    if (!previous) return ballot;
    const cells = { ...ballot.cells };
    for (const [key, cell] of Object.entries(previous.cells)) if (cell.revision > (cells[key]?.revision ?? -1)) cells[key] = cell;
    return { ...ballot, version: Math.max(ballot.version, previous.version), cells };
  }) };
}
