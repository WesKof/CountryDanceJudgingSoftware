# Google Apps Script Setup Instructions

## Updating Your Existing Google Apps Script for the New Sheet

Since you already have a Google Apps Script set up, you just need to update it to publish to the correct sheet name.

### Step 1: Update Your Existing Google Apps Script

1. Go to [Google Apps Script](https://script.google.com) and open your existing project
2. Replace the entire script with the improved code from `GoogleAppsScript.js`
3. The key changes are:
   - **Sheet Name**: Now looks for "Strictly Published Private Results" instead of "Published Private Results"
   - **Better Error Handling**: Improved logging and error messages
   - **Variable Row Lengths**: Properly handles rows with different numbers of columns
   - **Auto-formatting**: Adds borders, bold headers, and better visual formatting

### Step 2: Test the Updated Script

1. Click on the "testScript" function in the function dropdown
2. Click the "Run" button to test the script
3. Check your Google Sheet to see if a "Strictly Published Private Results" sheet was created with test data

### Step 3: Re-deploy (if needed)

If you've already deployed your script as a web app, you may need to create a new version:
1. Click "Deploy" → "Manage deployments"
2. Click the edit icon next to your existing deployment
3. Change the version to "New version"
4. Click "Deploy"

The web app URL will remain the same, so your frontend code should continue to work.

### Step 2: Configure the Script

The script is already configured for your spreadsheet:
- **Spreadsheet ID**: `1zLGd9Z0Z7odE7vatBtgnbFN3k3uQJRuVCu5_wLCb2l4`
- **Sheet Name**: `Strictly Published Private Results`

If you need to change these values, edit the constants at the top of the script:
```javascript
const SPREADSHEET_ID = '1zLGd9Z0Z7odE7vatBtgnbFN3k3uQJRuVCu5_wLCb2l4';
const SHEET_NAME = 'Strictly Published Private Results';
```

### Step 3: Test the Script (Optional)

1. Click on the "testScript" function in the function dropdown
2. Click the "Run" button
3. You'll be prompted to authorize the script - click "Review permissions"
4. Sign in with your Google account and grant the necessary permissions
5. The test should create some sample data in your sheet

### Step 4: Deploy as Web App

1. Click the "Deploy" button (top right)
2. Choose "New deployment"
3. Click the gear icon next to "Type" and select "Web app"
4. Fill in the deployment settings:
   - **Description**: "Dance Competition Results Publisher"
   - **Execute as**: "Me"
   - **Who has access**: "Anyone" (this is required for the web app to work)
5. Click "Deploy"
6. Copy the Web app URL that appears

### Step 4: Test the Publishing

1. Load your dance competition application
2. Make sure you have some completed scoring data
3. Click "Publish Results to Google Sheet"
4. Check your Google Sheet to see if the results were published to the "Strictly Published Private Results" sheet

## Key Differences from Your Original Script

Your original script was good, but the updated version includes:

1. **Correct Sheet Name**: 
   - Old: "Published Private Results"
   - New: "Strictly Published Private Results"

2. **Variable Row Length Handling**: Your original script assumed all rows have the same length as the first row, which could cause errors with the complex data structure from your app.

3. **Auto-formatting**: The new script adds:
   - Bold formatting for headers
   - Background colors for different header types
   - Borders around all data
   - Auto-resized columns

4. **Better Error Handling**: More detailed logging and error messages

5. **Auto Sheet Creation**: If the sheet doesn't exist, it will be created automatically

## Troubleshooting

### Common Issues:

1. **"Script function not found" error**: Make sure you copied the entire script correctly
2. **Permission denied**: Make sure the web app is deployed with "Anyone" access
3. **Sheet not found**: The script will automatically create the sheet if it doesn't exist
4. **CORS errors**: These shouldn't occur with Google Apps Script web apps

### Re-deploying:

If you make changes to the script:
1. Save the script
2. Click "Deploy" → "Manage deployments"
3. Click the edit icon next to your deployment
4. Change the version to "New version"
5. Click "Deploy"

The web app URL will remain the same, so you don't need to update your frontend code.

## What the Script Does

1. Receives POST requests from your dance competition application
2. Parses the results data (JSON format)
3. Opens your specified Google Sheet
4. Creates the "Strictly Published Private Results" sheet if it doesn't exist
5. Clears any existing content
6. Writes the new results data
7. Applies formatting for better readability (headers, borders, etc.)
8. Returns a success/error response

## Data Format

The script expects data in the following format:
- An array of arrays (rows)
- Each row contains the data for one line in the spreadsheet
- Headers and data are included in the same array
- Empty rows are preserved to maintain formatting

Example:
```javascript
[
  ["Division Name", "", "", "", ""],
  ["Total Score", "Division", "Lead", "Follow", "Lead Number"],
  ["50", "Beginner", "John Doe", "Jane Smith", "123"],
  ["", "", "", "", ""],
  ["Top 3 Winners - Beginner"],
  ["Place", "Total Score", "Division", "Lead", "Follow", "Lead Number"],
  ["1st", "50", "Beginner", "John Doe", "Jane Smith", "123"]
]
```
