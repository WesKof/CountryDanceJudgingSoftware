function getRowKey(division, lead, follow, leadNumber) {
    return [
        (division || '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(),
        (lead || '').toString().trim().toLowerCase(),
        (follow || '').toString().trim().toLowerCase(),
        (leadNumber || '').toString().trim().toLowerCase()
    ].join('||');
}

function normalizeDivisionName(name) {
    if (!name) return '';
    // Remove all line breaks, collapse all whitespace to single space, trim
    return name.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function fetchCSV(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.text();
    } catch (error) {
        console.error('Error fetching CSV:', error);
        errorMessageDiv.textContent = `Error fetching data: ${error.message}`;
        errorMessageDiv.classList.remove('hidden');
        return null;
    }
}

// Row completeness checking
function getRowCompleteness() {
    const fullyComplete = [];
    const partiallyComplete = [];
    const notFullyComplete = [];

    for (let i = 1; i < window.filteredData.length; i++) {
        const row = window.filteredData[i];
        const division = row[0] || '';
        const lead = row[1] || '';
        const follow = row[2] || '';
        const leadNumber = row[3] || '';
        
        // Skip header or judge name rows
        if (
            division.trim().toLowerCase() === 'division' ||
            (window.judgeNamesCSV && Array.isArray(window.judgeNamesCSV) && (
                window.judgeNamesCSV.some(jn => jn[0] && (lead.trim() === jn[0] || follow.trim() === jn[0]))
            ))
        ) {
            continue;
        }

        // Skip truly empty rows (all identifying fields blank)
        if (!division.trim() && !lead.trim() && !follow.trim() && !leadNumber.toString().trim()) {
            continue;
        }

        const rowKey = getRowKey(division, lead, follow, leadNumber);
        let filledCount = 0;
        let hasAny = false;

        // Count how many judges have scored this row
        for (let j = 1; j <= window.numberOfJudges; j++) {
            const val = window.judgeScoresStore[rowKey]?.[j] || '';
            if (val && window.scoreMap.hasOwnProperty(val)) {
                filledCount++;
                hasAny = true;
            }
        }

        // Now classify the row based on its scores
        if (filledCount === window.numberOfJudges) {
            fullyComplete.push({ division, lead, follow, leadNumber });
        } else if (hasAny) {
            // Any scores but not all
            partiallyComplete.push({ division, lead, follow, leadNumber });
            notFullyComplete.push({ division, lead, follow, leadNumber });
        } else {
            // No scores yet
            notFullyComplete.push({ division, lead, follow, leadNumber });
        }
    }

    return { fullyComplete, partiallyComplete, notFullyComplete };
}

function highlightNotFullyCompleteRows(notFullyCompleteRows) {
    // First, clear all highlighting
    document.querySelectorAll('.judge-score-select').forEach(sel => {
        sel.style.backgroundColor = '';
        sel.style.color = '';
        sel.style.fontWeight = '';
    });
    
    // Then, highlight ALL empty dropdowns regardless of row completeness status
    // This is more reliable than matching specific rows
    document.querySelectorAll('.judge-score-select').forEach(sel => {
        if (!sel.value || sel.value === '' || sel.value === 'Select') {
            sel.style.backgroundColor = '#fff0f0';
            sel.style.color = '#b91c1c';
            sel.style.fontWeight = 'bold';
        }
    });
}

function updateExportPublishButtonState(rowCompleteness) {
    const canExport = rowCompleteness.fullyComplete.length > 0 && rowCompleteness.partiallyComplete.length === 0;
    const exportPublishError = document.getElementById('exportPublishError');
    
    // Remove any previous extra messages
    let partialMsg = document.getElementById('partialRowsMsg');
    let emptyMsg = document.getElementById('emptyRowsMsg');
    let incompleteAlert = document.getElementById('incompleteTableAlert');
    if (partialMsg) partialMsg.remove();
    if (emptyMsg) emptyMsg.remove();
    if (incompleteAlert) incompleteAlert.remove();

    // Insert after the button container
    const buttonContainer = document.querySelector('.mt-6.flex.justify-center.space-x-4');
    let insertAfter = buttonContainer;

    // 1. Error: No rows are fully scored.
    if (!rowCompleteness.fullyComplete || rowCompleteness.fullyComplete.length === 0) {
        incompleteAlert = document.createElement('div');
        incompleteAlert.id = 'incompleteTableAlert';
        incompleteAlert.style.color = '#b91c1c';
        incompleteAlert.style.fontWeight = 'bold';
        incompleteAlert.style.marginTop = '0.5rem';
        incompleteAlert.style.textAlign = 'center';
        incompleteAlert.className = 'text-red-600 text-center mt-4';
        incompleteAlert.textContent = 'Error: No rows are fully scored.';
        if (insertAfter && insertAfter.parentNode) {
            insertAfter.parentNode.insertBefore(incompleteAlert, insertAfter.nextSibling);
            insertAfter = incompleteAlert;
        }
    }

    // 2. Error: You have at least one partially filled row...
    if (rowCompleteness.partiallyComplete.length > 0) {
        partialMsg = document.createElement('div');
        partialMsg.id = 'partialRowsMsg';
        partialMsg.style.color = '#b91c1c';
        partialMsg.style.fontWeight = 'bold';
        partialMsg.style.marginTop = '0.5rem';
        partialMsg.style.textAlign = 'center';
        partialMsg.textContent = "Error: You have at least one partially filled row. Please fill all judge scores or clear the row.";
        if (insertAfter && insertAfter.parentNode) {
            insertAfter.parentNode.insertBefore(partialMsg, insertAfter.nextSibling);
            insertAfter = partialMsg;
        }
    }

    // 3. Warning: There are still some empty rows...
    if (rowCompleteness.notFullyComplete.length > 0) {
        emptyMsg = document.createElement('div');
        emptyMsg.id = 'emptyRowsMsg';
        emptyMsg.style.color = '#bfa16b';
        emptyMsg.style.fontWeight = 'bold';
        emptyMsg.style.marginTop = '0.5rem';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.textContent = "Warning: There are still some empty rows. These will be ignored in the results.";
        if (insertAfter && insertAfter.parentNode) {
            insertAfter.parentNode.insertBefore(emptyMsg, insertAfter.nextSibling);
            insertAfter = emptyMsg;
        }
    }

    // Button state logic
    const exportButtons = [
        exportResultsButton,
        publishResultsButton,
        window.csvExportButton
    ].filter(Boolean); // Filter out any undefined buttons

    if (!canExport) {
        exportButtons.forEach(button => {
            button.disabled = true;
            button.classList.add('opacity-50', 'cursor-not-allowed');
        });
        exportPublishError.textContent = "";
        exportPublishError.classList.add('hidden');
    } else {
        exportButtons.forEach(button => {
            button.disabled = false;
            button.classList.remove('opacity-50', 'cursor-not-allowed');
        });
        exportPublishError.textContent = "";
        exportPublishError.classList.add('hidden');
    }
}

// Error handling
function handleError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.classList.remove('hidden');
    console.error(message);
}
