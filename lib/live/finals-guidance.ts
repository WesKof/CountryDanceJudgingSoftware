import type { LiveSetup } from './types.ts';
import { freezeRound, unpairedFinalists } from './validation.ts';

export type FinalsBlocker = { roundId: string; division: string; detail: string } & (
  { kind: 'pair'; leadId: string; lead: string } | { kind: 'setup'; section: string }
);

/** Explain the existing whole-draw validation gate without replacing it. */
export function finalsPairingBlocker(setup: LiveSetup, currentRoundId: string): FinalsBlocker | undefined {
  const blockers: FinalsBlocker[] = [];
  for (const round of setup.rounds.filter((r) => r.kind === 'finals' && r.finalistIds.length && setup.competitions.find((c) => c.id === r.competitionId)?.format === 'Jack & Jill')) {
    try { freezeRound(setup, round); }
    catch (error) {
      const division = setup.competitions.find((c) => c.id === round.competitionId)!.division;
      const detail = (error as Error).message, base = { roundId: round.id, division, detail };
      const missing = unpairedFinalists(setup, round).find((s) => s.role === 'Lead');
      // These opening checks precede the missing draw. Keep their recovery visible.
      const panelMissing = !setup.judges.length || !setup.headJudgeId;
      const identitiesMissing = setup.workflow === 'stage-v1' && (!setup.organizerName?.trim() || !setup.organizerParticipantId || !setup.separationAttested || setup.judges.some((j) => !j.participantId));
      const headNotAssigned = setup.workflow === 'stage-v1' && round.judgeIds.length > 0 && !round.judgeIds.includes(setup.headJudgeId);
      if (missing && !panelMissing && !identitiesMissing && !headNotAssigned) {
        blockers.push({ ...base, kind: 'pair', leadId: missing.id, lead: `#${missing.number} ${missing.primary}` });
      } else {
        let section = 'Finalists & pairings';
        if (panelMissing) section = 'Judges';
        else if (identitiesMissing) section = 'Role verification';
        else if (headNotAssigned) section = 'Required judges';
        else if (!round.heats.length || round.heats.some((h) => !h.songs.length || !h.subjectIds.length)) section = 'Heats, songs & partner rotations';
        else if (round.subjects.some((s) => !round.heats.some((h) => h.subjectIds.includes(s.id)))) section = 'Heat assignments';
        blockers.push({ ...base, kind: 'setup', section });
      }
    }
  }
  return blockers.find((b) => b.roundId === currentRoundId) ?? blockers[0];
}
