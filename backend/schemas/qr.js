const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QrSchema = new Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    redirectUrl: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    scans: { type: Number, default: 0 },
    repeated: { type: Number, default: 0 },
    uniqueScans: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    lastScanned: { type: Date },
    scanHistory: [{
        timestamp: { type: Date, default: Date.now },
        isRepeat: { type: Boolean, default: false },
        userAgent: { type: String },
        ipAddress: { type: String },
        referrer: { type: String }
    }],
    tags: [{ type: String }],
    location: { type: String },
    campaign: { type: String },
    fgColor: { type: String, default: '#414141' },
    bgColor: { type: String, default: '#ffffff' },
    transparentBg: { type: Boolean, default: false },
    dotType: { type: String, enum: ['extra-rounded', 'square', 'dots'], default: 'extra-rounded' },
    cornerType: { type: String, enum: ['extra-rounded', 'square', 'dot'], default: 'extra-rounded' }
});

// Index for better query performance
QrSchema.index({ name: 1 });
QrSchema.index({ createdAt: -1 });
QrSchema.index({ isActive: 1 });

module.exports = QrSchema;
