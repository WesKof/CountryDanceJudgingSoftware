// Show/hide export buttons
function showExportButtons() {
    exportResultsButton.classList.remove('hidden');
    publishResultsButton.classList.remove('hidden');
    csvExportButton.classList.remove('hidden');
}

function hideExportButtons() {
    exportResultsButton.classList.add('hidden');
    publishResultsButton.classList.add('hidden');
    csvExportButton.classList.add('hidden');
}

// Export button handlers
document.getElementById('exportResults').addEventListener('click', () => {
    // Get completed rows to export
    const results = getCompletedRows();
    if (results.length === 0) return;

    // Build headers
    const judgeHeaders = [];
    if (window.judgeNamesCSV && Array.isArray(window.judgeNamesCSV)) {
        for (let i = 1; i < window.judgeNamesCSV.length; i++) {
            judgeHeaders.push(window.judgeNamesCSV[i][0] ? window.judgeNamesCSV[i][0] : `Judge ${i}`);
        }
    }
    const headers = ['Total Score', 'Division', 'Lead', 'Follow', 'Lead Number', ...judgeHeaders];

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const workbook = XLSX.utils.book_new();
    
    // Add data by division
    const divisionMap = {};
    results.forEach(result => {
        const norm = normalizeDivisionName(result[1]); // Division is now at index 1
        if (!divisionMap[norm]) divisionMap[norm] = [];
        divisionMap[norm].push(result);
    });

    let currentRow = 1; // Skip header row
    Object.keys(divisionMap).forEach(division => {
        // Sort by total score within division (Total Score is now at index 0)
        const divisionResults = divisionMap[division].sort((a, b) => b[0] - a[0]);
        
        // Add division rows
        divisionResults.forEach(row => {
            for (let i = 0; i < row.length; i++) {
                const cellRef = XLSX.utils.encode_cell({ r: currentRow, c: i });
                ws[cellRef] = { v: row[i] };
                
                // Style total score column (now first column)
                if (i === 0) {
                    if (!ws['!cols']) ws['!cols'] = [];
                    ws[cellRef].s = { 
                        fill: { fgColor: { rgb: 'FFE4B5' } },
                        font: { bold: true }
                    };
                }
            }
            currentRow++;
        });
        // Add empty row between divisions
        currentRow++;
    });

    // Auto-size columns
    const range = XLSX.utils.decode_range(ws['!ref']);
    const colWidths = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
        let maxLen = headers[c].length;
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            if (ws[cellRef]) {
                const cellLen = String(ws[cellRef].v).length;
                if (cellLen > maxLen) maxLen = cellLen;
            }
        }
        colWidths.push({ wch: maxLen + 2 });
    }
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, ws, "Results");
    XLSX.writeFile(workbook, 'Dance_Competition_Results.xlsx');
});

// Helper function to get completed rows for export
function getCompletedRows() {
    const results = [];
    for (let i = 1; i < window.filteredData.length; i++) {
        const row = window.filteredData[i];
        const division = row[0] || '';
        const lead = row[1] || '';
        const follow = row[2] || '';
        const leadNumber = row[3] || '';

        // Skip header, judge name rows, or truly empty rows
        if (division.trim().toLowerCase() === 'division' ||
            (window.judgeNamesCSV && window.judgeNamesCSV.some(jn => jn[0] && (lead.trim() === jn[0] || follow.trim() === jn[0]))) ||
            (!division.trim() && !lead.trim() && !follow.trim() && !leadNumber.toString().trim())) {
            continue;
        }

        const rowKey = getRowKey(division, lead, follow, leadNumber);
        const judgeScores = [];
        let isValidRow = true;

        for (let j = 1; j <= window.numberOfJudges; j++) {
            const val = window.judgeScoresStore[rowKey]?.[j] || '';
            if (!val || !window.scoreMap.hasOwnProperty(val)) {
                isValidRow = false;
                break;
            }
            judgeScores.push(window.scoreMap[val]);
        }

        if (isValidRow && judgeScores.length === window.numberOfJudges) {
            const totalScore = judgeScores.reduce((sum, score) => sum + score, 0);
            results.push([
                totalScore,      // Total Score first
                division,        // Division second
                lead,           // Lead third
                follow,         // Follow fourth
                leadNumber,     // Lead Number fifth
                ...judgeScores  // Judge scores last
            ]);
        }
    }
    return results;
}

// CSV Export
document.getElementById('exportResultsCsv').addEventListener('click', () => {
    const results = getCompletedRows();
    if (results.length === 0) return;

    // Prepare headers
    const judgeHeaders = [];
    if (window.judgeNamesCSV && Array.isArray(window.judgeNamesCSV)) {
        for (let i = 1; i < window.judgeNamesCSV.length; i++) {
            judgeHeaders.push(window.judgeNamesCSV[i][0] ? window.judgeNamesCSV[i][0] : `Judge ${i}`);
        }
    }
    const headers = ['Total Score', 'Division', 'Lead', 'Follow', 'Lead Number', ...judgeHeaders];

    // Convert to CSV
    const csvContent = [
        headers.join(','),
        ...results.map(row => row.join(','))
    ].join('\n');

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Dance_Competition_Results.csv');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// Google Sheet Publish
document.getElementById('publishResults').addEventListener('click', async () => {
    window.hasAttemptedExportOrPublish = true;
    const rowCompleteness = getRowCompleteness();
    highlightNotFullyCompleteRows(rowCompleteness.notFullyComplete);
    updateExportPublishButtonState(rowCompleteness);
    if (rowCompleteness.fullyComplete.length === 0 || rowCompleteness.partiallyComplete.length > 0) return;

    // Get judgeNames for headers
    const judgeHeaders = [];
    if (window.judgeNamesCSV && Array.isArray(window.judgeNamesCSV)) {
        for (let i = 1; i < window.judgeNamesCSV.length; i++) {
            judgeHeaders.push(window.judgeNamesCSV[i][0] ? window.judgeNamesCSV[i][0] : `Judge ${i}`);
        }
    }
    // Match the website table headers order: Total Score first, then Division, Lead, Follow, Lead Number, then judges
    const mainHeaders = ['Total Score', 'Division', 'Lead', 'Follow', 'Lead Number', ...judgeHeaders];
    const winnersHeaders = ['Place', 'Total Score', 'Division', 'Lead', 'Follow', 'Lead Number'];

    // Format data for Google Sheets - Get data from tables directly
    let publishRows = [];  // Don't start with headers anymore

    // Get results from all division tables in the order they appear
    const resultsTables = document.querySelectorAll('.results-division-table');
    resultsTables.forEach((table, index) => {
        // Add division name as a header row
        const divisionName = table.getAttribute('data-division') || `Division ${index + 1}`;
        publishRows.push([divisionName, ...Array(mainHeaders.length - 1).fill('')]);

        // Add main headers after division name
        publishRows.push(mainHeaders);

        // Add division's rows - need to reorder cells to match headers
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            // Website shows: Total Score | Division | Lead | Follow | Lead Number | [Judges...]
            // So we extract in that order
            const rowData = [
                cells[0].textContent.trim(), // Total Score (first column)
                cells[1].textContent.trim(), // Division (second column)
                cells[2].textContent.trim(), // Lead (third column)
                cells[3].textContent.trim(), // Follow (fourth column)
                cells[4].textContent.trim(), // Lead Number (fifth column)
                // Add judge scores from remaining columns
                ...Array.from(cells).slice(5).map(cell => cell.textContent.trim())
            ];
            publishRows.push(rowData);
        });

        // Add empty row between divisions
        publishRows.push(Array(mainHeaders.length).fill(''));
    });

    // Get data from all winners tables
    const winnersTables = document.querySelectorAll('.final-winners-table');
    if (winnersTables.length > 0) {
        // Add extra empty row before winners section
        publishRows.push(Array(mainHeaders.length).fill(''));
        
        winnersTables.forEach((table, index) => {
            // Get the heading text from the previous sibling (h3 element)
            const headingElement = table.closest('div').previousElementSibling;
            let headingText = '';
            
            if (headingElement && headingElement.tagName === 'H3') {
                headingText = headingElement.textContent.trim();
            } else {
                // Fallback: look for any h3 before this table in the winners container
                const winnersContainer = table.closest('#finalWinnersContainer');
                if (winnersContainer) {
                    const allHeadings = winnersContainer.querySelectorAll('h3');
                    if (allHeadings[index]) {
                        headingText = allHeadings[index].textContent.trim();
                    }
                }
            }
            
            // Use the actual heading text or fallback
            const sectionName = headingText || `Top 3 Winners - Division ${index + 1}`;
            
            // Add section header with the actual heading text
            publishRows.push([sectionName, ...Array(mainHeaders.length - 1).fill('')]);
            
            // Add winners table headers - using correct order from reference
            publishRows.push(winnersHeaders);
            
            // Add winners rows - we need to reorder the cells to match headers
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach((row, rowIndex) => {
                const cells = row.querySelectorAll('td');
                const placeText = rowIndex === 0 ? '1st' : rowIndex === 1 ? '2nd' : rowIndex === 2 ? '3rd' : rowIndex === 3 ? '4th' : '5th';
                const rowData = [
                    placeText, // Place
                    cells[1].textContent.trim(), // Total Score
                    cells[2].textContent.trim(), // Division
                    cells[3].textContent.trim(), // Lead
                    cells[4].textContent.trim(), // Follow
                    cells[5].textContent.trim()  // Lead Number
                ];
                publishRows.push(rowData);
            });
            
            // Add empty row between winners tables if there are multiple
            if (index < winnersTables.length - 1) {
                publishRows.push(Array(mainHeaders.length).fill(''));
            }
        });
    }

    // Ensure all rows have same length by padding with empty strings
    const maxLen = Math.max(
        mainHeaders.length,
        winnersHeaders.length,
        ...publishRows.map(row => Array.isArray(row) ? row.length : 0)
    );
    publishRows = publishRows.map(row =>
        Array.isArray(row)
            ? [...row, ...Array(maxLen - row.length).fill('')]
            : row
    );

    // Display publishing message
    const exportPublishError = document.getElementById('exportPublishError');
    exportPublishError.textContent = 'Publishing results...';
    exportPublishError.style.color = '#A0522D';
    exportPublishError.classList.remove('hidden');

    try {
        // Create form data
        const formData = new FormData();
        formData.append('results', JSON.stringify(publishRows));

        console.log('Publishing to URL:', GOOGLE_APPS_SCRIPT_WEBAPP_URL);
        console.log('Publishing data rows:', publishRows.length);

        // Post to Google Apps Script web app with additional options for CORS
        const response = await fetch(GOOGLE_APPS_SCRIPT_WEBAPP_URL, {
            method: 'POST',
            body: formData,
            mode: 'cors',
            credentials: 'omit'
        });

        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);

        if (response.ok) {
            const responseData = await response.json();
            console.log('Response data:', responseData);
            
            if (responseData.success) {
                exportPublishError.textContent = 'Results published successfully!';
                exportPublishError.style.color = '#22c55e'; // Success green
                exportPublishError.classList.remove('hidden');
                
                // Hide success message after 3 seconds
                setTimeout(() => {
                    exportPublishError.classList.add('hidden');
                }, 3000);
            } else {
                throw new Error(responseData.error || 'Unknown error from server');
            }
        } else {
            const errorText = await response.text();
            console.error('Response error text:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error publishing results:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        
        let errorMessage = error.message;
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Network error - check your internet connection and try again. If the problem persists, the web app URL may be incorrect.';
        }
        
        exportPublishError.textContent = 'Error publishing results: ' + errorMessage;
        exportPublishError.style.color = '#EF4444'; // Error red
        exportPublishError.classList.remove('hidden');
    }
});
