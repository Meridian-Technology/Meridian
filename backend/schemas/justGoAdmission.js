const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'JustGoCampaign', required: true },
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'JustGoCampaignInvite', required: true },
  globalUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalUser', required: true },
  // Recoverable by the authenticated owner, never included by default queries.
  passToken: { type: String, required: true, select: false },
  status: { type: String, enum: ['confirmed', 'checked-in', 'cancelled'], default: 'confirmed', required: true },
  checkedInAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ campaignId: 1, globalUserId: 1 }, { unique: true });
schema.index({ passToken: 1 }, { unique: true });
schema.index({ inviteId: 1 });

module.exports = schema;
