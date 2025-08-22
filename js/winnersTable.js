// Winners table functionality

function displayFinalWinnersTable(results) {
    if (!results || !Array.isArray(results) || results.length === 0) {
        return; // No results to display
    }

    // Group by normalized division name, but keep original for display
    const divisionMap = {};
    const divisionDisplayNames = {};
    results.forEach(r => {
        const norm = normalizeDivisionName(r.division);
        if (!divisionMap[norm]) divisionMap[norm] = [];
        divisionMap[norm].push(r);
        if (!divisionDisplayNames[norm]) divisionDisplayNames[norm] = r.division;
    });

    // Beginner first, then Advanced
    const finalDivisions = [
        { key: 'beginner', label: 'Beginner/Newcomer Division', topCount: 5 },
        { key: 'advanced', label: 'Intermediate/Advanced Division', topCount: 5 }
    ];

    // Remove previous final winners container if present
    let finalWinnersContainer = document.getElementById('finalWinnersContainer');
    if (finalWinnersContainer) finalWinnersContainer.remove();

    finalWinnersContainer = document.createElement('div');
    finalWinnersContainer.id = 'finalWinnersContainer';
    finalWinnersContainer.className = 'mt-8 w-full flex flex-col items-center';

    finalDivisions.forEach(div => {
        const norm = div.key.toLowerCase();
        const matchingKey = Object.keys(divisionMap).find(k => k.includes(norm));
        if (!matchingKey || !divisionMap[matchingKey]) return;

        const divisionResults = divisionMap[matchingKey].sort((a, b) => b.totalScore - a.totalScore);

        // Only show if at least the minimum required rows for this division
        const minRequired = div.topCount;
        if (divisionResults.length < minRequired) return;

        // Heading
        const heading = document.createElement('h3');
        heading.className = 'text-lg font-bold mb-2 mt-6 custom-header text-center';
        heading.textContent = `Top ${div.topCount} Winners - ${div.label}`;
        finalWinnersContainer.appendChild(heading);

        // Table
        const tableWrapper = document.createElement('div');
        tableWrapper.style.overflowX = 'auto';
        tableWrapper.style.maxWidth = '100%';
        tableWrapper.style.marginBottom = '2rem';

        const table = document.createElement('table');
        table.className = 'table-auto divide-y divide-gray-200 final-winners-table';
        table.style.tableLayout = 'auto';
        table.style.width = 'max-content';

        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        ['Place', 'Total Score', 'Division', 'Lead', 'Follow', 'Lead Number'].forEach((h, idx) => {
            const th = document.createElement('th');
            th.textContent = h;
            th.style.fontWeight = 'bold'; // Ensure bold
            if (idx === 0) {
                th.style.backgroundColor = '#FFFF00'; // Place: highlighter yellow
            } else if (idx === 1) {
                th.style.backgroundColor = '#FFE4B5'; // Total Score: match sample (Moccasin)
            }
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        divisionResults.slice(0, div.topCount).forEach((result, idx) => {
            const tr = document.createElement('tr');
            // Place
            const placeCell = document.createElement('td');
            const placeText = idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : idx === 3 ? '4th' : '5th';
            placeCell.textContent = placeText;
            placeCell.style.backgroundColor = '#FFFF00'; // Place: highlighter yellow
            tr.appendChild(placeCell);
            // Total Score
            const totalScoreCell = document.createElement('td');
            totalScoreCell.textContent = result.totalScore;
            totalScoreCell.style.backgroundColor = '#FFE4B5'; // Total Score: match sample (Moccasin)
            tr.appendChild(totalScoreCell);
            // Division
            const divisionCell = document.createElement('td');
            divisionCell.textContent = result.division;
            tr.appendChild(divisionCell);
            // Lead
            const leadCell = document.createElement('td');
            leadCell.textContent = result.lead;
            tr.appendChild(leadCell);
            // Follow
            const followCell = document.createElement('td');
            followCell.textContent = result.follow;
            tr.appendChild(followCell);
            // Lead Number
            const leadNumberCell = document.createElement('td');
            leadNumberCell.textContent = result.leadNumber;
            tr.appendChild(leadNumberCell);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        finalWinnersContainer.appendChild(tableWrapper);
    });

    // Insert after resultsContainer
    const resultsContainerDiv = document.getElementById('resultsContainer');
    if (resultsContainerDiv && resultsContainerDiv.parentNode) {
        resultsContainerDiv.parentNode.insertBefore(finalWinnersContainer, resultsContainerDiv.nextSibling);
    }
}
