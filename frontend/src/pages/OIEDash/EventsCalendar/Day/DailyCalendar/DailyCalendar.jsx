import React, { useState, useEffect, useRef } from 'react';
import '../../Week/WeeklyCalendar/WeeklyCalendar.scss';
import { DateTime } from "luxon";
import CalendarEvent from '../../CalendarEvent/CalendarEvent';

const DailyCalendar = ({ selectedDay, events, height }) => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const MINUTE_HEIGHT = 1; // 1px per minute

    const [now, setNow] = useState(DateTime.now().setZone("America/New_York"));
    const [currentMinutes, setCurrentMinutes] = useState(now.hour * 60 + now.minute);
    const [width, setWidth] = useState(0);
    const [bottom, setBottom] = useState(0);

    const ref = useRef(null);

    useEffect(() => {
        setNow(DateTime.now().setZone("America/New_York"));
        setCurrentMinutes(now.hour * 60 + now.minute);
    }, [selectedDay]);

    useEffect(() => {
        if (ref.current && events.length > 0) {
            const earliestEvent = events.reduce((earliest, event) => {
                const eventTime = new Date(event.start_time);
                return eventTime < earliest ? eventTime : earliest;
            }, new Date(events[0].start_time));
            const earliestHour = earliestEvent.getHours();
            ref.current.scrollTo({
                top: (earliestHour * 60 * MINUTE_HEIGHT) - 20,
                behavior: 'smooth'
            });
        }
        if(ref.current){
            setWidth(ref.current.clientWidth);
            setBottom(ref.current.getBoundingClientRect().bottom);
        }
    }, [ref, events]);

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const groupIntoClusters = (events) => {
        if (events.length === 0) return [];
        const sortedEvents = [...events].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        const clusters = [];
        let currentCluster = [sortedEvents[0]];
        let maxEnd = new Date(sortedEvents[0].end_time);

        for (let i = 1; i < sortedEvents.length; i++) {
            const event = sortedEvents[i];
            const eventStart = new Date(event.start_time);
            if (eventStart < maxEnd) {
                currentCluster.push(event);
                maxEnd = Math.max(maxEnd, new Date(event.end_time));
            } else {
                clusters.push(currentCluster);
                currentCluster = [event];
                maxEnd = new Date(event.end_time);
            }
        }
        clusters.push(currentCluster);
        return clusters;
    };

    const computeColumns = (cluster) => {
        const sortedCluster = [...cluster].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        const columns = [];
        const eventsWithColumns = [];

        for (const event of sortedCluster) {
            const eventStart = new Date(event.start_time);
            const eventEnd = new Date(event.end_time);
            let columnIndex = -1;

            for (let i = 0; i < columns.length; i++) {
                if (eventStart >= columns[i]) {
                    columnIndex = i;
                    break;
                }
            }

            if (columnIndex === -1) {
                columnIndex = columns.length;
                columns.push(eventEnd);
            } else {
                columns[columnIndex] = eventEnd;
            }

            eventsWithColumns.push({ ...event, column: columnIndex });
        }

        const columnsInCluster = columns.length;
        eventsWithColumns.forEach(event => {
            event.columnsInCluster = columnsInCluster;
        });

        return eventsWithColumns;
    };

    const renderEvents = () => {
        const dayEvents = events.filter(event => {
            const eventDate = new Date(event.start_time).toDateString();
            return eventDate === selectedDay.toDateString();
        });

        const clusters = groupIntoClusters(dayEvents);
        const processedEvents = [];
        for (const cluster of clusters) {
            const eventsWithColumns = computeColumns(cluster);
            processedEvents.push(...eventsWithColumns);
        }

        return processedEvents.map((event, index) => {
            const start = new Date(event.start_time);
            const end = new Date(event.end_time);
            const top = (start.getHours() * 60 + start.getMinutes()) * MINUTE_HEIGHT;
            const height = ((end - start) / (1000 * 60)) * MINUTE_HEIGHT;

            return (
                <div
                    key={index}
                    className="event"
                    style={{ 
                        top: `${top}px`, 
                        height: `${height}px`,
                        left: `calc(${(event.column / event.columnsInCluster) * 100}% + 2px)`,
                        width: `calc(${100 / event.columnsInCluster}% - 4px)`,
                    }}
                >
                    <CalendarEvent event={event}/>
                </div>
            );
        });
    };

    const renderTimeGrid = () => {
        const times = Array.from({ length: 48 }, (_, i) => i * 30);

        return times.map((minutes, index) => {
            const isHour = minutes % 60 === 0;
            return (
                <div
                    key={index}
                    className={`time-grid-line ${isHour ? 'hour-line' : 'half-hour-line'}`}
                    style={{ top: `${minutes * MINUTE_HEIGHT}px` }}
                />
            );
        });
    };

    return (
        <div className="oie-weekly-calendar-container day-only" style={{ height: `${height}` }} ref={ref}>
            <div className="calendar-header">
                <div className="day-header">
                    <div className="day-name">{selectedDay.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                    <div className="day-date">{selectedDay.getDate()}</div>
                </div>
            </div>

            <div className="calendar-body">
                <div className="current-time-line" style={{ top: `${currentMinutes * MINUTE_HEIGHT}px` }} />
                <div className="time-column">
                    {hours.map(hour => (
                        <div key={hour} className="time-label" style={{ top: `${hour * 60 * MINUTE_HEIGHT}px` }}>
                            {new Date(0, 0, 0, hour).toLocaleTimeString([], { hour: '2-digit' })}
                        </div>
                    ))}
                </div>

                <div className="day-column ">
                    {renderTimeGrid()}
                    {renderEvents()}
                </div>
            </div>
            <div className="fixed-bottom" style={{ width: `${width}px`, top: `${bottom - 10}px` }}>

            </div>
        </div>
    );
};

export default DailyCalendar;