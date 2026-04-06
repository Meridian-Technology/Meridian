const mongoose = require('mongoose');

const tenantOnboardingConfigSchema = new mongoose.Schema(
  {
    configKey: { type: String, required: true, unique: true, default: 'default' },
    steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = tenantOnboardingConfigSchema;
