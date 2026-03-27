const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const checkoutEventSchema = new Schema(
    {
        action: { type: String, enum: ['checkout', 'checkin'], required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', default: null },
        expectedReturnAt: { type: Date, default: null },
        condition: { type: String, default: '' },
        notes: { type: String, default: '' },
        at: { type: Date, default: Date.now }
    },
    { _id: false }
);

const maintenanceEventSchema = new Schema(
    {
        type: { type: String, enum: ['maintenance', 'incident'], required: true },
        status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
        severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
        notes: { type: String, default: '' },
        reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        linkedEventId: { type: Schema.Types.ObjectId, ref: 'Event', default: null },
        reportedAt: { type: Date, default: Date.now },
        resolvedAt: { type: Date, default: null }
    },
    { _id: true }
);

const orgInventoryItemSchema = new Schema(
    {
        org_id: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
        inventory_id: { type: Schema.Types.ObjectId, ref: 'OrgInventory', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String, default: '' },
        quantity: { type: Number, default: 1, min: 0 },
        condition: {
            type: String,
            enum: ['new', 'good', 'fair', 'poor', 'broken'],
            default: 'good'
        },
        lifecycleStatus: {
            type: String,
            enum: ['active', 'maintenance', 'archived'],
            default: 'active'
        },
        isCheckedOut: { type: Boolean, default: false },
        checkedOutTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        checkedOutQuantity: { type: Number, default: 0, min: 0 },
        archivedAt: { type: Date, default: null },
        archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        checkoutHistory: { type: [checkoutEventSchema], default: [] },
        maintenanceEvents: { type: [maintenanceEventSchema], default: [] }
    },
    { timestamps: true }
);

module.exports = orgInventoryItemSchema;
