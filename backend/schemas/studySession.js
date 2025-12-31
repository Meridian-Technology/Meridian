const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const studySessionSchema = new Schema({
    // Basic Information
    title: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 100
    },
    course: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 100
    },
    description: { 
        type: String,
        trim: true,
        maxlength: 1000
    },
    
    // Creator & Visibility
    creator: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    visibility: { 
        type: String, 
        enum: ['public', 'private'], 
        required: true 
    },
    
    // Event Integration - CORE CONNECTION
    relatedEvent: { 
        type: Schema.Types.ObjectId, 
        ref: 'Event', 
        required: true 
    },
    
    // Participants with RSVP Status
    participants: [{
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        status: { 
            type: String, 
            enum: ['going', 'maybe', 'not-going'], 
            required: true 
        },
        rsvpAt: { type: Date, default: Date.now }
    }],
    
    // Invited Users (for private sessions)
    invitedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    
    // Recurrence (only until semester end)
    isRecurring: { type: Boolean, default: false },
    recurrencePattern: {
        frequency: { 
            type: String, 
            enum: ['weekly', 'biweekly'] 
        },
        dayOfWeek: { 
            type: Number, 
            min: 0, 
            max: 6 
        }, // 0 = Sunday
        semesterEnd: { type: Date }
    },
    
    // Session Status
    status: { 
        type: String, 
        enum: ['scheduled', 'active', 'completed', 'cancelled'], 
        default: 'scheduled' 
    },
    
    // Metadata
    
    // Optional availability poll reference
    availabilityPoll: { 
        type: Schema.Types.ObjectId, 
        ref: 'AvailabilityPoll' 
    },
    
}, { 
    timestamps: true 
});

// Optimized indexes based on cost/benefit analysis
studySessionSchema.index({ creator: 1, status: 1 }); // High value: user's sessions
studySessionSchema.index({ course: 1, visibility: 1 }); // High value: discovery
studySessionSchema.index({ relatedEvent: 1 }); // High value: event integration
studySessionSchema.index({ createdAt: -1 }); // Medium value: recent sessions
studySessionSchema.index({ status: 1, createdAt: -1 }); // For status-based queries

// Virtual for getting start/end time from related event
studySessionSchema.virtual('eventDetails', {
    ref: 'Event',
    localField: 'relatedEvent',
    foreignField: '_id',
    justOne: true
});

// Instance methods
studySessionSchema.methods.isCreator = function(userId) {
    return this.creator.toString() === userId.toString();
};

studySessionSchema.methods.canEdit = function(userId) {
    return this.isCreator(userId) && this.status === 'scheduled';
};

studySessionSchema.methods.getUserParticipation = function(userId) {
    return this.participants.find(p => p.user.toString() === userId.toString());
};

module.exports = studySessionSchema;
