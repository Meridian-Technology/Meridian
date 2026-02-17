const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

const orgInviteSchema = new Schema({
    org_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Org'
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        default: null
    },
    role: {
        type: String,
        required: true,
        default: 'member'
    },
    invited_by: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'expired'],
        default: 'pending'
    },
    token: {
        type: String,
        required: true,
        unique: true
    },
    expires_at: {
        type: Date,
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

orgInviteSchema.index({ org_id: 1, email: 1 });
orgInviteSchema.index({ token: 1 });
orgInviteSchema.index({ user_id: 1, status: 1 });
orgInviteSchema.index({ org_id: 1, status: 1 });

orgInviteSchema.statics.generateToken = function () {
    return crypto.randomBytes(32).toString('hex');
};

module.exports = orgInviteSchema;
