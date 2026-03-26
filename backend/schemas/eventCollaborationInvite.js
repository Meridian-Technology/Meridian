const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EVENT_COLLAB_INVITE_EXPIRY_DAYS = 7;

const eventCollaborationInviteSchema = new mongoose.Schema({
    eventId: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        index: true
    },
    hostOrgId: {
        type: Schema.Types.ObjectId,
        ref: 'Org',
        required: true,
        index: true
    },
    collaboratorOrgId: {
        type: Schema.Types.ObjectId,
        ref: 'Org',
        required: true,
        index: true
    },
    invitedByUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'resolved'],
        default: 'pending',
        index: true
    },
    respondedAt: {
        type: Date,
        default: null
    },
    acceptedByUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    declinedByUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + EVENT_COLLAB_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        index: true
    }
}, {
    timestamps: true
});

// One pending/active invite document per collaborating org per event
eventCollaborationInviteSchema.index(
    { eventId: 1, collaboratorOrgId: 1 },
    { unique: true }
);

module.exports = eventCollaborationInviteSchema;
