import type { LiveView } from './types.ts';

type Check = (value: unknown) => boolean;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const string: Check = (value) => typeof value === 'string';
const id: Check = (value) => typeof value === 'string' && value.length > 0;
const boolean: Check = (value) => typeof value === 'boolean';
const number: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const count: Check = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
const oneOf = (...values: unknown[]): Check => (value) => values.includes(value);
const nullable = (check: Check): Check => (value) => value === null || check(value);
const array = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);
const dictionary = (check: Check): Check => (value) => object(value) && Object.values(value).every(check);
// Check known fields without rejecting compatible additions. Read payloads are not mutation input.
const shape = (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => (value) => object(value)
  && Object.entries(required).every(([key, check]) => Object.hasOwn(value, key) && check(value[key]))
  && Object.entries(optional).every(([key, check]) => !Object.hasOwn(value, key) || check(value[key]));
const ids = array(id), strings = array(string), mark = oneOf('', 'Yes', 'A1', 'A2', 'No');
const pair: Check = (value) => Array.isArray(value) && value.length === 2 && value.every(id);
const judge = shape({ id, name: string }, { participantId: string });
const subject = shape({ id, number, primary: string, secondary: string }, { role: oneOf('Lead', 'Follow'), members: pair });
const song = shape({ id, title: string, artist: string, tempo: string, notes: string, partners: array(pair) }, { pairingRevised: boolean });
const heat = shape({ id, name: string, subjectIds: ids, songs: array(song) }, { withdrawnIds: ids, eligibilityVersion: string });
const roundFields = { id, competitionId: id, kind: oneOf('prelims', 'finals'), blockId: id, subjects: array(subject), heats: array(heat), judgeIds: ids, finalistIds: ids, finalistCount: count };
const roundOptions = { prelimRoundId: id, advancementRevision: count };
const round = shape(roundFields, roundOptions);
const definition = shape({ ...roundFields, format: oneOf('Strictly', 'Jack & Jill'), division: string, judges: array(judge) }, { ...roundOptions, withdrawnIds: ids });
const setup = shape({ name: string, venue: string, date: string, headJudgeId: string, judges: array(judge), competitions: array(shape({ id, format: oneOf('Strictly', 'Jack & Jill'), division: string })), rounds: array(round), blocks: array(shape({ id, label: string, kind: oneOf('prelims', 'finals'), roundIds: ids })) }, { workflow: oneOf('stage-v1'), organizerName: string, organizerParticipantId: string, separationAttested: boolean });
const context = shape({ blockId: nullable(id), performanceId: nullable(id), visited: ids }, { automaticStages: boolean, stageSubmission: boolean, stageReviewOpen: boolean, lineupHeatId: nullable(id) });
const cell = shape({ mark, note: string, revision: count, mutationId: string }, { savedAt: string });
const ballot = shape({ roundKey: id, judgeId: id, version: count, cells: dictionary(cell), locked: boolean });
const submitted = { id, roundKey: id, judgeId: id, ballotVersion: count, createdAt: string };
const heatSubmission = shape({ ...submitted, heatId: id, version: count }, { supersedes: id, acknowledgedAt: string });
const decision = shape({ key: id, order: ids, shared: boolean, explanation: string, decidedAt: string, judgeId: id, role: oneOf('head'), fingerprint: id });
const result = shape({ subjectId: id, number, primary: string, secondary: string, group: string, average: number, sumTenths: number, denominator: number, place: number, tied: boolean, decided: boolean, songs: array(shape({ id, title: string, sumTenths: number, denominator: number, average: number })) }, { judgeMeans: array(shape({ judgeId: id, average: number, observations: count })) });
const vote = shape({ roundKey: id, fingerprint: id, tieKey: id, judgeId: id, selected: ids, createdAt: string });
const standings = shape({ rows: array(result), ties: array(shape({ key: id, group: string, subjectIds: ids })), complete: boolean, submitted: count, required: count, fingerprint: id, decisions: array(decision), approved: boolean }, { approvedAt: string, advancementTies: array(shape({ key: id, group: string, subjectIds: ids, slots: count, votes: array(vote), selected: ids, deadlocked: boolean, complete: boolean })), advancingIds: ids, finalistCount: count });
const roundView = shape({ id, key: id, generation: count, version: count, phase: oneOf('dancing', 'discussion', 'approved', 'setup'), definition }, {
  liveScores: array(shape({ heatId: id, judgeId: id, ballotVersion: count, submissionVersion: count, marks: dictionary(mark) })), standings,
  submissions: array(shape(submitted)), submittedMarks: array(shape({ judgeId: id, performanceId: id, subjectId: id, mark })),
  draftProgress: array(shape({ judgeId: id, filled: count, required: count, ballotVersion: count, locked: boolean }, { savedAt: string, missing: array(shape({ heatId: id, subjectIds: ids })) })),
});
const review = shape({ id, kind: oneOf('correction', 'withdrawal'), version: count, payload: shape({}, { roundKey: id, heatId: id, judgeId: id, submissionId: id, competitionId: id, subjectId: id, sourceBoundary: string, sourceStage: oneOf('prelims', 'finals'), pairingPlan: array(shape({ performanceId: id, partners: array(pair) })), changes: array(shape({ performanceId: id, subjectId: id, before: mark, after: mark })) }), reason: string, requester: string, createdAt: string, approvals: array(shape({ role: oneOf('organizer', 'head'), participantId: string, version: count, at: string })) }, { appliedAt: string, cancelledAt: string });
const audit = shape({ id, context: string, at: string, actor: string, title: string, outcome: string, details: strings }, { roundId: id, competitionId: id, rows: array(shape({ number, primary: string, secondary: string, place: number, average: number }, { advancing: boolean })), marks: array(shape({ entrant: string, song: string, mark: string })) });
// Public snapshots are validated structurally here, without recalculating scores or approvals.
const publicSong = shape({ id, title: string, partners: array(ids) });
const publicStage = shape({ id, kind: string, judges: array(shape({ id, name: string, head: boolean })), entrants: array(shape({ id, number, primary: string, secondary: string, role: string, members: ids, withdrawn: boolean, average: nullable(number), numericPlace: nullable(number), place: nullable(number), observations: count, judgeMeans: array(shape({ judgeId: id, average: number, observations: count })) })), heats: array(shape({ id, name: string, entrants: ids, songs: array(publicSong) })), marks: array(shape({ judgeId: id, songId: id, entrantId: id, mark })), advancing: ids, decisions: array(shape({ order: ids, shared: boolean })) });
const snapshot = shape({ schemaVersion: oneOf(1), scoringVersion: oneOf('equal-judge-stage-v1'), id, eventId: id, competitionId: id, revision: count, supersedes: nullable(id), event: shape({ name: string, venue: string, date: string }), competition: shape({ format: string, division: string }), sourceFingerprint: id, preparedAt: string, headApproval: strings, changeSummary: string, stages: array(publicStage) });
const publication = shape({ id, competitionId: id, revision: count, sourceFingerprint: id, snapshot, status: oneOf('prepared', 'requested', 'queued', 'released', 'stale') }, { organizerApprovedAt: string, ownerApprovedAt: string, releasedAt: string, underReview: boolean, lastSynchronizedAt: string });
const view = shape({ eventId: id, version: count, status: oneOf('active', 'archived'), setup, context, role: oneOf('organizer', 'judge', 'head'), judgeId: nullable(id), rounds: array(roundView), ballots: array(ballot) }, {
  judgeLinks: array(shape({ id, name: string, path: string, revoked: boolean })), resultAudit: array(audit), heatSubmissions: array(heatSubmission), reviewRequests: array(review), publications: array(publication), publicationDeliveryUnconfirmed: boolean,
});
/** Structural display/merge safety only; authorization, scoring and exact source checks stay server-side. */
export function isLiveView(value: unknown): value is LiveView { return view(value); }
