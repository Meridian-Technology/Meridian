const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken');
const { requireEventManagement } = require('../middlewares/orgPermissions');
const getModels = require('../services/getModelService');
const {
    asObjectId,
    computeDueAtForTask,
    computeEventReadiness,
    getSuggestedTasksForEvent,
    listTasks,
    findOneTaskDto,
    buildEventTaskAssigneeSummary,
    recomputeDueDatesForEvent,
    sortHubTasks,
    normalizeTaskStatusForOrg,
    getResolvedTaskBoardStatuses,
    applyTaskColumnOrder
} = require('../services/taskService');
const {
    validateTaskBoardStatusesPayload,
    getAllowedStatusKeys,
    DEFAULT_TASK_BOARD_STATUSES
} = require('../services/taskBoardStatusUtils');
const {
    ORG_BETA_FEATURE_ORG_TASKS,
    orgHasBetaFeature
} = require('../constants/orgBetaFeatures');

function toBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function applyTaskPatch(task, payload = {}, statusConfig) {
    const cfg = statusConfig || DEFAULT_TASK_BOARD_STATUSES;
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
            if (field === 'status') {
                task[field] = normalizeTaskStatusForOrg(payload[field], cfg);
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
    if (payload.boardRank !== undefined && payload.boardRank !== null) {
        const n = Number(payload.boardRank);
        if (Number.isFinite(n)) {
            task.boardRank = n;
        }
    }
}

// Org task board columns (Kanban / status workflow; max 10)
router.get('/:orgId/task-board-statuses', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId } = req.params;
    const models = getModels(req, 'Org');
    try {
        const org = await models.Org.findById(asObjectId(orgId)).select('taskBoardStatuses').lean();
        return res.status(200).json({
            success: true,
            data: { statuses: getResolvedTaskBoardStatuses(org) }
        });
    } catch (error) {
        console.error('Error loading task board statuses:', error);
        return res.status(500).json({ success: false, message: 'Error loading task board statuses', error: error.message });
    }
});

router.put('/:orgId/task-board-statuses', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId } = req.params;
    const models = getModels(req, 'Org', 'Task');
    const body = req.body || {};

    try {
        const org = await models.Org.findById(asObjectId(orgId));
        if (!org) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        if (body.reset === true) {
            org.taskBoardStatuses = undefined;
            await org.save();
            return res.status(200).json({
                success: true,
                data: { statuses: getResolvedTaskBoardStatuses(null) }
            });
        }

        const parsed = validateTaskBoardStatusesPayload(body.statuses);
        if (parsed.error) {
            return res.status(400).json({ success: false, message: parsed.error });
        }

        const prevKeys = getAllowedStatusKeys(getResolvedTaskBoardStatuses(org));
        const nextKeys = new Set(parsed.value.map((s) => s.key));
        const removed = [...prevKeys].filter((k) => !nextKeys.has(k));
        if (removed.length) {
            const inUse = await models.Task.countDocuments({
                orgId: asObjectId(orgId),
                status: { $in: removed }
            });
            if (inUse > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot remove column(s) still used by ${inUse} task(s). Move those tasks first.`
                });
            }
        }

        org.taskBoardStatuses = parsed.value;
        await org.save();
        return res.status(200).json({
            success: true,
            data: { statuses: getResolvedTaskBoardStatuses(org) }
        });
    } catch (error) {
        console.error('Error saving task board statuses:', error);
        return res.status(500).json({ success: false, message: 'Error saving task board statuses', error: error.message });
    }
});

// Distinct task assignees per event (for event list / quick look avatars)
router.get('/:orgId/tasks/event-assignee-summary', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId } = req.params;
    const models = getModels(req, 'Task', 'User');

    try {
        const assigneesByEventId = await buildEventTaskAssigneeSummary(models, orgId);
        return res.status(200).json({
            success: true,
            data: { assigneesByEventId }
        });
    } catch (error) {
        console.error('Error building event task assignee summary:', error);
        return res.status(500).json({
            success: false,
            message: 'Error loading task assignees',
            error: error.message
        });
    }
});

async function loadOrgTaskBoardConfig(models, orgId) {
    if (!models?.Org) return DEFAULT_TASK_BOARD_STATUSES;
    const org = await models.Org.findById(asObjectId(orgId)).select('taskBoardStatuses').lean();
    return getResolvedTaskBoardStatuses(org);
}

/** Returns false if response was already sent (404/403). */
async function assertOrgTasksHubBeta(req, res, orgId) {
    const models = getModels(req, 'Org');
    const org = await models.Org.findById(asObjectId(orgId)).select('betaFeatureKeys').lean();
    if (!org) {
        res.status(404).json({ success: false, message: 'Organization not found' });
        return false;
    }
    if (!orgHasBetaFeature(org, ORG_BETA_FEATURE_ORG_TASKS)) {
        res.status(403).json({
            success: false,
            code: 'BETA_FEATURE_DISABLED',
            featureKey: ORG_BETA_FEATURE_ORG_TASKS,
            message: 'Organization task hub is not enabled for this organization'
        });
        return false;
    }
    return true;
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
    const models = getModels(req, 'Task', 'Event', 'Org');

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

// Persist drag order within one status column (event tasks)
router.put('/:orgId/events/:eventId/tasks/column-order', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId } = req.params;
    const { taskIds } = req.body || {};
    const models = getModels(req, 'Task', 'Event');

    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        if (!Array.isArray(taskIds)) {
            return res.status(400).json({ success: false, message: 'taskIds must be an array' });
        }
        await applyTaskColumnOrder(models, orgId, taskIds, eventId);
        return res.status(200).json({ success: true, message: 'Order updated' });
    } catch (error) {
        console.error('Error updating event task column order:', error);
        return res.status(500).json({ success: false, message: 'Error updating order', error: error.message });
    }
});

// Get single event task
router.get('/:orgId/events/:eventId/tasks/:taskId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId, taskId } = req.params;
    const models = getModels(req, 'Task', 'Event', 'Org');

    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        const task = await findOneTaskDto(models, orgId, taskId, eventId);
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        return res.status(200).json({ success: true, data: { task } });
    } catch (error) {
        console.error('Error loading event task:', error);
        return res.status(500).json({ success: false, message: 'Error loading task', error: error.message });
    }
});

// Create event task
router.post('/:orgId/events/:eventId/tasks', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId } = req.params;
    const payload = req.body || {};
    const models = getModels(req, 'Task', 'Event', 'Org');

    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        if (!payload.title || !String(payload.title).trim()) {
            return res.status(400).json({ success: false, message: 'Task title is required' });
        }

        const statusConfig = await loadOrgTaskBoardConfig(models, orgId);
        const task = new models.Task({
            orgId: asObjectId(orgId),
            eventId: asObjectId(eventId),
            title: String(payload.title).trim(),
            description: payload.description || '',
            status: normalizeTaskStatusForOrg(payload.status || 'todo', statusConfig),
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
    const models = getModels(req, 'Task', 'Event', 'Org');

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

        const statusConfig = await loadOrgTaskBoardConfig(models, orgId);
        applyTaskPatch(task, payload, statusConfig);
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
    const models = getModels(req, 'Task', 'Event', 'ApprovalInstance', 'EventEquipment', 'EventJob', 'Org');

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
    const models = getModels(req, 'Task', 'Event', 'Org');

    try {
        if (!(await assertOrgTasksHubBeta(req, res, orgId))) return;
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

// Get single hub task (org-scoped)
router.get('/:orgId/tasks/hub/:taskId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, taskId } = req.params;
    const models = getModels(req, 'Task', 'Org');

    try {
        if (!(await assertOrgTasksHubBeta(req, res, orgId))) return;
        const task = await findOneTaskDto(models, orgId, taskId, null);
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        return res.status(200).json({ success: true, data: { task } });
    } catch (error) {
        console.error('Error loading hub task:', error);
        return res.status(500).json({ success: false, message: 'Error loading task', error: error.message });
    }
});

// Create organization-level operational task (non-event task)
router.post('/:orgId/tasks/hub', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId } = req.params;
    const payload = req.body || {};
    const models = getModels(req, 'Task', 'Org');

    try {
        if (!(await assertOrgTasksHubBeta(req, res, orgId))) return;
        if (!payload.title || !String(payload.title).trim()) {
            return res.status(400).json({ success: false, message: 'Task title is required' });
        }

        const ownerObjectId = payload.ownerUserId && asObjectId(payload.ownerUserId);
        const eventObjectId = payload.eventId && asObjectId(payload.eventId);
        const statusConfig = await loadOrgTaskBoardConfig(models, orgId);

        const task = new models.Task({
            orgId: asObjectId(orgId),
            eventId: eventObjectId || null,
            title: String(payload.title).trim(),
            description: payload.description || '',
            status: normalizeTaskStatusForOrg(payload.status || 'todo', statusConfig),
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

// Persist drag order within one status column (org task hub — any eventId per task).
// MUST be registered before PUT /:orgId/tasks/hub/:taskId or "column-order" is parsed as taskId.
router.put('/:orgId/tasks/hub/column-order', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId } = req.params;
    const { taskIds } = req.body || {};
    const models = getModels(req, 'Task');

    try {
        if (!(await assertOrgTasksHubBeta(req, res, orgId))) return;
        if (!Array.isArray(taskIds)) {
            return res.status(400).json({ success: false, message: 'taskIds must be an array' });
        }
        await applyTaskColumnOrder(models, orgId, taskIds, undefined);
        return res.status(200).json({ success: true, message: 'Order updated' });
    } catch (error) {
        console.error('Error updating hub task column order:', error);
        return res.status(500).json({ success: false, message: 'Error updating order', error: error.message });
    }
});

// Update organization-level task by id
router.put('/:orgId/tasks/hub/:taskId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, taskId } = req.params;
    const payload = req.body || {};
    const models = getModels(req, 'Task', 'Event', 'Org');

    try {
        if (!(await assertOrgTasksHubBeta(req, res, orgId))) return;
        const task = await models.Task.findOne({
            _id: asObjectId(taskId),
            orgId: asObjectId(orgId)
        });
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        const statusConfig = await loadOrgTaskBoardConfig(models, orgId);
        applyTaskPatch(task, payload, statusConfig);

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

// Delete organization-level task by id
router.delete('/:orgId/tasks/hub/:taskId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, taskId } = req.params;
    const models = getModels(req, 'Task');
    try {
        if (!(await assertOrgTasksHubBeta(req, res, orgId))) return;
        const deleted = await models.Task.findOneAndDelete({
            _id: asObjectId(taskId),
            orgId: asObjectId(orgId)
        });
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        return res.status(200).json({ success: true, message: 'Task deleted' });
    } catch (error) {
        console.error('Error deleting hub task:', error);
        return res.status(500).json({ success: false, message: 'Error deleting task', error: error.message });
    }
});

// Suggested event tasks based on template/event type
router.get('/:orgId/events/:eventId/task-suggestions', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId } = req.params;
    const { templateId, eventType } = req.query;
    const models = getModels(req, 'Task', 'Event', 'EventTemplate', 'Org');
    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        const statusConfig = await loadOrgTaskBoardConfig(models, orgId);
        const librarySuggestions = getSuggestedTasksForEvent(event, { eventType }).map((s) => ({
            ...s,
            status: normalizeTaskStatusForOrg(s.status || 'todo', statusConfig)
        }));
        const template = templateId
            ? await models.EventTemplate.findOne({ _id: asObjectId(templateId), orgId: asObjectId(orgId), isActive: true }).lean()
            : null;
        const templateTasks = Array.isArray(template?.templateData?.taskBlueprint)
            ? template.templateData.taskBlueprint.map((task, idx) => ({
                key: task.templateTaskKey || `template_${idx + 1}`,
                title: String(task.title || '').trim(),
                description: task.description || '',
                priority: task.priority || 'medium',
                status: normalizeTaskStatusForOrg(task.status || 'todo', statusConfig),
                isCritical: Boolean(task.isCritical),
                dueRule: task.dueRule || { anchorType: 'none' },
                source: 'template_suggestion',
                userConfirmed: false,
                templateSource: {
                    templateId: template?._id || null,
                    templateTaskKey: task.templateTaskKey || `template_${idx + 1}`
                }
            })).filter((task) => task.title)
            : [];

        return res.status(200).json({
            success: true,
            data: {
                event: { _id: event._id, name: event.name, type: event.type },
                suggestions: [...librarySuggestions, ...templateTasks]
            }
        });
    } catch (error) {
        console.error('Error loading task suggestions:', error);
        return res.status(500).json({ success: false, message: 'Error loading task suggestions', error: error.message });
    }
});

// Apply selected suggestions to an event as confirmed tasks
router.post('/:orgId/events/:eventId/tasks/apply-suggestions', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { orgId, eventId } = req.params;
    const payload = req.body || {};
    const models = getModels(req, 'Task', 'Event', 'Org');
    try {
        const event = await ensureOrgEventAccess(models, orgId, eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        const statusConfig = await loadOrgTaskBoardConfig(models, orgId);
        const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
        if (!suggestions.length) {
            return res.status(400).json({ success: false, message: 'No suggestions provided' });
        }
        const approvalAnchorDate = null;
        const createdTasks = [];
        for (const suggestion of suggestions) {
            const title = String(suggestion?.title || '').trim();
            if (!title) continue;
            const task = new models.Task({
                orgId: asObjectId(orgId),
                eventId: asObjectId(eventId),
                title,
                description: suggestion.description || '',
                status: normalizeTaskStatusForOrg(suggestion.status || 'todo', statusConfig),
                priority: suggestion.priority || 'medium',
                isCritical: Boolean(suggestion.isCritical),
                source: suggestion.source || 'template_applied',
                userConfirmed: true,
                dueRule: suggestion.dueRule || { anchorType: 'none' },
                templateSource: suggestion.templateSource || undefined
            });
            task.dueAt = computeDueAtForTask(task, event, approvalAnchorDate);
            await task.save();
            createdTasks.push(task);
        }
        return res.status(201).json({
            success: true,
            message: 'Suggested tasks applied',
            data: { createdCount: createdTasks.length, tasks: createdTasks }
        });
    } catch (error) {
        console.error('Error applying task suggestions:', error);
        return res.status(500).json({ success: false, message: 'Error applying task suggestions', error: error.message });
    }
});

module.exports = router;
