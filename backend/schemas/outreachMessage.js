const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * OutreachMessage - Admin outreach message (school-wide).
 * Linked to an audience or inline filter; status drives send flow.
 */
const outreachMessageSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 300
    },
    subject: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ''
    },
    body: {
        type: String,
        required: true
        // plain or HTML; max length can be enforced in validation if needed
    },
    channels: [{
        type: String,
        enum: ['email', 'in_app'],
        default: ['in_app']
    }],
    audienceId: {
        type: Schema.Types.ObjectId,
        ref: 'OutreachAudience',
        default: null,
        index: true
    },
    filterDefinition: {
        type: Schema.Types.Mixed,
        default: null
        // Inline filter when not using a saved audience
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sent'],
        default: 'draft',
        index: true
    },
    scheduledAt: {
        type: Date,
        default: null
    },
    sentAt: {
        type: Date,
        default: null
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

outreachMessageSchema.index({ createdBy: 1, createdAt: -1 });
outreachMessageSchema.index({ status: 1, scheduledAt: 1 });

module.exports = outreachMessageSchema;
