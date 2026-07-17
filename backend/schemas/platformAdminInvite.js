const mongoose = require('mongoose');

const PLATFORM_ADMIN_INVITE_STATUSES = [
  'pending_signup',
  'ready_for_approval',
  'approved',
  'revoked',
];

const platformAdminInviteSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      required: true,
      enum: PLATFORM_ADMIN_INVITE_STATUSES,
      default: 'pending_signup',
    },
    globalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: false,
      default: null,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
    },
    approvedAt: {
      type: Date,
      required: false,
      default: null,
    },
    revokedAt: {
      type: Date,
      required: false,
      default: null,
    },
  },
  { timestamps: true },
);

platformAdminInviteSchema.index({ email: 1 });
platformAdminInviteSchema.index({ status: 1, email: 1 });

module.exports = platformAdminInviteSchema;
module.exports.PLATFORM_ADMIN_INVITE_STATUSES = PLATFORM_ADMIN_INVITE_STATUSES;
