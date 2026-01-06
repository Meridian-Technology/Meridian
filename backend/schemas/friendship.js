const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FriendshipSchema = new Schema({
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        required: true
    },
    createdAt: { type: Date, default: Date.now }
});

// Indexes for performance optimization
FriendshipSchema.index({ requester: 1, status: 1 }); // For finding friends by requester
FriendshipSchema.index({ recipient: 1, status: 1 }); // For finding friends by recipient
FriendshipSchema.index({ requester: 1, recipient: 1 }); // For unique friendship pairs
FriendshipSchema.index({ status: 1 }); // For filtering by status

// Compound index for the common query pattern in friends events
FriendshipSchema.index({ 
    $or: [
        { requester: 1, status: 1 },
        { recipient: 1, status: 1 }
    ]
});

module.exports = FriendshipSchema;