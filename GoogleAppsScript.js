/**
 * Google Apps Script Web App for Publishing Dance Competition Results
 * 
 * Instructions:
 * 1. Go to https://script.google.com
 * 2. Update your existing project with this improved code
 * 3. Make sure it's deployed as a web app with execute permissions for "Anyone"
 * 4. The web app URL should already be configured in your script.js
 */

// Configuration - Update this to match your spreadsheet
var SHEET_ID = "1zLGd9Z0Z7odE7vatBtgnbFN3k3uQJRuVCu5_wLCb2l4";
var SHEET_NAME = "Strictly Published Private Results";

/**
 * Handle POST requests from the dance competition app
 */
function doPost(e) {
  Logger.log("doPost called. Event: " + JSON.stringify(e));
  
  // Add CORS headers for better compatibility
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    var params = e.parameter;
    Logger.log("Params: " + JSON.stringify(params));
    var results = params.results ? JSON.parse(params.results) : null;
    Logger.log("Parsed results: " + JSON.stringify(results));
    
    if (!results || !Array.isArray(results)) {
      Logger.log("No results data received.");
      return output.setContent(JSON.stringify({ 
        success: false, 
        error: "No results data received" 
      }));
    }

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    
    // Create the sheet if it doesn't exist
    if (!sheet) {
      Logger.log("Sheet '" + SHEET_NAME + "' not found. Creating it.");
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // Clear existing content
    sheet.clearContents();
    Logger.log("Sheet cleared.");

    // Write all rows at once using setValues with proper padding
    if (results.length > 0) {
      // Find the maximum row length to ensure all rows have the same number of columns
      var maxLength = getMaxRowLength(results);
      Logger.log("Maximum row length: " + maxLength);
      
      // Pad all rows to have the same length
      var paddedResults = results.map(function(row) {
        if (!Array.isArray(row)) {
          return Array(maxLength).fill('');
        }
        // Pad row with empty strings if it's shorter than maxLength
        var paddedRow = row.slice(); // Copy the array
        while (paddedRow.length < maxLength) {
          paddedRow.push('');
        }
        return paddedRow;
      });
      
      // Write the data to the sheet
      sheet.getRange(1, 1, paddedResults.length, maxLength).setValues(paddedResults);
      Logger.log("All rows written with setValues.");
      
      // Apply formatting for better readability
      formatSheet(sheet, paddedResults.length, maxLength);
    }

    return output.setContent(JSON.stringify({ 
      success: true, 
      message: "Results published successfully to '" + SHEET_NAME + "'" 
    }));
    
  } catch (err) {
    Logger.log("Error: " + err.message);
    Logger.log("Error stack: " + err.stack);
    return output.setContent(JSON.stringify({ 
      success: false, 
      error: err.message 
    }));
  }
}

/**
 * Handle GET requests for testing
 */
function doGet(e) {
  return ContentService
    .createTextOutput('Dance Competition Results Publisher is running. Use POST to publish results.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Get the maximum length of any row in the results array
 */
function getMaxRowLength(results) {
  var maxLength = 0;
  for (var i = 0; i < results.length; i++) {
    var row = results[i];
    if (Array.isArray(row) && row.length > maxLength) {
      maxLength = row.length;
    }
  }
  return maxLength;
}

/**
 * Format the sheet for better readability
 */
function formatSheet(sheet, numRows, numCols) {
  if (numRows === 0) return;
  
  try {
    Logger.log("Formatting sheet with " + numRows + " rows and " + numCols + " columns");
    
    // Auto-resize columns
    if (numCols > 0) {
      sheet.autoResizeColumns(1, numCols);
    }
    
    // Format headers (look for rows that might be headers)
    // Headers are typically division names, "Top 3 Winners", or column headers
    for (var i = 1; i <= numRows; i++) {
      var cellValue = sheet.getRange(i, 1).getValue();
      var cellText = cellValue.toString().toLowerCase();
      
      // Check if this looks like a header row
      if (cellText.indexOf('division') !== -1 || 
          cellText.indexOf('winners') !== -1 || 
          cellText.indexOf('total score') !== -1 ||
          cellText.indexOf('place') !== -1) {
        
        // Format as header
        var headerRange = sheet.getRange(i, 1, 1, numCols);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#f0f0f0');
        
        // If it's a main header (division or winners), make it stand out more
        if (cellText.indexOf('division') !== -1 || cellText.indexOf('winners') !== -1) {
          headerRange.setBackground('#d0d0d0');
          headerRange.setFontSize(12);
        }
      }
    }
    
    // Add borders to all data
    if (numCols > 0) {
      var dataRange = sheet.getRange(1, 1, numRows, numCols);
      dataRange.setBorder(true, true, true, true, true, true);
    }
    
    // Freeze the first row if it contains column headers
    var firstRowValue = sheet.getRange(1, 1).getValue().toString().toLowerCase();
    if (firstRowValue.indexOf('total score') !== -1 || firstRowValue.indexOf('place') !== -1) {
      sheet.setFrozenRows(1);
    }
    
    Logger.log("Sheet formatting completed");
    
  } catch (error) {
    Logger.log('Error formatting sheet: ' + error.message);
    // Continue even if formatting fails
  }
}

/**
 * Test function - you can run this to test the script
 */
function testScript() {
  var testData = [
    ['Total Score', 'Division', 'Lead', 'Follow', 'Lead Number'],
    ['50', 'Beginner', 'John Doe', 'Jane Smith', '123'],
    ['45', 'Beginner', 'Bob Wilson', 'Alice Brown', '124']
  ];
  
  var testEvent = {
    parameter: {
      results: JSON.stringify(testData)
    }
  };
  
  var result = doPost(testEvent);
  Logger.log('Test result: ' + result.getContent());
}
