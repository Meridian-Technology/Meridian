import React, { useState, useEffect, useMemo } from 'react';
import AgendaItemCalendarEvent from '../AgendaItemCalendarEvent/AgendaItemCalendarEvent';
import '../../../../../../OIEDash/EventsCalendar/Week/WeeklyCalendar/WeeklyCalendar.scss';
import './AgendaDailyCalendar.scss';

const DEFAULT_MINUTE_HEIGHT = 4;
const MINUTES_PER_DAY = 24 * 60;

function AgendaDailyCalendar({
    agendaItems = [],
    event,
    dayStart,
    dayEnd,
    minuteHeight = DEFAULT_MINUTE_HEIGHT,
    onEditItem
}) {
    const [width, setWidth] = useState(0);
    const ref = React.useRef(null);

    const { days, totalHeight } = useMemo(() => {
        const eventStart = event?.start_time ? new Date(event.start_time) : new Date();
        const eventEnd = event?.end_time ? new Date(event.end_time) : new Date(eventStart);
        eventEnd.setDate(eventEnd.getDate() + 1);

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

        const firstDay = new Date(first);
        firstDay.setHours(0, 0, 0, 0);
        const lastDay = new Date(last);
        lastDay.setHours(0, 0, 0, 0);

        const days = [];
        for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
            days.push(new Date(d));
        }

        const totalHeight = days.length * MINUTES_PER_DAY * minuteHeight;

        return {
            days,
            totalHeight: Math.max(totalHeight, MINUTES_PER_DAY * minuteHeight)
        };
    }, [agendaItems, event, dayStart, dayEnd, minuteHeight]);

    const calendarEvents = useMemo(() => {
        return agendaItems
            .filter((item) => item.startTime && item.endTime)
            .map((item) => ({
                ...item,
                start_time: typeof item.startTime === 'string' ? item.startTime : item.startTime?.toISOString?.() ?? new Date(item.startTime).toISOString(),
                end_time: typeof item.endTime === 'string' ? item.endTime : item.endTime?.toISOString?.() ?? new Date(item.endTime).toISOString()
            }));
    }, [agendaItems]);

    useEffect(() => {
        if (ref.current) {
            setWidth(ref.current.clientWidth);
        }
    }, [ref, agendaItems]);

    const getMinutesFromStart = (date) => {
        const base = new Date(days[0]);
        base.setHours(0, 0, 0, 0);
        const d = new Date(date);
        const dayOffset = Math.floor((d - base) / (1000 * 60 * 60 * 24));
        const minutesInDay = d.getHours() * 60 + d.getMinutes();
        return dayOffset * MINUTES_PER_DAY + minutesInDay;
    };

    const groupIntoClusters = (events) => {
        if (events.length === 0) return [];
        const sortedEvents = [...events].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        const clusters = [];
        let currentCluster = [sortedEvents[0]];
        let maxEnd = new Date(sortedEvents[0].end_time);

        for (let i = 1; i < sortedEvents.length; i++) {
            const ev = sortedEvents[i];
            const evStart = new Date(ev.start_time);
            if (evStart < maxEnd) {
                currentCluster.push(ev);
                const evEnd = new Date(ev.end_time);
                maxEnd = evEnd > maxEnd ? evEnd : maxEnd;
            } else {
                clusters.push(currentCluster);
                currentCluster = [ev];
                maxEnd = new Date(ev.end_time);
            }
        }
        clusters.push(currentCluster);
        return clusters;
    };

    const computeColumns = (cluster) => {
        const sortedCluster = [...cluster].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        const columns = [];
        const eventsWithColumns = [];

        for (const ev of sortedCluster) {
            const evStart = new Date(ev.start_time);
            const evEnd = new Date(ev.end_time);
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
    };

    const renderEvents = () => {
        const clusters = groupIntoClusters(calendarEvents);
        const processedEvents = [];
        for (const cluster of clusters) {
            const eventsWithColumns = computeColumns(cluster);
            processedEvents.push(...eventsWithColumns);
        }

        return processedEvents.map((ev, index) => {
            const start = new Date(ev.start_time);
            const end = new Date(ev.end_time);
            const topMinutes = getMinutesFromStart(start);
            const durationMinutes = (end - start) / (1000 * 60);
            const eventHeight = Math.max(durationMinutes * minuteHeight, 24);

            return (
                <div
                    key={ev.id || index}
                    className="event agenda-event"
                    style={{
                        top: `${topMinutes * minuteHeight}px`,
                        height: `${eventHeight}px`,
                        left: `calc(${(ev.column / ev.columnsInCluster) * 100}% + 2px)`,
                        width: `calc(${100 / ev.columnsInCluster}% - 4px)`
                    }}
                >
                    <AgendaItemCalendarEvent
                        item={ev}
                        onEdit={onEditItem}
                        event={event}
                    />
                </div>
            );
        });
    };

    const renderTimeGrid = () => {
        const lines = [];
        days.forEach((day, dayIndex) => {
            for (let m = 0; m < MINUTES_PER_DAY; m += 30) {
                const isHour = m % 60 === 0;
                const top = (dayIndex * MINUTES_PER_DAY + m) * minuteHeight;
                lines.push(
                    <div
                        key={`${dayIndex}-${m}`}
                        className={`time-grid-line ${isHour ? 'hour-line' : 'half-hour-line'}`}
                        style={{ top: `${top}px` }}
                    />
                );
            }
        });
        return lines;
    };

    const renderDayLines = () => {
        return days.map((day, index) => (
            <div
                key={index}
                className="day-line"
                style={{ top: `${index * MINUTES_PER_DAY * minuteHeight}px` }}
            >
                <span className="day-line-label">
                    {day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
            </div>
        ));
    };

    const renderTimeLabels = () => {
        const labels = [];
        days.forEach((day, dayIndex) => {
            for (let hour = 0; hour < 24; hour++) {
                const top = (dayIndex * MINUTES_PER_DAY + hour * 60) * minuteHeight;
                labels.push(
                    <div
                        key={`${dayIndex}-${hour}`}
                        className="time-label"
                        style={{ top: `${top}px` }}
                    >
                        {new Date(0, 0, 0, hour).toLocaleTimeString([], { hour: '2-digit' })}
                    </div>
                );
            }
        });
        return labels;
    };

    return (
        <div
            className="agenda-daily-calendar oie-weekly-calendar-container multi-day"
            style={{ minHeight: totalHeight }}
            ref={ref}
        >
            <div className="calendar-body" style={{ minHeight: `${totalHeight}px` }}>
                <div className="time-column">
                    {renderTimeLabels()}
                </div>

                <div className="day-column">
                    {renderDayLines()}
                    {renderTimeGrid()}
                    {renderEvents()}
                </div>
            </div>
        </div>
    );
}

export default AgendaDailyCalendar;
