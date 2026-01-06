const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
    // Recipient information
    recipient: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'recipientModel'
    },
    recipientModel: {
        type: String,
        required: true,
        enum: ['User', 'Org']
    },
    
    // Sender information (optional - for system notifications)
    sender: {
        type: Schema.Types.ObjectId,
        refPath: 'senderModel',
        required: false
    },
    senderModel: {
        type: String,
        enum: ['User', 'Org'],
        required: false
    },
    
    // Notification content
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    
    // Notification type and category for filtering
    type: {
        type: String,
        required: true,
        enum: [
            'system',           // System notifications
            'user',             // User-to-user notifications
            'org',              // Organization notifications
            'event',            // Event-related notifications
            'membership',       // Membership changes
            'approval',         // Approval requests
            'reminder',         // Reminders
            'achievement',      // Achievements/badges
            'security',         // Security alerts
            'custom'            // Custom notifications
        ]
    },
    
    category: {
        type: String,
        required: false,
        trim: true,
        maxlength: 100
    },
    
    // Priority levels
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    },
    
    // Status tracking
    status: {
        type: String,
        enum: ['unread', 'read', 'acknowledged', 'archived', 'deleted'],
        default: 'unread'
    },
    
    // Timestamps for status changes
    readAt: {
        type: Date,
        default: null
    },
    acknowledgedAt: {
        type: Date,
        default: null
    },
    archivedAt: {
        type: Date,
        default: null
    },
    
    // Action configuration
    actions: [{
        id: {
            type: String,
            required: true,
            trim: true
        },
        label: {
            type: String,
            required: true,
            trim: true
        },
        type: {
            type: String,
            enum: ['link', 'form', 'api_call'],
            default: 'button'
        },
        url: {
            type: String,
            trim: true
        },
        method: {
            type: String,
            enum: ['GET', 'POST', 'PUT', 'DELETE'],
            default: 'GET'
        },
        payload: {
            type: Schema.Types.Mixed
        },
        style: {
            type: String,
            enum: ['primary', 'secondary', 'success', 'danger', 'warning', 'info'],
            default: 'primary'
        },
        order: {
            type: Number,
            default: 0
        }, 
        icon: {
            type: String,
            default: null
        }
    }],

    actionResult: {
        type: Schema.Types.Mixed,
        default: null
    },
    
    // Metadata for flexible data storage
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    },
    
    // Related entities (for context)
    relatedEntities: [{
        type: Schema.Types.ObjectId,
        refPath: 'relatedEntityModels'
    }],
    relatedEntityModels: [{
        type: String,
        enum: ['User', 'Org', 'Event', 'Form', 'Report', 'Badge']
    }],
    
    // Expiration and scheduling
    expiresAt: {
        type: Date,
        default: null
    },
    scheduledFor: {
        type: Date,
        default: null
    },
    
    // Delivery tracking
    deliveryStatus: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed'],
        default: 'pending'
    },
    deliveryAttempts: {
        type: Number,
        default: 0
    },
    lastDeliveryAttempt: {
        type: Date,
        default: null
    },
    
    // Notification channels
    channels: [{
        type: String,
        enum: ['in_app', 'email', 'push', 'sms', 'webhook'],
        default: ['in_app']
    }],
    
    // Template information (for system notifications)
    template: {
        name: {
            type: String,
            trim: true
        },
        version: {
            type: String,
            trim: true
        },
        variables: {
            type: Schema.Types.Mixed,
            default: {}
        }
    },
    
    // Grouping and threading
    threadId: {
        type: Schema.Types.ObjectId,
        ref: 'Notification',
        default: null
    },
    isThreadRoot: {
        type: Boolean,
        default: false
    },
    
    // Batch notifications
    batchId: {
        type: String,
        trim: true
    },
    
    // Soft delete
    deletedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true,
    // Indexes for performance
    indexes: [
        { recipient: 1, status: 1, createdAt: -1 },
        { recipient: 1, type: 1, createdAt: -1 },
        { status: 1, createdAt: -1 },
        { expiresAt: 1 },
        { scheduledFor: 1 },
        { threadId: 1 },
        { batchId: 1 },
        { 'metadata.key': 1 }
    ]
});

// Virtual for checking if notification is expired
notificationSchema.virtual('isExpired').get(function() {
    return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for checking if notification is scheduled
notificationSchema.virtual('isScheduled').get(function() {
    return this.scheduledFor && this.scheduledFor > new Date();
});

// Instance methods
notificationSchema.methods.markAsRead = function() {
    this.status = 'read';
    this.readAt = new Date();
    return this.save();
};

notificationSchema.methods.acknowledge = function() {
    this.status = 'acknowledged';
    this.acknowledgedAt = new Date();
    return this.save();
};

notificationSchema.methods.archive = function() {
    this.status = 'archived';
    this.archivedAt = new Date();
    return this.save();
};

notificationSchema.methods.softDelete = function() {
    this.status = 'deleted';
    this.deletedAt = new Date();
    return this.save();
};

notificationSchema.methods.addAction = function(action) {
    if (!this.actions) {
        this.actions = [];
    }
    this.actions.push(action);
    return this.save();
};

notificationSchema.methods.removeAction = function(actionId) {
    if (this.actions) {
        this.actions = this.actions.filter(action => action.id !== actionId);
    }
    return this.save();
};

// Static methods
notificationSchema.statics.findByRecipient = function(recipientId, recipientModel, options = {}) {
    const query = {
        recipient: recipientId,
        recipientModel: recipientModel,
        deletedAt: null
    };
    
    if (options.status) {
        query.status = options.status;
    }
    
    if (options.type) {
        query.type = options.type;
    }
    
    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(options.limit || 50)
        .skip(options.skip || 0)
        .populate('sender');
};

notificationSchema.statics.createBatch = function(notifications) {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const batchNotifications = notifications.map(notification => ({
        ...notification,
        batchId
    }));
    
    return this.insertMany(batchNotifications);
};

notificationSchema.statics.cleanupExpired = function() {
    return this.updateMany(
        { 
            expiresAt: { $lt: new Date() },
            status: { $nin: ['archived', 'deleted'] }
        },
        { 
            $set: { status: 'archived', archivedAt: new Date() }
        }
    );
};

// Pre-save middleware
notificationSchema.pre('save', function(next) {
    // Auto-expire notifications after 30 days if no expiration is set
    if (!this.expiresAt && this.type !== 'system') {
        this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    
    // Set thread root if this is a new thread
    if (this.threadId && !this.isThreadRoot) {
        this.isThreadRoot = false;
    }
    
    next();
});

// Pre-find middleware to exclude soft-deleted notifications
notificationSchema.pre('find', function() {
    this.where({ deletedAt: null });
});

notificationSchema.pre('findOne', function() {
    this.where({ deletedAt: null });
});

module.exports = notificationSchema; 