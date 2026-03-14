const getModels = require('./getModelService');
const { resolveAudience } = require('./studentTargetingService');
const NotificationService = require('./notificationService');

/**
 * Get filter definition for an outreach message (from audience or inline).
 */
async function getFilterForMessage(req, message) {
    const { OutreachAudience } = getModels(req, 'OutreachAudience');
    if (message.audienceId) {
        const audience = await OutreachAudience.findById(message.audienceId).lean();
        if (!audience) throw new Error('Audience not found');
        return audience.filterDefinition;
    }
    if (message.filterDefinition) return message.filterDefinition;
    throw new Error('Message has no audience or inline filter');
}

/**
 * Send an outreach message: resolve audience, create receipts, create notifications, deliver.
 */
async function sendOutreachMessage(req, messageId) {
    const { OutreachMessage, OutreachReceipt, User } = getModels(req, 'OutreachMessage', 'OutreachReceipt', 'User');
    const message = await OutreachMessage.findById(messageId);
    if (!message) throw new Error('Outreach message not found');
    if (message.status === 'sent') throw new Error('Message already sent');

    const filterDefinition = await getFilterForMessage(req, message);
    const { userIds, total } = await resolveAudience(req, filterDefinition, { limit: 50000 });
    if (total === 0) return { sent: 0, total: 0, receipts: [] };

    const channels = Array.isArray(message.channels) && message.channels.length > 0
        ? message.channels
        : ['in_app'];
    const receiptDocs = userIds.map((userId) => ({
        messageId: message._id,
        userId,
        emailPlanned: channels.includes('email'),
        emailStatus: 'pending'
    }));
    const receipts = await OutreachReceipt.insertMany(receiptDocs);

    const notificationData = {
        type: 'system',
        title: message.subject || message.title,
        message: message.body && message.body.length > 200 ? message.body.substring(0, 200) + '...' : message.body,
        channels,
        metadata: { outreachMessageId: message._id.toString() },
        priority: 'normal',
        status: 'unread'
    };

    const { Notification } = getModels(req, 'Notification');
    const notificationService = NotificationService.withModels({ Notification, User });

    const notificationsPayload = userIds.map((userId) => ({
        ...notificationData,
        recipient: userId,
        recipientModel: 'User'
    }));

    const batchSize = 100;
    for (let i = 0; i < notificationsPayload.length; i += batchSize) {
        const batch = notificationsPayload.slice(i, i + batchSize);
        const inserted = await Notification.insertMany(batch);
        const ids = inserted.map((n) => n._id);
        const docs = await Notification.find({ _id: { $in: ids } });
        for (const doc of docs) {
            try {
                await notificationService.deliverNotification(doc);
            } catch (err) {
                console.error('Outreach delivery error for notification', doc._id, err);
            }
        }
    }

    await OutreachMessage.findByIdAndUpdate(messageId, {
        status: 'sent',
        sentAt: new Date()
    });

    if (channels.includes('email')) {
        await OutreachReceipt.updateMany(
            { messageId },
            { $set: { emailSentAt: new Date(), emailStatus: 'sent' } }
        );
    }

    return { sent: userIds.length, total, receipts: receipts.length };
}

/**
 * Aggregate analytics for an outreach message from OutreachReceipt.
 */
async function getMessageAnalytics(req, messageId) {
    const { OutreachReceipt, OutreachMessage } = getModels(req, 'OutreachReceipt', 'OutreachMessage');
    const message = await OutreachMessage.findById(messageId).lean();
    if (!message) return null;

    const receipts = await OutreachReceipt.find({ messageId }).lean();
    const total = receipts.length;
    const emailSent = receipts.filter((r) => r.emailSentAt).length;
    const opened = receipts.filter((r) => r.openedAt).length;
    const seen = receipts.filter((r) => r.seenAt).length;
    const clicked = receipts.filter((r) => r.clickedAt || (r.clickCount && r.clickCount > 0)).length;

    return {
        messageId,
        total,
        emailSent,
        opened,
        seen,
        clicked,
        openRate: total > 0 ? Math.round((opened / total) * 100) / 100 : 0,
        clickRate: total > 0 ? Math.round((clicked / total) * 100) / 100 : 0,
        sentAt: message.sentAt
    };
}

module.exports = {
    getFilterForMessage,
    sendOutreachMessage,
    getMessageAnalytics
};
