const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VolunteerSignupSchema = new Schema({
    eventId: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        index: true
    },
    memberId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    roleId: {
        type: Schema.Types.ObjectId,
        ref: 'EventJob',
        required: true,
        index: true
    },
    shiftStart: {
        type: Date,
        required: false
    },
    shiftEnd: {
        type: Date,
        required: false
    },
    breakRequest: {
        startTime: Date,
        endTime: Date,
        reason: String
    },
    availability: [{
        start: Date,
        end: Date
    }],
    checkedIn: {
        type: Boolean,
        default: false
    },
    checkedInAt: {
        type: Date
    },
    checkedOut: {
        type: Boolean,
        default: false
    },
    checkedOutAt: {
        type: Date
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Compound index to prevent duplicate signups
VolunteerSignupSchema.index({ eventId: 1, memberId: 1, roleId: 1 }, { unique: true });
VolunteerSignupSchema.index({ eventId: 1 });
VolunteerSignupSchema.index({ memberId: 1 });
VolunteerSignupSchema.index({ roleId: 1 });

module.exports = VolunteerSignupSchema;
