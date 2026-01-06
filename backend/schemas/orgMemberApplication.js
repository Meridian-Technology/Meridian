const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orgMemberApplicationSchema = new Schema({
    org_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Org'
    },
    user_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    reason: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    formResponse: {
        type:Schema.Types.ObjectId,
        ref: 'FormResponse',
        required: false,
    },
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    approvedAt: {
        type: Date,
        required: false
    }
})

module.exports = orgMemberApplicationSchema;