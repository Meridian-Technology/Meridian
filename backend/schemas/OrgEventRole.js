const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrgEventRoleSchema = new Schema({
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
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

OrgEventRoleSchema.index({ orgId: 1, name: 1 }, { unique: true });

module.exports = OrgEventRoleSchema;
