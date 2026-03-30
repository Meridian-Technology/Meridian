const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken');
const { requireEventManagement } = require('../middlewares/orgPermissions');
const getModels = require('../services/getModelService');
const {
    asObjectId,
    computeDueAtForTask,
    computeEventReadiness,
    listTasks,
    recomputeDueDatesForEvent,
    sortHubTasks
} = require('../services/taskService');

function toBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function applyTaskPatch(task, payload = {}) {
    const scalarFields = [
        'title',
        'description',
        'status',
        'priority',
        'source',
        'userConfirmed',
        'dueAt',
        'dueRule',
        'blockers',
        'integrationLinks',
        'tags',
        'metadata'
    ];
    scalarFields.forEach((field) => {
        if (payload[field] !== undefined) {
            if ((field === 'title' || field === 'description') && typeof payload[field] === 'string') {
                task[field] = payload[field].trim();
                return;
            }
            task[field] = payload[field];
        }
    });
    if (payload.ownerUserId !== undefined) {
        task.ownerUserId = payload.ownerUserId ? asObjectId(payload.ownerUserId) : null;
    }
    if (payload.watcherUserIds !== undefined) {
        if (Array.isArray(payload.watcherUserIds)) {
            task.watcherUserIds = payload.watcherUserIds
                .map((id) => asObjectId(id))
                .filter(Boolean);
        } else {
            task.watcherUserIds = [];
        }
    }
    if (payload.eventId !== undefined) {
        task.eventId = payload.eventId ? asObjectId(payload.eventId) : null;
    }
    if (payload.isCritical !== undefined) {
        task.isCritical = toBoolean(payload.isCritical, false);
    }
}

async function ensureOrgEventAccess(models, orgId, eventId) {
    if (!eventId) return null;
    const event = await models.Event.findOne({
        _id: asObjectId(eventId),
        hostingType: 'Org',
        isDeleted: false,
        $or: [
            { hostingId: asObjectId(orgId) },
            { collaboratorOrgs: { $elemMatch: { orgId: asObjectId(orgId), status: 'active' } } }
        ]
    }).lean();
    return event || null;
}

// Event-level task list
router.get('/:orgId/events/:eventId/tasks', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId } = req.params;
    const { status = 'all', ownerUserId, priority = 'all', search = '', sortBy = 'priority' } = req.query;
    const models = getModels(req, 'Task', 'Event');

    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const tasks = await listTasks(models, orgId, {
            eventId,
            status,
            ownerUserId,
            priority,
            search,
            sortBy
        });

        return res.status(200).json({
            success: true,
            data: {
                event: {
                    _id: event._id,
                    name: event.name,
                    start_time: event.start_time,
                    end_time: event.end_time
                },
                tasks
            }
        });
    } catch (error) {
        console.error('Error listing event tasks:', error);
        return res.status(500).json({ success: false, message: 'Error listing event tasks', error: error.message });
    }
});

// Create event task
router.post('/:orgId/events/:eventId/tasks', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId } = req.params;
    const payload = req.body || {};
    const models = getModels(req, 'Task', 'Event');

    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        if (!payload.title || !String(payload.title).trim()) {
            return res.status(400).json({ success: false, message: 'Task title is required' });
        }

        const task = new models.Task({
            orgId: asObjectId(orgId),
            eventId: asObjectId(eventId),
            title: String(payload.title).trim(),
            description: payload.description || '',
            status: payload.status || 'todo',
            priority: payload.priority || 'medium',
            isCritical: toBoolean(payload.isCritical, false),
            ownerUserId: payload.ownerUserId && asObjectId(payload.ownerUserId) ? asObjectId(payload.ownerUserId) : null,
            source: payload.source || 'manual',
            userConfirmed: payload.userConfirmed !== undefined ? toBoolean(payload.userConfirmed, false) : true,
            dueRule: payload.dueRule || { anchorType: 'none' },
            blockers: Array.isArray(payload.blockers) ? payload.blockers : [],
            integrationLinks: Array.isArray(payload.integrationLinks) ? payload.integrationLinks : [],
            tags: Array.isArray(payload.tags) ? payload.tags : []
        });

        task.dueAt = payload.dueAt ? new Date(payload.dueAt) : computeDueAtForTask(task, event, null);
        await task.save();

        return res.status(201).json({
            success: true,
            message: 'Task created',
            data: { task }
        });
    } catch (error) {
        console.error('Error creating event task:', error);
        return res.status(500).json({ success: false, message: 'Error creating task', error: error.message });
    }
});

// Update event task
router.put('/:orgId/events/:eventId/tasks/:taskId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId, taskId } = req.params;
    const payload = req.body || {};
    const models = getModels(req, 'Task', 'Event');

    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        const task = await models.Task.findOne({
            _id: asObjectId(taskId),
            orgId: asObjectId(orgId),
            eventId: asObjectId(eventId)
        });
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        applyTaskPatch(task, payload);
        if (payload.dueRule !== undefined && payload.dueAt === undefined) {
            task.dueAt = computeDueAtForTask(task, event, null);
        }
        await task.save();

        return res.status(200).json({
            success: true,
            message: 'Task updated',
            data: { task }
        });
    } catch (error) {
        console.error('Error updating event task:', error);
        return res.status(500).json({ success: false, message: 'Error updating task', error: error.message });
    }
});

// Delete event task
router.delete('/:orgId/events/:eventId/tasks/:taskId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId, taskId } = req.params;
    const models = getModels(req, 'Task', 'Event');

    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        const deleted = await models.Task.findOneAndDelete({
            _id: asObjectId(taskId),
            orgId: asObjectId(orgId),
            eventId: asObjectId(eventId)
        });
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        return res.status(200).json({ success: true, message: 'Task deleted' });
    } catch (error) {
        console.error('Error deleting event task:', error);
        return res.status(500).json({ success: false, message: 'Error deleting task', error: error.message });
    }
});

// Recompute event task due dates from relative rules
router.post('/:orgId/events/:eventId/tasks/recompute-due-dates', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId } = req.params;
    const models = getModels(req, 'Task', 'Event', 'ApprovalInstance');

    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        const updatedCount = await recomputeDueDatesForEvent(models, orgId, eventId);
        return res.status(200).json({
            success: true,
            message: 'Due dates recomputed',
            data: { updatedCount }
        });
    } catch (error) {
        console.error('Error recomputing due dates:', error);
        return res.status(500).json({ success: false, message: 'Error recomputing due dates', error: error.message });
    }
});

// Event readiness snapshot
router.get('/:orgId/events/:eventId/readiness', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId } = req.params;
    const models = getModels(req, 'Task', 'Event', 'ApprovalInstance', 'EventEquipment', 'EventJob');

    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const readiness = await computeEventReadiness(models, orgId, eventId);
        return res.status(200).json({
            success: true,
            data: readiness
        });
    } catch (error) {
        console.error('Error computing readiness:', error);
        return res.status(500).json({ success: false, message: 'Error computing readiness', error: error.message });
    }
});

// Organization-level task hub
router.get('/:orgId/tasks/hub', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const {
        status = 'all',
        ownerUserId,
        priority = 'all',
        eventId = 'all',
        search = '',
        onlyBlocked,
        onlyOverdue,
        sortBy = 'urgency'
    } = req.query;
    const { orgId } = req.params;
    const models = getModels(req, 'Task', 'Event');

    try {
        const tasks = await listTasks(models, orgId, {
            eventId: eventId === 'all' ? undefined : eventId,
            status,
            ownerUserId,
            priority,
            search,
            onlyBlocked: toBoolean(onlyBlocked, false),
            onlyOverdue: toBoolean(onlyOverdue, false)
        });

        const sorted = sortHubTasks(tasks, sortBy);
        const summary = {
            total: sorted.length,
            overdue: sorted.filter((task) => task.overdue).length,
            blocked: sorted.filter((task) => task.effectiveStatus === 'blocked').length,
            highPriority: sorted.filter((task) => ['high', 'critical'].includes(task.priority)).length
        };

        return res.status(200).json({
            success: true,
            data: {
                summary,
                tasks: sorted
            }
        });
    } catch (error) {
        console.error('Error loading task hub:', error);
        return res.status(500).json({ success: false, message: 'Error loading task hub', error: error.message });
    }
});

// Create organization-level operational task (non-event task)
router.post('/:orgId/tasks/hub', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId } = req.params;
    const payload = req.body || {};
    const models = getModels(req, 'Task');

    try {
        if (!payload.title || !String(payload.title).trim()) {
            return res.status(400).json({ success: false, message: 'Task title is required' });
        }

        const ownerObjectId = payload.ownerUserId && asObjectId(payload.ownerUserId);
        const eventObjectId = payload.eventId && asObjectId(payload.eventId);

        const task = new models.Task({
            orgId: asObjectId(orgId),
            eventId: eventObjectId || null,
            title: String(payload.title).trim(),
            description: payload.description || '',
            status: payload.status || 'todo',
            priority: payload.priority || 'medium',
            isCritical: toBoolean(payload.isCritical, false),
            ownerUserId: ownerObjectId || null,
            source: payload.source || 'manual',
            userConfirmed: payload.userConfirmed !== undefined ? toBoolean(payload.userConfirmed, false) : true,
            dueRule: payload.dueRule || { anchorType: 'none' },
            dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
            blockers: Array.isArray(payload.blockers) ? payload.blockers : [],
            integrationLinks: Array.isArray(payload.integrationLinks) ? payload.integrationLinks : [],
            tags: Array.isArray(payload.tags) ? payload.tags : []
        });

        await task.save();
        return res.status(201).json({
            success: true,
            message: 'Task created',
            data: { task }
        });
    } catch (error) {
        console.error('Error creating hub task:', error);
        return res.status(500).json({ success: false, message: 'Error creating task', error: error.message });
    }
});

// Update organization-level task by id
router.put('/:orgId/tasks/hub/:taskId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, taskId } = req.params;
    const payload = req.body || {};
    const models = getModels(req, 'Task', 'Event');

    try {
        const task = await models.Task.findOne({
            _id: asObjectId(taskId),
            orgId: asObjectId(orgId)
        });
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        applyTaskPatch(task, payload);

        if (payload.dueRule !== undefined && payload.dueAt === undefined && task.eventId) {
            const event = await models.Event.findById(task.eventId).lean();
            task.dueAt = computeDueAtForTask(task, event, null);
        }

        await task.save();
        return res.status(200).json({
            success: true,
            message: 'Task updated',
            data: { task }
        });
    } catch (error) {
        console.error('Error updating hub task:', error);
        return res.status(500).json({ success: false, message: 'Error updating task', error: error.message });
    }
});

module.exports = router;
