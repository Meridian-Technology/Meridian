const mongoose = require('mongoose');

/** Dedup log: max one unfinished-swipe push per crew × batchWeek (Task 2.5). */
const pivotCrewNudgeSentSchema = new mongoose.Schema(
  {
    crewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PivotCrew',
      required: true,
    },
    batchWeek: {
      type: String,
      required: true,
      trim: true,
    },
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    recipientCount: {
      type: Number,
      required: true,
      min: 0,
    },
    sentAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

pivotCrewNudgeSentSchema.index({ crewId: 1, batchWeek: 1 }, { unique: true });
pivotCrewNudgeSentSchema.index({ tenantKey: 1, batchWeek: 1 });

module.exports = pivotCrewNudgeSentSchema;
