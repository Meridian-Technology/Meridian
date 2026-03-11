const mongoose = require('mongoose');

/**
 * Session stored in global DB, keyed by globalUserId.
 * Used for SSO refresh across tenants.
 */
const globalSessionSchema = new mongoose.Schema({
    globalUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GlobalUser',
        required: true,
        index: true,
    },
    refreshToken: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    deviceInfo: {
        type: String,
        default: 'Unknown',
    },
    userAgent: {
        type: String,
        default: '',
    },
    ipAddress: {
        type: String,
        default: '',
    },
    clientType: {
        type: String,
        enum: ['web', 'mobile', 'ios', 'android'],
        default: 'web',
    },
    lastUsed: {
        type: Date,
        default: Date.now,
        index: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true,
    },
}, {
    timestamps: true,
});

globalSessionSchema.index({ globalUserId: 1, expiresAt: 1 });
globalSessionSchema.index({ refreshToken: 1 });
globalSessionSchema.index({ expiresAt: 1 });

globalSessionSchema.methods.isExpired = function () {
    return Date.now() > this.expiresAt.getTime();
};

module.exports = globalSessionSchema;
