const { MANIFEST_KEY } = require('./seedDemoTenantService');
const { getDemoModels } = require('./demoModelService');

const VALID_PHASES = new Set(['planning', 'runOfShow', 'postMortem', 'drafting']);
const LIVE_AGENDA_ITEM_INDEX = 3;

function normalizePhase(phase) {
    const value = String(phase || 'planning').trim();
    return VALID_PHASES.has(value) ? value : 'planning';
}

function phaseToOperationalStatus(phase) {
    if (phase === 'runOfShow') return 'active';
    if (phase === 'postMortem') return 'completed';
    return 'upcoming';
}

function isPreEventTask(task) {
    const rule = task?.dueRule || {};
    if (rule.direction === 'before') return true;
    if (rule.anchorType === 'event_start' && rule.direction !== 'after') return true;
    return false;
}

function isPostEventTask(task) {
    const rule = task?.dueRule || {};
    if (rule.direction === 'after') return true;
    if (rule.anchorType === 'event_end') return true;
    return false;
}

function withTaskStatus(task, status) {
    return { ...task, status, effectiveStatus: status };
}

function applyPhaseToTasks(tasks, phase) {
    const list = Array.isArray(tasks) ? tasks.map((task) => (
        task?.toObject ? task.toObject() : { ...task }
    )) : [];

    return list.map((task) => {
        const title = String(task.title || '').toLowerCase();
        const pre = isPreEventTask(task);
        const post = isPostEventTask(task);

        if (phase === 'planning') {
            if (pre) {
                if (title.includes('finalize')) return withTaskStatus(task, 'done');
                if (title.includes('reminder') || title.includes('volunteer')) {
                    return withTaskStatus(task, 'in_progress');
                }
                return withTaskStatus(task, 'todo');
            }
            if (post) return withTaskStatus(task, 'todo');
        }

        if (phase === 'runOfShow') {
            if (pre) return withTaskStatus(task, 'done');
            if (post) return withTaskStatus(task, 'todo');
        }

        if (phase === 'postMortem') {
            if (pre) return withTaskStatus(task, 'done');
            if (post) {
                if (title.includes('thank') || title.includes('feedback')) {
                    return withTaskStatus(task, 'in_progress');
                }
                return withTaskStatus(task, 'todo');
            }
        }

        return task;
    });
}

function applyPhaseToAttendees(attendees, phase) {
    const list = Array.isArray(attendees) ? attendees.map((row) => ({ ...row })) : [];
    if (phase === 'planning') {
        return list.map((row) => ({ ...row, checkedIn: false, checkedInAt: undefined }));
    }
    if (phase === 'postMortem') {
        const checkedInTarget = Math.floor(list.length * 0.82);
        return list.map((row, index) => ({
            ...row,
            checkedIn: index < checkedInTarget,
            checkedInAt: index < checkedInTarget ? row.checkedInAt || row.registeredAt : undefined,
        }));
    }
    const checkedInTarget = Math.floor(list.length * 0.68);
    return list.map((row, index) => ({
        ...row,
        checkedIn: index < checkedInTarget,
        checkedInAt: index < checkedInTarget ? row.checkedInAt || row.registeredAt : undefined,
    }));
}

function applyPhaseToRegistrationStats(registrationCount, phase) {
    if (phase === 'planning') {
        return Math.max(1, Math.floor(registrationCount * 0.88));
    }
    return registrationCount;
}

function applyPhaseToAnalytics(analytics, phase, registrationCount) {
    const base = analytics || {
        views: 0,
        uniqueViews: 0,
        registrations: registrationCount,
        uniqueRegistrations: registrationCount,
        engagementRate: 0,
    };
    if (phase === 'planning') {
        const registrations = applyPhaseToRegistrationStats(registrationCount, phase);
        return {
            ...base,
            views: Math.max(base.views, 420),
            uniqueViews: Math.max(base.uniqueViews, 310),
            registrations,
            uniqueRegistrations: registrations,
            engagementRate: 0.58,
        };
    }
    if (phase === 'postMortem') {
        return {
            ...base,
            views: Math.max(base.views, 980),
            uniqueViews: Math.max(base.uniqueViews, 720),
            registrations: registrationCount,
            uniqueRegistrations: registrationCount,
            engagementRate: 0.81,
        };
    }
    return {
        ...base,
        views: Math.max(base.views, 842),
        uniqueViews: Math.max(base.uniqueViews, 614),
        registrations: registrationCount,
        uniqueRegistrations: registrationCount,
        engagementRate: 0.73,
    };
}

function applyPhaseToAgenda(agenda, phase) {
    const doc = agenda?.toObject ? agenda.toObject() : { ...(agenda || {}) };
    const items = (doc.items || []).map((item, index) => {
        const row = { ...(item?.toObject ? item.toObject() : item) };
        if (phase === 'runOfShow') {
            row.isLive = index === LIVE_AGENDA_ITEM_INDEX;
            row.isPast = index < LIVE_AGENDA_ITEM_INDEX;
            row.isUpcoming = index > LIVE_AGENDA_ITEM_INDEX;
        } else if (phase === 'planning') {
            row.isLive = false;
            row.isPast = false;
            row.isUpcoming = true;
        } else if (phase === 'postMortem') {
            row.isLive = false;
            row.isPast = true;
            row.isUpcoming = false;
        } else {
            row.isLive = false;
            row.isPast = false;
            row.isUpcoming = false;
        }
        return row;
    });

    const liveItem = items.find((item) => item.isLive) || null;

    return {
        ...doc,
        items,
        demoPhase: phase,
        liveItemId: liveItem?.id || null,
        liveItemTitle: liveItem?.title || null,
    };
}

function summarizeTasks(tasks) {
    const total = tasks.length;
    const done = tasks.filter((task) => /(done|completed)/i.test(task.status || '')).length;
    const inProgress = tasks.filter((task) => /in_progress/i.test(task.status || '')).length;
    const todo = tasks.filter((task) => task.status === 'todo').length;
    const open = total - done;
    return {
        total,
        done,
        inProgress,
        todo,
        open,
        completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    };
}

async function loadBaseDashboardData(db, manifest) {
    const {
        Event, EventAnalytics, EventAgenda, EventJob, VolunteerSignup, EventEquipment, Task,
    } = getDemoModels(db);

    const event = await Event.findOne({
        _id: manifest.eventId,
        hostingType: 'Org',
        isDeleted: false,
    })
        .populate('hostingId', 'org_name org_profile_image')
        .populate('collaboratorOrgs.orgId', 'org_name org_profile_image');

    if (!event) {
        const err = new Error('Seeded demo event not found. Run POST /admin/seed-demo-tenant first.');
        err.code = 'DEMO_NOT_SEEDED';
        throw err;
    }

    const [analytics, agenda, roles, signups, equipment, tasks] = await Promise.all([
        EventAnalytics.findOne({ eventId: manifest.eventId }),
        EventAgenda.findOne({ eventId: manifest.eventId }),
        EventJob.find({ eventId: manifest.eventId }),
        VolunteerSignup.find({ eventId: manifest.eventId }).populate('memberId', 'name email'),
        EventEquipment.findOne({ eventId: manifest.eventId }),
        Task.find({ eventId: manifest.eventId, orgId: manifest.orgId }).sort({ boardRank: 1, createdAt: 1 }).lean(),
    ]);

    const totalVolunteers = roles.reduce((sum, role) => sum + (role.assignments?.length || 0), 0);
    const confirmedVolunteers = roles.reduce(
        (sum, role) => sum + (role.assignments?.filter((a) => a.status === 'confirmed')?.length || 0),
        0
    );

    const registrationCount = event.registrationCount ?? (event.attendees?.length ?? 0);
    const checkedInCount = (event.attendees || []).filter((a) => a.checkedIn).length;

    let eventCheckIn = null;
    if (event.checkInEnabled && Array.isArray(event.attendees)) {
        const totalCheckedIn = event.attendees.filter((a) => a.checkedIn).length;
        const totalRegistrations = event.registrationCount ?? event.attendees.length;
        eventCheckIn = {
            totalCheckedIn,
            totalRegistrations,
            checkInRate: totalRegistrations > 0 ? ((totalCheckedIn / totalRegistrations) * 100).toFixed(1) : '0',
        };
    }

    const now = new Date();
    let operationalStatus = 'upcoming';
    if (event.start_time <= now && event.end_time >= now) {
        operationalStatus = 'active';
    } else if (event.end_time < now) {
        operationalStatus = 'completed';
    }

    return {
        event,
        analytics: analytics || {
            views: 0,
            uniqueViews: 0,
            registrations: 0,
            uniqueRegistrations: 0,
            engagementRate: 0,
        },
        agenda: agenda || { items: [] },
        tasks,
        roles: {
            total: roles.length,
            assignments: totalVolunteers,
            confirmed: confirmedVolunteers,
            signups: signups.length,
        },
        equipment: equipment || { items: [] },
        stats: {
            registrationCount,
            volunteers: {
                total: totalVolunteers,
                confirmed: confirmedVolunteers,
                checkedIn: checkedInCount,
            },
            operationalStatus,
            checkIn: eventCheckIn,
        },
        orgId: manifest.orgId,
    };
}

function buildPhaseSnapshot(base, normalizedPhase) {
    const eventObj = base.event.toObject ? base.event.toObject() : { ...base.event };
    const attendees = applyPhaseToAttendees(eventObj.attendees, normalizedPhase);
    eventObj.attendees = attendees;

    const fullRegistrationCount = attendees.length;
    const displayRegistrationCount = applyPhaseToRegistrationStats(fullRegistrationCount, normalizedPhase);
    eventObj.registrationCount = displayRegistrationCount;

    const checkedInCount = attendees.filter((a) => a.checkedIn).length;
    const operationalStatus = phaseToOperationalStatus(normalizedPhase);
    const shapedTasks = applyPhaseToTasks(base.tasks, normalizedPhase);
    const shapedAgenda = applyPhaseToAgenda(base.agenda, normalizedPhase);
    const taskSummary = summarizeTasks(shapedTasks);

    const checkIn = eventObj.checkInEnabled ? {
        totalCheckedIn: checkedInCount,
        totalRegistrations: fullRegistrationCount,
        checkInRate: fullRegistrationCount > 0
            ? ((checkedInCount / fullRegistrationCount) * 100).toFixed(1)
            : '0',
    } : null;

    return {
        event: eventObj,
        analytics: applyPhaseToAnalytics(base.analytics, normalizedPhase, displayRegistrationCount),
        agenda: shapedAgenda,
        tasks: shapedTasks,
        roles: base.roles,
        equipment: base.equipment,
        stats: {
            ...base.stats,
            registrationCount: displayRegistrationCount,
            fullRegistrationCount,
            operationalStatus,
            demoPhase: normalizedPhase,
            tasks: taskSummary,
            liveAgendaItemId: shapedAgenda.liveItemId,
            liveAgendaItemTitle: shapedAgenda.liveItemTitle,
            volunteers: {
                ...base.stats.volunteers,
                checkedIn: checkedInCount,
            },
            checkIn,
        },
    };
}

async function getDemoWorkspace(db, { phase } = {}) {
    const { DemoManifest } = getDemoModels(db);
    const manifest = await DemoManifest.findOne({ key: MANIFEST_KEY });
    if (!manifest) {
        const err = new Error('Demo tenant has not been seeded yet.');
        err.code = 'DEMO_NOT_SEEDED';
        throw err;
    }

    const normalizedPhase = normalizePhase(phase);
    const base = await loadBaseDashboardData(db, manifest);
    const data = buildPhaseSnapshot(base, normalizedPhase);

    return {
        manifest: {
            key: MANIFEST_KEY,
            orgId: manifest.orgId.toString(),
            eventId: manifest.eventId.toString(),
            operatorUserId: manifest.operatorUserId.toString(),
        },
        phase: normalizedPhase,
        data,
        orgId: manifest.orgId.toString(),
        eventId: manifest.eventId.toString(),
    };
}

function filterDemoTasks(tasks, { status = 'all', priority = 'all', search = '' } = {}) {
    let rows = [...tasks];
    if (status && status !== 'all') {
        rows = rows.filter((task) => (task.effectiveStatus || task.status) === status);
    }
    if (priority && priority !== 'all') {
        rows = rows.filter((task) => task.priority === priority);
    }
    const query = String(search || '').trim().toLowerCase();
    if (query) {
        rows = rows.filter((task) => String(task.title || '').toLowerCase().includes(query));
    }
    return rows;
}

async function getDemoTasks(db, { phase, status, priority, search } = {}) {
    const workspace = await getDemoWorkspace(db, { phase });
    const tasks = filterDemoTasks(workspace.data.tasks, { status, priority, search });
    return {
        phase: workspace.phase,
        event: {
            _id: workspace.data.event._id,
            name: workspace.data.event.name,
            start_time: workspace.data.event.start_time,
            end_time: workspace.data.event.end_time,
        },
        tasks,
        summary: workspace.data.stats.tasks,
    };
}

async function getDemoAgenda(db, { phase } = {}) {
    const workspace = await getDemoWorkspace(db, { phase });
    return {
        phase: workspace.phase,
        agenda: workspace.data.agenda,
    };
}

module.exports = {
    VALID_PHASES,
    LIVE_AGENDA_ITEM_INDEX,
    normalizePhase,
    applyPhaseToTasks,
    applyPhaseToAttendees,
    applyPhaseToAgenda,
    applyPhaseToAnalytics,
    applyPhaseToRegistrationStats,
    summarizeTasks,
    buildPhaseSnapshot,
    getDemoWorkspace,
    getDemoTasks,
    getDemoAgenda,
};
