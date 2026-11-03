const mongoose = require('mongoose');

/** Named crew in a city tenant (Just Go crew coordination). */
const pivotCrewSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    /** Rotatable share token for meridian://pivot/crew/join?token=… (Task 1.2). */
    shareInviteToken: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * Six characters a friend types to join (no 0/O/1/I/L), shown in the app
     * and the invite text. Separate from the share token: rotating the link
     * keeps the code. Backfilled by migrations/backfillPivotCrewJoinCodes.js.
     */
    joinCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    /**
     * How many events this crew can lock per week (1–2).
     * null = inherit tenant judgement.maxPickSlots.
     */
    maxPickSlots: {
      type: Number,
      default: null,
      min: 1,
      max: 2,
    },
  },
  { timestamps: true },
);

pivotCrewSchema.index({ tenantKey: 1, createdAt: -1 });
pivotCrewSchema.index({ createdBy: 1, tenantKey: 1 });
pivotCrewSchema.index({ shareInviteToken: 1 }, { unique: true });
pivotCrewSchema.index(
  { joinCode: 1 },
  { unique: true, partialFilterExpression: { joinCode: { $type: 'string' } } },
);

module.exports = pivotCrewSchema;
