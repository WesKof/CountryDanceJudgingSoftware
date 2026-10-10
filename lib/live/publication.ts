import type { LiveMark, LiveView } from './types.ts';
import { requireRule } from './validation.ts';

export type PublicSnapshot = {
  schemaVersion: 1; scoringVersion: 'equal-judge-stage-v1'; id: string; eventId: string; competitionId: string; revision: number; supersedes: string | null;
  event: { name: string; venue: string; date: string }; competition: { format: string; division: string }; sourceFingerprint: string;
  preparedAt: string; headApproval: string[]; changeSummary: string;
  stages: { id: string; kind: string; judges: { id: string; name: string; head: boolean }[];
    entrants: { id: string; number: number; primary: string; secondary: string; role: string; members: string[]; withdrawn: boolean; average: number | null; numericPlace: number | null; place: number | null; observations: number; judgeMeans: { judgeId: string; average: number; observations: number }[] }[];
    heats: { id: string; name: string; entrants: string[]; songs: { id: string; title: string; partners: string[][] }[] }[];
    marks: { judgeId: string; songId: string; entrantId: string; mark: LiveMark }[];
    advancing: string[]; decisions: { order: string[]; shared: boolean }[];
  }[];
};
export type PublicationRecord = { id: string; competitionId: string; revision: number; sourceFingerprint: string; snapshot: PublicSnapshot; status: 'prepared' | 'requested' | 'queued' | 'released' | 'stale'; organizerApprovedAt?: string; ownerApprovedAt?: string; releasedAt?: string; underReview?: boolean; lastSynchronizedAt?: string };
// Pick the newest immutable preparation for each competition, retaining stale status.
export function latestPublications(records: PublicationRecord[]) {
  const latest = new Map<string, PublicationRecord>();
  for (const record of records) {
    const prior = latest.get(record.competitionId);
    if (!prior || record.snapshot.preparedAt > prior.snapshot.preparedAt || (record.snapshot.preparedAt === prior.snapshot.preparedAt && record.revision > prior.revision)) latest.set(record.competitionId, record);
  }
  return [...latest.values()];
}
export async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, '0')).join(''); }
// Hash the complete allowlisted payload in the same fixed top-level order as preparation.
export async function snapshotFingerprint(snapshot:PublicSnapshot){const {schemaVersion,scoringVersion,eventId,competitionId,event,competition,headApproval,stages,changeSummary,id,revision,supersedes,preparedAt}=snapshot;return digest(JSON.stringify({schemaVersion,scoringVersion,eventId,competitionId,event,competition,headApproval,stages,changeSummary,id,revision,supersedes,preparedAt}));}
export async function publicId(eventId: string, value: string) { return 'p-' + (await digest(`${eventId}:${value}`)).slice(0, 24); }

export async function buildPublicSnapshot(view: LiveView, competitionId: string, revision: number, supersedes: string | null, preparedAt: string, snapshotId: string): Promise<PublicSnapshot> {
  requireRule(view.setup.workflow === 'stage-v1', 'Publication of legacy-only events is deferred.');
  const competition = view.setup.competitions.find((c) => c.id === competitionId);
  const rounds = view.rounds.filter((r) => r.definition.competitionId === competitionId);
  const scheduled = view.setup.rounds.filter((r) => r.competitionId === competitionId);
  requireRule(competition && scheduled.length > 0 && rounds.length === scheduled.length && rounds.some((r) => r.definition.kind === 'finals') && rounds.every((r) => r.standings?.approved && r.standings.complete), 'Publish only a completed competition with current head-approved results and advancement.');
  for (const finals of rounds.filter((r) => r.definition.kind === 'finals')) {
    const pre = rounds.find((r) => r.id === finals.definition.prelimRoundId)!;
    requireRule(pre?.standings?.approved && finals.definition.finalistIds.length === pre.standings.advancingIds?.length && finals.definition.finalistIds.every((id) => pre.standings!.advancingIds!.includes(id)), 'Finalist membership changed; publication is blocked pending the deferred replacement/redance policy.');
  }
  const ids = new Map<string, string>();
  for (const value of [view.eventId, competitionId, ...rounds.flatMap((r) => [r.id, ...r.definition.judgeIds, ...r.definition.subjects.flatMap((s) => [s.id, ...(s.members ?? [])]), ...r.definition.heats.flatMap((h) => [h.id, ...h.songs.map((p) => p.id)])])]) ids.set(value, await publicId(view.eventId, value));
  const pid = (id: string) => ids.get(id)!;
  const stages: PublicSnapshot['stages'] = rounds.map((r) => {
    const result = r.standings!;
    return { id: pid(r.id), kind: r.definition.kind, judges: r.definition.judges.map((j) => ({ id: pid(j.id), name: j.name, head: j.id === view.setup.headJudgeId })),
      entrants: r.definition.subjects.map((s) => { const row = result.rows.find((row) => row.subjectId === s.id); const retained=(r.submittedMarks ?? []).filter((c)=>c.subjectId===s.id&&c.mark!=='');const retainedMeans=r.definition.judgeIds.flatMap((judgeId)=>{const cells=retained.filter((c)=>c.judgeId===judgeId);return cells.length?[{judgeId,average:cells.reduce((n,c)=>n+({Yes:10,A1:4.5,A2:4.3,No:0}[c.mark as 'Yes'|'A1'|'A2'|'No']),0)/cells.length,observations:cells.length}]:[];}); const numericPlace = row ? 1 + result.rows.filter((x) => (x.group === row.group) && x.average > row.average + 1e-9).length : null;
        return { id: pid(s.id), number: s.number, primary: s.primary, secondary: s.secondary, role: s.role ?? 'Couple', members: (s.members ?? []).map(pid), withdrawn: r.definition.withdrawnIds?.includes(s.id) ?? false, average: row?.average ?? null, numericPlace, place: row?.place ?? null, observations: row?.denominator ?? retained.length, judgeMeans: (row?.judgeMeans ?? retainedMeans).map((j) => ({ ...j, judgeId: pid(j.judgeId) })) }; }),
      heats: r.definition.heats.map((h) => ({ id: pid(h.id), name: h.name, entrants: h.subjectIds.map(pid), songs: h.songs.map((p) => ({ id: pid(p.id), title: p.title, partners: p.partners.map((pair) => pair.map(pid)) })) })),
      marks: (r.submittedMarks ?? []).map((c) => ({ judgeId: pid(c.judgeId), songId: pid(c.performanceId), entrantId: pid(c.subjectId), mark: c.mark })),
      advancing: (result.advancingIds ?? []).map(pid), decisions: result.decisions.map((d) => ({ order: d.order.map(pid), shared: d.shared })) };
  });
  const material = { schemaVersion: 1 as const, scoringVersion: 'equal-judge-stage-v1' as const, eventId: pid(view.eventId), competitionId: pid(competitionId), event: { name: view.setup.name, venue: view.setup.venue, date: view.setup.date }, competition: { format: competition.format, division: competition.division }, headApproval: rounds.map((r) => `${r.standings!.fingerprint}:${r.standings!.approvedAt}`), stages, changeSummary: revision === 1 ? 'Head-approved results' : view.reviewRequests?.some((q) => q.appliedAt && q.kind === 'withdrawal' && q.payload.competitionId === competitionId) ? 'Approved withdrawal' : 'Approved score correction' };
  const snapshot = { ...material, sourceFingerprint: await digest(JSON.stringify({ ...material,id:snapshotId,revision,supersedes,preparedAt })), id: snapshotId, revision, supersedes, preparedAt };
  validatePublicSnapshot(snapshot);
  return snapshot;
}

// Receiver validation is independent of the operational average implementation.
export function validatePublicSnapshot(snapshot: PublicSnapshot) {
  const keys = (object: object, allowed: string[]) => requireRule(Object.keys(object).every((key) => allowed.includes(key)) && allowed.every((key) => Object.hasOwn(object, key)), 'Public snapshot contains unknown or missing fields.');
  keys(snapshot, ['schemaVersion','scoringVersion','id','eventId','competitionId','revision','supersedes','event','competition','sourceFingerprint','preparedAt','headApproval','changeSummary','stages']);
  keys(snapshot.event, ['name','venue','date']); keys(snapshot.competition, ['format','division']);
  requireRule(snapshot.schemaVersion === 1 && snapshot.scoringVersion === 'equal-judge-stage-v1' && Number.isSafeInteger(snapshot.revision) && snapshot.revision > 0 && snapshot.stages.length >= 2, 'Unsupported public snapshot.');
  const marks = { Yes: 10, A1: 4.5, A2: 4.3, No: 0 };
  for (const stage of snapshot.stages) {
    keys(stage, ['id','kind','judges','entrants','heats','marks','advancing','decisions']);
    for (const j of stage.judges) keys(j,['id','name','head']);
    for (const h of stage.heats) { keys(h,['id','name','entrants','songs']); for (const s of h.songs) keys(s,['id','title','partners']); }
    for (const d of stage.decisions) keys(d,['order','shared']);
    requireRule(new Set(stage.marks.map((c) => `${c.judgeId}/${c.songId}/${c.entrantId}`)).size === stage.marks.length, 'Duplicate public observation.');
    for (const c of stage.marks) { requireRule(stage.judges.some((j)=>j.id===c.judgeId)&&stage.heats.some((h)=>h.entrants.includes(c.entrantId)&&h.songs.some((song)=>song.id===c.songId)),'Unknown public observation scope.'); keys(c,['judgeId','songId','entrantId','mark']); requireRule(c.mark === '' || Object.hasOwn(marks,c.mark), 'Invalid public mark.'); }
    for (const entrant of stage.entrants) {
      keys(entrant,['id','number','primary','secondary','role','members','withdrawn','average','numericPlace','place','observations','judgeMeans']);
      for (const j of entrant.judgeMeans) keys(j,['judgeId','average','observations']);
      const heat = stage.heats.find((h) => h.entrants.includes(entrant.id)); requireRule(heat, 'Unknown public entrant heat.');
      for (const judge of stage.judges) for (const song of heat.songs) requireRule(stage.marks.some((c) => c.entrantId === entrant.id && c.judgeId === judge.id && c.songId === song.id), 'Public snapshots require explicit blank slots.');
      if (entrant.withdrawn) { requireRule(entrant.place === null && entrant.numericPlace === null && entrant.average === null, 'Withdrawn entrants cannot receive a placement.');for(const judge of stage.judges){const cells=stage.marks.filter((c)=>c.entrantId===entrant.id&&c.judgeId===judge.id&&c.mark!=='');const shown=entrant.judgeMeans.find((m)=>m.judgeId===judge.id);requireRule(cells.length ? shown&&shown.observations===cells.length&&Math.abs(shown.average-cells.reduce((n,c)=>n+marks[c.mark as keyof typeof marks],0)/cells.length)<1e-9 : !shown,'Withdrawn observations must retain their recorded means/counts.');}requireRule(entrant.observations===entrant.judgeMeans.reduce((n,m)=>n+m.observations,0),'Withdrawn counts disagree.');continue; }
      const means = stage.judges.map((judge) => {
        const observations = stage.marks.filter((c) => c.entrantId === entrant.id && c.judgeId === judge.id && c.mark !== '');
        requireRule(observations.length, 'An active entrant is uncovered.');
        const mean = observations.reduce((n,c) => n + marks[c.mark as keyof typeof marks],0) / observations.length;
        const shown = entrant.judgeMeans.find((j) => j.judgeId === judge.id);
        requireRule(shown && shown.observations === observations.length && Math.abs(shown.average - mean) < 1e-9, 'Public judge means/counts disagree with recorded observations.');
        return mean;
      });
      requireRule(entrant.average !== null && Math.abs(entrant.average - means.reduce((a,b) => a+b,0) / means.length) < 1e-9 && entrant.observations === entrant.judgeMeans.reduce((n,j)=>n+j.observations,0), 'Public average must weight each judge equally.');
      const sameGroup = stage.entrants.filter((e) => !e.withdrawn && e.role === entrant.role);
      requireRule(entrant.numericPlace === 1 + sameGroup.filter((e) => e.average! > entrant.average! + 1e-9).length, 'Public numeric ranks disagree with averages.');
    }
  }
}
