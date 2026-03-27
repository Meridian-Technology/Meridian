const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orgAccountingDimensionSchema = new Schema(
    {
        org_id: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
        key: { type: String, required: true },
        label: { type: String, required: true },
        required: { type: Boolean, default: false },
        values: {
            type: [String],
            default: []
        },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
    },
    { timestamps: true }
);

orgAccountingDimensionSchema.index({ org_id: 1, key: 1 }, { unique: true });

module.exports = orgAccountingDimensionSchema;
