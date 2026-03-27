const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orgInventorySchema = new Schema(
    {
        org_id: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String, default: '' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
    },
    { timestamps: true }
);

orgInventorySchema.index({ org_id: 1, name: 1 }, { unique: true });

module.exports = orgInventorySchema;
