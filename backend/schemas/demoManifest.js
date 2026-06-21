const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const demoManifestSchema = new Schema({
    key: { type: String, required: true, unique: true },
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Org' },
    eventId: { type: Schema.Types.ObjectId, required: true, ref: 'Event' },
    operatorUserId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    memberUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    seededAt: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
}, { collection: 'demo_manifests' });

module.exports = demoManifestSchema;
