const mongoose = require('mongoose');

const verificationRequestSchema = new mongoose.Schema({
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Org',
        required: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'conditionally_approved', 'under_review', 'escalated'],
        default: 'pending'
    },
    verificationType: {
        type: String,
        enum: ['basic', 'premium', 'gold', 'platinum', 'official', 'academic', 'cultural', 'sports', 'professional'],
        default: 'basic'
    },
    requestType: {
        type: String,
        enum: ['verification', 'feature_access', 'funding', 'space_reservation', 'event_approval', 'status_upgrade'],
        required: true
    },
    requestData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: Date,
    reviewNotes: String,
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    tags: [String],
    attachments: [{
        filename: String,
        url: String,
        uploadedAt: Date
    }]
}, { timestamps: true });

// Index for efficient queries
// verificationRequestSchema.index({ orgId: 1, status: 1 });
// verificationRequestSchema.index({ status: 1, priority: 1 });
// verificationRequestSchema.index({ requestedBy: 1 });

module.exports = verificationRequestSchema;
