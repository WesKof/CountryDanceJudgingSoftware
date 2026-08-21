/**
 * Secured Google Apps Script publisher for Country Dance Judging.
 *
 * Required Script Properties:
 *   SHEET_ID       Google Sheet ID receiving the published results.
 *   PUBLISHING_KEY A long random value shared only with event organizers.
 */

var TARGET_SHEET_NAME = 'Published Private Results';
var ARCHIVE_SHEET_NAME = 'Published Results Archive';
var MAX_ROWS = 5000;
var MAX_COLUMNS = 50;
var MAX_CELL_LENGTH = 2000;

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function secureEquals(left, right) {
  var leftDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(left), Utilities.Charset.UTF_8);
  var rightDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(right), Utilities.Charset.UTF_8);
  var difference = 0;
  for (var index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest[index] ^ rightDigest[index];
  }
  return difference === 0;
}

function validateRows(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ROWS) {
    throw new Error('Results must contain between 1 and ' + MAX_ROWS + ' rows.');
  }
  if (!Array.isArray(value[0]) || value[0].length < 1 || value[0].length > MAX_COLUMNS) {
    throw new Error('Results have an invalid column count.');
  }

  var width = value[0].length;
  return value.map(function (row) {
    if (!Array.isArray(row) || row.length !== width) throw new Error('Every result row must have the same number of columns.');
    return row.map(function (cell) {
      if (cell === null || typeof cell === 'undefined') return '';
      if (typeof cell !== 'string' && typeof cell !== 'number' && typeof cell !== 'boolean') {
        throw new Error('Result cells must be text or numbers.');
      }
      var normalized = String(cell);
      if (normalized.length > MAX_CELL_LENGTH) throw new Error('A result cell is too long.');
      return normalized;
    });
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var properties = PropertiesService.getScriptProperties();
    var sheetId = properties.getProperty('SHEET_ID');
    var expectedKey = properties.getProperty('PUBLISHING_KEY');
    if (!sheetId || !expectedKey) return jsonOutput({ success: false, error: 'Connector is not configured.' });

    var suppliedKey = e && e.parameter ? e.parameter.publishingKey : '';
    if (!suppliedKey || !secureEquals(suppliedKey, expectedKey)) {
      return jsonOutput({ success: false, error: 'Publishing key was rejected.' });
    }

    var rawResults = e.parameter.results;
    if (!rawResults) return jsonOutput({ success: false, error: 'No results data received.' });
    var rows = validateRows(JSON.parse(rawResults));

    if (!lock.tryLock(10000)) return jsonOutput({ success: false, error: 'Another publish is in progress. Try again.' });

    var spreadsheet = SpreadsheetApp.openById(sheetId);
    var target = spreadsheet.getSheetByName(TARGET_SHEET_NAME) || spreadsheet.insertSheet(TARGET_SHEET_NAME);
    var archive = spreadsheet.getSheetByName(ARCHIVE_SHEET_NAME) || spreadsheet.insertSheet(ARCHIVE_SHEET_NAME);
    var publishedAt = new Date().toISOString();
    var archiveRows = rows.map(function (row, index) {
      return [publishedAt, index === 0 ? 'Header' : 'Result'].concat(row);
    });

    archive.getRange(archive.getLastRow() + 1, 1, archiveRows.length, archiveRows[0].length).setValues(archiveRows);
    target.clearContents();
    target.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    SpreadsheetApp.flush();

    return jsonOutput({ success: true, rowsWritten: rows.length, publishedAt: publishedAt });
  } catch (error) {
    return jsonOutput({ success: false, error: error && error.message ? error.message : String(error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function doGet() {
  return jsonOutput({ success: true, service: 'Country Dance Judging publisher' });
}
