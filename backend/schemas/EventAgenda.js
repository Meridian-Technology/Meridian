const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EventAgendaSchema = new Schema({
    eventId: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        index: true
    },
    orgId: {
        type: Schema.Types.ObjectId,
        ref: 'Org',
        required: true,
        index: true
    },
    items: [{
        id: {
            type: String,
            required: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        startTime: {
            type: Date,
            required: false
        },
        endTime: {
            type: Date,
            required: false
        },
        type: {
            type: String,
            enum: ['Activity', 'Break', 'Setup', 'Breakdown', 'Transition', 'Speaker', 'Custom'],
            default: 'Activity'
        },
        location: {
            type: String,
            trim: true
        },
        assignedRoles: [{
            type: Schema.Types.ObjectId,
            ref: 'EventJob'
        }],
        isPublic: {
            type: Boolean,
            default: true
        },
        order: {
            type: Number,
            default: 0
        }
    }],
    publicNotes: {
        type: String,
        trim: true
    },
    internalNotes: {
        type: String,
        trim: true
    },
    isPublished: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
EventAgendaSchema.index({ eventId: 1 });
EventAgendaSchema.index({ orgId: 1 });

module.exports = EventAgendaSchema;
