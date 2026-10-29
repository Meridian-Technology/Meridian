const mongoose = require('mongoose');

/**
 * One phone at a Just Go Live night: its name on the board and its picks.
 * The device id is the App Clip's anonymous keychain id, so a fan who moves
 * from the clip to the app keeps their score. Cheers are never stored.
 */
const schema = new mongoose.Schema({
  eventId: { type: String, required: true, trim: true },
  deviceId: { type: String, required: true, trim: true },
  name: { type: String, default: null, trim: true, maxlength: 24 },
  surface: { type: String, enum: ['clip', 'app'], default: 'clip' },
  /** The printed code the fan scanned (`ring-2`). */
  source: { type: String, default: null, trim: true, maxlength: 64 },
  /** matchId → sideId. */
  calls: { type: mongoose.Schema.Types.Mixed, default: {} },
  joinedAt: { type: Date, default: Date.now },
}, { timestamps: true, minimize: false });

schema.index({ eventId: 1, deviceId: 1 }, { unique: true });

module.exports = schema;
