const {
  DEFINITION_KEY_PATTERN,
  MAX_TRIGGER_CONFIG_BYTES,
} = require('../schemas/meridianNotificationDefinition');
const { validateThirtyMinuteCron } = require('./meridianNotificationCron');

function cloneTriggerConfig(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function boundedByteLength(value) {
  if (value == null) return 0;
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function optionalCopy(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeOverrideRow(row = {}) {
  const definitionKey = String(row.definitionKey || '').trim().toLowerCase();
  if (!DEFINITION_KEY_PATTERN.test(definitionKey)) return null;

  const out = { definitionKey };
  if (row.enabled !== undefined) out.enabled = row.enabled === true;
  if (row.scheduleCron !== undefined) {
    const cron = validateThirtyMinuteCron(row.scheduleCron);
    if (cron.error) return null;
    out.scheduleCron = cron.normalized;
  }
  if (row.copyTitleKey !== undefined) out.copyTitleKey = optionalCopy(row.copyTitleKey);
  if (row.copyBodyKey !== undefined) out.copyBodyKey = optionalCopy(row.copyBodyKey);
  if (row.copyTitleFallback !== undefined) {
    out.copyTitleFallback = optionalCopy(row.copyTitleFallback);
  }
  if (row.copyBodyFallback !== undefined) {
    out.copyBodyFallback = optionalCopy(row.copyBodyFallback);
  }
  if (row.triggerConfig !== undefined) {
    const config = cloneTriggerConfig(row.triggerConfig);
    if (boundedByteLength(config) > MAX_TRIGGER_CONFIG_BYTES) return null;
    out.triggerConfig = config;
  }
  if (row.rules !== undefined) {
    if (!Array.isArray(row.rules)) return null;
    let rules;
    try {
      rules = JSON.parse(JSON.stringify(row.rules));
    } catch {
      return null;
    }
    if (!Array.isArray(rules) || boundedByteLength(rules) > MAX_TRIGGER_CONFIG_BYTES) return null;
    out.rules = rules;
  }
  return out;
}

function normalizeMeridianNotificationOverrides(rows = []) {
  if (!Array.isArray(rows)) return undefined;
  const byKey = new Map();
  rows.forEach((row) => {
    const normalized = normalizeOverrideRow(row);
    if (normalized) byKey.set(normalized.definitionKey, normalized);
  });
  const list = Array.from(byKey.values());
  return list.length > 0 ? list : undefined;
}

function validateMeridianNotificationOverridesPatch(rows) {
  if (rows === undefined) return { ok: true };
  if (rows === null) return { ok: true, patch: [] };
  if (!Array.isArray(rows)) {
    return { error: 'meridianNotificationOverrides must be an array' };
  }
  const normalized = [];
  for (const row of rows) {
    const next = normalizeOverrideRow(row);
    if (!next) {
      return {
        error: 'Invalid meridianNotificationOverrides row (definitionKey and 30-minute cron required)',
      };
    }
    normalized.push(next);
  }
  return { ok: true, patch: normalized };
}

module.exports = {
  cloneTriggerConfig,
  optionalCopy,
  normalizeOverrideRow,
  normalizeMeridianNotificationOverrides,
  validateMeridianNotificationOverridesPatch,
};
