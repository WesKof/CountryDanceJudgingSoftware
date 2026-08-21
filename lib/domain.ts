export type Mark = '' | 'Yes' | 'A1' | 'A2' | 'No';

export type Judge = {
  id: string;
  name: string;
};

export type Entry = {
  id: string;
  number: number;
  lead?: string;
  follow?: string;
  name?: string;
  role?: 'Lead' | 'Follow';
};

export type ResultRow = {
  entryId: string;
  number: number;
  primary: string;
  secondary: string;
  group: string;
  place: number;
  tied: boolean;
  total: number;
  complete: boolean;
};

export type ResultRevision = {
  id: string;
  createdAt: string;
  label: string;
  rows: ResultRow[];
};

export type Competition = {
  id: string;
  name: string;
  format: 'Strictly' | 'Jack & Jill';
  division: string;
  round: string;
  entries: Entry[];
  scores: Record<string, Record<string, Mark>>;
  revisions: ResultRevision[];
};

export type AppState = {
  version: 2;
  event: {
    name: string;
    venue: string;
    date: string;
  };
  judges: Judge[];
  competitions: Competition[];
  activeCompetitionId: string;
  publisherUrl: string;
};

export function createId(prefix: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createDefaultState(): AppState {
  const judges: Judge[] = [
    { id: 'judge-elise', name: 'Elise H.' },
    { id: 'judge-wesley', name: 'Wesley C.' },
    { id: 'judge-jeff', name: 'Jeff S.' },
  ];

  return {
    version: 2,
    event: {
      name: 'Bluebonnet Country Dance Classic',
      venue: 'Fort Worth, Texas',
      date: '2026-10-17',
    },
    judges,
    activeCompetitionId: 'competition-strictly',
    publisherUrl: '',
    competitions: [
      {
        id: 'competition-strictly',
        name: 'Strictly',
        format: 'Strictly',
        division: 'Intermediate / Advanced',
        round: 'Finals',
        entries: [
          { id: 'entry-128', number: 128, lead: 'Mason Reed', follow: 'Avery Brooks' },
          { id: 'entry-130', number: 130, lead: 'Cole Bennett', follow: 'Sadie Monroe' },
          { id: 'entry-122', number: 122, lead: 'Eli Turner', follow: 'Mae Collins' },
          { id: 'entry-117', number: 117, lead: 'Noah Hayes', follow: 'Clara James' },
        ],
        scores: {
          'entry-128': { 'judge-elise': 'Yes', 'judge-wesley': 'Yes', 'judge-jeff': 'A1' },
          'entry-130': { 'judge-elise': 'Yes', 'judge-wesley': 'A2', 'judge-jeff': 'Yes' },
          'entry-122': { 'judge-elise': 'A1', 'judge-wesley': 'Yes', 'judge-jeff': '' },
          'entry-117': { 'judge-elise': '', 'judge-wesley': '', 'judge-jeff': '' },
        },
        revisions: [],
      },
      {
        id: 'competition-jj',
        name: 'Jack & Jill',
        format: 'Jack & Jill',
        division: 'Novice',
        round: 'Preliminary',
        entries: [
          { id: 'entry-204', number: 204, name: 'Jordan Lee', role: 'Lead' },
          { id: 'entry-211', number: 211, name: 'Cameron Wells', role: 'Lead' },
          { id: 'entry-219', number: 219, name: 'Riley Parker', role: 'Lead' },
          { id: 'entry-306', number: 306, name: 'Morgan Davis', role: 'Follow' },
          { id: 'entry-312', number: 312, name: 'Taylor Quinn', role: 'Follow' },
          { id: 'entry-318', number: 318, name: 'Casey Lane', role: 'Follow' },
        ],
        scores: {},
        revisions: [],
      },
    ],
  };
}

export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppState>;
  return candidate.version === 2
    && Boolean(candidate.event)
    && Array.isArray(candidate.judges)
    && Array.isArray(candidate.competitions)
    && candidate.competitions.length > 0
    && typeof candidate.activeCompetitionId === 'string'
    && candidate.competitions.some((competition) => competition.id === candidate.activeCompetitionId);
}
