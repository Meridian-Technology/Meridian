/**
 * Upcoming / live events for tenant admin views (tenant-scoped, elevated roles).
 * Uses getModels(req, ...) per backend best practices.
 */

const getModels = require('./getModelService');
const mongoose = require('mongoose');

const MAX_LIMIT = 40;

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAnalyticsEventIdMatch(eventIds) {
    const strIds = [...new Set((eventIds || []).map((id) => String(id)).filter(Boolean))];
    const objIds = strIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    return {
        strIds,
        match: {
            $or: [{ 'properties.event_id': { $in: strIds } }, { 'properties.event_id': { $in: objIds } }],
        },
    };
}

async function buildAnalyticsByEventId(AnalyticsEvent, eventIds) {
    const { strIds, match } = buildAnalyticsEventIdMatch(eventIds);
    if (!strIds.length) return new Map();

    const rows = await AnalyticsEvent.aggregate([
        {
            $match: {
                event: { $in: ['event_view', 'event_registration'] },
                ...match,
            },
        },
        {
            $group: {
                _id: { eventId: '$properties.event_id', event: '$event' },
                count: { $sum: 1 },
            },
        },
    ]);

    const map = new Map();
    for (const row of rows) {
        const eventId = row?._id?.eventId != null ? String(row._id.eventId) : '';
        if (!eventId) continue;
        if (!map.has(eventId)) {
            map.set(eventId, {
                views: 0,
                uniqueViews: 0,
                registrations: 0,
                uniqueRegistrations: 0,
            });
        }
        const current = map.get(eventId);
        if (row?._id?.event === 'event_view') {
            current.views = row.count ?? 0;
        } else if (row?._id?.event === 'event_registration') {
            current.registrations = row.count ?? 0;
        }
    }
    return map;
}

/**
 * @param {import('express').Request} req
 * @param {{ page?: number, limit?: number, q?: string, includePast?: boolean }} opts
 */
async function listAdminTenantUpcomingEvents(req, opts = {}) {
    const { Event, AnalyticsEvent } = getModels(req, 'Event', 'AnalyticsEvent');
    const rawPage = Math.max(1, parseInt(String(opts.page ?? 1), 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(opts.limit ?? 20), 10) || 20));

    const rawQ = typeof opts.q === 'string' ? opts.q.trim() : '';
    const q = rawQ.length >= 3 ? rawQ : '';
    const includePast = Boolean(opts.includePast);

    const now = new Date();
    const query = {
        isDeleted: { $ne: true },
    };
    if (!includePast) {
        query.end_time = { $gte: now };
    }
    if (q) {
        query.name = { $regex: escapeRegex(q), $options: 'i' };
    }

    const sort = includePast ? { start_time: -1 } : { start_time: 1 };

    const total = await Event.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(rawPage, totalPages);
    const skip = (page - 1) * limit;

    const events = await Event.find(query)
        .select(
            'name start_time end_time status visibility type hostingType hostingId location expectedAttendance registrationCount'
        )
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

    const ids = events.map((e) => e._id).filter(Boolean);
    let analyticsById = new Map();
    if (ids.length) {
        analyticsById = await buildAnalyticsByEventId(AnalyticsEvent, ids);
    }

    const enrichedEvents = events.map((e) => {
        const a = analyticsById.get(String(e._id));
        return {
            ...e,
            analyticsSummary: a
                ? {
                      views: a.views ?? 0,
                      uniqueViews: a.uniqueViews ?? 0,
                      registrations: a.registrations ?? 0,
                      uniqueRegistrations: a.uniqueRegistrations ?? 0,
                  }
                : {
                      views: 0,
                      uniqueViews: 0,
                      registrations: 0,
                      uniqueRegistrations: 0,
                  },
        };
    });

    return {
        events: enrichedEvents,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}

module.exports = {
    listAdminTenantUpcomingEvents,
};
