const mongoose = require('mongoose');

const androidTesterSignupSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  source: {
    type: String,
    default: 'mobile_landing',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Prevent duplicate emails
androidTesterSignupSchema.index({ email: 1 }, { unique: true });

module.exports = androidTesterSignupSchema;
