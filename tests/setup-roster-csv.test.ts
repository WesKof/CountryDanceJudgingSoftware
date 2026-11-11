import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rosterHarness } from './setup-roster-render-harness.mjs';

for (const fixture of [
  { name: 'late invalid role', rows: '901,Ada,Lead\n902,Bea,Follow\n903,Cam,Folow', error: 'CSV row 4: Role must be Lead or Follow.' },
  { name: 'invalid numeric bib', rows: '901,Ada,Lead\n1.5,Bea,Follow', error: 'CSV row 3: Number must be a positive whole-number bib.' },
  { name: 'missing name', rows: '901,Ada,Lead\n902,,Follow', error: 'CSV row 3: Name is required.' },
  { name: 'duplicate normalized bib', rows: '901,Ada,Lead\n902,Bea,Follow\n0901,Cam,Lead', error: 'CSV row 4: Number repeats bib 901 from CSV row 2.' },
  { name: 'multiline record before invalid role', rows: '901,"Ada\nExample",Lead\n902,Bea,Folow', error: 'CSV row 3: Role must be Lead or Follow.' },
]) test(`real roster handler identifies ${fixture.name} before replacing the draft`, async () => {
  const h = await rosterHarness(), csv = 'Number,Name,Role\n' + fixture.rows;
  assert.deepEqual(h.submit(csv), { retainedInput: csv, prevented: true });
  assert.equal(h.issue(), fixture.error); assert.equal(h.confirmations, 0); assert.equal(h.updates, 0); assert.deepEqual(h.setup, h.initial);
});

for (const [rows, error] of [
  ['901,,Partner', 'CSV row 2: Lead is required.'],
  ['901,Lead,', 'CSV row 2: Follow is required.'],
]) test(`Strictly handler preserves existing roster for ${error}`, async () => {
  const h = await rosterHarness(false), csv = 'Number,Lead,Follow\n' + rows;
  assert.equal(h.submit(csv).retainedInput, csv); assert.equal(h.issue(), error); assert.equal(h.confirmations, 0); assert.equal(h.updates, 0); assert.deepEqual(h.setup, h.initial);
});

test('valid quoted multiline roster retains cancellation, confirmation and draft-only replacement', async () => {
  const h = await rosterHarness(false), csv = 'Number,Lead,Follow\n902,"Last, First","Other\nName"\n901,Second,Partner';
  assert.equal(h.submit(csv, false).retainedInput, csv); assert.equal(h.confirmations, 1); assert.equal(h.updates, 0); assert.deepEqual(h.setup, h.initial);
  h.submit(csv); assert.equal(h.confirmations, 2); assert.equal(h.updates, 1); assert.equal(h.issue(), '');
  const round = h.setup.rounds.find((r) => r.id === h.roundId)!;
  assert.deepEqual(round.subjects.map((s) => [s.number, s.primary, s.secondary]), [[901, 'Second', 'Partner'], [902, 'Last, First', 'Other\nName']]);
  assert.deepEqual(new Set(round.heats[0].subjectIds), new Set(round.subjects.map((s) => s.id)));
  assert.ok(round.heats.slice(1).every((heat) => heat.subjectIds.length === 0));
  assert.ok(round.heats.every((heat) => heat.songs.every((song) => song.partners.length === 0)));
  assert.deepEqual(h.setup.judges, h.initial.judges); assert.equal(h.setup.headJudgeId, h.initial.headJudgeId);
});

test('corrected valid import canceled after an error reports cancellation and keeps the draft', async () => {
  const h = await rosterHarness();
  const invalid = 'Number,Name,Role\n901,Ada,Lead\n902,Bea,Folow';
  h.submit(invalid);
  assert.equal(h.issue(), 'CSV row 3: Role must be Lead or Follow.');
  assert.equal(h.confirmations, 0); assert.equal(h.updates, 0);
  const corrected = 'Number,Name,Role\n901,Ada,Lead\n902,Bea,Follow';
  assert.equal(h.submit(corrected, false).retainedInput, corrected);
  assert.equal(h.issue(), 'Roster import canceled. Current roster and heat assignments are kept.');
  assert.equal(h.confirmations, 1); assert.equal(h.updates, 0); assert.deepEqual(h.setup, h.initial);
  h.submit(corrected);
  assert.equal(h.confirmations, 2); assert.equal(h.updates, 1); assert.equal(h.issue(), '');
  const round = h.setup.rounds.find((r) => r.id === h.roundId)!;
  assert.deepEqual(round.subjects.map((s) => [s.number, s.primary, s.role]), [[901, 'Ada', 'Lead'], [902, 'Bea', 'Follow']]);
});

test('corrected judge import canceled after an error keeps the panel, head and round assignments', async () => {
  const h = await rosterHarness();
  const invalid = 'Name,ParticipantId\nFirst,person-a,Unexpected';
  h.submit(invalid, true, 'judges');
  assert.equal(h.issue(), 'CSV row 2 needs exactly 2 columns. Put names containing commas in double quotes.');
  assert.equal(h.confirmations, 0); assert.equal(h.updates, 0);
  const corrected = 'Name,ParticipantId\nFirst,PERSON-A\nSecond,person-b';
  assert.equal(h.submit(corrected, false, 'judges').retainedInput, corrected);
  assert.equal(h.issue(), 'Judge import canceled. Current panel, head judge and round assignments are kept.');
  assert.equal(h.confirmations, 1); assert.equal(h.updates, 0); assert.deepEqual(h.setup, h.initial);
  h.submit(corrected, true, 'judges');
  assert.equal(h.confirmations, 2); assert.equal(h.updates, 1);
  assert.equal(h.issue(), 'Judge import validated. Choose the head and Save setup to apply.');
  assert.deepEqual(h.setup.judges.map((judge) => [judge.name, judge.participantId]), [['First', 'person-a'], ['Second', 'person-b']]);
  assert.equal(h.setup.headJudgeId, ''); assert.ok(h.setup.rounds.every((round) => round.judgeIds.length === 0));
  assert.deepEqual(h.setup.rounds.map((round) => ({ ...round, judgeIds: [] })), h.initial.rounds.map((round) => ({ ...round, judgeIds: [] })));
});

const judgeCsv = (count: number) => ['Name,ParticipantId', ...Array.from({ length: count }, (_, index) => `Judge ${index + 1},PERSON-${index + 1}`)].join('\n');

for (const { name, csv, error } of [
  { name: 'header only', csv: judgeCsv(0), error: 'Add at least one judge below the CSV header.' },
  { name: 'over the limit', csv: judgeCsv(16), error: 'Import at most 15 judges. This CSV contains 16 judge records.' },
  { name: 'missing name', csv: 'Name,ParticipantId\nFirst,person-a\n,person-b', error: 'CSV row 3: Name is required.' },
  { name: 'missing identity', csv: 'Name,ParticipantId\nFirst,person-a\nSecond,', error: 'CSV row 3: ParticipantId is required.' },
  { name: 'organizer identity', csv: 'Name,ParticipantId\nFirst,person-a\nSecond,<organizer>', error: 'CSV row 3: ParticipantId must differ from the organizer’s.' },
  { name: 'duplicate normalized identity after a multiline record', csv: 'Name,ParticipantId\n"First\nExample",PERSON-A\nSecond, person-a', error: 'CSV row 3: ParticipantId repeats the identifier from CSV row 2.' },
  { name: 'width error before count limit', csv: judgeCsv(16) + ',Unexpected', error: 'CSV row 17 needs exactly 2 columns. Put names containing commas in double quotes.' },
]) test(`judge CSV diagnostics identify ${name} before confirmation`, async () => {
  const h = await rosterHarness();
  const input = csv.replace('<organizer>', (h.initial.organizerParticipantId ?? '').toUpperCase());
  assert.equal(h.submit(input, true, 'judges').retainedInput, input);
  assert.equal(h.confirmations, 0);
  assert.equal(h.updates, 0);
  assert.deepEqual(h.setup, h.initial);
  assert.equal(h.issue(), error);
});

test('judge CSV diagnostics accept 15 judges only after confirmation', async () => {
  const h = await rosterHarness();
  const input = judgeCsv(15);
  assert.equal(h.submit(input, false, 'judges').retainedInput, input);
  assert.equal(h.confirmations, 1);
  assert.equal(h.updates, 0);
  assert.deepEqual(h.setup, h.initial);
  h.submit(input, true, 'judges');
  assert.equal(h.confirmations, 2);
  assert.equal(h.updates, 1);
  assert.deepEqual(h.setup.judges.map((judge) => judge.participantId), Array.from({ length: 15 }, (_, index) => `person-${index + 1}`));
  assert.equal(h.setup.headJudgeId, '');
  assert.ok(h.setup.rounds.every((round) => round.judgeIds.length === 0));
  assert.equal(h.issue(), 'Judge import validated. Choose the head and Save setup to apply.');
});
