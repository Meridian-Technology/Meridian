const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema for resource details
const resourceDetailsSchema = new Schema({
  hours: { type: String, required: false },
  location: { type: String, required: false },
  capacity: { type: String, required: false },
  features: { type: [String], default: [] }
}, { _id: false });

// Schema for a single resource (can be nested)
const resourceSchema = new Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  icon: { type: String, required: true },
  color: { type: String, required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['link', 'subpage', 'action']
  },
  // For link resources
  url: { type: String, required: false },
  // For subpage resources
  subtitle: { type: String, required: false },
  subResources: { type: [Schema.Types.Mixed], default: [] },
  // For action resources
  action: { type: String, required: false },
  // Optional details
  details: { type: resourceDetailsSchema, required: false }
}, { _id: false });

// Main resources config schema
const resourcesConfigSchema = new Schema({
  resources: {
    type: [resourceSchema],
    required: true,
    default: []
  },
  version: {
    type: Number,
    default: 1
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
resourcesConfigSchema.index({ version: 1 });

module.exports = resourcesConfigSchema;

