const mongoose = require('mongoose');

/** One row per person who joined or connected through someone's personal invite link. */
const pivotUserInviteAcceptanceSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    inviterGlobalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
    },
    inviteeGlobalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
    },
    /** False when the pair was blocked, or the inviter's account is gone. */
    friended: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

pivotUserInviteAcceptanceSchema.index({ inviteeGlobalUserId: 1, code: 1 }, { unique: true });
pivotUserInviteAcceptanceSchema.index({ inviterGlobalUserId: 1, createdAt: -1 });

module.exports = pivotUserInviteAcceptanceSchema;
