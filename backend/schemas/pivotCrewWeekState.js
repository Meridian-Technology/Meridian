const mongoose = require('mongoose');

const PIVOT_CREW_JUDGEMENT_STATUSES = Object.freeze([
  'awaiting_quorum',
  'proposed',
  'split',
  'deciding',
  'confirmed',
  'swapped',
]);

const MEMBER_JUDGEMENT_ACTIONS = Object.freeze(['confirmed', 'swapped']);

const memberVoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['interested', 'registered'],
      required: true,
    },
  },
  { _id: false },
);

const memberJudgementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: MEMBER_JUDGEMENT_ACTIONS,
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    at: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

const voteBreakdownEntrySchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
    },
    interestedCount: {
      type: Number,
      required: true,
      min: 0,
    },
    registeredCount: {
      type: Number,
      required: true,
      min: 0,
    },
    memberVotes: {
      type: [memberVoteSchema],
      default: [],
    },
  },
  { _id: false },
);

const swipeProgressSchema = new mongoose.Schema(
  {
    activeMemberCount: {
      type: Number,
      required: true,
      min: 0,
    },
    swipedCount: {
      type: Number,
      required: true,
      min: 0,
    },
    invitedCount: {
      type: Number,
      required: true,
      min: 0,
    },
    participationRate: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    quorumMet: {
      type: Boolean,
      required: true,
    },
  },
  { _id: false },
);

/** Per crew × batchWeek aggregation for proposed picks and judgement (Task 2.1). */
const pivotCrewWeekStateSchema = new mongoose.Schema(
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
    swipeProgress: {
      type: swipeProgressSchema,
      required: true,
    },
    proposedEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null,
    },
    originalProposedEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null,
    },
    proposedScore: {
      type: Number,
      default: null,
      min: 0,
    },
    voteBreakdown: {
      type: [voteBreakdownEntrySchema],
      default: [],
    },
    judgementStatus: {
      type: String,
      enum: PIVOT_CREW_JUDGEMENT_STATUSES,
      required: true,
    },
    consensusStartedAt: {
      type: Date,
      default: null,
    },
    consensusEndsAt: {
      type: Date,
      default: null,
    },
    crewSwapsRemaining: {
      type: Number,
      default: null,
      min: 0,
    },
    memberJudgements: {
      type: [memberJudgementSchema],
      default: [],
    },
    aggregatedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

pivotCrewWeekStateSchema.index({ crewId: 1, batchWeek: 1 }, { unique: true });
pivotCrewWeekStateSchema.index({ tenantKey: 1, batchWeek: 1 });
pivotCrewWeekStateSchema.index({
  judgementStatus: 1,
  consensusEndsAt: 1,
});

module.exports = pivotCrewWeekStateSchema;
module.exports.PIVOT_CREW_JUDGEMENT_STATUSES = PIVOT_CREW_JUDGEMENT_STATUSES;
module.exports.MEMBER_JUDGEMENT_ACTIONS = MEMBER_JUDGEMENT_ACTIONS;
