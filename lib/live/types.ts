export type LiveMark = '' | 'Yes' | 'A1' | 'A2' | 'No';
export type LiveSubject = { id: string; number: number; primary: string; secondary: string; role?: 'Lead' | 'Follow'; members?: [string, string] };
export type Performance = { id: string; title: string; artist: string; tempo: string; notes: string; pairingRevised?: boolean; partners: [string, string][] };
export type LiveHeat = { withdrawnIds?: string[]; eligibilityVersion?: string; id: string; name: string; subjectIds: string[]; songs: Performance[] };
export type LiveRound = { id: string; competitionId: string; kind: 'prelims' | 'finals'; blockId: string; subjects: LiveSubject[]; heats: LiveHeat[]; judgeIds: string[]; prelimRoundId?: string; finalistIds: string[]; finalistCount: number; advancementRevision?: number };
export type LiveSetup = {
  name: string; venue: string; date: string; headJudgeId: string;
  workflow?: 'stage-v1'; organizerName?: string; organizerParticipantId?: string; separationAttested?: boolean;
  judges: { id: string; name: string; participantId?: string }[];
  competitions: { id: string; format: 'Strictly' | 'Jack & Jill'; division: string }[];
  rounds: LiveRound[];
  blocks: { id: string; label: string; kind: 'prelims' | 'finals'; roundIds: string[] }[];
};
export type FrozenRound = LiveRound & { withdrawnIds?: string[]; format: 'Strictly' | 'Jack & Jill'; division: string; judges: { id: string; name: string }[] };
export type LiveContext = { blockId: string | null; performanceId: string | null; visited: string[]; lineupHeatId?: string | null };
export type Cell = { mark: LiveMark; note: string; revision: number; mutationId: string; savedAt?: string };
export type Cells = Record<string, Cell>;
export type LiveBallot = { roundKey: string; judgeId: string; version: number; cells: Cells; locked: boolean };
// Organizer-only display data. Never include private notes or editable ballot cells.
export type LiveScoreFeed = { heatId: string; judgeId: string; ballotVersion: number; submissionVersion: number; marks: Record<string, LiveMark> };
export type LiveSubmission = { id: string; roundKey: string; judgeId: string; ballotVersion: number; cells: Cells; createdAt: string };
export type HeatSubmission = LiveSubmission & { heatId: string; version: number; supersedes?: string; acknowledgedAt?: string };
export type StageVote = { roundKey: string; fingerprint: string; tieKey: string; judgeId: string; selected: string[]; createdAt: string };
export type AmendmentChange = { performanceId: string; subjectId: string; before: LiveMark; after: LiveMark };
export type ReviewRequest = { id: string; kind: 'correction' | 'withdrawal'; version: number; payload: { roundKey?: string; heatId?: string; judgeId?: string; submissionId?: string; competitionId?: string; subjectId?: string; sourceBoundary?: string; sourceStage?: 'prelims' | 'finals'; pairingPlan?: { performanceId: string; partners: [string, string][] }[]; changes?: AmendmentChange[] }; reason: string; requester: string; createdAt: string; approvals: { role: 'organizer' | 'head'; participantId: string; version: number; at: string }[]; appliedAt?: string; cancelledAt?: string };
export type AdvancementTie = { key: string; group: string; subjectIds: string[]; slots: number; votes: StageVote[]; selected: string[]; deadlocked: boolean; complete: boolean };
export type TieDecision = { key: string; order: string[]; shared: boolean; explanation: string; decidedAt: string; judgeId: string; role: 'head'; fingerprint: string };
export type LiveResult = { subjectId: string; number: number; primary: string; secondary: string; group: string; average: number; sumTenths: number; denominator: number; place: number; tied: boolean; decided: boolean; judgeMeans?: { judgeId: string; average: number; observations: number }[]; songs: { id: string; title: string; sumTenths: number; denominator: number; average: number }[] };
export type LiveStandings = { rows: LiveResult[]; ties: { key: string; group: string; subjectIds: string[] }[]; complete: boolean; submitted: number; required: number; fingerprint: string; decisions: TieDecision[]; approved: boolean; approvedAt?: string; advancementTies?: AdvancementTie[]; advancingIds?: string[]; finalistCount?: number };
export type RoundView = { id: string; key: string; generation: number; version: number; phase: 'dancing' | 'discussion' | 'approved' | 'setup'; definition: FrozenRound; liveScores?: LiveScoreFeed[]; standings?: LiveStandings; submissions?: Omit<LiveSubmission, 'cells'>[]; submittedMarks?: { judgeId: string; performanceId: string; subjectId: string; mark: LiveMark }[]; draftProgress?: { judgeId: string; filled: number; required: number; ballotVersion: number; savedAt?: string; locked: boolean }[] };
export type LiveView = {
  eventId: string; version: number; status: 'active' | 'archived'; setup: LiveSetup; context: LiveContext;
  role: 'organizer' | 'judge' | 'head'; judgeId: string | null; rounds: RoundView[]; ballots: LiveBallot[];
  judgeLinks?: { id: string; name: string; path: string; revoked: boolean }[];
  restoredHistory?: unknown;
  heatSubmissions?: Omit<HeatSubmission, 'cells'>[]; reviewRequests?: ReviewRequest[]; publications?: import('./publication.ts').PublicationRecord[];
};
export const cellKey = (performanceId: string, subjectId: string) => `${performanceId}:${subjectId}`;
export const roundKey = (id: string, generation: number) => `${id}:${generation}`;
