const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema for school-specific shuttle API configuration
const shuttleConfigSchema = new Schema({
  school: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  apiBaseUrl: {
    type: String,
    required: true,
    trim: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index on school field for faster queries
shuttleConfigSchema.index({ school: 1 });

module.exports = shuttleConfigSchema;
