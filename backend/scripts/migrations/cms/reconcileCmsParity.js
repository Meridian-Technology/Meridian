const fs = require('fs');
const path = require('path');
const { connectToDatabase } = require('../../../connectionsManager');

function aggregateSourceData(payload) {
    const organizations = Array.isArray(payload.organizations) ? payload.organizations : [];
    const memberships = Array.isArray(payload.memberships) ? payload.memberships : [];
    const budgets = Array.isArray(payload.budgets) ? payload.budgets : [];
    const inventories = Array.isArray(payload.inventories) ? payload.inventories : [];
    const inventoryItems = Array.isArray(payload.inventoryItems) ? payload.inventoryItems : [];
    const governanceDocuments = Array.isArray(payload.governanceDocuments) ? payload.governanceDocuments : [];

    const budgetTotalsByFiscalYear = budgets.reduce((acc, budget) => {
        const key = String(budget.fiscalYear || 'unknown');
        const requested = Number(budget.totalRequested || 0);
        const approved = Number(budget.totalApproved || 0);
        if (!acc[key]) {
            acc[key] = { requested: 0, approved: 0 };
        }
        acc[key].requested += requested;
        acc[key].approved += approved;
        return acc;
    }, {});

    return {
        organizations: organizations.length,
        memberships: memberships.length,
        budgets: budgets.length,
        inventories: inventories.length,
        inventoryItems: inventoryItems.length,
        governanceDocuments: governanceDocuments.length,
        budgetTotalsByFiscalYear
    };
}

function collectMismatches(sourceSummary, targetSummary) {
    const mismatches = [];
    ['organizations', 'memberships', 'budgets', 'inventories', 'inventoryItems', 'governanceDocuments'].forEach((key) => {
        if (Number(sourceSummary[key]) !== Number(targetSummary[key])) {
            mismatches.push({
                type: 'count_mismatch',
                key,
                source: sourceSummary[key],
                target: targetSummary[key]
            });
        }
    });

    Object.entries(sourceSummary.budgetTotalsByFiscalYear).forEach(([fiscalYear, totals]) => {
        const targetTotals = targetSummary.budgetTotalsByFiscalYear[fiscalYear] || { requested: 0, approved: 0 };
        if (Number(totals.requested) !== Number(targetTotals.requested) || Number(totals.approved) !== Number(targetTotals.approved)) {
            mismatches.push({
                type: 'budget_total_mismatch',
                fiscalYear,
                source: totals,
                target: targetTotals
            });
        }
    });

    return mismatches;
}

async function reconcileCmsParity({ sourcePath, tenant, dryRun }) {
    console.log('[cms-migration] reconciliation started');
    console.log(`[cms-migration] sourcePath=${sourcePath}`);
    console.log(`[cms-migration] tenant=${tenant}`);
    console.log(`[cms-migration] dryRun=${dryRun}`);

    const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const sourceSummary = aggregateSourceData(payload);

    let targetSummary = {
        organizations: 0,
        memberships: 0,
        budgets: 0,
        inventories: 0,
        inventoryItems: 0,
        governanceDocuments: 0,
        budgetTotalsByFiscalYear: {}
    };

    if (!dryRun) {
        const db = await connectToDatabase(tenant);
        const Org = db.model('Org', require('../../../schemas/org'));
        const OrgMember = db.model('OrgMember', require('../../../schemas/orgMember'));
        const OrgBudget = db.model('OrgBudget', require('../../../schemas/orgBudget'));
        const OrgInventory = db.model('OrgInventory', require('../../../schemas/orgInventory'));
        const OrgInventoryItem = db.model('OrgInventoryItem', require('../../../schemas/orgInventoryItem'));
        const OrgGovernanceDocument = db.model('OrgGovernanceDocument', require('../../../schemas/orgGovernanceDocument'));

        const [organizations, memberships, budgets, inventories, inventoryItems, governanceDocuments, budgetRows] = await Promise.all([
            Org.countDocuments(),
            OrgMember.countDocuments(),
            OrgBudget.countDocuments(),
            OrgInventory.countDocuments(),
            OrgInventoryItem.countDocuments(),
            OrgGovernanceDocument.countDocuments(),
            OrgBudget.aggregate([
                {
                    $group: {
                        _id: '$fiscalYear',
                        requested: { $sum: '$totalRequested' },
                        approved: { $sum: '$totalApproved' }
                    }
                }
            ])
        ]);

        const budgetTotalsByFiscalYear = budgetRows.reduce((acc, row) => {
            acc[String(row._id || 'unknown')] = {
                requested: Number(row.requested || 0),
                approved: Number(row.approved || 0)
            };
            return acc;
        }, {});

        targetSummary = {
            organizations,
            memberships,
            budgets,
            inventories,
            inventoryItems,
            governanceDocuments,
            budgetTotalsByFiscalYear
        };
    }

    const mismatches = collectMismatches(sourceSummary, targetSummary);
    const report = {
        tenant,
        sourcePath,
        dryRun,
        checksRun: 7,
        sourceSummary,
        targetSummary,
        mismatches
    };

    const reportPath = path.join(path.dirname(sourcePath), `cms-parity-reconciliation.${tenant}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[cms-migration] reconciliation report written: ${reportPath}`);

    return {
        checksRun: report.checksRun,
        mismatches: report.mismatches,
        reportPath
    };
}

module.exports = {
    reconcileCmsParity,
    aggregateSourceData,
    collectMismatches
};
