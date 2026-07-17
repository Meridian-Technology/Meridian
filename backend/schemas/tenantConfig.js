const mongoose = require('mongoose');

const pivotDropOverrideSchema = new mongoose.Schema(
  {
    batchWeek: { type: String, required: true, trim: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    hour: { type: Number, required: true, min: 0, max: 23 },
    minute: { type: Number, default: 0, min: 0, max: 59 },
    pushTitle: { type: String, default: null, trim: true, maxlength: 100 },
    pushBody: { type: String, default: null, trim: true, maxlength: 240 },
  },
  { _id: false }
);

const tenantEntrySchema = new mongoose.Schema(
  {
    tenantKey: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    subdomain: { type: String, required: true, trim: true, lowercase: true },
    location: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['active', 'coming_soon', 'maintenance', 'hidden'],
      default: 'active',
    },
    statusMessage: { type: String, default: '', trim: true, maxlength: 240 },
    tenantType: {
      type: String,
      enum: ['campus', 'pivot'],
      default: 'campus',
    },
    pivotPilot: { type: Boolean, default: false },
    mongoUri: { type: String, default: null, trim: true },
    mongoDatabaseName: { type: String, default: null, trim: true, lowercase: true },
    pivotCatalogOrgId: { type: String, default: null, trim: true },
    pivotDropTimezone: { type: String, default: null, trim: true },
    pivotDropDayOfWeek: { type: Number, default: null, min: 0, max: 6 },
    pivotDropHour: { type: Number, default: null, min: 0, max: 23 },
    pivotDropMinute: { type: Number, default: 0, min: 0, max: 59 },
    pivotDropPushTitle: { type: String, default: null, trim: true, maxlength: 100 },
    pivotDropPushBody: { type: String, default: null, trim: true, maxlength: 240 },
    pivotDropOverrides: { type: [pivotDropOverrideSchema], default: undefined },
    provisioningConfirmations: {
      dns: { type: Boolean, default: false },
      cors: { type: Boolean, default: false },
      pickerVerified: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const tenantConfigSchema = new mongoose.Schema(
  {
    configKey: { type: String, required: true, unique: true, default: 'default' },
    tenants: { type: [tenantEntrySchema], default: [] },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = tenantConfigSchema;
