const mongoose = require('mongoose');

/** Tenant-scoped attendee intent for Pivot catalog (not campus RSVP). */
const pivotEventIntentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    batchWeek: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['interested', 'registered', 'passed'],
      required: true,
    },
    /** Last time the user opened the external ticket link (analytics / Lab funnel). */
    externalOpenAt: {
      type: Date,
      default: null,
    },
    /** Count of external ticket-link opens (countable in Pivot Lab). */
    externalOpenCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

pivotEventIntentSchema.index({ userId: 1, eventId: 1 }, { unique: true });
pivotEventIntentSchema.index({ eventId: 1, status: 1 });
pivotEventIntentSchema.index({ batchWeek: 1, userId: 1, status: 1 });

module.exports = pivotEventIntentSchema;
