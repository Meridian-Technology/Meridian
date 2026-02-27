const express = require('express');
const router = express.Router();
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');

/**
 * GET /me/outreach-messages — paginated list of outreach messages for the current user (via OutreachReceipt)
 */
router.get('/outreach-messages', verifyToken, async (req, res) => {
    try {
        const { OutreachReceipt, OutreachMessage } = getModels(req, 'OutreachReceipt', 'OutreachMessage');
        const userId = req.user.userId;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const receipts = await OutreachReceipt.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('messageId')
            .lean();

        const items = receipts
            .filter((r) => r.messageId)
            .map((r) => {
                const msg = r.messageId;
                return {
                    messageId: msg._id,
                    title: msg.title,
                    subject: msg.subject,
                    body: msg.body,
                    sentAt: msg.sentAt,
                    seenAt: r.seenAt,
                    openedAt: r.openedAt
                };
            });

        const total = await OutreachReceipt.countDocuments({ userId });

        return res.json({
            success: true,
            data: items,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('GET /me/outreach-messages', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /me/outreach-messages/:messageId/open — mark message as opened (for analytics)
 */
router.post('/outreach-messages/:messageId/open', verifyToken, async (req, res) => {
    try {
        const { OutreachReceipt } = getModels(req, 'OutreachReceipt');
        const userId = req.user.userId;
        const { messageId } = req.params;

        const receipt = await OutreachReceipt.findOne({ messageId, userId });
        if (!receipt) {
            return res.status(404).json({ success: false, message: 'Receipt not found', code: 'NOT_FOUND' });
        }

        const update = {};
        if (!receipt.seenAt) update.seenAt = new Date();
        if (!receipt.openedAt) update.openedAt = new Date();
        if (Object.keys(update).length > 0) {
            await OutreachReceipt.findByIdAndUpdate(receipt._id, { $set: update });
        }

        return res.json({ success: true, message: 'Marked as opened' });
    } catch (err) {
        console.error('POST /me/outreach-messages/:messageId/open', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
