const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const eventTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: false
    },
    orgId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Org'
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    templateData: {
        type: {
            name: String,
            type: String,
            location: String,
            description: String,
            expectedAttendance: Number,
            visibility: String,
            contact: String,
            rsvpEnabled: Boolean,
            rsvpRequired: Boolean,
            maxAttendees: Number,
            externalLink: String
        },
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsed: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient queries
eventTemplateSchema.index({ orgId: 1, isActive: 1 });
eventTemplateSchema.index({ createdBy: 1 });

module.exports = mongoose.model('EventTemplate', eventTemplateSchema);
