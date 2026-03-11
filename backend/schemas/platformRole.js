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
}, {
    timestamps: true,
});

platformRoleSchema.index({ globalUserId: 1 }, { unique: true });

module.exports = platformRoleSchema;
