const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orgMessageSchema = new Schema({
    orgId: {
        type: Schema.Types.ObjectId,
        ref: 'Org',
        required: true,
        index: true
    },
    authorId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000 // Will be configurable per org, but max is 2000
    },
    visibility: {
        type: String,
        enum: ['members_only', 'members_and_followers', 'public'],
        default: 'members_and_followers',
        required: true
    },
    mentionedEvents: [{
        type: Schema.Types.ObjectId,
        ref: 'Event',
        index: true
    }],
    links: [{
        type: String,
        trim: true
    }],
    likes: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    likeCount: {
        type: Number,
        default: 0,
        min: 0
    },
    replyCount: {
        type: Number,
        default: 0,
        min: 0
    },
    parentMessageId: {
        type: Schema.Types.ObjectId,
        ref: 'OrgMessage',
        default: null,
        index: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
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

// Indexes for performance
orgMessageSchema.index({ orgId: 1, createdAt: -1 });
orgMessageSchema.index({ authorId: 1, createdAt: -1 });
orgMessageSchema.index({ parentMessageId: 1, createdAt: 1 });
orgMessageSchema.index({ mentionedEvents: 1 });
orgMessageSchema.index({ isDeleted: 1 });

// Pre-save middleware to update denormalized counts
orgMessageSchema.pre('save', function(next) {
    if (this.isModified('likes')) {
        this.likeCount = this.likes.length;
    }
    next();
});

// Instance method to soft delete
orgMessageSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
};

// Static method to find messages by org with visibility filtering
orgMessageSchema.statics.findByOrg = function(orgId, userRelationship, options = {}) {
    const query = {
        orgId: orgId,
        isDeleted: false,
        parentMessageId: null // Only top-level messages by default
    };

    // Apply visibility filtering based on user's relationship to org
    if (userRelationship === 'member') {
        // Members can see all visibility levels
    } else if (userRelationship === 'follower') {
        // Followers can see members_and_followers and public
        query.visibility = { $in: ['members_and_followers', 'public'] };
    } else {
        // Public users can only see public messages
        query.visibility = 'public';
    }

    const skip = options.skip || 0;
    const limit = options.limit || 20;

    return this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'name username picture')
        .populate('mentionedEvents', 'name start_time location image previewImage type');
};

// Static method to find replies to a message
orgMessageSchema.statics.findReplies = function(parentMessageId, options = {}) {
    const query = {
        parentMessageId: parentMessageId,
        isDeleted: false
    };

    const skip = options.skip || 0;
    const limit = options.limit || 50;

    return this.find(query)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'name username picture')
        .populate('mentionedEvents', 'name start_time location image previewImage type');
};

module.exports = orgMessageSchema;

