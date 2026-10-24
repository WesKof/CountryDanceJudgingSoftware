import type { PublicSnapshot, PublicationRecord } from '../lib/live/publication.ts';

type Stage = PublicSnapshot['stages'][number];
type Entrant = Stage['entrants'][number];
type Mark = Stage['marks'][number]['mark'];
type Scope = { entrantId?: string; judgeId?: string };
type MarkChange = { judgeId: string; judge: string; song: string; before: Mark | undefined; after: Mark | undefined };
export type PublicChange = { stage: string; before?: Entrant; after?: Entrant; wasAdvancing: boolean; advancing: boolean; marks: MarkChange[] };
export type PublicComparison = { state: 'first' | 'unavailable' | 'compared'; previous?: PublicationRecord; changes: PublicChange[] };

function released(record: PublicationRecord | undefined): record is PublicationRecord {
  return Boolean(record?.snapshot && record.status === 'released' && record.releasedAt && Number.isFinite(Date.parse(record.releasedAt)) && record.id === record.snapshot.id && record.revision === record.snapshot.revision && Number.isSafeInteger(record.revision) && record.revision > 0);
}

// Read canonical public records only. A supersedes pointer never authorizes a comparison.
export function comparePublicResults(record: PublicationRecord, records: Record<string, PublicationRecord>, scope: Scope = {}): PublicComparison {
  const current = records[record.id];
  if (!released(record) || !released(current) || current.snapshot.eventId !== record.snapshot.eventId || current.snapshot.competitionId !== record.snapshot.competitionId || current.revision !== record.revision) return { state: 'unavailable', changes: [] };
  if (current.revision === 1) return { state: 'first', changes: [] };
  const candidates = Object.entries(records).filter(([id, candidate]) => released(candidate) && id === candidate.id && candidate.snapshot.eventId === current.snapshot.eventId && candidate.snapshot.competitionId === current.snapshot.competitionId && candidate.revision < current.revision && Date.parse(candidate.releasedAt!) <= Date.parse(current.releasedAt!)).map(([, candidate]) => candidate).sort((a, b) => b.revision - a.revision);
  const previous = candidates[0];
  if (!previous || candidates.some((candidate) => candidate.id !== previous.id && candidate.revision === previous.revision)) return { state: 'unavailable', changes: [] };

  const identity = new Set(scope.entrantId ? [scope.entrantId] : []);
  if (scope.entrantId) for (const snapshot of [previous.snapshot, current.snapshot]) for (const stage of snapshot.stages) for (const entrant of stage.entrants) if (entrant.id === scope.entrantId) entrant.members.forEach((id) => identity.add(id));
  const relevant = (entrant: Entrant | undefined) => entrant && (!scope.entrantId || identity.has(entrant.id) || entrant.members.some((id) => identity.has(id)));
  const changes: PublicChange[] = [];
  const stageIds = new Set([...current.snapshot.stages, ...previous.snapshot.stages].map((stage) => stage.id));
  for (const stageId of stageIds) {
    const beforeStage = previous.snapshot.stages.find((stage) => stage.id === stageId), afterStage = current.snapshot.stages.find((stage) => stage.id === stageId);
    const entrants = new Set([...(afterStage?.entrants ?? []), ...(beforeStage?.entrants ?? [])].map((entrant) => entrant.id));
    for (const id of entrants) {
      const before = beforeStage?.entrants.find((entrant) => entrant.id === id), after = afterStage?.entrants.find((entrant) => entrant.id === id);
      if (!relevant(before) && !relevant(after)) continue;
      const markKey = (mark: Stage['marks'][number]) => JSON.stringify([mark.judgeId, mark.songId]);
      const oldMarks = new Map((beforeStage?.marks ?? []).filter((mark) => mark.entrantId === id).map((mark) => [markKey(mark), mark]));
      const newMarks = new Map((afterStage?.marks ?? []).filter((mark) => mark.entrantId === id).map((mark) => [markKey(mark), mark]));
      const marks: MarkChange[] = [];
      for (const key of new Set([...oldMarks.keys(), ...newMarks.keys()])) {
        const oldMark = oldMarks.get(key), newMark = newMarks.get(key), cell = newMark ?? oldMark!;
        if (oldMark?.mark === newMark?.mark || scope.judgeId && cell.judgeId !== scope.judgeId) continue;
        const judge = [...(afterStage?.judges ?? []), ...(beforeStage?.judges ?? [])].find((judge) => judge.id === cell.judgeId)?.name ?? 'Recorded judge';
        const song = [...(afterStage?.heats ?? []), ...(beforeStage?.heats ?? [])].flatMap((heat) => heat.songs).find((song) => song.id === cell.songId)?.title ?? 'Recorded song';
        marks.push({ judgeId: cell.judgeId, judge, song, before: oldMark?.mark, after: newMark?.mark });
      }
      const wasAdvancing = beforeStage?.advancing.includes(id) ?? false, advancing = afterStage?.advancing.includes(id) ?? false;
      const fields = ['average', 'place', 'withdrawn', 'primary', 'secondary', 'number', 'role', 'observations'] as const;
      const changed = !before || !after || fields.some((field) => before[field] !== after[field]) || wasAdvancing !== advancing;
      if (scope.judgeId ? marks.length > 0 : changed || marks.length > 0) changes.push({ stage: afterStage?.kind ?? beforeStage!.kind, before, after, wasAdvancing, advancing, marks });
    }
  }
  changes.sort((a, b) => Number(b.stage === 'finals') - Number(a.stage === 'finals') || a.stage.localeCompare(b.stage) || (a.after ?? a.before)!.number - (b.after ?? b.before)!.number);
  return { state: 'compared', previous, changes };
}

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const name = (entrant: Entrant) => `#${entrant.number} ${entrant.primary}${entrant.secondary ? ' & ' + entrant.secondary : ''}`;
const average = (entrant: Entrant) => entrant.average === null ? '—' : entrant.average.toFixed(4);
const markLabel = (mark: Mark | undefined) => mark === undefined ? 'Not present' : mark === '' ? 'Blank · Not observed' : mark === 'No' ? 'No (0)' : mark;

export function renderPublicComparison(record: PublicationRecord, records: Record<string, PublicationRecord>, scope: Scope = {}) {
  // Admin preparations are private previews, even when other versions have been released.
  if (!released(record) || !released(records[record.id])) return '';
  const result = comparePublicResults(record, records, scope);
  if (result.state === 'first') return '';
  const summary = `What changed${result.changes.length ? ` · ${result.changes.length} result ${result.changes.length === 1 ? 'entry' : 'entries'}` : ''}`;
  if (result.state === 'unavailable') return `<details class="public-comparison"><summary>${summary}</summary><p>An earlier published version is not available for comparison.</p></details>`;
  const previous = result.previous!;
  const context = scope.judgeId ? 'Only changes in this judge’s recorded scorecards are listed.' : scope.entrantId ? 'Only changes for this entrant or their published couples are listed.' : 'Published averages, places, advancement and recorded scorecards are compared.';
  const unchanged = scope.judgeId ? 'No recorded-scorecard changes for this judge.' : scope.entrantId ? 'No public result or recorded-scorecard changes for this entrant.' : 'No public result or recorded-scorecard changes for this view.';
  return `<details class="public-comparison"><summary>${summary}</summary><p>Compared with <a href="/results/${escape(encodeURIComponent(previous.id))}">published revision ${previous.revision}</a> → revision ${record.revision}. ${context}</p>${result.changes.length ? `<ul class="comparison-list">${result.changes.map((change) => {
    const entrant = change.after ?? change.before!, before = change.before, after = change.after;
    const facts: [string, string, string][] = [];
    if (!before || !after) facts.push(['Entry', before ? 'Present' : 'Not present', after ? 'Present' : 'Not present']);
    if (before && after) {
      if (name(before) !== name(after)) facts.push(['Identity', name(before), name(after)]);
      if (before.role !== after.role) facts.push(['Role', before.role || 'Couple', after.role || 'Couple']);
      if (before.average !== after.average) facts.push(average(before) === average(after) ? ['Average (full published value)', String(before.average), String(after.average)] : ['Average', average(before), average(after)]);
      if (before.place !== after.place) facts.push(['Place', before.place === null ? '—' : String(before.place), after.place === null ? '—' : String(after.place)]);
      if (before.withdrawn !== after.withdrawn) facts.push(['Status', before.withdrawn ? 'Withdrawn' : 'Active', after.withdrawn ? 'Withdrawn' : 'Active']);
      if (before.observations !== after.observations) facts.push(['Recorded observations', String(before.observations), String(after.observations)]);
      if (change.wasAdvancing !== change.advancing) facts.push(['Advancing', change.wasAdvancing ? 'Yes' : 'No', change.advancing ? 'Yes' : 'No']);
    }
    return `<li><h4>${escape(change.stage === 'finals' ? 'Finals' : change.stage === 'prelims' ? 'Prelims' : change.stage)} · ${escape(name(entrant))}${entrant.role && entrant.role !== 'Couple' ? ` · ${escape(entrant.role)}` : ''}</h4>${facts.length ? `<dl>${facts.map(([label, oldValue, newValue]) => `<div><dt>${escape(label)}</dt><dd>${escape(oldValue)} → ${escape(newValue)}</dd></div>`).join('')}</dl>` : ''}${change.marks.length ? `<details class="comparison-marks"><summary>Recorded scorecard changes · ${change.marks.length}</summary><ul>${change.marks.map((mark) => `<li><strong>${escape(mark.judge)} · ${escape(mark.song)}</strong><span>${escape(markLabel(mark.before))} → ${escape(markLabel(mark.after))}</span></li>`).join('')}</ul></details>` : ''}</li>`;
  }).join('')}</ul>` : `<p>${unchanged}</p>`}<p class="quiet">Values are retained from each published version. — means no published value; zero is a value. No scores are recalculated here.</p></details>`;
}
