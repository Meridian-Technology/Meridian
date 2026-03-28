const mongoose = require('mongoose');

const platformRoleSchema = new mongoose.Schema({
    globalUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GlobalUser',
        required: true,
        unique: true,
    },
    roles: {
        type: [String],
        default: [],
        enum: ['platform_admin', 'root'],
    },
    tenantPermissions: {
        type: [{
            tenantKey: {
                type: String,
                required: true,
                trim: true,
                lowercase: true
            },
            permissions: {
                type: [String],
                default: []
            },
            updatedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'GlobalUser',
                default: null
            },
            updatedAt: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    }
}, {
    timestamps: true,
});

platformRoleSchema.index({ globalUserId: 1 }, { unique: true });

module.exports = platformRoleSchema;
