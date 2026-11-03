const mongoose = require('mongoose');

/**
 * Email/password sign-up held back because the email already belongs to a
 * GlobalUser. Linking a new tenant account to that identity hands over the
 * existing account, so it waits for a code sent to the address (or, for
 * platform admins, to the platform approver).
 */
const pendingRegistrationSchema = new mongoose.Schema(
  {
    verificationId: { type: String, required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    tenantKey: { type: String, required: true, trim: true, lowercase: true },
    username: { type: String, required: true },
    /** bcrypt hash; the raw password is never stored. */
    passwordHash: { type: String, required: true },
    inviteToken: { type: String, default: null },
    globalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
    },
    /** 'account_email' or 'platform_admin_approver'. */
    deliveryRoute: {
      type: String,
      required: true,
      enum: ['account_email', 'platform_admin_approver'],
    },
    /** sha256 of the 6-digit code. */
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

pendingRegistrationSchema.index(
  { verificationId: 1 },
  { unique: true, name: 'verificationId_unique' },
);
pendingRegistrationSchema.index(
  { email: 1, tenantKey: 1 },
  { unique: true, name: 'email_tenantKey_unique' },
);
pendingRegistrationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'expiresAt_ttl' },
);

module.exports = pendingRegistrationSchema;
