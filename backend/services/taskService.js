const mongoose = require('mongoose');
const {
    DEFAULT_TASK_BOARD_STATUSES,
    getResolvedTaskBoardStatuses,
    resolveStatusCategory,
    normalizeTaskStatusForOrg,
    pickFirstDoneKey,
    pickDefaultActiveKey
} = require('./taskBoardStatusUtils');

const PRIORITY_WEIGHTS = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
};

const STATUS_SORT = {
    blocked: 0,
    in_progress: 1,
    todo: 2,
    done: 3,
    cancelled: 4
};

const TASK_SUGGESTION_LIBRARY = {
    default: [
        { key: 'kickoff', title: 'Run kickoff alignment', description: 'Confirm scope, owners, and timeline.', priority: 'high', status: 'todo', isCritical: true, dueRule: { anchorType: 'event_start', offsetValue: 21, offsetUnit: 'days', direction: 'before' } },
        { key: 'promotion', title: 'Publish promotion plan', description: 'Announce event channels and cadence.', priority: 'medium', status: 'todo', isCritical: false, dueRule: { anchorType: 'event_start', offsetValue: 14, offsetUnit: 'days', direction: 'before' } },
        { key: 'staffing', title: 'Confirm staffing coverage', description: 'Assign event-day roles and backups.', priority: 'high', status: 'todo', isCritical: true, dueRule: { anchorType: 'event_start', offsetValue: 7, offsetUnit: 'days', direction: 'before' } },
        { key: 'runbook', title: 'Finalize day-of runbook', description: 'Prepare timeline, contacts, and contingency notes.', priority: 'high', status: 'todo', isCritical: true, dueRule: { anchorType: 'event_start', offsetValue: 2, offsetUnit: 'days', direction: 'before' } },
        { key: 'retro', title: 'Post-event debrief', description: 'Capture outcomes and follow-up actions.', priority: 'medium', status: 'todo', isCritical: false, dueRule: { anchorType: 'event_end', offsetValue: 2, offsetUnit: 'days', direction: 'after' } }
    ],
    workshop: [
        { key: 'materials', title: 'Prepare workshop materials', description: 'Slides, handouts, and activity assets.', priority: 'high', status: 'todo', isCritical: true, dueRule: { anchorType: 'event_start', offsetValue: 5, offsetUnit: 'days', direction: 'before' } }
    ],
    social: [
        { key: 'guest-flow', title: 'Plan guest flow and check-in', description: 'Entry process, check-in points, and host assignments.', priority: 'medium', status: 'todo', isCritical: false, dueRule: { anchorType: 'event_start', offsetValue: 3, offsetUnit: 'days', direction: 'before' } }
    ]
};

function asObjectId(id) {
    if (!id) return null;
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
    return null;
}

function addOffset(baseDate, offsetValue, offsetUnit, direction) {
    const date = new Date(baseDate);
    const sign = direction === 'after' ? 1 : -1;
    const amount = Number(offsetValue || 0) * sign;
    switch (offsetUnit) {
        case 'minutes':
            date.setMinutes(date.getMinutes() + amount);
            break;
        case 'hours':
            date.setHours(date.getHours() + amount);
            break;
        case 'weeks':
            date.setDate(date.getDate() + (amount * 7));
            break;
        case 'days':
        default:
            date.setDate(date.getDate() + amount);
            break;
    }
    return date;
}

function computeDueAtForTask(task, event, approvalAnchorDate = null) {
    const dueRule = task?.dueRule || {};
    if (!dueRule || dueRule.anchorType === 'none') return null;
    if (dueRule.anchorType === 'absolute') {
        return dueRule.absoluteDate ? new Date(dueRule.absoluteDate) : null;
    }

    let anchorDate = null;
    if (dueRule.anchorType === 'event_start') {
        anchorDate = event?.start_time ? new Date(event.start_time) : null;
    } else if (dueRule.anchorType === 'event_end') {
        anchorDate = event?.end_time ? new Date(event.end_time) : null;
    } else if (dueRule.anchorType === 'approval_granted') {
        anchorDate = approvalAnchorDate ? new Date(approvalAnchorDate) : null;
    }

    if (!anchorDate) return null;
    return addOffset(anchorDate, dueRule.offsetValue, dueRule.offsetUnit, dueRule.direction);
}

async function resolveApprovalAnchorDate(models, eventId) {
    if (!eventId || !models?.ApprovalInstance) return null;
    try {
        const approval = await models.ApprovalInstance.findOne({
            eventId: asObjectId(eventId),
            status: 'approved'
        }).sort({ updatedAt: -1 }).lean();
        return approval?.updatedAt || null;
    } catch (_error) {
        return null;
    }
}

function buildTaskSort(sortBy = 'priority') {
    const boardTie = { boardRank: 1 };
    if (sortBy === 'dueAt') return { dueAt: 1, priority: -1, createdAt: -1, ...boardTie };
    if (sortBy === 'createdAt') return { createdAt: -1, ...boardTie };
    if (sortBy === 'status') return { status: 1, priority: -1, dueAt: 1, createdAt: -1, ...boardTie };
    return { priority: -1, dueAt: 1, createdAt: -1, ...boardTie };
}

function toTaskDto(task, statusConfig = DEFAULT_TASK_BOARD_STATUSES) {
    const plain = task.toObject ? task.toObject() : task;
    const blockedByUnresolved = (plain.blockers || []).some((blocker) => !blocker.resolved);
    const cat = resolveStatusCategory(plain.status, statusConfig);
    const isDone = cat === 'done';
    const isCancelled = cat === 'cancelled';
    const effectiveStatus =
        blockedByUnresolved && !isDone && !isCancelled ? 'blocked' : plain.status;

    return {
        ...plain,
        effectiveStatus,
        priorityWeight: PRIORITY_WEIGHTS[plain.priority] || PRIORITY_WEIGHTS.medium,
        overdue: Boolean(
            plain.dueAt && new Date(plain.dueAt) < new Date() && !isDone && !isCancelled
        )
    };
}

function computeUrgencyScore(taskDto) {
    const now = Date.now();
    const dueAtMs = taskDto.dueAt ? new Date(taskDto.dueAt).getTime() : null;
    const priority = PRIORITY_WEIGHTS[taskDto.priority] || PRIORITY_WEIGHTS.medium;
    const blockedPenalty = taskDto.effectiveStatus === 'blocked' ? 35 : 0;
    const criticalBoost = taskDto.isCritical ? 25 : 0;

    let dueScore = 0;
    if (dueAtMs) {
        const daysUntilDue = (dueAtMs - now) / (1000 * 60 * 60 * 24);
        if (daysUntilDue < 0) {
            dueScore = 50 + Math.min(30, Math.abs(daysUntilDue) * 5);
        } else if (daysUntilDue <= 1) {
            dueScore = 35;
        } else if (daysUntilDue <= 3) {
            dueScore = 25;
        } else if (daysUntilDue <= 7) {
            dueScore = 15;
        } else {
            dueScore = 8;
        }
    }

    return (priority * 12) + dueScore + criticalBoost + blockedPenalty;
}

function scoreBand(score) {
    if (score >= 85) return 'ready';
    if (score >= 65) return 'on_track';
    if (score >= 40) return 'at_risk';
    return 'not_ready';
}

/** @deprecated Use normalizeTaskStatusForOrg from taskBoardStatusUtils with org config */
function normalizeTaskStatus(status) {
    return normalizeTaskStatusForOrg(status, DEFAULT_TASK_BOARD_STATUSES);
}

function getSuggestedTasksForEvent(event = {}, options = {}) {
    const eventType = String(options.eventType || event.type || '').toLowerCase();
    const defaults = TASK_SUGGESTION_LIBRARY.default || [];
    const typeSpecific = TASK_SUGGESTION_LIBRARY[eventType] || [];
    return [...defaults, ...typeSpecific].map((suggestion) => ({
        ...suggestion,
        status: normalizeTaskStatus(suggestion.status || 'todo'),
        source: 'template_suggestion',
        userConfirmed: false
    }));
}

async function computeEventReadiness(models, orgId, eventId) {
    const eventObjectId = asObjectId(eventId);
    if (!eventObjectId) return null;

    const orgObjectId = asObjectId(orgId);
    const orgDoc = models.Org && orgObjectId
        ? await models.Org.findById(orgObjectId).select('taskBoardStatuses').lean()
        : null;
    const statusConfig = getResolvedTaskBoardStatuses(orgDoc);

    const [event, tasks, approvalInstances, equipment, roles] = await Promise.all([
        models.Event.findOne({ _id: eventObjectId, hostingType: 'Org', isDeleted: false }).lean(),
        models.Task.find({ orgId: orgObjectId, eventId: eventObjectId }).lean(),
        models.ApprovalInstance
            ? models.ApprovalInstance.find({ eventId: eventObjectId }).lean()
            : Promise.resolve([]),
        models.EventEquipment
            ? models.EventEquipment.findOne({ eventId: eventObjectId }).lean()
            : Promise.resolve(null),
        models.EventJob
            ? models.EventJob.find({ eventId: eventObjectId }).lean()
            : Promise.resolve([])
    ]);

    if (!event) return null;

    const actionableTasks = tasks.filter(
        (task) => resolveStatusCategory(task.status, statusConfig) !== 'cancelled'
    );
    const totalTaskWeight = actionableTasks.reduce((sum, task) => sum + Math.max(0, Number(task?.readinessContribution?.weight ?? 1)), 0);
    const doneTaskWeight = actionableTasks
        .filter((task) => resolveStatusCategory(task.status, statusConfig) === 'done')
        .reduce((sum, task) => sum + Math.max(0, Number(task?.readinessContribution?.weight ?? 1)), 0);
    const weightedBlockedTasks = actionableTasks.filter((task) =>
        task?.readinessContribution?.blocked || (task.blockers || []).some((blocker) => !blocker.resolved)
    );
    const blockedWeightPenalty = totalTaskWeight > 0
        ? Math.min(
            0.35,
            weightedBlockedTasks.reduce(
                (sum, task) => sum + Math.max(0, Number(task?.readinessContribution?.weight ?? 1)),
                0
            ) / totalTaskWeight
        )
        : 0;
    const taskCompletionRaw = totalTaskWeight > 0 ? (doneTaskWeight / totalTaskWeight) : 0;
    const taskCompletion = Math.max(0, taskCompletionRaw - blockedWeightPenalty);

    const criticalIncomplete = actionableTasks.filter((task) => {
        const c = resolveStatusCategory(task.status, statusConfig);
        return task.isCritical && c !== 'done' && c !== 'cancelled';
    });
    const blockedCritical = criticalIncomplete.filter((task) =>
        (task.blockers || []).some((blocker) => !blocker.resolved)
    );

    const approvalsRequired = approvalInstances.length > 0;
    const approvalsApproved = approvalInstances.filter((instance) => instance.status === 'approved').length;
    const approvalsScore = approvalsRequired
        ? approvalsApproved / approvalInstances.length
        : 1;

    const hasEquipment = Boolean(equipment?.items?.length);
    const roleCount = roles.length;
    const roleCoverage = roles.length === 0
        ? 1
        : roles.filter((role) => (role.assignments || []).length >= (role.requiredCount || 1)).length / roles.length;
    const logisticsScoreRaw = (roleCoverage * 0.7) + ((hasEquipment || roleCount === 0) ? 0.3 : 0);

    const registrationGoal = Number(event.expectedAttendance || 0);
    const registrations = Number(event.registrationCount || event.attendees?.length || 0);
    const engagementScore = registrationGoal > 0 ? Math.min(1, registrations / registrationGoal) : 1;

    const weightedScore = (
        (taskCompletion * 0.40) +
        (approvalsScore * 0.25) +
        (logisticsScoreRaw * 0.20) +
        (engagementScore * 0.15)
    ) * 100;

    const hardBlockers = [];
    if (blockedCritical.length > 0) {
        hardBlockers.push({
            type: 'critical_blocked_tasks',
            label: `${blockedCritical.length} critical task(s) blocked`,
            ownerUserIds: blockedCritical.map((task) => task.ownerUserId).filter(Boolean)
        });
    }
    const pendingApprovals = approvalInstances.filter((instance) => instance.status !== 'approved');
    if (pendingApprovals.length > 0) {
        hardBlockers.push({
            type: 'approvals_pending',
            label: `${pendingApprovals.length} approval item(s) unresolved`
        });
    }
    if (new Date(event.start_time).getTime() - Date.now() <= (72 * 60 * 60 * 1000) && criticalIncomplete.length > 0) {
        hardBlockers.push({
            type: 'critical_near_deadline',
            label: 'Critical tasks unresolved with less than 72h to event start'
        });
    }

    const cappedScore = hardBlockers.length > 0 ? Math.min(weightedScore, 64.9) : weightedScore;

    return {
        score: Math.round(cappedScore * 10) / 10,
        band: scoreBand(cappedScore),
        dimensions: {
            taskCompletion: Math.round(taskCompletion * 100),
            approvals: Math.round(approvalsScore * 100),
            logistics: Math.round(logisticsScoreRaw * 100),
            engagementReadiness: Math.round(engagementScore * 100)
        },
        blockers: hardBlockers,
        explainability: {
            weightedTaskCoverage: Math.round(taskCompletionRaw * 100),
            blockedWeightPenalty: Math.round(blockedWeightPenalty * 100),
            criticalIncompleteCount: criticalIncomplete.length,
            pendingApprovals: pendingApprovals.length
        },
        missing: [
            ...criticalIncomplete.map((task) => ({
                type: 'task',
                taskId: task._id,
                label: task.title,
                ownerUserId: task.ownerUserId || null
            }))
        ]
    };
}

async function recomputeDueDatesForEvent(models, orgId, eventId) {
    const eventObjectId = asObjectId(eventId);
    const orgObjectId = asObjectId(orgId);
    if (!eventObjectId || !orgObjectId) return 0;

    const [event, approvalAnchorDate, tasks] = await Promise.all([
        models.Event.findOne({ _id: eventObjectId, hostingType: 'Org', isDeleted: false }).lean(),
        resolveApprovalAnchorDate(models, eventObjectId),
        models.Task.find({ orgId: orgObjectId, eventId: eventObjectId })
    ]);

    if (!event || tasks.length === 0) return 0;

    let updates = 0;
    await Promise.all(tasks.map(async (task) => {
        const nextDueAt = computeDueAtForTask(task, event, approvalAnchorDate);
        const hasChanged = String(task.dueAt || '') !== String(nextDueAt || '');
        if (hasChanged) {
            task.dueAt = nextDueAt;
            await task.save();
            updates += 1;
        }
    }));
    return updates;
}

async function listTasks(models, orgId, options = {}) {
    const orgObjectId = asObjectId(orgId);
    if (!orgObjectId) return [];

    const orgDoc =
        models.Org && orgObjectId
            ? await models.Org.findById(orgObjectId).select('taskBoardStatuses').lean()
            : null;
    const statusConfig = getResolvedTaskBoardStatuses(orgDoc);

    const query = { orgId: orgObjectId };
    if (options.eventId === null || options.eventId === 'null') {
        query.eventId = null;
    } else if (options.eventId) {
        query.eventId = asObjectId(options.eventId);
    }
    if (options.status && options.status !== 'all') {
        query.status = options.status;
    }
    if (options.ownerUserId && options.ownerUserId !== 'unassigned') {
        query.ownerUserId = asObjectId(options.ownerUserId);
    } else if (options.ownerUserId === 'unassigned') {
        query.ownerUserId = null;
    }
    if (options.priority && options.priority !== 'all') {
        query.priority = options.priority;
    }
    if (options.search) {
        query.$or = [
            { title: { $regex: options.search, $options: 'i' } },
            { description: { $regex: options.search, $options: 'i' } }
        ];
    }

    const sort = buildTaskSort(options.sortBy);
    const tasks = await models.Task.find(query)
        .sort(sort)
        .populate('ownerUserId', 'name username picture')
        .populate('eventId', 'name start_time end_time')
        .lean();

    const taskDtos = tasks.map((t) => toTaskDto(t, statusConfig)).map((task) => ({
        ...task,
        urgencyScore: computeUrgencyScore(task)
    }));

    if (options.onlyOverdue) {
        return taskDtos.filter((task) => task.overdue);
    }
    if (options.onlyBlocked) {
        return taskDtos.filter((task) => task.effectiveStatus === 'blocked');
    }
    return taskDtos;
}

/**
 * Unique task owners per event for org (stable order: first task appearance).
 * Returns plain object: { [eventId]: [{ _id, name, username, picture }, ...] }
 */
async function buildEventTaskAssigneeSummary(models, orgId) {
    const orgObjectId = asObjectId(orgId);
    if (!orgObjectId || !models?.Task || !models?.User) {
        return {};
    }

    const tasks = await models.Task.find({
        orgId: orgObjectId,
        eventId: { $ne: null },
        ownerUserId: { $ne: null }
    })
        .select('eventId ownerUserId')
        .sort({ updatedAt: 1 })
        .lean();

    const byEvent = new Map();
    for (const t of tasks) {
        const eid = t.eventId != null ? String(t.eventId) : '';
        const uid = t.ownerUserId != null ? String(t.ownerUserId) : '';
        if (!eid || !uid) continue;
        if (!byEvent.has(eid)) byEvent.set(eid, []);
        const arr = byEvent.get(eid);
        if (!arr.includes(uid)) arr.push(uid);
    }

    const allIds = [...new Set([].concat(...byEvent.values()))];
    if (!allIds.length) return {};

    const oids = allIds.map((id) => asObjectId(id)).filter(Boolean);
    const users = await models.User.find({ _id: { $in: oids } })
        .select('name username picture')
        .lean();
    const userMap = new Map(
        users.map((u) => [
            String(u._id),
            { _id: u._id, name: u.name, username: u.username, picture: u.picture }
        ])
    );

    const assigneesByEventId = {};
    for (const [eid, uids] of byEvent.entries()) {
        assigneesByEventId[eid] = uids.map((id) => userMap.get(id)).filter(Boolean);
    }
    return assigneesByEventId;
}

async function findOneTaskDto(models, orgId, taskId, eventIdConstraint = null) {
    const orgObjectId = asObjectId(orgId);
    const taskObjectId = asObjectId(taskId);
    if (!orgObjectId || !taskObjectId || !models?.Task) return null;

    const orgDoc =
        models.Org && orgObjectId
            ? await models.Org.findById(orgObjectId).select('taskBoardStatuses').lean()
            : null;
    const statusConfig = getResolvedTaskBoardStatuses(orgDoc);

    const query = { _id: taskObjectId, orgId: orgObjectId };
    if (eventIdConstraint) {
        query.eventId = asObjectId(eventIdConstraint);
    }

    const task = await models.Task.findOne(query)
        .populate('ownerUserId', 'name username picture')
        .populate('eventId', 'name start_time end_time')
        .lean();
    if (!task) return null;

    const dto = toTaskDto(task, statusConfig);
    return {
        ...dto,
        urgencyScore: computeUrgencyScore(dto)
    };
}

function sortHubTasks(tasks, sortBy = 'urgency') {
    const byBoardRank = (a, b) => {
        const d = (Number(a.boardRank) || 0) - (Number(b.boardRank) || 0);
        if (d !== 0) return d;
        return (new Date(a.createdAt).getTime()) - (new Date(b.createdAt).getTime());
    };
    const cloned = [...tasks];
    if (sortBy === 'dueAt') {
        return cloned.sort((a, b) => {
            const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
            const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
            const byDue = aDue - bDue;
            if (byDue !== 0) return byDue;
            return byBoardRank(a, b);
        });
    }
    if (sortBy === 'priority') {
        return cloned.sort((a, b) => {
            const byPriority = (b.priorityWeight || 0) - (a.priorityWeight || 0);
            if (byPriority !== 0) return byPriority;
            const byStatus = (STATUS_SORT[a.effectiveStatus] ?? 10) - (STATUS_SORT[b.effectiveStatus] ?? 10);
            if (byStatus !== 0) return byStatus;
            return byBoardRank(a, b);
        });
    }
    return cloned.sort((a, b) => {
        const byU = (b.urgencyScore || 0) - (a.urgencyScore || 0);
        if (byU !== 0) return byU;
        return byBoardRank(a, b);
    });
}

/**
 * Persist 0..n-1 boardRank for tasks in one column (org-scoped; optional event scope).
 * @param {import('mongoose').Model} models
 * @param {string} orgId
 * @param {string[]} taskIdsOrdered
 * @param {string|null|undefined} eventId - if set, only tasks for this event; if null, only hub tasks (eventId null); if undefined, any event under org
 */
async function applyTaskColumnOrder(models, orgId, taskIdsOrdered, eventId) {
    const orgOid = asObjectId(orgId);
    if (!orgOid || !models?.Task || !Array.isArray(taskIdsOrdered)) {
        return { updated: 0 };
    }
    let updated = 0;
    for (let i = 0; i < taskIdsOrdered.length; i += 1) {
        const id = asObjectId(taskIdsOrdered[i]);
        if (!id) continue;
        const q = { _id: id, orgId: orgOid };
        if (eventId !== undefined) {
            q.eventId = eventId ? asObjectId(eventId) : null;
        }
        const res = await models.Task.updateOne(q, { $set: { boardRank: i } });
        if (res.modifiedCount || res.matchedCount) updated += 1;
    }
    return { updated };
}

module.exports = {
    PRIORITY_WEIGHTS,
    asObjectId,
    applyTaskColumnOrder,
    computeDueAtForTask,
    computeEventReadiness,
    getSuggestedTasksForEvent,
    normalizeTaskStatus,
    normalizeTaskStatusForOrg,
    getResolvedTaskBoardStatuses,
    pickFirstDoneKey,
    pickDefaultActiveKey,
    DEFAULT_TASK_BOARD_STATUSES,
    syncApprovalLinkedTasks: async (models, orgId, eventId, approvalInstanceId, approvalStatus = 'pending') => {
        const orgObjectId = asObjectId(orgId);
        const eventObjectId = asObjectId(eventId);
        if (!orgObjectId || !eventObjectId || !approvalInstanceId || !models?.Task) return 0;
        const tasks = await models.Task.find({
            orgId: orgObjectId,
            eventId: eventObjectId,
            integrationLinks: {
                $elemMatch: {
                    type: 'approval_instance',
                    referenceId: String(approvalInstanceId)
                }
            }
        });
        if (!tasks.length) return 0;
        const shouldResolve = approvalStatus === 'approved';
        let updates = 0;
        await Promise.all(tasks.map(async (task) => {
            let changed = false;
            task.integrationLinks = (task.integrationLinks || []).map((link) => {
                if (link.type !== 'approval_instance' || String(link.referenceId) !== String(approvalInstanceId)) {
                    return link;
                }
                if (link.status !== approvalStatus) {
                    changed = true;
                    return { ...link, status: approvalStatus };
                }
                return link;
            });
            task.blockers = (task.blockers || []).map((blocker) => {
                if (blocker.type !== 'approval' || String(blocker.referenceId) !== String(approvalInstanceId)) {
                    return blocker;
                }
                if (blocker.resolved !== shouldResolve) {
                    changed = true;
                    return { ...blocker, resolved: shouldResolve };
                }
                return blocker;
            });
            if (changed) {
                await task.save();
                updates += 1;
            }
        }));
        return updates;
    },
    recomputeDueDatesForEvent,
    listTasks,
    findOneTaskDto,
    sortHubTasks,
    buildEventTaskAssigneeSummary
};
