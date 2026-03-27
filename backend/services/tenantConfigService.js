const fs = require('fs');
const path = require('path');

const DEFAULT_PROFILE = 'cmsParity';
const CONFIG_CACHE = new Map();

function stripJsonComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function getTenantConfigPath(tenantKey, profile = DEFAULT_PROFILE) {
  return path.join(__dirname, '..', 'config', 'tenants', tenantKey, `${profile}.jsonc`);
}

function assertBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid config: ${field} must be boolean`);
  }
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid config: ${field} must be an object`);
  }
}

function assertArray(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid config: ${field} must be an array`);
  }
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid config: ${field} must be a non-empty string`);
  }
}

function validateParityConfig(config) {
  assertObject(config, 'root');
  assertString(config.profile, 'profile');
  assertObject(config.modules, 'modules');
  assertObject(config.orgLifecycle, 'orgLifecycle');
  assertObject(config.governance, 'governance');
  assertObject(config.finance, 'finance');
  assertObject(config.inventory, 'inventory');
  assertObject(config.reporting, 'reporting');

  assertBoolean(config.modules.governance, 'modules.governance');
  assertBoolean(config.modules.finance, 'modules.finance');
  assertBoolean(config.modules.inventory, 'modules.inventory');
  assertBoolean(config.modules.reporting, 'modules.reporting');

  if (!Array.isArray(config.orgLifecycle.allowedStatuses) || config.orgLifecycle.allowedStatuses.length === 0) {
    throw new Error('Invalid config: orgLifecycle.allowedStatuses must be a non-empty array');
  }
  if (config.orgLifecycle.transitions !== undefined) {
    assertObject(config.orgLifecycle.transitions, 'orgLifecycle.transitions');
    Object.entries(config.orgLifecycle.transitions).forEach(([status, allowedTransitions]) => {
      assertArray(allowedTransitions, `orgLifecycle.transitions.${status}`);
    });
  }
  assertString(config.orgLifecycle.defaultStatus, 'orgLifecycle.defaultStatus');

  assertString(config.governance.documentLabel, 'governance.documentLabel');
  assertBoolean(config.governance.allowVersioning, 'governance.allowVersioning');
  assertBoolean(config.governance.requireApprovalForDocumentPublish, 'governance.requireApprovalForDocumentPublish');
  assertBoolean(config.governance.officerTermsEnabled, 'governance.officerTermsEnabled');
  if (config.governance.documentStatuses !== undefined) {
    assertArray(config.governance.documentStatuses, 'governance.documentStatuses');
  }

  if (!Array.isArray(config.finance.accountingDimensions)) {
    throw new Error('Invalid config: finance.accountingDimensions must be an array');
  }

  if (!Array.isArray(config.finance.workflowStates) || config.finance.workflowStates.length === 0) {
    throw new Error('Invalid config: finance.workflowStates must be a non-empty array');
  }
  if (config.finance.transitions !== undefined) {
    assertObject(config.finance.transitions, 'finance.transitions');
    Object.entries(config.finance.transitions).forEach(([state, allowedTransitions]) => {
      assertArray(allowedTransitions, `finance.transitions.${state}`);
    });
  }
  if (config.finance.reviewActions !== undefined) {
    assertArray(config.finance.reviewActions, 'finance.reviewActions');
  }
  config.finance.accountingDimensions.forEach((dimension, index) => {
    assertObject(dimension, `finance.accountingDimensions[${index}]`);
    assertString(dimension.key, `finance.accountingDimensions[${index}].key`);
    assertString(dimension.label, `finance.accountingDimensions[${index}].label`);
    assertBoolean(dimension.required, `finance.accountingDimensions[${index}].required`);
  });

  assertBoolean(config.inventory.enabled, 'inventory.enabled');
  assertBoolean(config.inventory.allowCheckout, 'inventory.allowCheckout');
  assertBoolean(config.inventory.requireConditionOnReturn, 'inventory.requireConditionOnReturn');
  if (config.inventory.lifecycleStatuses !== undefined) {
    assertArray(config.inventory.lifecycleStatuses, 'inventory.lifecycleStatuses');
  }
  if (config.inventory.conditions !== undefined) {
    assertArray(config.inventory.conditions, 'inventory.conditions');
  }

  if (!Array.isArray(config.reporting.defaultExports)) {
    throw new Error('Invalid config: reporting.defaultExports must be an array');
  }
  if (config.reporting.searchEntities !== undefined) {
    assertArray(config.reporting.searchEntities, 'reporting.searchEntities');
  }
  if (config.reporting.adminSummaryCards !== undefined) {
    assertArray(config.reporting.adminSummaryCards, 'reporting.adminSummaryCards');
  }

  return config;
}

function readAndValidateConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(stripJsonComments(raw));
  return validateParityConfig(parsed);
}

function loadTenantParityConfig(tenantKey, profile = DEFAULT_PROFILE) {
  const configPath = getTenantConfigPath(tenantKey, profile);
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const stats = fs.statSync(configPath);
  const cacheKey = `${tenantKey}:${profile}`;
  const cached = CONFIG_CACHE.get(cacheKey);

  if (cached && cached.mtimeMs === stats.mtimeMs) {
    return cached.config;
  }

  const config = readAndValidateConfig(configPath);
  CONFIG_CACHE.set(cacheKey, {
    mtimeMs: stats.mtimeMs,
    config,
  });

  return config;
}

function getTenantParityConfig(req, profile = DEFAULT_PROFILE) {
  const tenantKey = req.school || 'rpi';

  let config = loadTenantParityConfig(tenantKey, profile);
  if (config) {
    return config;
  }

  config = loadTenantParityConfig('default', profile);
  if (config) {
    return config;
  }

  throw new Error(`No parity configuration found for tenant "${tenantKey}"`);
}

module.exports = {
  getTenantParityConfig,
  loadTenantParityConfig,
  validateParityConfig,
};
