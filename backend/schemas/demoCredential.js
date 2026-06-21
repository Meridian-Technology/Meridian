const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const demoCredentialSchema = new Schema({
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    label: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed, default: {} },
}, { collection: 'demo_credentials', timestamps: false });

demoCredentialSchema.index({ revokedAt: 1 });
demoCredentialSchema.index({ expiresAt: 1 });

module.exports = demoCredentialSchema;
