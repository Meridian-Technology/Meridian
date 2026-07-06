const mongoose = require('mongoose');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');

const pivotLabNotesSchema = new mongoose.Schema(
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
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    updatedBy: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true },
);

pivotLabNotesSchema.index({ batchWeek: 1 }, { unique: true });

module.exports = pivotLabNotesSchema;
