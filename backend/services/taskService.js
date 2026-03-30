const mongoose = require('mongoose');

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
    if (sortBy === 'dueAt') return { dueAt: 1, priority: -1, createdAt: -1 };
    if (sortBy === 'createdAt') return { createdAt: -1 };
    if (sortBy === 'status') return { status: 1, priority: -1, dueAt: 1, createdAt: -1 };
    return { priority: -1, dueAt: 1, createdAt: -1 };
}

function toTaskDto(task) {
    const plain = task.toObject ? task.toObject() : task;
    const blockedByUnresolved = (plain.blockers || []).some((blocker) => !blocker.resolved);
    const effectiveStatus = blockedByUnresolved && plain.status !== 'done' && plain.status !== 'cancelled'
        ? 'blocked'
        : plain.status;

    return {
        ...plain,
        effectiveStatus,
        priorityWeight: PRIORITY_WEIGHTS[plain.priority] || PRIORITY_WEIGHTS.medium,
        overdue: Boolean(plain.dueAt && new Date(plain.dueAt) < new Date() && !['done', 'cancelled'].includes(plain.status))
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

async function computeEventReadiness(models, orgId, eventId) {
    const eventObjectId = asObjectId(eventId);
    if (!eventObjectId) return null;

    const [event, tasks, approvalInstances, equipment, roles] = await Promise.all([
        models.Event.findOne({ _id: eventObjectId, hostingType: 'Org', isDeleted: false }).lean(),
        models.Task.find({ orgId: asObjectId(orgId), eventId: eventObjectId }).lean(),
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

    const actionableTasks = tasks.filter((task) => !['cancelled'].includes(task.status));
    const doneTasks = actionableTasks.filter((task) => task.status === 'done');
    const taskCompletion = actionableTasks.length > 0
        ? (doneTasks.length / actionableTasks.length)
        : 0;

    const criticalIncomplete = actionableTasks.filter(
        (task) => task.isCritical && !['done', 'cancelled'].includes(task.status)
    );
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

    const taskDtos = tasks.map(toTaskDto).map((task) => ({
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

function sortHubTasks(tasks, sortBy = 'urgency') {
    const cloned = [...tasks];
    if (sortBy === 'dueAt') {
        return cloned.sort((a, b) => {
            const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
            const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
            return aDue - bDue;
        });
    }
    if (sortBy === 'priority') {
        return cloned.sort((a, b) => {
            const byPriority = (b.priorityWeight || 0) - (a.priorityWeight || 0);
            if (byPriority !== 0) return byPriority;
            const byStatus = (STATUS_SORT[a.effectiveStatus] ?? 10) - (STATUS_SORT[b.effectiveStatus] ?? 10);
            if (byStatus !== 0) return byStatus;
            return (new Date(a.createdAt).getTime()) - (new Date(b.createdAt).getTime());
        });
    }
    return cloned.sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));
}

module.exports = {
    PRIORITY_WEIGHTS,
    asObjectId,
    computeDueAtForTask,
    computeEventReadiness,
    recomputeDueDatesForEvent,
    listTasks,
    sortHubTasks
};
