import React, { useMemo } from 'react';
import AgendaItemCalendarEvent from '../AgendaItemCalendarEvent/AgendaItemCalendarEvent';
import '../../../../../../OIEDash/EventsCalendar/Week/WeeklyCalendar/WeeklyCalendar.scss';
import {
    computeDayRange,
    computeColumns,
    getSegmentLayout,
    groupIntoClusters,
    MINUTES_PER_DAY,
    splitItemIntoDaySegments,
    toCalendarEvent
} from './agendaCalendarUtils';
import './AgendaDailyCalendar.scss';

const DEFAULT_MINUTE_HEIGHT = 4;

function AgendaDailyCalendar({
    agendaItems = [],
    event,
    dayStart,
    dayEnd,
    minuteHeight = DEFAULT_MINUTE_HEIGHT,
    onEditItem
}) {
    const { days, minutesInRange, perDayBounds } = useMemo(
        () => computeDayRange(agendaItems, event, dayStart, dayEnd),
        [agendaItems, event, dayStart, dayEnd]
    );

    const columnHeight = minutesInRange * minuteHeight;
    const isMultiDay = days.length > 1;

    const segmentsByDay = useMemo(() => {
        const calendarEvents = agendaItems
            .filter((item) => item.startTime && item.endTime)
            .map(toCalendarEvent);

        const byDay = days.map(() => []);
        calendarEvents.forEach((item) => {
            const segments = splitItemIntoDaySegments(item, days);
            segments.forEach((seg) => {
                byDay[seg.dayIndex].push(seg);
            });
        });
        return byDay;
    }, [agendaItems, days]);

    const renderTimeGrid = () => {
        const lines = [];
        for (let m = 0; m < MINUTES_PER_DAY; m += 30) {
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

    const renderTimeLabels = () => {
        const labels = [];
        for (let hour = 0; hour < 24; hour++) {
            const hourMinutes = hour * 60;
            labels.push(
                <div
                    key={hour}
                    className="time-label"
                    style={{ top: `${hourMinutes * minuteHeight}px` }}
                >
                    {new Date(0, 0, 0, hour).toLocaleTimeString([], { hour: '2-digit' })}
                </div>
            );
        }
        return labels;
    };

    const renderInactiveRegions = (dayIndex) => {
        const { activeStartMinutes, activeEndMinutes } =
            perDayBounds[dayIndex] ?? { activeStartMinutes: 0, activeEndMinutes: MINUTES_PER_DAY };

        const regions = [];
        if (activeStartMinutes > 0) {
            regions.push(
                <div
                    key="before"
                    className="inactive-region before"
                    style={{
                        top: 0,
                        height: `${activeStartMinutes * minuteHeight}px`
                    }}
                    aria-hidden
                />
            );
        }
        if (activeEndMinutes < MINUTES_PER_DAY) {
            regions.push(
                <div
                    key="after"
                    className="inactive-region after"
                    style={{
                        top: `${activeEndMinutes * minuteHeight}px`,
                        height: `${(MINUTES_PER_DAY - activeEndMinutes) * minuteHeight}px`
                    }}
                    aria-hidden
                />
            );
        }
        return regions;
    };

    const renderDayEvents = (dayIndex) => {
        const daySegments = segmentsByDay[dayIndex] || [];
        const clusters = groupIntoClusters(daySegments);
        const processedEvents = [];
        for (const cluster of clusters) {
            processedEvents.push(...computeColumns(cluster));
        }

        return processedEvents.map((seg) => {
            const layout = getSegmentLayout(seg.segmentStart, seg.segmentEnd, minuteHeight);
            if (!layout) return null;

            const spanClass = [
                seg.continuesFromPrev ? 'continues-from-prev' : '',
                seg.continuesToNext ? 'continues-to-next' : '',
                isMultiDay && (seg.continuesFromPrev || seg.continuesToNext) ? 'multi-day-span' : ''
            ]
                .filter(Boolean)
                .join(' ');

            return (
                <div
                    key={seg.segmentKey}
                    className={`event agenda-event ${spanClass}`}
                    style={{
                        top: `${layout.top}px`,
                        height: `${layout.height}px`,
                        left: `calc(${(seg.column / seg.columnsInCluster) * 100}% + 2px)`,
                        width: `calc(${100 / seg.columnsInCluster}% - 4px)`
                    }}
                    title={
                        seg.continuesFromPrev || seg.continuesToNext
                            ? `${seg.title || 'Untitled'} (spans multiple days)`
                            : undefined
                    }
                >
                    <AgendaItemCalendarEvent
                        item={{
                            ...seg,
                            startTime: layout.displayStart,
                            endTime: layout.displayEnd
                        }}
                        onEdit={onEditItem}
                        event={event}
                        showContinuationHint={seg.continuesFromPrev || seg.continuesToNext}
                    />
                </div>
            );
        });
    };

    return (
        <div
            className={`agenda-daily-calendar oie-weekly-calendar-container ${isMultiDay ? 'multi-day-columns' : 'single-day'}`}
            style={{ '--day-count': days.length }}
        >
            <div className="calendar-header">
                <div className="time-header" />
                <div className="days-header">
                    {days.map((day, index) => (
                        <div key={index} className="day-header">
                            <span className="day-name">
                                {day.toLocaleDateString('en-US', { weekday: 'short' })}
                            </span>
                            <span className="day-date">
                                {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="calendar-body" style={{ minHeight: `${columnHeight}px` }}>
                <div className="time-column">{renderTimeLabels()}</div>

                <div className="days-container">
                    {days.map((day, index) => (
                        <div
                            key={day.toISOString()}
                            className="day-column"
                            data-day-index={index}
                            style={{ minHeight: `${columnHeight}px` }}
                        >
                            {renderInactiveRegions(index)}
                            {renderTimeGrid()}
                            {renderDayEvents(index)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default AgendaDailyCalendar;
