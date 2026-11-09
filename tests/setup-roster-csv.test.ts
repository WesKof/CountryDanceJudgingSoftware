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
