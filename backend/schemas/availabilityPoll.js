const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const availabilityPollSchema = new Schema({
    // Parent relationship - supports StudySessions, Events, and Orgs
    parentType: { 
        type: String, 
        enum: ['StudySession', 'Event', 'Org'], 
        required: true 
    },
    parentId: { 
        type: Schema.Types.ObjectId, 
        required: true, 
        refPath: 'parentType' 
    },
    
    // Creator (User or Org)
    creatorType: { 
        type: String, 
        enum: ['User', 'Org'], 
        required: true 
    },
    creatorId: { 
        type: Schema.Types.ObjectId, 
        required: true, 
        refPath: 'creatorType' 
    },
    
    // Time Selection Configuration (timezone-aware)
    timeSlotOptions: [{
        label: { 
            type: String,
            trim: true,
            maxlength: 50
        }, // "Monday Morning", "Friday Evening"
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true }
    }],
    
    // Invited Participants
    invitedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    
    // Access Control
    allowAnonymous: { type: Boolean, default: false },
    
    // User Responses (unified for authenticated and anonymous)
    responses: [{
        // User (null for anonymous responses)
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        
        // Display name (required for anonymous, optional for authenticated)
        displayName: { 
            type: String,
            trim: true,
            maxlength: 50
        },
        
        // Selected time blocks (timezone-aware DateTime objects)
        selectedBlocks: [{
            startTime: { type: Date, required: true },
            endTime: { type: Date, required: true }
        }],
        
        // Conflict preferences (only meaningful for authenticated users)
        conflictPreferences: {
            blockRsvpEvents: { type: Boolean, default: true },
            blockClasses: { type: Boolean, default: true },
            blockClubMeetings: { type: Boolean, default: false }
        },
        
        submittedAt: { type: Date, default: Date.now }
    }],
    
    // Poll Status
    isFinalized: { type: Boolean, default: false },
    finalizedChoice: {
        startTime: { type: Date },
        endTime: { type: Date }
    },
    expiresAt: { type: Date, required: true },
    
}, { 
    timestamps: true 
});

// Essential indexes for performance
availabilityPollSchema.index({ parentType: 1, parentId: 1 }); // High value: parent lookups
availabilityPollSchema.index({ expiresAt: 1 }); // High value: cleanup jobs
availabilityPollSchema.index({ creatorType: 1, creatorId: 1 }); // Medium value: creator lookups

// Validation
availabilityPollSchema.pre('save', function(next) {
    // Ensure expires date is in the future
    if (this.expiresAt <= new Date()) {
        return next(new Error('Expiration date must be in the future'));
    }
    
    // Ensure time slot options are valid
    for (const slot of this.timeSlotOptions) {
        if (slot.startTime >= slot.endTime) {
            return next(new Error('Start time must be before end time'));
        }
    }
    
    // If finalized, ensure finalizedChoice is set
    if (this.isFinalized && (!this.finalizedChoice.startTime || !this.finalizedChoice.endTime)) {
        return next(new Error('Finalized choice must have start and end time'));
    }
    
    next();
});

// Instance methods
availabilityPollSchema.methods.isCreator = function(userId, userType = 'User') {
    return this.creatorType === userType && this.creatorId.toString() === userId.toString();
};

availabilityPollSchema.methods.canAccess = function(userId) {
    // Creator can always access
    if (this.isCreator(userId)) return true;
    
    // Invited users can access
    if (this.invitedUsers.includes(userId)) return true;
    
    // Anonymous access if allowed
    if (this.allowAnonymous) return true;
    
    return false;
};

availabilityPollSchema.methods.getUserResponse = function(userId) {
    return this.responses.find(r => r.user && r.user.toString() === userId.toString());
};

availabilityPollSchema.methods.isExpired = function() {
    return this.expiresAt <= new Date();
};

// Static methods
availabilityPollSchema.statics.findAccessible = function(userId) {
    return this.find({
        $or: [
            { creatorId: userId, creatorType: 'User' },
            { invitedUsers: userId },
            { allowAnonymous: true }
        ],
        expiresAt: { $gt: new Date() }
    });
};

module.exports = availabilityPollSchema;
