/**
 * Per-organization beta feature keys for Club Dash / Atlas UI.
 * Keep keys in sync with Meridian/backend/constants/orgBetaFeatures.js
 */
export const ORG_BETA_FEATURE_ORG_TASKS = 'org_tasks';
export const ORG_BETA_FEATURE_ORG_BUDGETING = 'org_budgeting';
export const ORG_BETA_FEATURE_ORG_GOVERNANCE = 'org_governance';
export const ORG_BETA_FEATURE_ORG_LIFECYCLE = 'org_lifecycle';
export const ORG_BETA_FEATURE_ORG_VERIFICATION_REQUESTS = 'org_verification_requests';
export const ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON = 'coming_soon';
export const ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE = 'hide';

export const ORG_BETA_FEATURE_CATALOG = {
    [ORG_BETA_FEATURE_ORG_TASKS]: {
        label: 'Organization task hub',
        description: 'Tasks tab and org-level task hub APIs.',
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

export const ORG_BETA_FEATURE_KEYS = Object.freeze(Object.keys(ORG_BETA_FEATURE_CATALOG));

export function orgHasBetaFeature(overview, featureKey) {
    const keys = overview && overview.betaFeatureKeys;
    if (!Array.isArray(keys)) return false;
    return keys.includes(featureKey);
}
