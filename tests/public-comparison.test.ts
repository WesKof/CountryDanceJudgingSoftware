import test from 'node:test';
import assert from 'node:assert/strict';
import type { PublicationRecord, PublicSnapshot } from '../lib/live/publication.ts';
import { comparePublicResults, renderPublicComparison } from '../public-site/comparison.ts';
import { renderIndex, renderResults, type PublicStore } from '../public-site/render.ts';

function published(id = 'v1', revision = 1): PublicationRecord {
  const judges = [{ id: 'judge-a', name: 'Public Alex', head: false }, { id: 'judge-b', name: 'Public Robin', head: true }];
  const entrants: PublicSnapshot['stages'][number]['entrants'] = [1, 2].map((number) => ({ id: `entry-${number}`, number: 100 + number, primary: `Dancer ${number}`, secondary: `Partner ${number}`, role: '', members: [], withdrawn: false, average: number === 1 ? 4.5 : 0, numericPlace: number, place: number, observations: 4, judgeMeans: judges.map((judge) => ({ judgeId: judge.id, average: number === 1 ? 4.5 : 0, observations: 2 })) }));
  const snapshot: PublicSnapshot = { schemaVersion: 1, scoringVersion: 'equal-judge-stage-v1', id, revision, supersedes: revision === 1 ? null : 'v1', eventId: 'public-event', competitionId: 'public-competition', event: { name: 'Synthetic public results', venue: 'Local', date: '2026-10-24' }, competition: { format: 'Strictly', division: 'Beginner' }, sourceFingerprint: 'opaque-public-digest', preparedAt: '2026-10-24T10:00:00Z', headApproval: ['public-approval'], changeSummary: 'Approved score correction', stages: [{ id: 'finals', kind: 'finals', judges, entrants, heats: [{ id: 'heat', name: 'Heat 1', entrants: entrants.map((entrant) => entrant.id), songs: ['song-a', 'song-b'].map((id) => ({ id, title: id === 'song-a' ? 'Two-step' : 'Country swing', partners: [] })) }], marks: entrants.flatMap((entrant) => judges.flatMap((judge) => ['song-a', 'song-b'].map((songId) => ({ entrantId: entrant.id, judgeId: judge.id, songId, mark: entrant.number === 101 ? 'A1' as const : 'No' as const })))), advancing: [], decisions: [] }] };
  return { id, revision, competitionId: 'PRIVATE_INTERNAL_COMPETITION', sourceFingerprint: snapshot.sourceFingerprint, snapshot, status: 'released', releasedAt: `2026-10-24T${String(10 + revision).padStart(2, '0')}:00:00Z` };
}

test('selected event navigation is compact, escaped, consistent and leaves direct views complete', () => {
  const first = published(); first.snapshot.event.name = 'Latest <Autumn> & Friends';
  const older = published('older'); older.snapshot.competitionId = 'second-competition'; older.releasedAt = '2026-10-23T10:00:00Z'; older.snapshot.event.name = 'Earlier event name';
  const store: PublicStore = { records: { v1: first, older }, current: { first: 'v1', second: 'older' } };
  const before = JSON.stringify(store), one = renderIndex(store, true, 'public-event');
  assert.match(one, /<h1>Latest &lt;Autumn&gt; &amp; Friends<\/h1>/);
  assert.match(one, /Published results · 2 competitions/);
  assert.doesNotMatch(one, /<form|Final places first|<h2>Latest/);
  assert.match(one, /<h2>Earlier event name · Strictly · Beginner/);
  assert.match(one, /href="\/leaderboard">All events/);
  const another = published('another'); another.snapshot.eventId = 'other-event';
  store.records = { ...store.records, another };
  store.current = { ...store.current, another: 'another' };
  const multi = renderIndex(store, true, 'public-event');
  assert.match(multi, /<label>Switch event<select name="event">/);
  assert.match(multi, /value="public-event" selected>Latest &lt;Autumn&gt; &amp; Friends/);
  assert.doesNotMatch(multi, /<script/);
  assert.match(renderResults(first, store), /<h2>Latest &lt;Autumn&gt; &amp; Friends · Strictly · Beginner/);
  assert.equal(JSON.stringify({ records: { v1: first, older }, current: { first: 'v1', second: 'older' } }), before);
});

test('unknown selected events retain recovery with one event or an empty directory', () => {
  const first = published(), store = { records: { v1: first }, current: { first: 'v1' } };
  for (const candidate of [store, { records: {}, current: {} }]) {
    const html = renderIndex(candidate, true, 'missing-event');
    assert.match(html, /No released competitions for this selection/);
    assert.match(html, /href="\/leaderboard">Choose another event/);
    assert.doesNotMatch(html, /selected-event-heading/);
  }
  assert.match(renderIndex({ records: {}, current: {} }, true), /No released competitions yet/);
});

test('event search uses literal case-insensitive metadata terms and retains complete current event groups', () => {
  const current = published(), olderCompetition = published('older'), other = published('other'), historical = published('historical'), privateRecord = published('private');
  current.snapshot.event.name = 'Autumn Country Dance'; current.snapshot.event.venue = 'River Hall';
  olderCompetition.snapshot.competitionId = 'second'; olderCompetition.snapshot.event.venue = 'Earlier North Texas Hall'; olderCompetition.releasedAt = '2026-10-23T10:00:00Z';
  other.snapshot.eventId = 'other'; other.snapshot.event.name = 'Spring Festival';
  historical.snapshot.event.name = 'HISTORICAL_ONLY'; privateRecord.snapshot.event.name = 'PRIVATE_ONLY'; privateRecord.releasedAt = undefined; privateRecord.status = 'requested';
  const store: PublicStore = { records: Object.fromEntries([current, olderCompetition, other, historical, privateRecord].map(record => [record.id, record])), current: { 'public-event/public-competition': current.id, 'public-event/second': olderCompetition.id, 'other/public-competition': other.id, 'private/current': privateRecord.id } };
  const before = JSON.stringify(store);
  for (const query of ['  AUTUMN   country ', 'north TEXAS', '2026-10-24']) {
    const html = renderIndex(store, true, '', query);
    assert.match(html, /name="q"/); assert.match(html, /Autumn Country Dance/);
    assert.match(html, /2 competitions/);
    if (!query.includes('2026')) assert.doesNotMatch(html, /Spring Festival/);
    assert.doesNotMatch(html, /<select|HISTORICAL_ONLY|PRIVATE_ONLY/);
  }
  assert.match(renderIndex(store, true, '', '.*'), /No events found/);
  assert.match(renderIndex(store, true, '', 'HISTORICAL_ONLY'), /No events found/);
  assert.match(renderIndex(store, true, '', 'PRIVATE_ONLY'), /No events found/);
  assert.match(renderIndex(store, true, '', 'Dancer'), /No events found/);
  assert.equal(JSON.stringify(store), before);
});

test('search query and return context are escaped and empty or stale selections recover honestly', () => {
  const record = published(); record.snapshot.event.name = 'Dance <Friends> & "Family"';
  const store: PublicStore = { records: { v1: record }, current: { 'public-event/public-competition': 'v1' } };
  const query = '<Friends> & "Family"', html = renderIndex(store, true, '', query);
  assert.match(html, /value="&lt;Friends&gt; &amp; &quot;Family&quot;"/);
  assert.doesNotMatch(html, /<Friends>|<script/);
  assert.match(html, /event=public-event&amp;q=%3CFriends%3E/);
  const selected = renderIndex(store, true, 'public-event', query);
  assert.match(selected, /Back to search/); assert.match(selected, /q=%3CFriends%3E/);
  assert.doesNotMatch(selected, /<form/);
  const stale = renderIndex(store, true, 'missing', query);
  assert.match(stale, /No released competitions for this selection/); assert.match(stale, /Choose another event/);
  assert.match(renderIndex(store, true, '', 'absent'), /No events found/);
  assert.match(renderIndex({ records: {}, current: {} }, true, '', 'absent'), /No released competitions yet/);
  assert.doesNotMatch(renderIndex({ records: {}, current: {} }, true, '', 'absent'), /<form|<input|<button/);
  assert.doesNotMatch(renderIndex(store, false, '', query), /Search events|Back to search/);
});

test('released history chooses the highest valid preceding release across private gaps without trusting pointers or mutating inputs', () => {
  const first = published(), third = published('v3', 3), current = published('v5', 5), privateSecond = published('v2', 2), privateFourth = published('v4', 4), unrelated = published('other', 4);
  privateSecond.status = 'requested'; privateFourth.status = 'queued'; unrelated.snapshot.eventId = 'another-event'; current.snapshot.supersedes = unrelated.id;
  const records = Object.fromEntries([first, privateSecond, third, privateFourth, unrelated, current].map((record) => [record.id, record]));
  const before = JSON.stringify(records);
  assert.equal(comparePublicResults(current, records).previous?.id, 'v3');
  assert.equal(comparePublicResults(third, records).previous?.id, 'v1', 'a historical view never compares forward to a newer release');
  assert.equal(JSON.stringify(records), before);
  assert.doesNotMatch(renderPublicComparison(current, records), /another-event|PRIVATE_INTERNAL_COMPETITION|published revision 4/);
});

test('missing, cross-competition, future, mismatched and ambiguous predecessor records stay unavailable', () => {
  const current = published('v3', 3), foreign = published(), future = published('future', 2), mismatch = published('mismatch', 2);
  foreign.snapshot.competitionId = 'other-competition'; foreign.snapshot.stages[0].entrants[0].primary = 'UNRELATED_SECRET';
  future.releasedAt = '2026-10-25T12:00:00Z'; mismatch.snapshot.id = 'not-the-record'; current.snapshot.supersedes = foreign.id;
  const broken = { id: 'broken', status: 'released', releasedAt: '2026-10-24T11:00:00Z' } as PublicationRecord;
  const records = { [current.id]: current, [foreign.id]: foreign, [future.id]: future, [mismatch.id]: mismatch, broken };
  assert.equal(comparePublicResults(current, records).state, 'unavailable');
  const html = renderPublicComparison(current, records);
  assert.match(html, /earlier published version is not available/); assert.doesNotMatch(html, /UNRELATED_SECRET|other-competition/);
  const one = published(), duplicate = published('duplicate', 1);
  assert.equal(comparePublicResults(current, { ...records, [one.id]: one, [duplicate.id]: duplicate }).state, 'unavailable');
});

test('first, unchanged, private preview and under-review released states are honest without exposing private preparations', () => {
  const first = published(), current = published('v2', 2), records = { v1: first, v2: current };
  assert.equal(renderPublicComparison(first, records), '');
  assert.match(renderPublicComparison(current, records), /No public result or recorded-scorecard changes for this view/);
  const privateView = structuredClone(current); privateView.status = 'requested'; privateView.snapshot.stages[0].entrants[0].primary = 'UNRELEASED_SECRET';
  assert.equal(renderPublicComparison(privateView, records), '');
  assert.equal(comparePublicResults(privateView, records).state, 'unavailable');
  current.underReview = true;
  assert.equal(comparePublicResults(current, records).previous?.id, first.id);
});

test('withdrawal, official place and average changes preserve null and zero without recalculation', () => {
  const first = published(), current = published('v2', 2), entrant = current.snapshot.stages[0].entrants[1];
  entrant.withdrawn = true; entrant.average = null; entrant.place = null;
  const changes = comparePublicResults(current, { v1: first, v2: current }).changes;
  assert.equal(changes.length, 1); assert.equal(changes[0].before?.average, 0); assert.equal(changes[0].after?.average, null);
  const html = renderPublicComparison(current, { v1: first, v2: current });
  assert.match(html, /0\.0000 → —/); assert.match(html, /2 → —/); assert.match(html, /Active → Withdrawn/);
  assert.equal(entrant.observations, 4);
});

test('recorded mark changes remain visible when displayed averages do not change; blank, No and absent cells differ', () => {
  const first = published(), current = published('v2', 2), stage = current.snapshot.stages[0];
  first.snapshot.stages[0].marks[0].mark = 'Yes';
  first.snapshot.stages[0].entrants[0].average = stage.entrants[0].average = 5.875;
  stage.marks[1].mark = 'Yes';
  const swapped = renderPublicComparison(current, { v1: first, v2: current });
  assert.match(swapped, /Yes → A1/); assert.match(swapped, /A1 → Yes/);
  assert.doesNotMatch(swapped, /5\.8750 → 5\.8750/);
  stage.marks[0].mark = ''; stage.marks[1].mark = 'No';
  const result = comparePublicResults(current, { v1: first, v2: current });
  assert.equal(result.changes[0].before?.average, result.changes[0].after?.average);
  assert.equal(result.changes[0].marks.length, 2);
  let html = renderPublicComparison(current, { v1: first, v2: current });
  assert.match(html, /Recorded scorecard changes · 2/); assert.match(html, /Yes → Blank · Not observed/); assert.match(html, /A1 → No \(0\)/);
  stage.marks = stage.marks.slice(1);
  html = renderPublicComparison(current, { v1: first, v2: current }); assert.match(html, /Yes → Not present/);
});

test('sub-display precision and observation-only changes render meaningful facts rather than identical values or empty entries', () => {
  const first = published(), current = published('v2', 2);
  first.snapshot.stages[0].entrants[0].average = 4.500001; current.snapshot.stages[0].entrants[0].average = 4.500002;
  current.snapshot.stages[0].entrants[1].observations = 3;
  const html = renderPublicComparison(current, { v1: first, v2: current });
  assert.match(html, /Average \(full published value\)/); assert.match(html, /4\.500001 → 4\.500002/);
  assert.match(html, /Recorded observations<\/dt><dd>4 → 3/); assert.doesNotMatch(html, /4\.5000 → 4\.5000/);
});

test('entrant and judge contexts exclude unrelated changes and keep only the selected recorded scorecard', () => {
  const first = published(), current = published('v2', 2), stage = current.snapshot.stages[0];
  stage.marks[0].mark = 'Yes'; stage.marks.find((mark) => mark.entrantId === 'entry-2' && mark.judgeId === 'judge-b')!.mark = 'A1';
  assert.equal(comparePublicResults(current, { v1: first, v2: current }).changes.length, 2);
  const judge = comparePublicResults(current, { v1: first, v2: current }, { judgeId: 'judge-a' });
  assert.equal(judge.changes.length, 1); assert.equal(judge.changes[0].after?.id, 'entry-1'); assert.ok(judge.changes[0].marks.every((mark) => mark.judgeId === 'judge-a'));
  const entrant = comparePublicResults(current, { v1: first, v2: current }, { entrantId: 'entry-2' });
  assert.equal(entrant.changes.length, 1); assert.equal(entrant.changes[0].after?.id, 'entry-2');
  assert.equal(comparePublicResults(current, { v1: first, v2: current }, { judgeId: 'unknown' }).changes.length, 0);
});

test('published member links connect an entrant and their couple across stages without matching unrelated bibs', () => {
  const first = published(), finals = first.snapshot.stages[0];
  finals.entrants[0].members = ['public-lead', 'public-follow'];
  const prelims = structuredClone(finals); prelims.id = 'prelims'; prelims.kind = 'prelims'; prelims.entrants = [{ ...structuredClone(finals.entrants[0]), id: 'public-lead', role: 'Lead', secondary: '', members: [] }];
  prelims.marks = prelims.marks.filter((mark) => mark.entrantId === 'entry-1').map((mark) => ({ ...mark, entrantId: 'public-lead' }));
  first.snapshot.stages.push(prelims);
  const current = structuredClone(first); current.id = current.snapshot.id = 'v2'; current.revision = current.snapshot.revision = 2; current.releasedAt = '2026-10-24T12:00:00Z';
  current.snapshot.stages.forEach((stage) => { stage.marks[0].mark = 'Yes'; });
  const records = { v1: first, v2: current };
  assert.equal(comparePublicResults(current, records, { entrantId: 'public-lead' }).changes.length, 2);
  assert.equal(comparePublicResults(current, records, { entrantId: 'entry-1' }).changes.length, 2);
  assert.equal(comparePublicResults(current, records, { entrantId: 'unknown' }).changes.length, 0);
});

test('comparison HTML escapes names and labels, ignores private extras and stays collapsed after rankings', () => {
  const first = published(), current = published('v2', 2), stage = current.snapshot.stages[0];
  stage.entrants[0].primary = '<img src=x onerror=alert(1)>'; stage.judges[0].name = 'Judge <script>bad</script>'; stage.heats[0].songs[0].title = '</summary><svg onload=bad>';
  stage.marks[0].mark = 'Yes';
  Object.assign(current.snapshot, { privateNotes: 'PRIVATE_REASON_NEVER_RENDER' });
  const records = { v1: first, v2: current }, html = renderResults(current, { records, current: { 'public-event/public-competition': current.id } });
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.match(html, /Judge &lt;script&gt;bad&lt;\/script&gt;/); assert.match(html, /&lt;\/summary&gt;&lt;svg onload=bad&gt;/);
  assert.doesNotMatch(html, /<script>|<svg|<img src=x|PRIVATE_REASON_NEVER_RENDER|PRIVATE_INTERNAL_COMPETITION/);
  assert.match(html, /<details class="public-comparison"><summary>/);
  assert.ok(html.indexOf('Final places') < html.indexOf('class="public-comparison"'));
});

test('public overview puts the correction before one supporting group without losing stage or judge links', () => {
  const first = published(), current = published('v2', 2);
  for (const record of [first, current]) {
    const prelims = structuredClone(record.snapshot.stages[0]); prelims.id = 'prelims'; prelims.kind = 'prelims';
    record.snapshot.stages.unshift(prelims);
  }
  current.snapshot.stages[1].marks[0].mark = 'Yes';
  const store = { records: { v1: first, v2: current }, current: { 'public-event/public-competition': current.id } };
  const before = JSON.stringify(store), html = renderResults(current, store);
  assert.ok(html.indexOf('Final places') < html.indexOf('class="public-comparison"'));
  assert.ok(html.indexOf('class="public-comparison"') < html.indexOf('class="public-supporting"'));
  assert.equal((html.match(/class="public-supporting"/g) ?? []).length, 1);
  assert.match(html, /Finals judge scorecards · 2 judges/);
  assert.match(html, /Scorecards, Prelims &amp; scoring details/);
  assert.match(html, /class="public-stage-records public-prelims"><h3>prelims<\/h3><table/);
  for (const stage of current.snapshot.stages) {
    for (const entrant of stage.entrants) assert.ok(html.includes(`/results/v2/entrant/${entrant.id}`));
    for (const judge of stage.judges) assert.ok(html.includes(`/results/v2/judge/${judge.id}`));
  }
  assert.ok(html.includes('/results/v1'));
  assert.match(html, /No<\/p>/);
  assert.equal(JSON.stringify(store), before);
});

test('first-release, private-preview and scoped empty results avoid misleading comparison or extra gates', () => {
  const first = published(), current = published('v2', 2), records = { v1: first, v2: current };
  const store = { records, current: { 'public-event/public-competition': current.id } };
  assert.doesNotMatch(renderResults(first, store), /public-comparison/);
  const preview = structuredClone(current); preview.id = preview.snapshot.id = 'private'; preview.status = 'requested'; delete preview.releasedAt;
  const privateHtml = renderResults(preview, store);
  assert.doesNotMatch(privateHtml, /public-supporting|public-comparison|href="\/results\//);
  assert.match(privateHtml, /Private preview · Not published/);
  for (const [entrant, judge] of [['entry-1', undefined], [undefined, 'judge-a']]) {
    const html = renderResults(current, store, entrant, judge);
    assert.doesNotMatch(html, /public-supporting/);
    assert.match(html, /class="public-scorecards" open/);
  }
  assert.doesNotMatch(renderResults(current, store, 'missing-entry'), /public-supporting|Final places|<h3>/);
});

test('retained stage kinds and no-Finals scoped records keep escaped standings before comparisons without duplicate tables', () => {
  const first = published(), current = published('v2', 2);
  for (const record of [first, current]) record.snapshot.stages[0].kind = 'Qualification & review';
  current.snapshot.stages[0].marks[0].mark = 'Yes';
  const store = { records: { v1: first, v2: current }, current: { 'public-event/public-competition': current.id } };
  for (const scoped of [false, true]) {
    const html = renderResults(current, store, scoped ? 'entry-1' : undefined);
    assert.match(html, /<h3>Qualification &amp; review<\/h3><table>/);
    assert.doesNotMatch(html, /Prelims judge scorecards/);
    assert.equal((html.match(/<table>/g) ?? []).length, 1);
    assert.ok(html.indexOf('</table>') < html.indexOf('class="public-comparison"'));
  }
  for (const record of [first, current]) {
    const finals = structuredClone(record.snapshot.stages[0]); finals.id = 'finals'; finals.kind = 'finals';
    record.snapshot.stages.unshift(finals);
  }
  const html = renderResults(current, store, 'entry-1');
  assert.equal((html.match(/<table>/g) ?? []).length, 2);
  assert.ok(html.lastIndexOf('</table>') < html.indexOf('class="public-comparison"'));
  assert.ok(html.indexOf('Final places') < html.indexOf('Qualification &amp; review'));
  for (const record of [first, current]) {
    record.snapshot.stages = [record.snapshot.stages[1]];
    record.snapshot.stages[0].kind = 'prelims';
  }
  const prelimOnly = renderResults(current, store, 'entry-1');
  assert.equal((prelimOnly.match(/<table>/g) ?? []).length, 1);
  assert.ok(prelimOnly.indexOf('</table>') < prelimOnly.indexOf('class="public-comparison"'));
  assert.doesNotMatch(prelimOnly, /public-supporting|Final places/);
});
