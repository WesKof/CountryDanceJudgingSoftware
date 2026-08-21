import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv, serializeCsv } from '../lib/csv.ts';

test('CSV parsing supports quoted commas, line breaks, and escaped quotes', () => {
  const input = 'Number,Name,Note\r\n128,"Lane, Avery","Said ""yes"""\r\n129,"Two\nLines",Ready';
  assert.deepEqual(parseCsv(input), [
    ['Number', 'Name', 'Note'],
    ['128', 'Lane, Avery', 'Said "yes"'],
    ['129', 'Two\nLines', 'Ready'],
  ]);
});

test('CSV serialization round-trips values that require escaping', () => {
  const rows = [['Number', 'Name'], ['128', 'Lane, "Avery"']];
  assert.deepEqual(parseCsv(serializeCsv(rows)), rows);
});
