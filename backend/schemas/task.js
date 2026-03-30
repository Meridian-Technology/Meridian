const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const taskDueRuleSchema = new Schema({
    anchorType: {
        type: String,
        enum: ['event_start', 'event_end', 'approval_granted', 'absolute', 'none'],
        default: 'none'
    },
    offsetValue: {
        type: Number,
        default: 0
    },
    offsetUnit: {
        type: String,
        enum: ['minutes', 'hours', 'days', 'weeks'],
        default: 'days'
    },
    direction: {
        type: String,
        enum: ['before', 'after'],
        default: 'before'
    },
    absoluteDate: {
        type: Date,
        default: null
    }
}, { _id: false });

const taskBlockerSchema = new Schema({
    type: {
        type: String,
        enum: ['approval', 'booking', 'task', 'dependency', 'manual'],
        default: 'manual'
    },
    referenceId: {
        type: String,
        default: null
    },
    label: {
        type: String,
        trim: true,
        default: ''
    },
    resolved: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const taskIntegrationSchema = new Schema({
    type: {
        type: String,
        enum: ['approval_instance', 'room_booking', 'registration_goal', 'agenda_item', 'event_job'],
        required: true
    },
    referenceId: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'pending'
    }
}, { _id: false });

const TaskSchema = new Schema({
    orgId: {
        type: Schema.Types.ObjectId,
        ref: 'Org',
        required: true,
        index: true
    },
    eventId: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: false,
        default: null,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 180
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'],
        default: 'todo',
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
        index: true
    },
    isCritical: {
        type: Boolean,
        default: false
    },
    ownerUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    watcherUserIds: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    source: {
        type: String,
        enum: ['manual', 'template_suggestion', 'template_applied', 'integration_generated'],
        default: 'manual'
    },
    userConfirmed: {
        type: Boolean,
        default: false
    },
    templateSource: {
        templateId: {
            type: Schema.Types.ObjectId,
            default: null
        },
        templateTaskKey: {
            type: String,
            default: null
        }
    },
    dueRule: {
        type: taskDueRuleSchema,
        default: () => ({ anchorType: 'none' })
    },
    dueAt: {
        type: Date,
        default: null,
        index: true
    },
    blockers: {
        type: [taskBlockerSchema],
        default: []
    },
    integrationLinks: {
        type: [taskIntegrationSchema],
        default: []
    },
    tags: {
        type: [String],
        default: []
    },
    readinessContribution: {
        weight: {
            type: Number,
            default: 1,
            min: 0
        },
        blocked: {
            type: Boolean,
            default: false
        }
    },
    completedAt: {
        type: Date,
        default: null
    },
    cancelledAt: {
        type: Date,
        default: null
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

TaskSchema.index({ orgId: 1, eventId: 1, status: 1 });
TaskSchema.index({ orgId: 1, dueAt: 1 });
TaskSchema.index({ orgId: 1, ownerUserId: 1, status: 1 });

TaskSchema.pre('save', function syncCompletionTimestamps(next) {
    if (this.status === 'done' && !this.completedAt) {
        this.completedAt = new Date();
    }
    if (this.status !== 'done' && this.completedAt) {
        this.completedAt = null;
    }
    if (this.status === 'cancelled' && !this.cancelledAt) {
        this.cancelledAt = new Date();
    }
    if (this.status !== 'cancelled' && this.cancelledAt) {
        this.cancelledAt = null;
    }
    next();
});

module.exports = TaskSchema;
