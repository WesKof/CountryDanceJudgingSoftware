import { type FrozenRound, type LiveContext, type ReviewRequest } from './types.ts';
import { record, id, requireRule } from './validation.ts';

export function applyEligibility(round: FrozenRound, requests: ReviewRequest[]): FrozenRound {
  const applied = requests.filter((q) => q.kind === 'withdrawal' && q.appliedAt && q.payload.subjectId && q.payload.competitionId === round.competitionId && (q.payload.sourceStage !== 'finals' || round.kind === 'finals'));
  const withdrawnIds = round.subjects.filter((subject) => applied.some((q) => q.payload.subjectId === subject.id || subject.members?.includes(q.payload.subjectId!))).map((s) => s.id);
  const eligibilityVersion = applied.map((q) => `${q.id}:${q.version}`).sort().join('|');
  return { ...round, withdrawnIds, heats: round.heats.map((heat) => ({ ...heat, withdrawnIds: heat.subjectIds.filter((s) => withdrawnIds.includes(s)), eligibilityVersion, songs: heat.songs.map((song) => ({ ...song, pairingRevised:applied.some((q)=>q.payload.pairingPlan?.some((p)=>p.performanceId===song.id)), partners: applied.flatMap((q) => q.payload.pairingPlan ?? []).findLast((p) => p.performanceId === song.id)?.partners ?? song.partners })) })) };
}
export function withdrawalBoundary(round: FrozenRound, context: LiveContext): string {
  return JSON.stringify([round.id, round.heats[0]?.eligibilityVersion ?? '', context.performanceId, [...context.visited].sort()]);
}
export function validatePairingPlan(round: FrozenRound, subjectId: string, context: LiveContext, value: unknown) {
  const needsPlan = round.format === 'Jack & Jill' && round.kind === 'prelims';
  if (!needsPlan) { requireRule(value === undefined || Array.isArray(value) && value.length === 0, 'Fixed couples have no replacement pairing plan.'); return []; }
  const undanced = round.heats.flatMap((h) => h.songs.filter((p) => !context.visited.includes(p.id)).map((p) => ({ heat: h, song: p })));
  requireRule(Array.isArray(value) && value.length === undanced.length, 'Provide an exact pairing plan for every undanced song; past partnerships cannot change.');
  const seen = new Set<string>();
  const plan = value.map((v) => {
    const p = record(v), performanceId = id(p.performanceId), target = undanced.find((x) => x.song.id === performanceId);
    requireRule(target && !seen.has(performanceId), 'Pairing plans may change each undanced song exactly once.'); seen.add(performanceId);
    const active = target.heat.subjectIds.filter((s) => s !== subjectId && !round.withdrawnIds?.includes(s));
    requireRule(Array.isArray(p.partners) && p.partners.length <= 200, 'Invalid pairing plan.');
    const partners = p.partners.map((pair) => {
      requireRule(Array.isArray(pair) && pair.length === 2, 'Each pairing needs a lead and follow.');
      const lead = id(pair[0]), follow = id(pair[1]);
      requireRule(active.includes(lead) && active.includes(follow) && round.subjects.some((s) => s.id === lead && s.role === 'Lead') && round.subjects.some((s) => s.id === follow && s.role === 'Follow'), 'Pair every active dancer with an eligible opposite role in this heat.');
      return [lead, follow] as [string, string];
    });
    requireRule(new Set(partners.flat()).size === partners.flat().length && (!active.length || partners.length > 0), 'A dancer cannot have two partners in the same song; specify the exact eligible pairings.');
    return { performanceId, partners };
  });
  if(undanced.length) { const active=round.subjects.filter((s)=>s.id!==subjectId && !round.withdrawnIds?.includes(s.id)); requireRule(active.every((s)=>plan.some((p)=>p.partners.some((pair)=>pair.includes(s.id)))), 'Every remaining dancer needs a valid pairing in the reviewed undanced work.'); }
  return plan;
}
