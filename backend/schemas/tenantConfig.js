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
