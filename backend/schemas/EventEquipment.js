const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EventEquipmentSchema = new Schema({
    eventId: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        index: true
    },
    orgId: {
        type: Schema.Types.ObjectId,
        ref: 'Org',
        required: true,
        index: true
    },
    items: [{
        equipmentId: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        quantity: {
            type: Number,
            required: true,
            default: 1,
            min: 1
        }
    }]
}, {
    timestamps: true
});

// Indexes for efficient queries
EventEquipmentSchema.index({ eventId: 1 });
EventEquipmentSchema.index({ orgId: 1 });

module.exports = EventEquipmentSchema;
