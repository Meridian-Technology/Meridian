const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    refreshToken: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    deviceInfo: {
        type: String, // e.g., "iPhone 13", "Chrome on Windows", "Android"
        default: 'Unknown'
    },
    userAgent: {
        type: String,
        default: ''
    },
    ipAddress: {
        type: String,
        default: ''
    },
    clientType: {
        type: String,
        enum: ['web', 'mobile', 'ios', 'android'],
        default: 'web'
    },
    lastUsed: {
        type: Date,
        default: Date.now,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    }
}, {
    timestamps: true
});

// Index for efficient queries
sessionSchema.index({ userId: 1, expiresAt: 1 });
sessionSchema.index({ refreshToken: 1 });
sessionSchema.index({ expiresAt: 1 }); // For cleanup of expired sessions

// Method to check if session is expired
sessionSchema.methods.isExpired = function() {
    return Date.now() > this.expiresAt.getTime();
};

module.exports = sessionSchema;

