const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const taskBlueprintDueRuleSchema = new Schema(
    {
        anchorType: {
            type: String,
            enum: ['event_start', 'event_end', 'approval_granted', 'absolute', 'none'],
            default: 'none'
        },
        offsetValue: { type: Number, default: 0 },
        offsetUnit: {
            type: String,
            enum: ['minutes', 'hours', 'days', 'weeks'],
            default: 'days'
        },
        direction: {
            type: String,
            enum: ['before', 'after'],
            default: 'before'
        }
    },
    { _id: false }
);

const taskBlueprintItemSchema = new Schema(
    {
        templateTaskKey: String,
        title: String,
        description: String,
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
        },
        status: {
            type: String,
            enum: ['todo', 'in_progress', 'done', 'cancelled'],
            default: 'todo'
        },
        isCritical: {
            type: Boolean,
            default: false
        },
        dueRule: taskBlueprintDueRuleSchema
    },
    { _id: false }
);

// Nested Schema avoids Mongoose interpreting inner `type: String` as the parent field's type
// (which orphaned `required: true` and caused "true is not a valid type at path required").
const templateDataSchema = new Schema(
    {
        name: String,
        type: { type: String },
        location: String,
        description: String,
        expectedAttendance: Number,
        visibility: String,
        contact: String,
        rsvpEnabled: Boolean,
        rsvpRequired: Boolean,
        maxAttendees: Number,
        externalLink: String,
        taskBlueprint: [taskBlueprintItemSchema]
    },
    { _id: false }
);

const eventTemplateSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            required: false
        },
        orgId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Org'
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'User'
        },
        templateData: {
            type: templateDataSchema,
            required: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        usageCount: {
            type: Number,
            default: 0
        },
        lastUsed: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Index for efficient queries
eventTemplateSchema.index({ orgId: 1, isActive: 1 });
eventTemplateSchema.index({ createdBy: 1 });

module.exports = mongoose.model('EventTemplate', eventTemplateSchema);
