const mongoose = require('mongoose');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');

const pivotWeeklySnapshotTenantSchema = new mongoose.Schema(
  {
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    cityDisplayName: {
      type: String,
      default: '',
      trim: true,
    },
    eventCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    interestedCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    registeredCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    externalOpenCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    swipeCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    feedbackAvg: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },
    activeUsers: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { _id: false },
);

const pivotWeeklySnapshotSchema = new mongoose.Schema(
  {
    batchWeek: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: isValidIsoWeek,
        message: 'batchWeek must be ISO week format YYYY-Www',
      },
    },
    generatedAt: {
      type: Date,
      required: true,
    },
    tenants: {
      type: [pivotWeeklySnapshotTenantSchema],
      default: [],
    },
  },
  { timestamps: true },
);

pivotWeeklySnapshotSchema.index({ batchWeek: 1 }, { unique: true });
pivotWeeklySnapshotSchema.index({ generatedAt: -1 });

module.exports = pivotWeeklySnapshotSchema;
