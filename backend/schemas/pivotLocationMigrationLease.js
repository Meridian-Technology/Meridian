const mongoose = require('mongoose');

/**
 * Short-lived cross-process lease for the temporary rich-location migration UI.
 * A separate collection keeps dry runs from mutating the durable backfill audit.
 */
const pivotLocationMigrationLeaseSchema = new mongoose.Schema(
  {
    tenantKey: { type: String, required: true, trim: true, lowercase: true },
    scope: { type: String, required: true, enum: ['live', 'historical'] },
    leaseId: { type: String, required: true },
    actor: { type: String, default: null, trim: true },
    acquiredAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

pivotLocationMigrationLeaseSchema.index(
  { tenantKey: 1, scope: 1 },
  { unique: true, name: 'tenantKey_scope_unique' },
);
pivotLocationMigrationLeaseSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'expiresAt_ttl' },
);

module.exports = pivotLocationMigrationLeaseSchema;
