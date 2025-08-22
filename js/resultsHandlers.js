function updateResultsLive() {
    if (window.filteredData.length <= 1) {
        errorMessageDiv.textContent = 'Please upload an Excel file with valid dance data.';
        errorMessageDiv.classList.remove('hidden');
        return;
    }
    const results = [];
    
    // Loop through all data rows (not just visible ones)
    for (let i = 1; i < window.filteredData.length; i++) {
        const row = window.filteredData[i];
        const division = row[0] || '';
        const lead = row[1] || '';
        const follow = row[2] || '';
        const leadNumber = row[3] || '';
        const rowKey = getRowKey(division, lead, follow, leadNumber);
        const judgeScores = [];
        let isValidRow = true;
        let hasAny = false;
        let hasEmpty = false;
        
        for (let j = 1; j <= window.numberOfJudges; j++) {
            const val = window.judgeScoresStore[rowKey]?.[j] || '';
            if (val && window.scoreMap.hasOwnProperty(val)) hasAny = true;
            if (!val) hasEmpty = true;
            if (!val || !window.scoreMap.hasOwnProperty(val)) isValidRow = false;
            judgeScores.push({ name: window.judgeNamesCSV?.[j]?.[0] || `Judge ${j}`, score: window.scoreMap[val] });
        }

        if (!division.trim() && !lead.trim() && !follow.trim() && !leadNumber.toString().trim()) {
            continue; // skip truly empty row
        }
        if (!hasAny) {
            // All empty selects, skip for completeness
            continue;
        }
        
        if (isValidRow && judgeScores.length === numberOfJudges) {
            const totalScore = judgeScores.reduce((sum, item) => sum + item.score, 0);
            const judgeScoresArr = judgeScores.map(j => j.score);
            results.push({
                division,
                lead,
                follow,
                leadNumber,
                totalScore,
                judgeScoresArr
            });
        }
    }
    // Always sort by totalScore descending within each division
    if (results.length > 0) {
        errorMessageDiv.classList.add('hidden');
        displayResultsInTable(results);
        displayFinalWinnersTable(results);
    } else {
        resultsContainer.classList.add('hidden');
        resultsBody.innerHTML = '';
    }

    // Show or hide the incomplete table alert
    let incompleteAlert = document.getElementById('incompleteTableAlert');
    if (!incompleteAlert) {
        incompleteAlert = document.createElement('div');
        incompleteAlert.id = 'incompleteTableAlert';
        incompleteAlert.style.color = '#b91c1c';
        incompleteAlert.style.fontWeight = 'bold';
        incompleteAlert.style.marginTop = '1.5rem';
        incompleteAlert.style.textAlign = 'center';
        incompleteAlert.className = 'text-red-600 text-center mt-4';
        // Insert after the button container
        const buttonContainer = document.querySelector('.mt-6.flex.justify-center.space-x-4');
        if (buttonContainer && buttonContainer.parentNode) {
            buttonContainer.parentNode.insertBefore(incompleteAlert, buttonContainer.nextSibling);
        } else {
            document.body.appendChild(incompleteAlert);
        }
    }
    const rowCompleteness = getRowCompleteness();
    if (!rowCompleteness.fullyComplete || rowCompleteness.fullyComplete.length === 0) {
        incompleteAlert.textContent = 'Error: No rows are fully scored.';
        incompleteAlert.style.display = '';
    } else {
        incompleteAlert.textContent = '';
        incompleteAlert.style.display = 'none';
    }
}

function calculateResults() {
    const results = [];
    for (let i = 1; i < filteredData.length; i++) {
        const row = filteredData[i];
        const division = row[0] || '';
        const lead = row[1] || '';
        const follow = row[2] || '';
        const leadNumber = row[3] || '';
        
        if (!division.trim() && !lead.trim() && !follow.trim() && !leadNumber.toString().trim()) {
            continue;
        }

        const rowResult = processRow(division, lead, follow, leadNumber);
        if (rowResult) {
            results.push(rowResult);
        }
    }
    return results;
}

function processRow(division, lead, follow, leadNumber) {
    const rowKey = getRowKey(division, lead, follow, leadNumber);
    const judgeScores = [];
    let isValidRow = true;
    let hasAny = false;

    for (let j = 1; j <= numberOfJudges; j++) {
        const val = judgeScoresStore[rowKey]?.[j] || '';
        if (val && scoreMap.hasOwnProperty(val)) {
            hasAny = true;
            judgeScores.push({ 
                name: window.judgeNamesCSV?.[j]?.[0] || `Judge ${j}`, 
                score: scoreMap[val] 
            });
        } else {
            isValidRow = false;
            judgeScores.push({ 
                name: window.judgeNamesCSV?.[j]?.[0] || `Judge ${j}`, 
                score: 0
            });
        }
    }

    if (!hasAny || !isValidRow || judgeScores.length !== numberOfJudges) {
        return null;
    }

    const totalScore = judgeScores.reduce((sum, item) => sum + item.score, 0);
    return {
        division,
        lead,
        follow,
        leadNumber,
        totalScore,
        judgeScoresArr: judgeScores.map(j => j.score)
    };
}

function displayResultsInTable(results) {
    // Group by normalized division name
    const divisionMap = {};
    const divisionDisplayNames = {};
    results.forEach(r => {
        const norm = normalizeDivisionName(r.division);
        if (!divisionMap[norm]) divisionMap[norm] = [];
        divisionMap[norm].push(r);
        // Store proper division display name based on reference format
        if (!divisionDisplayNames[norm]) {
            if (norm.includes('adv')) {
                divisionDisplayNames[norm] = 'Intermediate/Advanced Division';
            } else if (norm.includes('beg')) {
                divisionDisplayNames[norm] = 'Beginner/Newcomer Division';
            } else {
                divisionDisplayNames[norm] = r.division;
            }
        }
    });

    resultsContainer.innerHTML = '';
    let hasAnyDivision = false;

    Object.keys(divisionMap).forEach((norm) => {
        // Sort results by total score within each division
        const divisionResults = divisionMap[norm].sort((a, b) => b.totalScore - a.totalScore);
        if (divisionResults.length === 0) return;

        hasAnyDivision = true;
        
        // Create division heading with proper name
        const heading = document.createElement('h3');
        heading.className = 'text-lg font-bold mb-2 mt-6 custom-header text-center';
        heading.textContent = divisionDisplayNames[norm];
        resultsContainer.appendChild(heading);

        // Create table wrapper for horizontal scrolling
        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-container';
        tableWrapper.style.overflowX = 'auto';
        tableWrapper.style.maxWidth = '100%';
        tableWrapper.style.marginBottom = '2rem';

        // Create table with proper division name attribute
        const table = document.createElement('table');
        table.className = 'table-auto min-w-full divide-y divide-gray-200 results-division-table';
        table.setAttribute('data-division', divisionDisplayNames[norm]);
        table.style.width = 'max-content';

        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // Static headers
        const headers = [
            { text: 'Total Score', class: 'total-score' },
            { text: 'Division' },
            { text: 'Lead' },
            { text: 'Follow' },
            { text: 'Lead Number' }
        ];

        // Add headers
        headers.forEach(h => {
            const th = document.createElement('th');
            th.className = `px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider${h.class ? ' ' + h.class : ''}`;
            th.textContent = h.text;
            th.style.fontWeight = 'bold';
            if (h.class === 'total-score') {
                th.style.backgroundColor = '#FFE4B5';
            }
            th.style.whiteSpace = 'nowrap';
            headerRow.appendChild(th);
        });

        // Add judge score headers
        if (window.judgeNamesCSV && Array.isArray(window.judgeNamesCSV)) {
            for (let i = 1; i < window.judgeNamesCSV.length; i++) {
                const th = document.createElement('th');
                th.className = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
                th.textContent = window.judgeNamesCSV[i][0] ? window.judgeNamesCSV[i][0] : `Judge ${i}`;
                th.style.whiteSpace = 'nowrap';
                th.style.fontWeight = 'bold';
                headerRow.appendChild(th);
            }
        }

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');
        divisionResults.forEach(result => {
            const row = tbody.insertRow();
            
            // Total Score
            const totalScoreCell = row.insertCell();
            totalScoreCell.textContent = result.totalScore;
            totalScoreCell.className = 'total-score';
            totalScoreCell.style.backgroundColor = '#FFE4B5';

            // Division
            const divisionCell = row.insertCell();
            divisionCell.textContent = result.division;
            divisionCell.style.whiteSpace = 'nowrap';

            // Lead
            const leadCell = row.insertCell();
            leadCell.textContent = result.lead;
            leadCell.style.whiteSpace = 'nowrap';

            // Follow
            const followCell = row.insertCell();
            followCell.textContent = result.follow;
            followCell.style.whiteSpace = 'nowrap';

            // Lead Number
            const leadNumberCell = row.insertCell();
            leadNumberCell.textContent = result.leadNumber;
            leadNumberCell.style.whiteSpace = 'nowrap';

            // Judge scores
            if (Array.isArray(result.judgeScoresArr)) {
                result.judgeScoresArr.forEach(score => {
                    const cell = row.insertCell();
                    cell.textContent = score;
                    cell.className = 'judge-scores';
                    cell.style.whiteSpace = 'nowrap';
                });
            }
        });

        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        resultsContainer.appendChild(tableWrapper);
    });

    // Show/hide results section and export buttons based on whether we have results
    if (hasAnyDivision) {
        resultsContainer.classList.remove('hidden');
        exportResultsButton.classList.remove('hidden');
        publishResultsButton.classList.remove('hidden');
        if (window.csvExportButton) {
            window.csvExportButton.classList.remove('hidden');
        }
    } else {
        resultsContainer.classList.add('hidden');
        exportResultsButton.classList.add('hidden');
        publishResultsButton.classList.add('hidden');
        if (window.csvExportButton) {
            window.csvExportButton.classList.add('hidden');
        }
    }
}
