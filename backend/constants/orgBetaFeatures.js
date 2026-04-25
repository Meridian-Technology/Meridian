/**
 * Per-organization beta feature registry (server source of truth).
 * Keep keys in sync with Meridian/frontend/src/constants/orgBetaFeatures.js
 */
const ORG_BETA_FEATURE_ORG_TASKS = 'org_tasks';

const ORG_BETA_FEATURE_CATALOG = {
    [ORG_BETA_FEATURE_ORG_TASKS]: {
        label: 'Organization task hub',
        description: 'Cross-event operational tasks and org-level task board in Club Dashboard.',
        clubDashMenuKey: 'tasks'
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
        clubDashMenuKey: ORG_BETA_FEATURE_CATALOG[key].clubDashMenuKey || null
    }));
}

module.exports = {
    ORG_BETA_FEATURE_ORG_TASKS,
    ORG_BETA_FEATURE_KEYS,
    ORG_BETA_FEATURE_CATALOG,
    orgHasBetaFeature,
    validateBetaFeatureKeysArray,
    getBetaFeatureCatalogForApi
};
