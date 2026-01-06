const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const universalFeedbackSchema = new Schema({
    // Core identification
    user: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    
    // Feature and process identification
    feature: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 50
    }, // 'studySession', 'event', 'org', 'classroom', etc.
    
    processId: { 
        type: Schema.Types.ObjectId, 
        required: true 
    }, // ID of the specific item being reviewed (studySessionId, eventId, etc.)
    
    // Versioning and configuration
    systemVersion: { 
        type: String, 
        required: true,
        trim: true
    }, // e.g., "1.2", "1.3-beta", etc.
    
    feedbackVersion: { 
        type: String, 
        required: true,
        trim: true
    }, // Version of the feedback form used (for A/B testing)
    
    // Configurable response data
    responses: {
        type: Schema.Types.Mixed,
        required: true,
        validate: {
            validator: function(value) {
                return value && typeof value === 'object' && Object.keys(value).length > 0;
            },
            message: 'At least one response field is required'
        }
    },
    
    // Metadata
    submittedAt: { 
        type: Date, 
        default: Date.now 
    },
    
    // Optional context data (browser info, session data, etc.)
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    },
    
    // Status tracking
    isProcessed: { 
        type: Boolean, 
        default: false 
    },
    processedAt: { 
        type: Date 
    },
    
}, { 
    timestamps: true 
});

// Compound indexes for efficient querying
universalFeedbackSchema.index({ feature: 1, processId: 1 }); // Find feedback for specific items
universalFeedbackSchema.index({ user: 1, feature: 1, processId: 1 }, { unique: true }); // Prevent duplicate feedback
universalFeedbackSchema.index({ feature: 1, systemVersion: 1 }); // Version analysis
universalFeedbackSchema.index({ feature: 1, feedbackVersion: 1 }); // A/B testing analysis
universalFeedbackSchema.index({ submittedAt: -1 }); // Recent feedback

// Instance methods
universalFeedbackSchema.methods.isFromUser = function(userId) {
    return this.user.toString() === userId.toString();
};

universalFeedbackSchema.methods.getResponseValue = function(fieldName) {
    return this.responses[fieldName];
};

// Static methods for aggregation
universalFeedbackSchema.statics.getFeatureStats = function(feature, processId = null) {
    const matchStage = { feature };
    if (processId) {
        matchStage.processId = mongoose.Types.ObjectId(processId);
    }
    
    return this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    feature: '$feature',
                    processId: '$processId',
                    systemVersion: '$systemVersion',
                    feedbackVersion: '$feedbackVersion'
                },
                totalFeedback: { $sum: 1 },
                responses: { $push: '$responses' },
                avgTimestamp: { $avg: { $toLong: '$submittedAt' } }
            }
        },
        {
            $sort: { '_id.systemVersion': -1, '_id.feedbackVersion': -1 }
        }
    ]);
};

universalFeedbackSchema.statics.getVersionStats = function(feature, systemVersion) {
    return this.aggregate([
        { 
            $match: { 
                feature, 
                systemVersion 
            } 
        },
        {
            $group: {
                _id: '$feedbackVersion',
                count: { $sum: 1 },
                responses: { $push: '$responses' }
            }
        },
        {
            $sort: { count: -1 }
        }
    ]);
};

module.exports = universalFeedbackSchema;
