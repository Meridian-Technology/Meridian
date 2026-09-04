const ROLLOUT_VALUES = Object.freeze(['off', 'on']);
const CAPABILITIES = Object.freeze(['reads', 'writes', 'autocomplete', 'search']);
const DEFAULT_RICH_LOCATION_CONTROLS = Object.freeze({
  rollout: 'off',
  reads: false,
  writes: false,
  autocomplete: false,
  search: false,
});

function isJustGoCityTenant(tenant) {
  return Boolean(tenant && (tenant.tenantType === 'pivot' || tenant.pivotPilot === true));
}

function normalizeRichLocationControls(value, options = {}) {
  const sparse = options.sparse === true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return sparse ? undefined : { ...DEFAULT_RICH_LOCATION_CONTROLS };
  }

  const normalized = sparse ? {} : { ...DEFAULT_RICH_LOCATION_CONTROLS };
  if (value.rollout !== undefined && ROLLOUT_VALUES.includes(value.rollout)) {
    normalized.rollout = value.rollout;
  }
  for (const capability of CAPABILITIES) {
    if (value[capability] !== undefined) {
      normalized[capability] = value[capability] === true;
    }
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function validateRichLocationControls(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'richLocationControls must be an object.' };
  }
  if (value.rollout !== undefined && !ROLLOUT_VALUES.includes(value.rollout)) {
    return { error: 'richLocationControls.rollout must be off or on.' };
  }
  for (const capability of CAPABILITIES) {
    if (value[capability] !== undefined && typeof value[capability] !== 'boolean') {
      return { error: `richLocationControls.${capability} must be boolean.` };
    }
  }
  return { controls: normalizeRichLocationControls(value) };
}

function resolveRichLocationControls(tenant) {
  if (!isJustGoCityTenant(tenant)) return { ...DEFAULT_RICH_LOCATION_CONTROLS };
  const controls = normalizeRichLocationControls(tenant.richLocationControls);
  if (controls.rollout !== 'on') return { ...DEFAULT_RICH_LOCATION_CONTROLS };
  return controls;
}

function isRichLocationCapabilityEnabled(tenant, capability) {
  if (!CAPABILITIES.includes(capability)) return false;
  return resolveRichLocationControls(tenant)[capability] === true;
}

module.exports = {
  ROLLOUT_VALUES,
  CAPABILITIES,
  DEFAULT_RICH_LOCATION_CONTROLS,
  isJustGoCityTenant,
  normalizeRichLocationControls,
  validateRichLocationControls,
  resolveRichLocationControls,
  isRichLocationCapabilityEnabled,
};
