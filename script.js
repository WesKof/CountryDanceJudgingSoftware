// Constants and configurations
const CORS_PROXY = "https://corsproxy.io/?";
const SIGNUPS_CSV_URL = CORS_PROXY + "https://docs.google.com/spreadsheets/d/e/2PACX-1vSJBH0yJI10tQyc8fjIntxd345nYR4cl5eKjdHOLv2nfYoGNrkn5uJQGLvleQGBLpTV-eZuku0uihdL/pub?gid=272461473&single=true&output=csv";
const JUDGES_CSV_URL = CORS_PROXY + "https://docs.google.com/spreadsheets/d/e/2PACX-1vSJBH0yJI10tQyc8fjIntxd345nYR4cl5eKjdHOLv2nfYoGNrkn5uJQGLvleQGBLpTV-eZuku0uihdL/pub?gid=469839298&single=true&output=csv";
const GOOGLE_APPS_SCRIPT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyCH-wLvlTmeRErAo99INVfibeCu5_yDnE1PasPVeWTO7iBjrg6QlIAdqS5GOEAIPmMTw/exec";

// Global state
window.scoreMap = { 'Yes': 10, 'No': 0, 'a1': 4.5, 'a2': 4.3 };
window.danceData = [];
window.filteredData = []; // Store non-empty rows
window.numberOfJudges = 0; // Will be set dynamically
window.currentPage = 1;
window.rowsPerPage = 10;
window.sortDirection = { totalScore: 'desc' }; // Default sort direction for totalScore
window.hasAttemptedExportOrPublish = false;
window.judgeScoresStore = {}; // Persistent storage for judge scores

// DOM Elements
const exportResultsButton = document.getElementById('exportResults');
const publishResultsButton = document.getElementById('publishResults');
const csvExportButton = document.getElementById('exportResultsCsv');
window.csvExportButton = csvExportButton; // Make it globally accessible
const resultsContainer = document.getElementById('resultsContainer');
const resultsTable = document.getElementById('resultsTable');
const resultsBody = document.getElementById('resultsBody');
const errorMessageDiv = document.getElementById('errorMessage');

// Display initialization
async function preloadData() {
    try {
        // Load both CSVs in parallel
        const [signupsCSV, judgeNamesCSV] = await Promise.all([
            fetchCSV(SIGNUPS_CSV_URL),
            fetchCSV(JUDGES_CSV_URL)
        ]);

        if (!judgeNamesCSV || !signupsCSV) {
            throw new Error('Failed to load data');
        }

        // Store judge names for later use
        window.judgeNamesCSV = judgeNamesCSV;
        window.numberOfJudges = judgeNamesCSV.length - 1;

        // Filter and display data
        window.danceData = signupsCSV;
        window.filteredData = window.danceData.filter((row, idx) => 
            idx === 0 || row.some(cell => cell && cell.trim().length > 0)
        );
        
        if (window.filteredData.length > 0) {
            displayData(window.filteredData);
            errorMessageDiv.classList.add('hidden');
            resultsContainer.classList.add('hidden');
            resultsBody.innerHTML = '';
            exportResultsButton.classList.add('hidden');
            publishResultsButton.classList.add('hidden');
            setupJudgeScoreListeners();

            // Initialize button states and alerts
            const rowCompleteness = getRowCompleteness();
            updateExportPublishButtonState(rowCompleteness);
            highlightNotFullyCompleteRows(rowCompleteness.notFullyComplete);
            
        } else {
            throw new Error('No valid dance data found.');
        }
    } catch (error) {
        console.error('Error in preloadData:', error);
        errorMessageDiv.textContent = `Error loading data: ${error.message}`;
        errorMessageDiv.classList.remove('hidden');
        exportResultsButton.classList.add('hidden');
        publishResultsButton.classList.add('hidden');
    }
}

// Initialize display on load
document.addEventListener('DOMContentLoaded', () => {
    preloadData();
});

// Data handling
async function fetchCSV(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        // Check if the response is HTML (e.g., Google login page or error)
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
            throw new Error('Failed to fetch CSV: received HTML instead of CSV.\nThis may be a CORS issue, a Google login page, or the sheet is not published as CSV.');
        }
        return text.trim().split('\n').map(row => row.split(','));
    } catch (error) {
        console.error('Error fetching CSV:', error);
        errorMessageDiv.textContent = `Error fetching data: ${error.message}`;
        errorMessageDiv.classList.remove('hidden');
        return null;
    }
}
