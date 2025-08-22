function setupJudgeScoreListeners() {
    const dataRows = document.querySelectorAll('#dataBody tr');
    dataRows.forEach((rowElement) => {
        const selectElements = rowElement.querySelectorAll('.judge-score-select');
        selectElements.forEach((select) => {
            select.addEventListener('change', (e) => {
                const division = select.dataset.division;
                const lead = select.dataset.lead;
                const follow = select.dataset.follow;
                const leadNumber = select.dataset.leadNumber;
                const judge = select.dataset.judge;
                const rowKey = getRowKey(division, lead, follow, leadNumber);
                
                if (!window.judgeScoresStore[rowKey]) window.judgeScoresStore[rowKey] = {};
                window.judgeScoresStore[rowKey][judge] = select.value;
                updateResultsLive();
                
                const rowCompleteness = getRowCompleteness();
                updateExportPublishButtonState(rowCompleteness);
                highlightNotFullyCompleteRows(rowCompleteness.notFullyComplete);
            });
        });
    });
}

// Delegate to the main updateResultsLive function in resultsHandlers.js
// This avoids code duplication while maintaining the event handling functionality
