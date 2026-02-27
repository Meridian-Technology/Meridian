const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * OutreachReceipt - Per-recipient delivery and engagement for an outreach message.
 * One document per (messageId, userId).
 */
const outreachReceiptSchema = new Schema({
    messageId: {
        type: Schema.Types.ObjectId,
        ref: 'OutreachMessage',
        required: true,
        index: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    emailPlanned: {
        type: Boolean,
        default: false
    },
    emailSentAt: {
        type: Date,
        default: null
    },
    emailStatus: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'bounced'],
        default: 'pending'
    },
    seenAt: {
        type: Date,
        default: null
    },
    openedAt: {
        type: Date,
        default: null
    },
    clickedAt: {
        type: Date,
        default: null
    },
    clickCount: {
        type: Number,
        default: 0,
        min: 0
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

outreachReceiptSchema.index({ messageId: 1, userId: 1 }, { unique: true });
outreachReceiptSchema.index({ userId: 1, createdAt: -1 });

module.exports = outreachReceiptSchema;
