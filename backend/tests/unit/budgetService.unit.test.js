jest.mock('../../services/getModelService', () => jest.fn());

const {
    toCsv,
    materializeLineItems,
    validateRequiredLineItems,
    budgetToExportRows
} = require('../../services/budgetService');

describe('budgetService helpers', () => {
    test('toCsv escapes quotes and commas', () => {
        const rows = [
            ['a', 'b'],
            ['hello,world', 'say "hi"']
        ];
        const csv = toCsv(rows);
        expect(csv).toContain('"hello,world"');
        expect(csv).toContain('""');
    });

    test('materializeLineItems maps incoming values by key', () => {
        const template = {
            lineItemDefinitions: [
                { key: 'x', label: 'X', required: true, kind: 'currency' },
                { key: 'y', label: 'Y', required: false, kind: 'text' }
            ]
        };
        const li = materializeLineItems(template, [{ key: 'x', amount: 100, note: 'n' }, { key: 'y', textValue: 'hello' }]);
        expect(li).toHaveLength(2);
        expect(li[0].amount).toBe(100);
        expect(li[0].note).toBe('n');
        expect(li[1].textValue).toBe('hello');
    });

    test('validateRequiredLineItems fails when currency missing', () => {
        const template = {
            lineItemDefinitions: [{ key: 'x', label: 'X', required: true, kind: 'currency' }]
        };
        const li = [{ key: 'x', amount: null, label: 'X', kind: 'currency' }];
        const v = validateRequiredLineItems(template, li);
        expect(v.ok).toBe(false);
    });

    test('budgetToExportRows includes line items', () => {
        const budget = {
            _id: '507f1f77bcf86cd799439011',
            title: 'T',
            fiscalYear: '2026',
            templateKey: 'annual_club',
            status: 'draft',
            lineItems: [{ key: 'operating', label: 'Op', amount: 50, numberValue: null, textValue: '', note: '' }]
        };
        const rows = budgetToExportRows(budget);
        expect(rows.some((r) => r[0] === 'operating')).toBe(true);
    });
});
