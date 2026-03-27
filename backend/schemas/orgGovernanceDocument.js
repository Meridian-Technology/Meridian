const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orgGovernanceDocumentSchema = new Schema(
    {
        org_id: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Org',
            index: true
        },
        documentType: {
            type: String,
            enum: ['constitution', 'charter', 'policy'],
            default: 'constitution'
        },
        title: {
            type: String,
            required: true
        },
        body: {
            type: String,
            required: true
        },
        version: {
            type: Number,
            required: true,
            default: 1
        },
        status: {
            type: String,
            enum: ['draft', 'pending_review', 'published', 'archived'],
            default: 'draft'
        },
        publishedAt: {
            type: Date,
            default: null
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    {
        timestamps: true
    }
);

orgGovernanceDocumentSchema.index({ org_id: 1, documentType: 1, version: -1 });

module.exports = orgGovernanceDocumentSchema;
