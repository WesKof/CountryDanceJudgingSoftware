import type { LiveHeat, Performance, RoundView } from './types.ts';

export function scoringRestriction(round: RoundView, song: Performance, subjectId: string) {
  if (round.definition.withdrawnIds?.includes(subjectId)) return 'This entry is withdrawn. Retained marks and notes are read only.';
  if (song.pairingRevised && !song.partners.some((pair) => pair.includes(subjectId))) return 'Not scheduled for this song. Retained marks and notes are read only.';
  return '';
}

export function missingScoreDestination(round: RoundView, heat: LiveHeat, subjectId: string, selectableSongIds: ReadonlySet<string>) {
  if (!heat.subjectIds.includes(subjectId) || heat.withdrawnIds?.includes(subjectId)) return undefined;
  return heat.songs.find((song) => selectableSongIds.has(song.id) && !scoringRestriction(round, song, subjectId));
}
