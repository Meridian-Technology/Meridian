const mongoose = require('mongoose');

/**
 * A themed Explore for one Just Go city (Halloween, a festival weekend): for
 * its dates the discover page swaps its headline, featured events, and
 * background photo. Dates are calendar days in the city's drop timezone;
 * `startsAt`/`endsAt` are those days resolved to instants when saved.
 */
const schema = new mongoose.Schema({
  tenantKey: { type: String, required: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true, maxlength: 40 },
  tagline: { type: String, trim: true, maxlength: 90, default: '' },
  startsOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  endsOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  timezone: { type: String, required: true, trim: true },
  startsAt: { type: Date, required: true },
  // Exclusive: midnight after the last day.
  endsAt: { type: Date, required: true },
  // Featured events, in order. Ids from the city's own database.
  eventIds: { type: [String], default: [] },
  backgroundImageUrl: { type: String, trim: true, default: '' },
  // Set for Unsplash photos, which have to credit their photographer.
  backgroundCredit: {
    type: new mongoose.Schema({
      provider: { type: String, enum: ['unsplash'], required: true },
      photographer: { type: String, trim: true, maxlength: 120, required: true },
      photographerUrl: { type: String, trim: true, required: true },
      sourceUrl: { type: String, trim: true, required: true },
    }, { _id: false }),
    default: null,
  },
  // Looks layered over the background photo in the app.
  filmGrain: { type: Boolean, default: false },
  // A heavier darkening at the edges and behind the shelf, for bright photos.
  darkVignette: { type: Boolean, default: false },
  published: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalUser', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalUser', default: null },
}, { timestamps: true });

schema.index({ tenantKey: 1, published: 1, startsAt: -1, endsAt: 1 });

module.exports = schema;
