/**
 * Per-organization beta feature keys for Club Dash / Atlas UI.
 * Keep keys in sync with Meridian/backend/constants/orgBetaFeatures.js
 */
export const ORG_BETA_FEATURE_ORG_TASKS = 'org_tasks';

export const ORG_BETA_FEATURE_CATALOG = {
    [ORG_BETA_FEATURE_ORG_TASKS]: {
        label: 'Organization task hub',
        description: 'Tasks tab and org-level task hub APIs.',
        clubDashMenuKey: 'tasks'
    }
};

export const ORG_BETA_FEATURE_KEYS = Object.freeze(Object.keys(ORG_BETA_FEATURE_CATALOG));

export function orgHasBetaFeature(overview, featureKey) {
    const keys = overview && overview.betaFeatureKeys;
    if (!Array.isArray(keys)) return false;
    return keys.includes(featureKey);
}
