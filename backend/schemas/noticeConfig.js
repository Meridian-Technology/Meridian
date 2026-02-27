const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Notice shown to users on mobile app (Home screen) or web (Explore/Home).
 * Supports banner (above content) or popup display.
 */
const noticeConfigSchema = new Schema({
  platform: {
    type: String,
    enum: ['mobile', 'web'],
    default: 'mobile'
  },
  showFor: {
    type: String,
    enum: ['guest', 'authenticated', 'both'],
    default: 'both'
  },
  active: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  displayType: {
    type: String,
    enum: ['banner', 'popup'],
    default: 'banner'
  },
  // Optional link/button (e.g. "Learn more" -> URL)
  actionLabel: { type: String, trim: true, maxlength: 50 },
  actionUrl: { type: String, trim: true, maxlength: 500 },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = noticeConfigSchema;
