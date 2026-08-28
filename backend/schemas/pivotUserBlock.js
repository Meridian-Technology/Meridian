const mongoose = require('mongoose');

/** One-way Just Go block. Hidden from friends, search, contacts, and social proof. */
const pivotUserBlockSchema = new mongoose.Schema(
  {
    blockerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    blockedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

pivotUserBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

module.exports = pivotUserBlockSchema;
