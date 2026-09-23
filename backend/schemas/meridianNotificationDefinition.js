const mongoose = require('mongoose');
const { validateThirtyMinuteCron } = require('../utilities/meridianNotificationCron');
const { validateRules } = require('../utilities/meridianNotificationRules');

const MERIDIAN_NOTIFICATION_DEFINITION_INDEX_NAMES = Object.freeze([
  'meridian_notification_definition_key_tenant_unique',
  'meridian_notification_definition_enabled_handler',
]);

const MAX_TRIGGER_CONFIG_BYTES = 16 * 1024;
const DEFINITION_KEY_PATTERN = /^[a-z][a-z0-9_]{1,127}$/;

function boundedByteLength(value) {
  if (value == null) return 0;
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function normalizeOptionalKey(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeTenantKey(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

const meridianNotificationDefinitionSchema = new mongoose.Schema(
  {
    definitionKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 128,
    },
    handlerKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    tenantKey: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      maxlength: 64,
    },
    enabled: { type: Boolean, default: true },
    scheduleCron: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    copyTitleKey: { type: String, default: null, trim: true, maxlength: 128 },
    copyBodyKey: { type: String, default: null, trim: true, maxlength: 128 },
    copyTitleFallback: { type: String, default: null, trim: true, maxlength: 100 },
    copyBodyFallback: { type: String, default: null, trim: true, maxlength: 240 },
    triggerConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
    rules: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true, autoIndex: false },
);

meridianNotificationDefinitionSchema.pre('validate', function normalizeDefinition() {
  this.definitionKey = String(this.definitionKey || '').trim().toLowerCase();
  this.handlerKey = String(this.handlerKey || '').trim();
  this.tenantKey = normalizeTenantKey(this.tenantKey);
  this.copyTitleKey = normalizeOptionalKey(this.copyTitleKey);
  this.copyBodyKey = normalizeOptionalKey(this.copyBodyKey);
  this.copyTitleFallback = normalizeOptionalKey(this.copyTitleFallback);
  this.copyBodyFallback = normalizeOptionalKey(this.copyBodyFallback);
  if (this.triggerConfig == null || typeof this.triggerConfig !== 'object' || Array.isArray(this.triggerConfig)) {
    this.triggerConfig = {};
  }

  if (!DEFINITION_KEY_PATTERN.test(this.definitionKey)) {
    this.invalidate(
      'definitionKey',
      'definitionKey must be 2–128 chars, start with a letter, and use lowercase letters, digits, or underscore',
    );
  }

  const cron = validateThirtyMinuteCron(this.scheduleCron);
  if (cron.error) {
    this.invalidate('scheduleCron', cron.error);
  } else {
    this.scheduleCron = cron.normalized;
  }

  if (boundedByteLength(this.triggerConfig) > MAX_TRIGGER_CONFIG_BYTES) {
    this.invalidate('triggerConfig', `triggerConfig exceeds ${MAX_TRIGGER_CONFIG_BYTES} bytes`);
  }

  if (this.rules != null) {
    const rules = validateRules(this.handlerKey, this.rules);
    if (rules.error) {
      this.invalidate('rules', rules.error);
    } else {
      this.rules = rules.rules;
    }
    if (boundedByteLength(this.rules) > MAX_TRIGGER_CONFIG_BYTES) {
      this.invalidate('rules', `rules exceed ${MAX_TRIGGER_CONFIG_BYTES} bytes`);
    }
  }
});

meridianNotificationDefinitionSchema.index(
  { definitionKey: 1, tenantKey: 1 },
  { unique: true, name: MERIDIAN_NOTIFICATION_DEFINITION_INDEX_NAMES[0] },
);
meridianNotificationDefinitionSchema.index(
  { enabled: 1, handlerKey: 1 },
  { name: MERIDIAN_NOTIFICATION_DEFINITION_INDEX_NAMES[1] },
);

module.exports = meridianNotificationDefinitionSchema;
module.exports.MERIDIAN_NOTIFICATION_DEFINITION_INDEX_NAMES =
  MERIDIAN_NOTIFICATION_DEFINITION_INDEX_NAMES;
module.exports.MAX_TRIGGER_CONFIG_BYTES = MAX_TRIGGER_CONFIG_BYTES;
module.exports.DEFINITION_KEY_PATTERN = DEFINITION_KEY_PATTERN;
