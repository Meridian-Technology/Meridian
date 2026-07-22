const crypto = require('crypto');
const mongoose = require('mongoose');

const PIVOT_CREW_MEMBERSHIP_STATUSES = Object.freeze(['active', 'invited', 'left']);
const PIVOT_CREW_MEMBERSHIP_ROLES = Object.freeze(['owner', 'member']);

/** Member, owner, or invited placeholder for a Pivot crew. */
const pivotCrewMembershipSchema = new mongoose.Schema(
  {
    crewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PivotCrew',
      required: true,
    },
    /** Null for invited placeholders until signup (Task 1.3). */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    inviteToken: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: PIVOT_CREW_MEMBERSHIP_STATUSES,
      required: true,
    },
    role: {
      type: String,
      enum: PIVOT_CREW_MEMBERSHIP_ROLES,
      required: true,
    },
    invitedAt: {
      type: Date,
      required: true,
    },
    joinedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

pivotCrewMembershipSchema.index({ inviteToken: 1 }, { unique: true });
pivotCrewMembershipSchema.index(
  { crewId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'active',
      userId: { $type: 'objectId' },
    },
  },
);
pivotCrewMembershipSchema.index({ crewId: 1, status: 1 });
pivotCrewMembershipSchema.index({ userId: 1, status: 1 });

pivotCrewMembershipSchema.statics.generateInviteToken = function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = pivotCrewMembershipSchema;
module.exports.PIVOT_CREW_MEMBERSHIP_STATUSES = PIVOT_CREW_MEMBERSHIP_STATUSES;
module.exports.PIVOT_CREW_MEMBERSHIP_ROLES = PIVOT_CREW_MEMBERSHIP_ROLES;
