/**
 * Friend Utilities
 * Utilities for managing friend requests and friendship status
 */

/**
 * Get all pending friend requests for a user (both sent and received)
 * @param {Object} Friendship - Mongoose Friendship model
 * @param {string|ObjectId} userId - User ID to fetch friend requests for
 * @param {Object} options - Optional configuration
 * @param {string|Array} options.receivedFields - Fields to populate for received requests (default: all)
 * @param {string|Array} options.sentFields - Fields to populate for sent requests (default: all)
 * @param {boolean} options.lean - Whether to return plain JavaScript objects (default: false)
 * @returns {Promise<Object>} Object containing received and sent friend requests
 */
const getFriendRequests = async (Friendship, userId, options = {}) => {
    const {
        receivedFields = null, // null means populate all fields
        sentFields = null,
        lean = false
    } = options;

    try {
        // Build query for received requests
        let receivedQuery = Friendship.find({
            recipient: userId,
            status: 'pending'
        });

        // Build query for sent requests
        let sentQuery = Friendship.find({
            requester: userId,
            status: 'pending'
        });

        // Apply population based on fields specified
        if (receivedFields) {
            receivedQuery = receivedQuery.populate('requester', receivedFields);
        } else {
            receivedQuery = receivedQuery.populate('requester');
        }

        if (sentFields) {
            sentQuery = sentQuery.populate('recipient', sentFields);
        } else {
            sentQuery = sentQuery.populate('recipient');
        }

        // Apply lean if specified
        if (lean) {
            receivedQuery = receivedQuery.lean();
            sentQuery = sentQuery.lean();
        }

        // Execute queries in parallel
        const [receivedRequests, sentRequests] = await Promise.all([
            receivedQuery.exec(),
            sentQuery.exec()
        ]);

        return {
            received: receivedRequests,
            sent: sentRequests
        };
    } catch (error) {
        throw new Error(`Error fetching friend requests: ${error.message}`);
    }
};

/**
 * Get friend request status for a specific user
 * Checks if there's a pending request between two users
 * @param {Object} Friendship - Mongoose Friendship model
 * @param {string|ObjectId} userId1 - First user ID
 * @param {string|ObjectId} userId2 - Second user ID
 * @returns {Promise<Object|null>} Friendship object if exists, null otherwise
 */
const getFriendshipStatus = async (Friendship, userId1, userId2) => {
    try {
        const friendship = await Friendship.findOne({
            $or: [
                { requester: userId1, recipient: userId2 },
                { requester: userId2, recipient: userId1 }
            ]
        });

        return friendship;
    } catch (error) {
        throw new Error(`Error fetching friendship status: ${error.message}`);
    }
};

/**
 * Check if a user has sent a friend request to another user
 * @param {Object} Friendship - Mongoose Friendship model
 * @param {string|ObjectId} requesterId - User who sent the request
 * @param {string|ObjectId} recipientId - User who received the request
 * @returns {Promise<boolean>} True if request exists and is pending
 */
const hasPendingRequest = async (Friendship, requesterId, recipientId) => {
    try {
        const friendship = await Friendship.findOne({
            requester: requesterId,
            recipient: recipientId,
            status: 'pending'
        });

        return !!friendship;
    } catch (error) {
        throw new Error(`Error checking pending request: ${error.message}`);
    }
};

/**
 * Get all friendships for a user (accepted, pending, etc.)
 * @param {Object} Friendship - Mongoose Friendship model
 * @param {string|ObjectId} userId - User ID
 * @param {string} status - Optional status filter ('pending', 'accepted', etc.)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.lean - Whether to return plain JavaScript objects
 * @returns {Promise<Array>} Array of friendship objects
 */
const getAllFriendships = async (Friendship, userId, status = null, options = {}) => {
    const { lean = false } = options;

    try {
        let query = Friendship.find({
            $or: [
                { requester: userId },
                { recipient: userId }
            ]
        });

        if (status) {
            query = query.where('status').equals(status);
        }

        if (lean) {
            query = query.lean();
        }

        const friendships = await query
            .populate('requester', 'username name picture _id')
            .populate('recipient', 'username name picture _id')
            .exec();

        return friendships;
    } catch (error) {
        throw new Error(`Error fetching friendships: ${error.message}`);
    }
};

module.exports = {
    getFriendRequests,
    getFriendshipStatus,
    hasPendingRequest,
    getAllFriendships
};

