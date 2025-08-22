function displayData(data) {
    const table = document.getElementById('dataTable');
    const headerRow = document.getElementById('headerRow');
    const dataBody = document.getElementById('dataBody');
    const paginationDiv = document.getElementById('pagination');
    const pageInfo = document.getElementById('pageInfo');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');

    headerRow.innerHTML = '';
    dataBody.innerHTML = '';
    table.classList.remove('hidden');

    // Custom headers: Division, Lead, Follow, Lead Number, then judge columns
    const staticHeaders = ['Division', 'Lead', 'Follow', 'Lead Number'];
    staticHeaders.forEach(header => {
        const th = document.createElement('th');
        th.className = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
        th.textContent = header;
        th.style.fontWeight = 'bold'; // Ensure bold
        headerRow.appendChild(th);
    });

    // Judge columns
    if (window.judgeNamesCSV && Array.isArray(window.judgeNamesCSV)) {
        for (let i = 1; i < window.judgeNamesCSV.length; i++) {
            const judgeTh = document.createElement('th');
            judgeTh.className = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
            judgeTh.textContent = window.judgeNamesCSV[i][0] ? window.judgeNamesCSV[i][0] : `Judge ${i}`;
            judgeTh.style.whiteSpace = 'nowrap';
            judgeTh.style.fontWeight = 'bold'; // Ensure bold
            headerRow.appendChild(judgeTh);
        }
    }

    function renderPage(page) {
        dataBody.innerHTML = '';
        const start = (page - 1) * window.rowsPerPage + 1;
        const end = Math.min(start + window.rowsPerPage, data.length);

        for (let i = start; i < end; i++) {
            const row = data[i];
            const tr = document.createElement('tr');
            
            // Division, Lead, Follow, Lead Number
            for (let k = 0; k < 4; k++) {
                const td = document.createElement('td');
                td.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
                td.textContent = row[k] !== undefined && row[k] !== null ? row[k] : '';
                tr.appendChild(td);
            }

            // Judge selects
            const division = row[0] || '';
            const lead = row[1] || '';
            const follow = row[2] || '';
            const leadNumber = row[3] || '';
            const rowKey = getRowKey(division, lead, follow, leadNumber);
            
            for (let j = 1; j <= window.numberOfJudges; j++) {
                const judgeTd = document.createElement('td');
                judgeTd.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
                const select = document.createElement('select');
                select.className = 'w-24 border rounded p-1 bg-white judge-score-select';
                select.dataset.judge = j;
                
                // Set value from store if present
                const storeVal = window.judgeScoresStore[rowKey]?.[j] || '';
                
                const optionDefault = document.createElement('option');
                optionDefault.value = '';
                optionDefault.textContent = 'Select';
                optionDefault.disabled = true;
                optionDefault.selected = storeVal === '';
                select.appendChild(optionDefault);
                
                ['Yes', 'No', 'a1', 'a2'].forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = `${opt} (${window.scoreMap[opt]})`;
                    option.style.fontWeight = 'bold'; // Make option bold
                    if (storeVal === opt) option.selected = true;
                    select.appendChild(option);
                });
                
                // Save row identity for change handler
                select.dataset.division = division;
                select.dataset.lead = lead;
                select.dataset.follow = follow;
                select.dataset.leadNumber = leadNumber;
                
                judgeTd.appendChild(select);
                tr.appendChild(judgeTd);
            }
            dataBody.appendChild(tr);
        }

        const totalPages = Math.max(1, Math.ceil((data.length - 1) / window.rowsPerPage));
        pageInfo.textContent = `Page ${page} of ${totalPages}`;
        prevPage.disabled = page === 1;
        nextPage.disabled = page === totalPages;
        paginationDiv.classList.toggle('hidden', data.length <= 1);
        setupJudgeScoreListeners();
        const rowCompleteness = getRowCompleteness();
        highlightNotFullyCompleteRows(rowCompleteness.notFullyComplete);
        updateButtonVisibility();
    }

    prevPage.addEventListener('click', () => {
        if (window.currentPage > 1) {
            window.currentPage--;
            renderPage(window.currentPage);
        }
    });

    nextPage.addEventListener('click', () => {
        if (window.currentPage < Math.ceil((data.length - 1) / window.rowsPerPage)) {
            window.currentPage++;
            renderPage(window.currentPage);
        }
    });

    renderPage(window.currentPage);
}

function updateButtonVisibility() {
    const rowCompleteness = getRowCompleteness();
    const hasFullyComplete = rowCompleteness.fullyComplete && rowCompleteness.fullyComplete.length > 0;
    
    // Get export buttons
    const exportResultsButton = document.getElementById('exportResults');
    const publishResultsButton = document.getElementById('publishResults');
    const csvExportButton = document.getElementById('exportResultsCsv');
    
    if (hasFullyComplete) {
        // Show buttons when we have complete rows
        exportResultsButton?.classList.remove('hidden');
        publishResultsButton?.classList.remove('hidden');
        csvExportButton?.classList.remove('hidden');
    } else {
        // Hide buttons when no complete rows
        exportResultsButton?.classList.add('hidden');
        publishResultsButton?.classList.add('hidden');
        csvExportButton?.classList.add('hidden');
    }
}
