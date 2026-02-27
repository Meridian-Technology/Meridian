const getModels = require('./getModelService');
const mongoose = require('mongoose');

const DEFAULT_LOOKAHEAD_DAYS = 60;
const DEFAULT_MAX_OCCURRENCES = 20;

/**
 * Parse time string (e.g. "14:00") into hours and minutes.
 */
function parseTimeOfDay(timeStr) {
    const match = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
        return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
    }
    return { hours: 14, minutes: 0 };
}

/**
 * Create a date at the given time on the given day.
 */
function dateAtTime(date, timeStr) {
    const { hours, minutes } = parseTimeOfDay(timeStr);
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    return d;
}

/**
 * Check if a date is in excludeDates (compare date parts only).
 */
function isExcluded(date, excludeDates = []) {
    if (!excludeDates.length) return false;
    const dStr = date.toISOString().split('T')[0];
    return excludeDates.some((ex) => {
        const exDate = ex instanceof Date ? ex : new Date(ex);
        return exDate.toISOString().split('T')[0] === dStr;
    });
}

/**
 * Generate occurrence dates for a recurring rule.
 */
function generateOccurrenceDates(rule, fromDate, maxCount = DEFAULT_MAX_OCCURRENCES) {
    const dates = [];
    const start = new Date(Math.max(rule.startDate.getTime(), fromDate.getTime()));
    const endLimit = rule.endDate
        ? new Date(Math.min(
            rule.endDate.getTime(),
            fromDate.getTime() + DEFAULT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000
        ))
        : new Date(fromDate.getTime() + DEFAULT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const limit = rule.occurrenceLimit ? Math.min(maxCount, rule.occurrenceLimit) : maxCount;

    const interval = rule.interval || 1;
    const days = (rule.daysOfWeek && rule.daysOfWeek.length) ? rule.daysOfWeek : [rule.startDate.getDay()];
    let cursor = new Date(start);

    while (dates.length < limit && cursor <= endLimit) {
        const candidates = [];

        switch (rule.recurrenceType) {
            case 'daily': {
                const d = dateAtTime(cursor, rule.timeOfDay);
                if (d >= start && d <= endLimit && !isExcluded(d, rule.excludeDates)) {
                    candidates.push(d);
                }
                cursor.setDate(cursor.getDate() + interval);
                break;
            }
            case 'weekly':
            case 'biweekly': {
                const weekMs = 7 * 24 * 60 * 60 * 1000;
                const baseWeekStart = new Date(rule.startDate);
                baseWeekStart.setHours(0, 0, 0, 0);
                for (const dayOfWeek of days) {
                    const d = new Date(cursor);
                    const diff = (dayOfWeek - d.getDay() + 7) % 7;
                    d.setDate(d.getDate() + diff);
                    const atTime = dateAtTime(d, rule.timeOfDay);
                    if (atTime < start) continue;
                    if (atTime > endLimit) continue;
                    if (isExcluded(atTime, rule.excludeDates)) continue;
                    if (rule.recurrenceType === 'biweekly') {
                        const weeksFromStart = Math.floor((atTime - rule.startDate) / weekMs);
                        if (weeksFromStart % 2 !== 0) continue;
                    }
                    candidates.push(atTime);
                }
                cursor.setDate(cursor.getDate() + 7 * interval * (rule.recurrenceType === 'biweekly' ? 2 : 1));
                break;
            }
            case 'monthly': {
                if (rule.dayOfMonth) {
                    const d = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(rule.dayOfMonth, 28));
                    const atTime = dateAtTime(d, rule.timeOfDay);
                    if (atTime >= start && atTime <= endLimit && !isExcluded(atTime, rule.excludeDates)) {
                        candidates.push(atTime);
                    }
                } else if ((rule.weekOfMonth || rule.daysOfWeek) && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
                    const weekNum = rule.weekOfMonth === 'last' ? 5 : (parseInt(rule.weekOfMonth, 10) || 1);
                    const dayOfWeek = rule.daysOfWeek[0];
                    let d = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
                    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
                    let occurrences = [];
                    for (let day = 1; day <= lastDay; day++) {
                        d.setDate(day);
                        if (d.getDay() === dayOfWeek) occurrences.push(new Date(d));
                    }
                    const target = rule.weekOfMonth === 'last' ? occurrences[occurrences.length - 1] : occurrences[weekNum - 1];
                    if (target) {
                        const atTime = dateAtTime(target, rule.timeOfDay);
                        if (atTime >= start && atTime <= endLimit && !isExcluded(atTime, rule.excludeDates)) {
                            candidates.push(atTime);
                        }
                    }
                }
                cursor.setMonth(cursor.getMonth() + interval);
                break;
            }
            default:
                cursor.setDate(cursor.getDate() + 7);
        }

        candidates.sort((a, b) => a - b);
        for (const c of candidates) {
            if (dates.length >= limit) break;
            dates.push(c);
        }
    }

    return dates.slice(0, limit);
}

/**
 * Generate upcoming Event instances from a RecurringMeetingRule.
 * @param {Object} rule - RecurringMeetingRule document
 * @param {Object} req - Request object (for getModels)
 * @param {Object} options - { fromDate?, maxOccurrences? }
 * @returns {Promise<Array<Object>>} Created Event documents
 */
async function generateUpcomingInstances(rule, req, options = {}) {
    const { Event, MeetingConfig, EventAgenda } = getModels(req, 'Event', 'MeetingConfig', 'EventAgenda');
    const fromDate = options.fromDate || new Date();
    const maxOccurrences = options.maxOccurrences ?? DEFAULT_MAX_OCCURRENCES;

    const dates = generateOccurrenceDates(rule, fromDate, maxOccurrences);
    const created = [];

    for (const startTime of dates) {
        const endTime = new Date(startTime.getTime() + (rule.durationMinutes || 60) * 60 * 1000);

        const existing = await Event.findOne({
            hostingId: rule.orgId,
            hostingType: 'Org',
            start_time: startTime,
            isDeleted: false,
            'customFields.recurringRuleId': rule._id
        });

        if (existing) continue;

        const event = new Event({
            name: rule.name,
            type: 'meeting',
            start_time: startTime,
            end_time: endTime,
            location: rule.location,
            description: rule.description || '',
            expectedAttendance: rule.expectedAttendance || 10,
            visibility: rule.visibility || 'members_only',
            hostingId: rule.orgId,
            hostingType: 'Org',
            status: 'not-applicable',
            registrationEnabled: true,
            registrationRequired: false,
            attendees: [],
            registrationCount: 0,
            checkInEnabled: true,
            customFields: {
                recurringRuleId: rule._id,
                meetingType: rule.meetingType
            }
        });

        await event.save();

        const meetingConfig = new MeetingConfig({
            eventId: event._id,
            meetingType: rule.meetingType,
            requiredRoles: rule.requiredRoles || ['members'],
            reminderConfig: { enabled: true, leadTimeMinutes: 60 * 24, channels: ['in_app', 'email'] }
        });
        await meetingConfig.save();

        if (event.hostingType === 'Org' && event.hostingId) {
            try {
                let agenda = await EventAgenda.findOne({ eventId: event._id, orgId: rule.orgId });
                if (!agenda) {
                    agenda = new EventAgenda({ eventId: event._id, orgId: rule.orgId });
                    await agenda.save();
                }
            } catch (e) {
                // Non-fatal
            }
        }

        created.push(event);
    }

    return created;
}

module.exports = {
    generateUpcomingInstances,
    generateOccurrenceDates
};
