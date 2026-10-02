const mongoose = require('mongoose');

const justGoCityInterestSchema = new mongoose.Schema({
  cityId: {type: Number, required: true, index: true},
  cityLabel: {type: String, required: true, maxlength: 120},
  email: {type: String, required: true, lowercase: true, trim: true, maxlength: 254},
  source: {type: String, enum: ['ios', 'android', 'web'], required: true},
  consentAt: {type: Date, required: true},
}, {timestamps: true});

justGoCityInterestSchema.index({cityId: 1, email: 1}, {unique: true});

module.exports = justGoCityInterestSchema;
