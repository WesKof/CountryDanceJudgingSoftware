// Test scenarios for row completeness validation
describe('Row Completeness Tests', () => {
    beforeEach(() => {
        // Reset test data
        window.filteredData = [
            ['Division', 'Lead', 'Follow', 'Number'], // Header row
            ['Novice', 'John', 'Jane', '1'],
            ['Novice', 'Mike', 'Sarah', '2'],
            ['Advanced', 'Bob', 'Alice', '3']
        ];
        window.numberOfJudges = 3;
        window.judgeScoresStore = {};
    });

    test('Row with all Yes scores is fully complete', () => {
        const rowKey = 'Novice-John-Jane-1';
        window.judgeScoresStore[rowKey] = {
            1: 'Yes',
            2: 'Yes',
            3: 'Yes'
        };
        const result = getRowCompleteness();
        expect(result.fullyComplete).toContain(rowKey);
        expect(result.partiallyComplete).not.toContain(rowKey);
    });

    test('Row with mixed valid scores is fully complete', () => {
        const rowKey = 'Novice-John-Jane-1';
        window.judgeScoresStore[rowKey] = {
            1: 'Yes',
            2: 'No',
            3: 'a1'
        };
        const result = getRowCompleteness();
        expect(result.fullyComplete).toContain(rowKey);
        expect(result.partiallyComplete).not.toContain(rowKey);
    });

    test('Row with some missing scores is partially complete', () => {
        const rowKey = 'Novice-John-Jane-1';
        window.judgeScoresStore[rowKey] = {
            1: 'Yes',
            2: 'No'
            // Judge 3 missing
        };
        const result = getRowCompleteness();
        expect(result.fullyComplete).not.toContain(rowKey);
        expect(result.partiallyComplete).toContain(rowKey);
    });

    test('Row with no scores is not complete', () => {
        const rowKey = 'Novice-John-Jane-1';
        window.judgeScoresStore[rowKey] = {};
        const result = getRowCompleteness();
        expect(result.fullyComplete).not.toContain(rowKey);
        expect(result.partiallyComplete).not.toContain(rowKey);
        expect(result.notFullyComplete).toContain(rowKey);
    });
});
