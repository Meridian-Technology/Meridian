const mongoose = require('mongoose');

const FORMATS = Object.freeze(['city-picks', 'sorry-you-missed-it']);

/**
 * An editorial account: a publishing identity, not a login or a tenant database.
 * The owner tenant is the Pivot city the existing export path still routes through.
 */
const pivotCarouselAccountSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    handle: { type: String, default: null, trim: true, maxlength: 40 },
    ownerTenantKey: { type: String, required: true, trim: true, lowercase: true },
    sourceTenantKeys: {
      type: [String],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0 && value.length <= 32;
        },
        message: 'An account needs at least one source tenant.',
      },
    },
    voice: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    defaultFormat: { type: String, enum: FORMATS, default: 'city-picks' },
    createdBy: { type: String, default: null, trim: true },
    updatedBy: { type: String, default: null, trim: true },
    migrationKey: { type: String, default: null },
  },
  { timestamps: true },
);

pivotCarouselAccountSchema.pre('validate', function normalizeFields() {
  if (this.ownerTenantKey) {
    this.ownerTenantKey = String(this.ownerTenantKey).trim().toLowerCase();
  }
  if (Array.isArray(this.sourceTenantKeys)) {
    this.sourceTenantKeys = this.sourceTenantKeys.map((key) => String(key).trim().toLowerCase());
  }
});

pivotCarouselAccountSchema.index({ ownerTenantKey: 1, updatedAt: -1 });
pivotCarouselAccountSchema.index({ migrationKey: 1 }, { unique: true, sparse: true });

module.exports = pivotCarouselAccountSchema;
module.exports.FORMATS = FORMATS;
