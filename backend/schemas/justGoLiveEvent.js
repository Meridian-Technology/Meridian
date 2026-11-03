const mongoose = require('mongoose');

/**
 * A Just Go Live night: the organizer's card (`definition`, checked by
 * `services/justGoLive/liveEventDefinition`) and what the spotter has called
 * so far (`state`, from the live engine). Fans' picks live in justgo_live_fans.
 * The spotter PIN is stored only as a scrypt digest. Phones can join only
 * between `opensAt` and `closesAt`; with no hours set, the night is closed.
 */
const schema = new mongoose.Schema({
  eventId: { type: String, required: true, trim: true, unique: true },
  definition: { type: mongoose.Schema.Types.Mixed, required: true },
  state: { type: mongoose.Schema.Types.Mixed, default: null },
  opensAt: { type: Date, default: null },
  closesAt: { type: Date, default: null },
  spotterPin: {
    type: new mongoose.Schema({
      salt: { type: String, required: true },
      hash: { type: String, required: true },
    }, { _id: false }),
    default: null,
    select: false,
  },
}, { timestamps: true, minimize: false });

schema.index({ closesAt: 1 });

module.exports = schema;
