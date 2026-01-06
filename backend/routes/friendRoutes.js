const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken');
const friendshipSchema = require('../schemas/friendship');
const userSchema = require('../schemas/user');
const getModels = require('../services/getModelService');
const NotificationService = require('../services/notificationService');


router.get('/user-search/:searchTerm', verifyToken, async (req, res) => {
    const { User } = getModels(req, 'User');
    const { searchTerm } = req.params;
    try {
        const users = await User.find({
            username: { $regex: new RegExp(searchTerm, 'i') },
            _id: { $ne: req.user.userId }
        });
        users.sort((a, b) => a.username.toLowerCase().indexOf(searchTerm.toLowerCase()) - b.username.toLowerCase().indexOf(searchTerm.toLowerCase()));
        res.json({ success: true, message: 'Users found', data: users });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

router.post('/friend-request/:friendUsername', verifyToken, async (req, res) => {
    const { User, Friendship, Notification } = getModels(req, 'User', 'Friendship', 'Notification');
    const { friendUsername } = req.params;
    const requester = req.user.userId;
    let friendId;

    try {
        const friend = await User.findOne({ username: { $regex: new RegExp(friendUsername, 'i') } });
        if (!friend) return res.status(404).json({ success: false, message: 'Friend not found.' });
        friendId = friend._id;
        if (friendId == requester) return res.status(400).json({ success: false, message: 'Cannot send friend request to self.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }

    const existingFriendship = await Friendship.findOne({
        $or: [{ requester, recipient: friendId }, { requester: friendId, recipient: requester }]
    });

    if (existingFriendship) {
        if (existingFriendship.status === 'pending') return res.status(400).json({ success: false, message: 'Friend request already sent.' });
        if (existingFriendship.status === 'accepted') return res.status(400).json({ success: false, message: 'You are already friends with this user.' });
    }

    try {
        const requesterUser = await User.findById(requester);
        const newFriendship = await new Friendship({ requester, recipient: friendId, status: 'pending' }).save();
        const notificationService = NotificationService.withModels({ Notification });
        console.log(requesterUser._id);
        await notificationService.createSystemNotification(
            friendId,
            'User',
            'friend_request',
            {senderName: requesterUser.username, friendshipId: newFriendship._id, sender: requester}
        );
        console.log('Friend request sent to', friendId);
        res.status(201).json({ success: true, message: 'Friend request sent' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error sending friend request' });
    }
});

router.post('/friend-request/accept/:friendshipId', verifyToken, async (req, res) => {
    const { User, Friendship } = getModels(req, 'User', 'Friendship');
    const { friendshipId } = req.params;
    const recipient = req.user.userId;

    try {
        const friendship = await Friendship.findById(friendshipId);
        if (!friendship) return res.status(404).json({ success: false, message: 'Friendship not found.' });
        if (friendship.recipient.toString() !== recipient.toString()) return res.status(403).json({ success: false, message: 'Not authorized to accept request.' });
        friendship.status = 'accepted';
        await friendship.save();
        await User.updateOne({ _id: friendship.requester }, { $inc: { partners: 1 } });
        await User.updateOne({ _id: friendship.recipient }, { $inc: { partners: 1 } });
        res.status(200).json({ success: true, message: 'Friend request accepted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/friend-request/reject/:friendshipId', verifyToken, async (req, res) => {
    const { Friendship } = getModels(req, 'Friendship');
    const { friendshipId } = req.params;
    const recipient = req.user.userId;

    try {
        const friendship = await Friendship.findById(friendshipId);
        if (!friendship) return res.status(404).json({ success: false, message: 'Friendship not found.' });
        if (friendship.recipient.toString() !== recipient.toString()) return res.status(403).json({ success: false, message: 'Not authorized to reject request.' });
        await Friendship.deleteOne({ _id: friendship._id });
        res.status(200).json({ success: true, message: 'Friend request rejected' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/getFriends', verifyToken, async (req, res) => {
    const { User, Friendship } = getModels(req, 'User', 'Friendship');
    const userId = req.user.userId;
    try {
        const friendships = await Friendship.find({
            $or: [{ requester: userId, status: 'accepted' }, { recipient: userId, status: 'accepted' }]
        }).populate('requester recipient', 'username');

        const friendIds = friendships.map(f => (f.requester._id.toString() === userId.toString() ? f.recipient._id : f.requester._id));
        const friends = await User.find({ _id: { $in: friendIds } });
        res.json({ success: true, message: 'Friends found', data: friends });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

router.get('/friend-requests', verifyToken, async (req, res) => {
    const { Friendship } = getModels(req, 'Friendship');
    const userId = req.user.userId;

    try {
        const requests = await Friendship.find({
            recipient: userId,
            status: 'pending'   
        }).populate('requester');
        res.json({
            success: true,
            message: 'Friend requests found',
            data: requests
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message
        });
    }
});

//unfriend
router.post('/unfriend/:friendId', verifyToken, async (req, res) => {
    const { Friendship } = getModels(req, 'Friendship');
    const { friendId } = req.params;
    const userId = req.user.userId;

    try {
        const friendship = await Friendship.findOne({ $or: [{ requester: userId, recipient: friendId }, { requester: friendId, recipient: userId }] });
        if (!friendship) return res.status(404).json({ success: false, message: 'Friendship not found.' });
        await Friendship.deleteOne({ _id: friendship._id });
        res.status(200).json({ success: true, message: 'Unfriended.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
