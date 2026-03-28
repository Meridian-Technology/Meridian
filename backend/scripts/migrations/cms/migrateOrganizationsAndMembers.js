const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectToDatabase } = require('../../../connectionsManager');

function readSourcePayload(sourcePath) {
    const raw = fs.readFileSync(sourcePath, 'utf8');
    return JSON.parse(raw);
}

function toObjectId(value, namespace) {
    if (!value) {
        return new mongoose.Types.ObjectId();
    }
    if (mongoose.Types.ObjectId.isValid(value)) {
        return new mongoose.Types.ObjectId(value);
    }
    const hash = crypto.createHash('md5').update(`${namespace}:${String(value)}`).digest('hex');
    return new mongoose.Types.ObjectId(hash.slice(0, 24));
}

async function migrateOrganizationsAndMembers({ sourcePath, tenant, dryRun }) {
    console.log('[cms-migration] organizations/members migration started');
    console.log(`[cms-migration] sourcePath=${sourcePath}`);
    console.log(`[cms-migration] tenant=${tenant}`);
    console.log(`[cms-migration] dryRun=${dryRun}`);

    const payload = readSourcePayload(sourcePath);
    const organizations = Array.isArray(payload.organizations) ? payload.organizations : [];
    const memberships = Array.isArray(payload.memberships) ? payload.memberships : [];
    const budgets = Array.isArray(payload.budgets) ? payload.budgets : [];
    const budgetReviews = Array.isArray(payload.budgetReviews) ? payload.budgetReviews : [];
    const budgetWorkflowEvents = Array.isArray(payload.budgetWorkflowEvents) ? payload.budgetWorkflowEvents : [];
    const inventories = Array.isArray(payload.inventories) ? payload.inventories : [];
    const governanceDocuments = Array.isArray(payload.governanceDocuments) ? payload.governanceDocuments : [];
    const inventoryItems = Array.isArray(payload.inventoryItems) ? payload.inventoryItems : [];

    const mapping = {
        tenant,
        organizations: {},
        users: {},
        memberships: {},
        budgets: {},
        inventories: {},
        inventoryItems: {},
        governanceDocuments: {},
        budgetReviews: {},
        budgetWorkflowEvents: {}
    };

    if (dryRun) {
        organizations.forEach((org) => {
            mapping.organizations[String(org.id || org._id || org.org_name)] = String(toObjectId(org.id || org._id || org.org_name, 'org'));
        });
        memberships.forEach((membership) => {
            const userKey = String(membership.userId || membership.user_id || membership.username || crypto.randomUUID());
            mapping.users[userKey] = String(toObjectId(userKey, 'user'));
        });
    } else {
        const db = await connectToDatabase(tenant);
        const Org = db.model('Org', require('../../../schemas/org'));
        const OrgMember = db.model('OrgMember', require('../../../schemas/orgMember'));
        const OrgBudget = db.model('OrgBudget', require('../../../schemas/orgBudget'));
        const OrgInventory = db.model('OrgInventory', require('../../../schemas/orgInventory'));
        const OrgInventoryItem = db.model('OrgInventoryItem', require('../../../schemas/orgInventoryItem'));
        const OrgGovernanceDocument = db.model('OrgGovernanceDocument', require('../../../schemas/orgGovernanceDocument'));
        const OrgBudgetReview = db.model('OrgBudgetReview', require('../../../schemas/orgBudgetReview'));
        const OrgBudgetWorkflowEvent = db.model('OrgBudgetWorkflowEvent', require('../../../schemas/orgBudgetWorkflowEvent'));

        for (const organization of organizations) {
            const sourceOrgKey = String(organization.id || organization._id || organization.org_name);
            const orgId = toObjectId(sourceOrgKey, 'org');
            mapping.organizations[sourceOrgKey] = String(orgId);

            const orgPayload = {
                _id: orgId,
                org_name: organization.org_name || organization.name || `Migrated Org ${sourceOrgKey}`,
                org_description: organization.org_description || organization.description || '',
                lifecycleStatus: organization.lifecycleStatus || organization.status || 'active',
                lifecycleUpdatedAt: organization.lifecycleUpdatedAt ? new Date(organization.lifecycleUpdatedAt) : new Date(),
                approvalStatus: organization.approvalStatus || 'approved'
            };
            await Org.updateOne({ _id: orgId }, { $set: orgPayload }, { upsert: true });
        }

        for (const membership of memberships) {
            const sourceOrgKey = String(membership.orgId || membership.org_id);
            const sourceUserKey = String(membership.userId || membership.user_id || membership.username || crypto.randomUUID());
            const sourceMembershipKey = String(membership.id || membership._id || `${sourceOrgKey}:${sourceUserKey}`);
            const orgId = mapping.organizations[sourceOrgKey]
                ? new mongoose.Types.ObjectId(mapping.organizations[sourceOrgKey])
                : toObjectId(sourceOrgKey, 'org');
            const userId = toObjectId(sourceUserKey, 'user');
            const membershipId = toObjectId(sourceMembershipKey, 'membership');
            mapping.users[sourceUserKey] = String(userId);
            mapping.memberships[sourceMembershipKey] = String(membershipId);

            await OrgMember.updateOne(
                { _id: membershipId },
                {
                    $set: {
                        org_id: orgId,
                        user_id: userId,
                        role: membership.role || 'member',
                        status: membership.status || 'active',
                        joinedAt: membership.joinedAt ? new Date(membership.joinedAt) : new Date(),
                        termStart: membership.termStart ? new Date(membership.termStart) : null,
                        termEnd: membership.termEnd ? new Date(membership.termEnd) : null,
                        roleHistory: Array.isArray(membership.roleHistory) ? membership.roleHistory : [],
                        membershipAuditTrail: Array.isArray(membership.membershipAuditTrail)
                            ? membership.membershipAuditTrail
                            : []
                    }
                },
                { upsert: true }
            );
        }

        for (const budget of budgets) {
            const sourceBudgetKey = String(budget.id || budget._id || `${budget.orgId || budget.org_id}:${budget.name}`);
            const sourceOrgKey = String(budget.orgId || budget.org_id);
            const budgetId = toObjectId(sourceBudgetKey, 'budget');
            const orgId = mapping.organizations[sourceOrgKey]
                ? new mongoose.Types.ObjectId(mapping.organizations[sourceOrgKey])
                : toObjectId(sourceOrgKey, 'org');
            mapping.budgets[sourceBudgetKey] = String(budgetId);

            await OrgBudget.updateOne(
                { _id: budgetId },
                {
                    $set: {
                        org_id: orgId,
                        fiscalYear: budget.fiscalYear || 'unknown',
                        name: budget.name || `Budget ${sourceBudgetKey}`,
                        state: budget.state || 'draft',
                        lineItems: Array.isArray(budget.lineItems) ? budget.lineItems : [],
                        totalRequested: Number(budget.totalRequested || 0),
                        totalApproved: Number(budget.totalApproved || 0),
                        createdBy: budget.createdBy ? toObjectId(budget.createdBy, 'user') : toObjectId('system', 'user'),
                        updatedBy: budget.updatedBy ? toObjectId(budget.updatedBy, 'user') : null
                    }
                },
                { upsert: true }
            );
        }

        for (const review of budgetReviews) {
            const sourceReviewKey = String(review.id || review._id || `${review.budgetId || review.budget_id}:${review.action}:${review.reviewerId || review.reviewer_id}`);
            const sourceBudgetKey = String(review.budgetId || review.budget_id);
            const sourceOrgKey = String(review.orgId || review.org_id);
            const reviewId = toObjectId(sourceReviewKey, 'budgetReview');
            const budgetId = mapping.budgets[sourceBudgetKey]
                ? new mongoose.Types.ObjectId(mapping.budgets[sourceBudgetKey])
                : toObjectId(sourceBudgetKey, 'budget');
            const orgId = mapping.organizations[sourceOrgKey]
                ? new mongoose.Types.ObjectId(mapping.organizations[sourceOrgKey])
                : toObjectId(sourceOrgKey, 'org');
            mapping.budgetReviews[sourceReviewKey] = String(reviewId);

            await OrgBudgetReview.updateOne(
                { _id: reviewId },
                {
                    $set: {
                        budget_id: budgetId,
                        org_id: orgId,
                        reviewerId: review.reviewerId ? toObjectId(review.reviewerId, 'user') : toObjectId('system', 'user'),
                        action: review.action || 'comment',
                        comment: review.comment || '',
                        metadata: review.metadata || {},
                        parentReviewId: review.parentReviewId ? toObjectId(review.parentReviewId, 'budgetReview') : null,
                        visibility: review.visibility || 'submitter_visible'
                    }
                },
                { upsert: true }
            );
        }

        for (const event of budgetWorkflowEvents) {
            const sourceEventKey = String(event.id || event._id || `${event.budgetId || event.budget_id}:${event.toState}:${event.createdAt || ''}`);
            const sourceBudgetKey = String(event.budgetId || event.budget_id);
            const sourceOrgKey = String(event.orgId || event.org_id);
            const eventId = toObjectId(sourceEventKey, 'budgetWorkflowEvent');
            const budgetId = mapping.budgets[sourceBudgetKey]
                ? new mongoose.Types.ObjectId(mapping.budgets[sourceBudgetKey])
                : toObjectId(sourceBudgetKey, 'budget');
            const orgId = mapping.organizations[sourceOrgKey]
                ? new mongoose.Types.ObjectId(mapping.organizations[sourceOrgKey])
                : toObjectId(sourceOrgKey, 'org');
            mapping.budgetWorkflowEvents[sourceEventKey] = String(eventId);

            await OrgBudgetWorkflowEvent.updateOne(
                { _id: eventId },
                {
                    $set: {
                        budget_id: budgetId,
                        org_id: orgId,
                        fromState: event.fromState || null,
                        toState: event.toState || 'draft',
                        eventType: event.eventType || 'state_transition',
                        reason: event.reason || '',
                        actorId: event.actorId ? toObjectId(event.actorId, 'user') : toObjectId('system', 'user'),
                        metadata: event.metadata || {}
                    }
                },
                { upsert: true }
            );
        }

        for (const inventory of inventories) {
            const sourceInventoryKey = String(inventory.id || inventory._id || `${inventory.orgId || inventory.org_id}:${inventory.name}`);
            const sourceOrgKey = String(inventory.orgId || inventory.org_id);
            const inventoryId = toObjectId(sourceInventoryKey, 'inventory');
            const orgId = mapping.organizations[sourceOrgKey]
                ? new mongoose.Types.ObjectId(mapping.organizations[sourceOrgKey])
                : toObjectId(sourceOrgKey, 'org');
            mapping.inventories[sourceInventoryKey] = String(inventoryId);

            await OrgInventory.updateOne(
                { _id: inventoryId },
                {
                    $set: {
                        org_id: orgId,
                        name: inventory.name || `Inventory ${sourceInventoryKey}`,
                        description: inventory.description || '',
                        createdBy: inventory.createdBy ? toObjectId(inventory.createdBy, 'user') : toObjectId('system', 'user'),
                        updatedBy: inventory.updatedBy ? toObjectId(inventory.updatedBy, 'user') : null
                    }
                },
                { upsert: true }
            );
        }

        for (const item of inventoryItems) {
            const sourceItemKey = String(item.id || item._id || `${item.inventoryId || item.inventory_id}:${item.name}`);
            const sourceInventoryKey = String(item.inventoryId || item.inventory_id);
            const sourceOrgKey = String(item.orgId || item.org_id);
            const itemId = toObjectId(sourceItemKey, 'inventoryItem');
            const inventoryId = mapping.inventories[sourceInventoryKey]
                ? new mongoose.Types.ObjectId(mapping.inventories[sourceInventoryKey])
                : toObjectId(sourceInventoryKey, 'inventory');
            const orgId = mapping.organizations[sourceOrgKey]
                ? new mongoose.Types.ObjectId(mapping.organizations[sourceOrgKey])
                : toObjectId(sourceOrgKey, 'org');
            mapping.inventoryItems[sourceItemKey] = String(itemId);

            await OrgInventoryItem.updateOne(
                { _id: itemId },
                {
                    $set: {
                        org_id: orgId,
                        inventory_id: inventoryId,
                        name: item.name || `Item ${sourceItemKey}`,
                        description: item.description || '',
                        quantity: Number(item.quantity || 1),
                        checkedOutQuantity: Number(item.checkedOutQuantity || 0),
                        condition: item.condition || 'good',
                        lifecycleStatus: item.lifecycleStatus || 'active',
                        checkoutHistory: Array.isArray(item.checkoutHistory) ? item.checkoutHistory : [],
                        maintenanceEvents: Array.isArray(item.maintenanceEvents) ? item.maintenanceEvents : []
                    }
                },
                { upsert: true }
            );
        }

        for (const document of governanceDocuments) {
            const sourceDocKey = String(document.id || document._id || `${document.orgId || document.org_id}:${document.documentType}:${document.version || 1}`);
            const sourceOrgKey = String(document.orgId || document.org_id);
            const docId = toObjectId(sourceDocKey, 'governanceDocument');
            const orgId = mapping.organizations[sourceOrgKey]
                ? new mongoose.Types.ObjectId(mapping.organizations[sourceOrgKey])
                : toObjectId(sourceOrgKey, 'org');
            mapping.governanceDocuments[sourceDocKey] = String(docId);

            await OrgGovernanceDocument.updateOne(
                { _id: docId },
                {
                    $set: {
                        org_id: orgId,
                        documentType: document.documentType || 'constitution',
                        title: document.title || 'Migrated governance document',
                        body: document.body || '',
                        status: document.status || 'published',
                        version: Number(document.version || 1),
                        publishedAt: document.publishedAt ? new Date(document.publishedAt) : null,
                        createdBy: document.createdBy ? toObjectId(document.createdBy, 'user') : toObjectId('system', 'user'),
                        updatedBy: document.updatedBy ? toObjectId(document.updatedBy, 'user') : null
                    }
                },
                { upsert: true }
            );
        }
    }

    const mappingPath = path.join(path.dirname(sourcePath), `cms-parity-id-map.${tenant}.json`);
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    console.log(`[cms-migration] id map written: ${mappingPath}`);

    return {
        organizationsProcessed: organizations.length,
        membershipsProcessed: memberships.length,
        budgetsProcessed: budgets.length,
        budgetReviewsProcessed: budgetReviews.length,
        budgetWorkflowEventsProcessed: budgetWorkflowEvents.length,
        inventoriesProcessed: inventories.length,
        inventoryItemsProcessed: inventoryItems.length,
        governanceDocumentsProcessed: governanceDocuments.length,
        mappingPath
    };
}

module.exports = {
    migrateOrganizationsAndMembers,
    toObjectId
};
