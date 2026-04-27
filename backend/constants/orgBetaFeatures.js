/**
 * Per-organization beta feature registry (server source of truth).
 * Keep keys in sync with Meridian/frontend/src/constants/orgBetaFeatures.js
 */
const ORG_BETA_FEATURE_ORG_TASKS = 'org_tasks';
const ORG_BETA_FEATURE_ORG_BUDGETING = 'org_budgeting';
const ORG_BETA_FEATURE_ORG_GOVERNANCE = 'org_governance';
const ORG_BETA_FEATURE_ORG_LIFECYCLE = 'org_lifecycle';
const ORG_BETA_FEATURE_ORG_VERIFICATION_REQUESTS = 'org_verification_requests';
const ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON = 'coming_soon';

const ORG_BETA_FEATURE_CATALOG = {
    [ORG_BETA_FEATURE_ORG_TASKS]: {
        label: 'Organization task hub',
        description: 'Cross-event operational tasks and org-level task board in Club Dashboard.',
        clubDashMenuKey: 'tasks',
        disabledMenuBehavior: ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON
    },
    [ORG_BETA_FEATURE_ORG_BUDGETING]: {
        label: 'Budgeting',
        description: 'Budgets page inside club settings.',
        clubDashMenuKey: 'settings.budgets',
        disabledMenuBehavior: ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON
    },
    [ORG_BETA_FEATURE_ORG_GOVERNANCE]: {
        label: 'Governance',
        description: 'Governance page inside club settings.',
        clubDashMenuKey: 'settings.governance',
        disabledMenuBehavior: ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON
    },
    [ORG_BETA_FEATURE_ORG_LIFECYCLE]: {
        label: 'Life cycle',
        description: 'Lifecycle page inside club settings.',
        clubDashMenuKey: 'settings.lifecycle',
        disabledMenuBehavior: ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON
    },
    [ORG_BETA_FEATURE_ORG_VERIFICATION_REQUESTS]: {
        label: 'Verification requests',
        description: 'Verification requests page inside club settings.',
        clubDashMenuKey: 'settings.verification_requests',
        disabledMenuBehavior: ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON
    }
};

const ORG_BETA_FEATURE_KEYS = Object.freeze(Object.keys(ORG_BETA_FEATURE_CATALOG));

function orgHasBetaFeature(org, featureKey) {
    const keys = org && org.betaFeatureKeys;
    if (!Array.isArray(keys)) return false;
    return keys.includes(featureKey);
}

/**
 * @param {unknown} keys
 * @returns {{ ok: true, keys: string[] } | { ok: false, error: string }}
 */
function validateBetaFeatureKeysArray(keys) {
    if (!Array.isArray(keys)) {
        return { ok: false, error: 'enabledKeys must be an array' };
    }
    const invalid = keys.filter((k) => typeof k !== 'string' || !ORG_BETA_FEATURE_KEYS.includes(k));
    if (invalid.length) {
        return { ok: false, error: `Unknown beta feature keys: ${invalid.join(', ')}` };
    }
    const unique = [...new Set(keys)];
    return { ok: true, keys: unique };
}

function getBetaFeatureCatalogForApi() {
    return ORG_BETA_FEATURE_KEYS.map((key) => ({
        key,
        label: ORG_BETA_FEATURE_CATALOG[key].label,
        description: ORG_BETA_FEATURE_CATALOG[key].description,
        clubDashMenuKey: ORG_BETA_FEATURE_CATALOG[key].clubDashMenuKey || null,
        disabledMenuBehavior:
            ORG_BETA_FEATURE_CATALOG[key].disabledMenuBehavior || ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON
    }));
}

module.exports = {
    ORG_BETA_FEATURE_ORG_TASKS,
    ORG_BETA_FEATURE_ORG_BUDGETING,
    ORG_BETA_FEATURE_ORG_GOVERNANCE,
    ORG_BETA_FEATURE_ORG_LIFECYCLE,
    ORG_BETA_FEATURE_ORG_VERIFICATION_REQUESTS,
    ORG_BETA_FEATURE_KEYS,
    ORG_BETA_FEATURE_CATALOG,
    orgHasBetaFeature,
    validateBetaFeatureKeysArray,
    getBetaFeatureCatalogForApi
};
