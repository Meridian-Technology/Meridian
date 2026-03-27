const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const checkoutEventSchema = new Schema(
    {
        action: { type: String, enum: ['checkout', 'checkin'], required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        condition: { type: String, default: '' },
        notes: { type: String, default: '' },
        at: { type: Date, default: Date.now }
    },
    { _id: false }
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
        isCheckedOut: { type: Boolean, default: false },
        checkedOutTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        checkoutHistory: { type: [checkoutEventSchema], default: [] }
    },
    { timestamps: true }
);

module.exports = orgInventoryItemSchema;
