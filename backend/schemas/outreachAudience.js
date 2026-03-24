const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * OutreachAudience - Saved dynamic audience segment for admin outreach.
 * Stores filter definition only; membership is resolved at send time via studentTargetingService.
 */
const outreachAudienceSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    },
    filterDefinition: {
        type: Schema.Types.Mixed,
        required: true
        // e.g. { logic: 'AND', conditions: [{ field, op, value }] }
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

outreachAudienceSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = outreachAudienceSchema;
