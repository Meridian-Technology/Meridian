const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrgEquipmentSchema = new Schema({
    orgId: {
        type: Schema.Types.ObjectId,
        ref: 'Org',
        required: true,
        index: true
    },
    id: {
        type: String,
        unique: true,
        index: true
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
    },
    storageLocation: {
        type: String,
        trim: true,
        default: null
    },
    managedByRole: {
        type: String,
        default: null
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    id: false
});

OrgEquipmentSchema.index({ orgId: 1 });
OrgEquipmentSchema.index({ managedByRole: 1 });

// @James this feels like a bad approach, thoughts?

OrgEquipmentSchema.pre('validate', async function generateEquipmentId(next) {
    if (this.id) {
        return next();
    }

    let attempts = 0;
    let code = null;

    while (attempts < 10) {
        const candidate = `EQ-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        const exists = await this.constructor.exists({ id: candidate });
        if (!exists) {
            code = candidate;
            break;
        }
        attempts += 1;
    }

    this.id = code || `EQ-${String(Date.now()).slice(-3)}`;
    next();
});

module.exports = OrgEquipmentSchema;
