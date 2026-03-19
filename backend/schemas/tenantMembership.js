const mongoose = require('mongoose');

const tenantMembershipSchema = new mongoose.Schema({
    globalUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GlobalUser',
        required: true,
    },
    tenantKey: {
        type: String,
        required: true,
        trim: true,
    },
    tenantUserId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        // No ref - points to User in tenant DB, cross-DB ref not used
    },
    status: {
        type: String,
        enum: ['active', 'invited', 'left'],
        default: 'active',
    },
}, {
    timestamps: true,
});

tenantMembershipSchema.index({ globalUserId: 1, tenantKey: 1 }, { unique: true });
tenantMembershipSchema.index({ tenantKey: 1, tenantUserId: 1 });

module.exports = tenantMembershipSchema;
