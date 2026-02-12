import React, { useState, useEffect, useMemo } from 'react';
import AgendaItemCalendarEvent from '../AgendaItemCalendarEvent/AgendaItemCalendarEvent';
import '../../../../../../OIEDash/EventsCalendar/Week/WeeklyCalendar/WeeklyCalendar.scss';
import './AgendaDailyCalendar.scss';

const DEFAULT_MINUTE_HEIGHT = 4;

function AgendaDailyCalendar({
    agendaItems = [],
    event,
    dayStart,
    dayEnd,
    minuteHeight = DEFAULT_MINUTE_HEIGHT,
    onEditItem,
    height = '600px'
}) {
    const [width, setWidth] = useState(0);
    const [bottom, setBottom] = useState(0);
    const ref = React.useRef(null);

    const { selectedDay, startMinutes, totalMinutes, hours } = useMemo(() => {
        const eventStart = event?.start_time ? new Date(event.start_time) : new Date();
        const eventEnd = event?.end_time ? new Date(event.end_time) : new Date(eventStart);
        eventEnd.setHours(eventEnd.getHours() + 2);

        let start = dayStart ? new Date(dayStart) : eventStart;
        let end = dayEnd ? new Date(dayEnd) : eventEnd;

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
            if (firstStart) start = firstStart < start ? firstStart : start;
            if (lastEnd) end = lastEnd > end ? lastEnd : end;
        }

        const dayDate = new Date(start);
        dayDate.setHours(0, 0, 0, 0);

        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutes = end.getHours() * 60 + end.getMinutes();
        const totalMinutes = Math.max(60, endMinutes - startMinutes);

        const hourCount = Math.ceil(totalMinutes / 60) + 1;
        const hours = Array.from({ length: Math.min(24, hourCount) }, (_, i) => start.getHours() + i);

        return {
            selectedDay: dayDate,
            startMinutes,
            totalMinutes,
            hours,
            dayStart: start,
            dayEnd: end
        };
    }, [agendaItems, event, dayStart, dayEnd]);

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
            setBottom(ref.current.getBoundingClientRect().bottom);
        }
    }, [ref, agendaItems]);

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
            const top = (start.getHours() * 60 + start.getMinutes() - startMinutes) * minuteHeight;
            const eventHeight = ((end - start) / (1000 * 60)) * minuteHeight;

            return (
                <div
                    key={ev.id || index}
                    className="event agenda-event"
                    style={{
                        top: `${Math.max(0, top)}px`,
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
        for (let m = 0; m <= totalMinutes; m += 30) {
            const isHour = m % 60 === 0;
            lines.push(
                <div
                    key={m}
                    className={`time-grid-line ${isHour ? 'hour-line' : 'half-hour-line'}`}
                    style={{ top: `${m * minuteHeight}px` }}
                />
            );
        }
        return lines;
    };

    return (
        <div
            className="agenda-daily-calendar oie-weekly-calendar-container day-only"
            style={{ height, minHeight: totalMinutes * minuteHeight }}
            ref={ref}
        >
            <div className="calendar-header">
                <div className="day-header">
                    <div className="day-name">{selectedDay.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                    <div className="day-date">{selectedDay.getDate()}</div>
                </div>
            </div>

            <div className="calendar-body" style={{ minHeight: `${totalMinutes * minuteHeight}px` }}>
                <div className="time-column">
                    {hours.map((hour) => (
                        <div
                            key={hour}
                            className="time-label"
                            style={{ top: `${(hour * 60 - startMinutes) * minuteHeight}px` }}
                        >
                            {new Date(0, 0, 0, hour).toLocaleTimeString([], { hour: '2-digit' })}
                        </div>
                    ))}
                </div>

                <div className="day-column">
                    {renderTimeGrid()}
                    {renderEvents()}
                </div>
            </div>
            <div className="fixed-bottom" style={{ width: `${width}px`, top: `${bottom - 10}px` }} />
        </div>
    );
}

export default AgendaDailyCalendar;
