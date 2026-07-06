const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MINUTES_PER_DAY = 24 * 60;

export function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function getMinutesInDay(date) {
    return date.getHours() * 60 + date.getMinutes();
}

export function toCalendarEvent(item) {
    return {
        ...item,
        start_time:
            typeof item.startTime === 'string'
                ? item.startTime
                : item.startTime?.toISOString?.() ?? new Date(item.startTime).toISOString(),
        end_time:
            typeof item.endTime === 'string'
                ? item.endTime
                : item.endTime?.toISOString?.() ?? new Date(item.endTime).toISOString()
    };
}

/** Split an agenda item into one segment per calendar day it intersects. */
export function splitItemIntoDaySegments(item, days) {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return [];
    }

    const segments = [];
    days.forEach((day, dayIndex) => {
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        const segStart = start > dayStart ? start : dayStart;
        const segEnd = end < dayEnd ? end : dayEnd;

        if (segStart < segEnd) {
            segments.push({
                ...item,
                dayIndex,
                segmentStart: segStart,
                segmentEnd: segEnd,
                continuesFromPrev: segStart > start,
                continuesToNext: segEnd < end,
                segmentKey: `${item.id}-day-${dayIndex}`
            });
        }
    });

    return segments;
}

/** Active (non-grey) minutes on a day column: event start → event end, clipped to that day. */
export function getDayActiveBounds(day, eventStart, eventEnd) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);

    if (eventEnd <= dayStart || eventStart >= dayEnd) {
        return { activeStartMinutes: 0, activeEndMinutes: 0 };
    }

    const activeStartMinutes = eventStart > dayStart ? getMinutesInDay(eventStart) : 0;
    const activeEndMinutes = eventEnd < dayEnd ? getMinutesInDay(eventEnd) : MINUTES_PER_DAY;

    return { activeStartMinutes, activeEndMinutes };
}

export function computeDayRange(agendaItems, event, dayStart, dayEnd) {
    const eventStart = event?.start_time ? new Date(event.start_time) : new Date();
    const eventEnd = event?.end_time ? new Date(event.end_time) : new Date(eventStart);
    if (isNaN(eventEnd.getTime()) || eventEnd <= eventStart) {
        eventEnd.setDate(eventEnd.getDate() + 1);
    }

    let first = dayStart ? new Date(dayStart) : eventStart;
    let last = dayEnd ? new Date(dayEnd) : eventEnd;

    if (agendaItems.length > 0) {
        const firstStart = agendaItems.reduce((earliest, item) => {
            const itemStart = item.startTime ? new Date(item.startTime) : null;
            if (!itemStart) return earliest;
            return !earliest || itemStart < earliest ? itemStart : earliest;
        }, null);
        const lastEnd = agendaItems.reduce((latest, item) => {
            const itemEnd = item.endTime ? new Date(item.endTime) : null;
            if (!itemEnd) return latest;
            return !latest || itemEnd > latest ? itemEnd : latest;
        }, null);
        if (firstStart) first = firstStart < first ? firstStart : first;
        if (lastEnd) last = lastEnd > last ? lastEnd : last;
    }

    const firstDay = startOfDay(first);
    const lastDay = startOfDay(last);

    const days = [];
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d));
    }

    const perDayBounds = days.map((day) => getDayActiveBounds(day, eventStart, eventEnd));

    return {
        days,
        perDayBounds,
        minutesInRange: MINUTES_PER_DAY
    };
}

export function getSegmentLayout(segmentStart, segmentEnd, minuteHeight) {
    let startMinutes = getMinutesInDay(segmentStart);
    let endMinutes = getMinutesInDay(segmentEnd);

    if (endMinutes === 0 && segmentEnd > segmentStart) {
        const daySpan = segmentEnd - segmentStart;
        if (daySpan >= MS_PER_DAY - 60000) {
            endMinutes = MINUTES_PER_DAY;
        }
    }

    if (endMinutes <= startMinutes) {
        return null;
    }

    const top = startMinutes * minuteHeight;
    const height = Math.max((endMinutes - startMinutes) * minuteHeight, 24);

    return { top, height, displayStart: segmentStart, displayEnd: segmentEnd };
}

export function groupIntoClusters(events) {
    if (events.length === 0) return [];
    const sortedEvents = [...events].sort(
        (a, b) => new Date(a.segmentStart) - new Date(b.segmentStart)
    );
    const clusters = [];
    let currentCluster = [sortedEvents[0]];
    let maxEnd = new Date(sortedEvents[0].segmentEnd);

    for (let i = 1; i < sortedEvents.length; i++) {
        const ev = sortedEvents[i];
        const evStart = new Date(ev.segmentStart);
        if (evStart < maxEnd) {
            currentCluster.push(ev);
            const evEnd = new Date(ev.segmentEnd);
            maxEnd = evEnd > maxEnd ? evEnd : maxEnd;
        } else {
            clusters.push(currentCluster);
            currentCluster = [ev];
            maxEnd = new Date(ev.segmentEnd);
        }
    }
    clusters.push(currentCluster);
    return clusters;
}

export function computeColumns(cluster) {
    const sortedCluster = [...cluster].sort(
        (a, b) => new Date(a.segmentStart) - new Date(b.segmentStart)
    );
    const columns = [];
    const eventsWithColumns = [];

    for (const ev of sortedCluster) {
        const evStart = new Date(ev.segmentStart);
        const evEnd = new Date(ev.segmentEnd);
        let columnIndex = -1;

        for (let i = 0; i < columns.length; i++) {
            if (evStart >= columns[i]) {
                columnIndex = i;
                break;
            }
        }

        if (columnIndex === -1) {
            columnIndex = columns.length;
            columns.push(evEnd);
        } else {
            columns[columnIndex] = evEnd;
        }

        eventsWithColumns.push({ ...ev, column: columnIndex });
    }

    const columnsInCluster = columns.length;
    eventsWithColumns.forEach((ev) => {
        ev.columnsInCluster = columnsInCluster;
    });

    return eventsWithColumns;
}
