import type { LiveView } from './types.ts';

// A status read started before an acknowledgement must not roll back a saved cell.
export function mergeLiveView(current: LiveView | null, incoming: LiveView): LiveView {
  if (!current || current.eventId !== incoming.eventId) return incoming;
  if (current.version > incoming.version) return current;
  const heatSubmissions = incoming.heatSubmissions ? [...incoming.heatSubmissions] : undefined;
  if (heatSubmissions && current.version === incoming.version) for (const previous of current.heatSubmissions ?? []) {
    const i = heatSubmissions.findIndex((s) => s.roundKey === previous.roundKey && s.heatId === previous.heatId && s.judgeId === previous.judgeId);
    if (i < 0) heatSubmissions.push(previous);
    else if (heatSubmissions[i].version < previous.version) heatSubmissions[i] = previous;
  }
  const rounds = incoming.rounds.map((round) => {
    const previous = current.rounds.find((r) => r.key === round.key);
    if (incoming.role !== 'organizer' || current.version !== incoming.version || !round.liveScores || !previous?.liveScores) return round;
    return { ...round, liveScores: round.liveScores.map((feed) => {
      const prior = previous.liveScores!.find((f) => f.heatId === feed.heatId && f.judgeId === feed.judgeId);
      return prior && (prior.submissionVersion > feed.submissionVersion || prior.submissionVersion === feed.submissionVersion && prior.ballotVersion > feed.ballotVersion) ? prior : feed;
    }) };
  });
  return { ...incoming, rounds, heatSubmissions, ballots: incoming.ballots.map((ballot) => {
    const previous = current.ballots.find((b) => b.roundKey === ballot.roundKey && b.judgeId === ballot.judgeId);
    if (!previous) return ballot;
    const cells = { ...ballot.cells };
    for (const [key, cell] of Object.entries(previous.cells)) if (cell.revision > (cells[key]?.revision ?? -1)) cells[key] = cell;
    return { ...ballot, version: Math.max(ballot.version, previous.version), cells };
  }) };
}
