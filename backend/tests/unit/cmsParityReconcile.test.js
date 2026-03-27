const { aggregateSourceData, collectMismatches } = require('../../scripts/migrations/cms/reconcileCmsParity');

describe('cms parity reconciliation helpers', () => {
  test('aggregates source counts and budget totals by fiscal year', () => {
    const source = {
      organizations: [{ id: 1 }, { id: 2 }],
      memberships: [{ id: 1 }],
      budgets: [
        { fiscalYear: '2025', totalRequested: 100, totalApproved: 90 },
        { fiscalYear: '2025', totalRequested: 50, totalApproved: 25 }
      ],
      inventories: [{ id: 1 }],
      inventoryItems: [{ id: 1 }, { id: 2 }],
      governanceDocuments: [{ id: 1 }]
    };
    const summary = aggregateSourceData(source);
    expect(summary.organizations).toBe(2);
    expect(summary.budgetTotalsByFiscalYear['2025']).toEqual({ requested: 150, approved: 115 });
  });

  test('detects count and budget mismatches', () => {
    const source = {
      organizations: 2,
      memberships: 1,
      budgets: 1,
      inventories: 1,
      inventoryItems: 2,
      governanceDocuments: 1,
      budgetTotalsByFiscalYear: {
        '2025': { requested: 150, approved: 100 }
      }
    };
    const target = {
      organizations: 1,
      memberships: 1,
      budgets: 1,
      inventories: 1,
      inventoryItems: 2,
      governanceDocuments: 1,
      budgetTotalsByFiscalYear: {
        '2025': { requested: 149, approved: 100 }
      }
    };
    const mismatches = collectMismatches(source, target);
    expect(mismatches.some((row) => row.key === 'organizations')).toBe(true);
    expect(mismatches.some((row) => row.type === 'budget_total_mismatch')).toBe(true);
  });
});
