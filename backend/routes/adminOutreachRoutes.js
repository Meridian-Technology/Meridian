const express = require('express');
const router = express.Router();
const getModels = require('../services/getModelService');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const { resolveAudience } = require('../services/studentTargetingService');
const { sendOutreachMessage, getMessageAnalytics } = require('../services/adminOutreachService');

const OUTREACH_ROLES = ['admin', 'root', 'oie'];

router.use(verifyToken);
router.use(authorizeRoles(...OUTREACH_ROLES));

/**
 * POST /admin/outreach/audiences — create a saved audience
 */
router.post('/audiences', async (req, res) => {
    try {
        const { OutreachAudience } = getModels(req, 'OutreachAudience');
        const { name, description, filterDefinition } = req.body;
        if (!name || !filterDefinition || !filterDefinition.conditions || !Array.isArray(filterDefinition.conditions)) {
            return res.status(400).json({
                success: false,
                message: 'name and filterDefinition.conditions are required',
                code: 'VALIDATION_ERROR'
            });
        }
        const audience = new OutreachAudience({
            name: name.trim(),
            description: (description || '').trim(),
            filterDefinition,
            createdBy: req.user.userId
        });
        await audience.save();
        return res.status(201).json({ success: true, data: audience, message: 'Audience created' });
    } catch (err) {
        console.error('POST /admin/outreach/audiences', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /admin/outreach/audiences — list audiences with pagination
 */
router.get('/audiences', async (req, res) => {
    try {
        const { OutreachAudience } = getModels(req, 'OutreachAudience');
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const search = (req.query.search || '').trim();
        const query = search ? { name: new RegExp(escapeRegex(search), 'i') } : {};
        const [items, total] = await Promise.all([
            OutreachAudience.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            OutreachAudience.countDocuments(query)
        ]);
        return res.json({
            success: true,
            data: items,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('GET /admin/outreach/audiences', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /admin/outreach/audiences/:id — fetch a single audience
 */
router.get('/audiences/:id', async (req, res) => {
    try {
        const { OutreachAudience } = getModels(req, 'OutreachAudience');
        const audience = await OutreachAudience.findById(req.params.id).lean();
        if (!audience) {
            return res.status(404).json({ success: false, message: 'Audience not found', code: 'NOT_FOUND' });
        }
        return res.json({ success: true, data: audience });
    } catch (err) {
        console.error('GET /admin/outreach/audiences/:id', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /admin/outreach/audiences/preview — preview count/sample for a filter (no save)
 */
router.post('/audiences/preview', async (req, res) => {
    try {
        const filterDefinition = req.body.filterDefinition || req.body;
        if (!filterDefinition.conditions || !Array.isArray(filterDefinition.conditions)) {
            return res.status(400).json({
                success: false,
                message: 'filterDefinition.conditions required',
                code: 'VALIDATION_ERROR'
            });
        }
        const limit = Math.min(20, parseInt(req.body.limit) || 10);
        const result = await resolveAudience(req, filterDefinition, { preview: true, limit });
        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('POST /admin/outreach/audiences/preview', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /admin/outreach/audiences/:id — update audience
 */
router.put('/audiences/:id', async (req, res) => {
    try {
        const { OutreachAudience } = getModels(req, 'OutreachAudience');
        const { name, description, filterDefinition } = req.body;
        const audience = await OutreachAudience.findById(req.params.id);
        if (!audience) {
            return res.status(404).json({ success: false, message: 'Audience not found', code: 'NOT_FOUND' });
        }
        if (name != null) audience.name = name.trim();
        if (description != null) audience.description = description.trim();
        if (filterDefinition != null) audience.filterDefinition = filterDefinition;
        await audience.save();
        return res.json({ success: true, data: audience, message: 'Audience updated' });
    } catch (err) {
        console.error('PUT /admin/outreach/audiences/:id', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * DELETE /admin/outreach/audiences/:id
 */
router.delete('/audiences/:id', async (req, res) => {
    try {
        const { OutreachAudience } = getModels(req, 'OutreachAudience');
        const deleted = await OutreachAudience.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Audience not found', code: 'NOT_FOUND' });
        }
        return res.json({ success: true, message: 'Audience deleted' });
    } catch (err) {
        console.error('DELETE /admin/outreach/audiences/:id', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /admin/outreach/messages — create a draft message
 */
router.post('/messages', async (req, res) => {
    try {
        const { OutreachMessage, OutreachAudience } = getModels(req, 'OutreachMessage', 'OutreachAudience');
        const { title, subject, body, channels, audienceId, filterDefinition } = req.body;
        if (!title || !body) {
            return res.status(400).json({
                success: false,
                message: 'title and body are required',
                code: 'VALIDATION_ERROR'
            });
        }
        if (audienceId) {
            const aud = await OutreachAudience.findById(audienceId);
            if (!aud) return res.status(400).json({ success: false, message: 'Audience not found', code: 'NOT_FOUND' });
        } else if (!filterDefinition || !filterDefinition.conditions || !Array.isArray(filterDefinition.conditions)) {
            return res.status(400).json({
                success: false,
                message: 'audienceId or filterDefinition.conditions required',
                code: 'VALIDATION_ERROR'
            });
        }
        const message = new OutreachMessage({
            title: title.trim(),
            subject: (subject || title).trim(),
            body,
            channels: Array.isArray(channels) ? channels : ['in_app'],
            audienceId: audienceId || null,
            filterDefinition: filterDefinition || null,
            createdBy: req.user.userId,
            status: 'draft'
        });
        await message.save();
        return res.status(201).json({ success: true, data: message, message: 'Message created' });
    } catch (err) {
        console.error('POST /admin/outreach/messages', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /admin/outreach/messages/:id — update a draft message
 */
router.put('/messages/:id', async (req, res) => {
    try {
        const { OutreachMessage } = getModels(req, 'OutreachMessage');
        const message = await OutreachMessage.findById(req.params.id);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found', code: 'NOT_FOUND' });
        }
        if (message.status !== 'draft') {
            return res.status(400).json({ success: false, message: 'Only draft messages can be updated', code: 'INVALID_STATE' });
        }
        const { title, subject, body, channels, audienceId, filterDefinition } = req.body;
        if (title != null) message.title = title.trim();
        if (subject != null) message.subject = subject.trim();
        if (body != null) message.body = body;
        if (channels != null) message.channels = Array.isArray(channels) ? channels : message.channels;
        if (audienceId != null) message.audienceId = audienceId;
        if (filterDefinition != null) message.filterDefinition = filterDefinition;
        await message.save();
        return res.json({ success: true, data: message, message: 'Message updated' });
    } catch (err) {
        console.error('PUT /admin/outreach/messages/:id', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /admin/outreach/messages/:id/send — trigger send
 */
router.post('/messages/:id/send', async (req, res) => {
    try {
        const result = await sendOutreachMessage(req, req.params.id);
        return res.json({ success: true, data: result, message: 'Message sent' });
    } catch (err) {
        if (err.message === 'Outreach message not found') {
            return res.status(404).json({ success: false, message: err.message, code: 'NOT_FOUND' });
        }
        if (err.message === 'Message already sent') {
            return res.status(400).json({ success: false, message: err.message, code: 'INVALID_STATE' });
        }
        if (err.message === 'Audience not found' || err.message === 'Message has no audience or inline filter') {
            return res.status(400).json({ success: false, message: err.message, code: 'VALIDATION_ERROR' });
        }
        console.error('POST /admin/outreach/messages/:id/send', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /admin/outreach/messages — list messages with pagination
 */
router.get('/messages', async (req, res) => {
    try {
        const { OutreachMessage } = getModels(req, 'OutreachMessage');
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const status = req.query.status;
        const query = status ? { status } : {};
        const [items, total] = await Promise.all([
            OutreachMessage.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            OutreachMessage.countDocuments(query)
        ]);
        return res.json({
            success: true,
            data: items,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('GET /admin/outreach/messages', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /admin/outreach/messages/:id — fetch one message
 */
router.get('/messages/:id', async (req, res) => {
    try {
        const { OutreachMessage } = getModels(req, 'OutreachMessage');
        const message = await OutreachMessage.findById(req.params.id).lean();
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found', code: 'NOT_FOUND' });
        }
        return res.json({ success: true, data: message });
    } catch (err) {
        console.error('GET /admin/outreach/messages/:id', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /admin/outreach/messages/:id/analytics — aggregate metrics
 */
router.get('/messages/:id/analytics', async (req, res) => {
    try {
        const analytics = await getMessageAnalytics(req, req.params.id);
        if (!analytics) {
            return res.status(404).json({ success: false, message: 'Message not found', code: 'NOT_FOUND' });
        }
        return res.json({ success: true, data: analytics });
    } catch (err) {
        console.error('GET /admin/outreach/messages/:id/analytics', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
