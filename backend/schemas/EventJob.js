const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Event job assignments (event-specific slots) for staffing.
const EventJobSchema = new Schema({
    orgRoleId: {
        type: Schema.Types.ObjectId,
        ref: 'OrgEventRole',
        required: false,
        index: true
    },
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
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    requiredCount: {
        type: Number,
        required: true,
        default: 1,
        min: 1
    },
    shiftStart: {
        type: Date,
        required: false
    },
    shiftEnd: {
        type: Date,
        required: false
    },
    agendaItemIds: [{
        type: String
    }],
    assignments: [{
        memberId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        status: {
            type: String,
            enum: ['assigned', 'confirmed', 'declined'],
            default: 'assigned'
        },
        notes: {
            type: String,
            trim: true
        },
        assignedAt: {
            type: Date,
            default: Date.now
        },
        confirmedAt: {
            type: Date
        }
    }]
}, {
    timestamps: true
});

// Indexes for efficient queries
EventJobSchema.index({ eventId: 1 });
EventJobSchema.index({ orgId: 1 });
EventJobSchema.index({ 'assignments.memberId': 1 });

module.exports = EventJobSchema;
