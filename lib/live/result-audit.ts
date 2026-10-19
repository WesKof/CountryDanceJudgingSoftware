import type { FrozenRound, HeatSubmission, LiveSetup, ResultAuditEntry, ReviewRequest, RoundView, StageVote, TieDecision } from './types.ts';

// Explicit presentation allowlist: never spread stored snapshots, cells or identities.
export function resultAudit(s: {
  setup: LiveSetup; rounds: RoundView[]; historyRounds: { key: string; definition: FrozenRound }[];
  heatSubmissions: HeatSubmission[]; requests: ReviewRequest[]; votes: StageVote[];
  decisions: { round_key: string; fingerprint: string; decision: string }[];
  approvals: { id: string; judge_id?: string; round_key: string; fingerprint: string; snapshot: string; created_at: string }[];
}): ResultAuditEntry[] {
  const entries: ResultAuditEntry[] = [];
  const round = (key?: string) => s.historyRounds.find((r) => r.key === key)?.definition ?? s.historyRounds.find((r) => r.definition.id === key?.split(':')[0])?.definition;
  const judge = (id?: string, key?: string) => round(key)?.judges.find((j) => j.id === id)?.name ?? s.setup.judges.find((j) => j.id === id)?.name ?? 'Recorded judge';
  const entrant = (key: string | undefined, id: string) => { const e = round(key)?.subjects.find((e) => e.id === id); return e ? `#${e.number} ${e.primary}${e.secondary ? ` & ${e.secondary}` : ''}` : 'Recorded entrant'; };
  const song = (key: string, id: string) => round(key)?.heats.flatMap((h) => h.songs).find((p) => p.id === id)?.title || 'Recorded song';
  function scope(key?: string, competitionId?: string) {
    const r = round(key), c = s.setup.competitions.find((c) => c.id === competitionId);
    const past = s.historyRounds.find((r) => r.definition.competitionId === competitionId)?.definition;
    return { roundId: key?.split(':')[0], competitionId: r?.competitionId ?? competitionId, context: r ? `${r.format} · ${r.division} · ${r.kind}` : c || past ? `${(c ?? past)!.format} · ${(c ?? past)!.division}` : 'Retained competition' };
  }
  for (const sub of s.heatSubmissions) {
    const superseded = s.heatSubmissions.some((other) => other.supersedes === sub.id);
    entries.push({ id: `submission:${sub.id}`, ...scope(sub.roundKey), at: sub.createdAt, actor: judge(sub.judgeId, sub.roundKey), title: sub.supersedes ? 'Heat submission amended' : 'Heat submitted', outcome: superseded ? 'Historical submission · replaced by an approved amendment' : 'Recorded submission retained', details: [round(sub.roundKey)?.heats.find((h) => h.id === sub.heatId)?.name ?? 'Recorded heat', `Submission version ${sub.version}`], marks: Object.entries(sub.cells).map(([key, cell]) => ({ entrant: entrant(sub.roundKey, key.split(':')[1]), song: song(sub.roundKey, key.split(':')[0]), mark: cell.mark })) });
  }
  for (const vote of s.votes) entries.push({ id: `vote:${vote.roundKey}:${vote.fingerprint}:${vote.tieKey}:${vote.judgeId}`, ...scope(vote.roundKey), at: vote.createdAt, actor: judge(vote.judgeId, vote.roundKey), title: 'Cutoff vote recorded', outcome: 'Panel vote retained', details: vote.selected.map((id) => entrant(vote.roundKey, id)) });
  for (const stored of s.decisions) {
    const d = JSON.parse(stored.decision) as TieDecision;
    entries.push({ id: `decision:${stored.round_key}:${stored.fingerprint}:${d.key}`, ...scope(stored.round_key), at: d.decidedAt, actor: judge(d.judgeId, stored.round_key), title: 'Tie decision recorded', outcome: d.shared ? 'Shared place' : 'Ordered placement', details: [d.explanation || 'No explanation recorded', ...d.order.map((id, i) => `${d.shared ? 'Shared' : i + 1}. ${entrant(stored.round_key, id)}`)] });
  }
  for (const a of s.approvals) {
    const snapshot = JSON.parse(a.snapshot) as { rows?: { subjectId: string; number: number; primary: string; secondary: string; place: number; average: number }[]; advancingIds?: string[] };
    const current = s.rounds.some((r) => r.key === a.round_key && r.standings?.approved && r.standings.fingerprint === a.fingerprint);
    entries.push({ id: `approval:${a.id}`, ...scope(a.round_key), at: a.created_at, actor: a.judge_id ? judge(a.judge_id, a.round_key) : 'Head judge', title: 'Results approved', outcome: current ? 'Current head approval' : 'Historical approval · not the current approved result', details: ['Retained result snapshot; viewing it does not replace current standings.'], rows: snapshot.rows?.map((r) => ({ number: r.number, primary: r.primary, secondary: r.secondary, place: r.place, average: r.average, ...(snapshot.advancingIds ? { advancing: snapshot.advancingIds.includes(r.subjectId) } : {}) })) });
  }
  for (const q of s.requests) {
    const kind = q.kind === 'correction' ? 'Correction' : q.payload.subjectId ? 'Entrant/couple withdrawal' : 'Competition withdrawal';
    const details = [`Request version ${q.version}`, q.reason, ...(q.payload.subjectId ? [entrant(q.payload.roundKey, q.payload.subjectId)] : []), ...(q.payload.changes ?? []).map((c) => `${entrant(q.payload.roundKey, c.subjectId)} · ${song(q.payload.roundKey!, c.performanceId)}: ${c.before || 'Blank'} → ${c.after || 'Blank'}`)];
    const add = (suffix: string, at: string, actor: string, title: string, outcome: string) => entries.push({ id: `request:${q.id}:${q.version}:${suffix}`, ...scope(q.payload.roundKey, q.payload.competitionId), at, actor, title, outcome, details });
    if (!q.cancelledAt) add('requested', q.createdAt, 'Organizer', `${kind} ${q.version > 1 ? 'revised' : 'requested'}`, 'Request recorded; changes require both exact approvals');
    for (const a of q.approvals) add(`approval:${a.role}`, a.at, a.role === 'head' ? 'Head judge' : 'Organizer', `${kind} approval recorded`, `Approved request version ${a.version} as ${a.role}`);
    if (q.cancelledAt) add('cancelled', q.cancelledAt, 'Organizer', `${kind} cancelled`, 'Cancelled; records retained');
    if (q.appliedAt) add('applied', q.appliedAt, 'Organizer and head judge', `${kind} applied`, 'Applied with both approvals; affected results require renewed review');
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
