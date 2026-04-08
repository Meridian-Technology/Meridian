const DEFAULT_ATLAS_POLICY = {
    lifecycle: {
        statuses: [
            { key: 'active', label: 'Active' },
            { key: 'sunset', label: 'Sunset' },
            { key: 'inactive', label: 'Inactive' }
        ],
        defaultStatus: 'active',
        transitions: [
            { from: 'active', to: 'sunset', allowedActors: ['admin', 'root', 'officer'] },
            { from: 'sunset', to: 'inactive', allowedActors: ['admin', 'root'] },
            { from: 'sunset', to: 'active', allowedActors: ['admin', 'root', 'officer'] },
            { from: 'inactive', to: 'active', allowedActors: ['admin', 'root'] }
        ]
    },
    orgTypes: [
        { key: 'default', displayName: 'General', requiredGovernanceKeys: ['constitution'] },
        { key: 'club', displayName: 'Club', requiredGovernanceKeys: ['constitution'] }
    ],
    defaultOrgTypeKey: 'default',
    terminology: {
        constitution: 'Constitution',
        charter: 'Charter',
        bylaws: 'Bylaws',
        member_list: 'Member list',
        financial_statement: 'Financial statement'
    },
    directory: {
        hideNonActiveFromPublicList: false,
        nonActiveStatuses: ['inactive']
    },
    events: {
        inactiveOrgBlocksEventCreation: true,
        /** lifecycleStatus values that block creating new org events when policy enabled */
        blockedLifecycleStatuses: ['inactive', 'sunset']
    }
};

function deepMergeAtlasPolicy(stored) {
    const base = JSON.parse(JSON.stringify(DEFAULT_ATLAS_POLICY));
    if (!stored || typeof stored !== 'object') return base;
    return {
        lifecycle: { ...base.lifecycle, ...(stored.lifecycle || {}) },
        orgTypes: Array.isArray(stored.orgTypes) && stored.orgTypes.length > 0
            ? stored.orgTypes
            : base.orgTypes,
        defaultOrgTypeKey: stored.defaultOrgTypeKey || base.defaultOrgTypeKey,
        terminology: { ...base.terminology, ...(stored.terminology || {}) },
        directory: { ...base.directory, ...(stored.directory || {}) },
        events: { ...base.events, ...(stored.events || {}) }
    };
}

/**
 * Merge transitions and statuses from stored policy without losing defaults entirely
 */
function getEffectivePolicyFromConfig(configDoc) {
    const raw = configDoc?.atlasPolicy;
    const merged = deepMergeAtlasPolicy(raw);
    if (raw?.lifecycle?.transitions?.length) {
        merged.lifecycle.transitions = raw.lifecycle.transitions;
    }
    if (raw?.lifecycle?.statuses?.length) {
        merged.lifecycle.statuses = raw.lifecycle.statuses;
    }
    if (raw?.lifecycle?.defaultStatus) {
        merged.lifecycle.defaultStatus = raw.lifecycle.defaultStatus;
    }
    return merged;
}

async function getEffectivePolicy(req) {
    const getModels = require('./getModelService');
    const { OrgManagementConfig } = getModels(req, 'OrgManagementConfig');
    const config = await OrgManagementConfig.findOne();
    return getEffectivePolicyFromConfig(config);
}

function statusKeys(policy) {
    const statuses = policy?.lifecycle?.statuses || DEFAULT_ATLAS_POLICY.lifecycle.statuses;
    return new Set(statuses.map((s) => s.key));
}

function assertLifecycleTransition(policy, org, toStatus, actor) {
    const keys = statusKeys(policy);
    if (!keys.has(toStatus)) {
        const err = new Error(`Invalid lifecycle status: ${toStatus}`);
        err.statusCode = 400;
        throw err;
    }
    const fromStatus = org.lifecycleStatus || policy.lifecycle.defaultStatus || 'active';
    if (fromStatus === toStatus) {
        return;
    }
    const transitions = policy?.lifecycle?.transitions || [];
    const match = transitions.find((t) => t.from === fromStatus && t.to === toStatus);
    if (!match) {
        const err = new Error(`Transition from "${fromStatus}" to "${toStatus}" is not allowed`);
        err.statusCode = 400;
        throw err;
    }
    const allowed = match.allowedActors || ['admin', 'root'];
    if (actor.isPlatformAdmin) {
        return;
    }
    if (actor.isOfficer && allowed.includes('officer')) {
        return;
    }
    const err = new Error('You are not allowed to perform this lifecycle transition');
    err.statusCode = 403;
    throw err;
}

function governanceRequirementsForOrg(policy, org) {
    const key = org.orgTypeKey || policy.defaultOrgTypeKey || 'default';
    const orgType = (policy.orgTypes || []).find((t) => t.key === key);
    if (orgType?.requiredGovernanceKeys?.length) {
        return orgType.requiredGovernanceKeys;
    }
    const fallback = (policy.orgTypes || []).find((t) => t.key === policy.defaultOrgTypeKey);
    return fallback?.requiredGovernanceKeys || ['constitution'];
}

function shouldHideOrgFromPublicList(policy, org) {
    if (!policy?.directory?.hideNonActiveFromPublicList) return false;
    const nonActive = policy.directory.nonActiveStatuses || ['inactive'];
    const status = org.lifecycleStatus || policy.lifecycle?.defaultStatus || 'active';
    return nonActive.includes(status);
}

function assertOrgAllowsEventCreation(policy, org) {
    if (!policy?.events?.inactiveOrgBlocksEventCreation) {
        return { ok: true };
    }
    const blocked = policy.events.blockedLifecycleStatuses || ['inactive', 'sunset'];
    const status = org.lifecycleStatus || policy.lifecycle?.defaultStatus || 'active';
    if (blocked.includes(status)) {
        return {
            ok: false,
            message: `This organization cannot create events while lifecycle status is "${status}".`
        };
    }
    return { ok: true };
}

function assertEventReservationReady(event, options = {}) {
    const required = options.required !== false;
    const resourceId = event?.reservation?.resourceId || event?.classroom_id || null;
    if (!required || !resourceId) return { ok: true };
    const state = event?.reservation?.state || 'draft';
    const allowedStates = options.allowedStates || ['approved', 'requested', 'hold'];
    if (!allowedStates.includes(state)) {
        return {
            ok: false,
            message: `This event cannot proceed while reservation state is "${state}".`,
            code: 'EVENT_RESERVATION_NOT_READY',
            state
        };
    }
    if (event?.reservation?.conflictSummary?.hasConflict) {
        return {
            ok: false,
            message: event.reservation.conflictSummary.reason || 'This event has unresolved reservation conflicts.',
            code: 'EVENT_RESERVATION_CONFLICT',
            state
        };
    }
    return { ok: true, state };
}

function labelForGovernanceKey(policy, key) {
    const t = policy?.terminology || {};
    return t[key] || key;
}

module.exports = {
    DEFAULT_ATLAS_POLICY,
    deepMergeAtlasPolicy,
    getEffectivePolicyFromConfig,
    getEffectivePolicy,
    assertLifecycleTransition,
    governanceRequirementsForOrg,
    shouldHideOrgFromPublicList,
    assertOrgAllowsEventCreation,
    assertEventReservationReady,
    labelForGovernanceKey,
    statusKeys
};
