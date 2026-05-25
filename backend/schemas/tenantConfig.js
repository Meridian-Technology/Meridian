const mongoose = require('mongoose');

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
