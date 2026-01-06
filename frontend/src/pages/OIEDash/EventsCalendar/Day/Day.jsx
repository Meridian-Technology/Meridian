import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useFetch } from '../../../../hooks/useFetch';
import DailyCalendar from './DailyCalendar/DailyCalendar';
import Switch from '../../../../components/Switch/Switch';
import './Day.scss';

function Day({ height, start = new Date(new Date().setHours(0, 0, 0, 0)) , startingText = "", nav=true, setView = () => {}, view = 2, showSwitch = true, blockedEvents = [], filter }) {
    const initialStartDate = typeof start === 'string' ? new Date(start) : start;
    // Ensure the initial date is set to the start of the day
    const getStartOfDay = (date) => {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        return start;
    };

    const [day, setDay] = useState(getStartOfDay(initialStartDate));

    const formattedDate = (date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const updateDay = (days) => {
        setDay((prev) => {
            const newStart = new Date(prev);
            newStart.setDate(newStart.getDate() + days);
            return getStartOfDay(newStart);
        });

    };

    const handleKeyDown = (event, direction) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (direction === 'next') {
                updateDay(1);
            } else {
                updateDay(-1);
            }
        }
    };

    const getEndOfDay = (date) => {
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        return end;
    };

    const url = `/get-events-by-range?start=${encodeURIComponent(getStartOfDay(day).toISOString())}&end=${encodeURIComponent(getEndOfDay(day).toISOString())}${filter ? `&filter=${JSON.stringify(filter)}` : ''}`;
    const events = useFetch(url);
    
    // Filter blocked events to only show those within the current day
    const dayBlockedEvents = blockedEvents.filter(event => {
        const eventStart = new Date(event.start_time);
        const eventDay = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
        const currentDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        return eventDay.getTime() === currentDay.getTime();
    });

    // Combine regular events with blocked events
    const combinedEvents = [
        ...(events.data ? events.data.events : []),
        ...dayBlockedEvents
    ];
    const dayText = formattedDate(day);
    const isToday = day.toDateString() === new Date().toDateString();

    return (
        <>
            <header className="daily-header">
                <div className="time-period">
                    {nav &&
                        <div className="arrows" role="group" aria-label="Day navigation">
                            <button 
                                className="left-arrow" 
                                onClick={() => updateDay(-1)}
                                onKeyDown={(e) => handleKeyDown(e, 'prev')}
                                aria-label={`Previous day, ${formattedDate(new Date(day.getTime() - 24 * 60 * 60 * 1000))}`}
                                type="button"
                            >
                                <Icon icon="charm:chevron-left" aria-hidden="true" />
                            </button>
                            <button 
                                className="right-arrow" 
                                onClick={() => updateDay(1)}
                                onKeyDown={(e) => handleKeyDown(e, 'next')}
                                aria-label={`Next day, ${formattedDate(new Date(day.getTime() + 24 * 60 * 60 * 1000))}`}
                                type="button"
                            >
                                <Icon icon="charm:chevron-right" aria-hidden="true" />
                            </button>
                        </div>
                    }
                    <h1 id="day-display">
                        {startingText}{nav && (
                            <span className={isToday ? 'today' : ''}>
                                {dayText}
                            </span>
                        )}
                    </h1>
                </div>
                {showSwitch && (
                    <Switch 
                        options={["month", "week", "day"]} 
                        onChange={setView} 
                        selectedPass={view} 
                        setSelectedPass={setView}
                        ariaLabel="Calendar view options"
                    />
                )}
            </header>
            <div 
                className="week" 
                style={{ height: `${height}` }}
                role="region"
                aria-labelledby="day-display"
                aria-label={`Day view for ${dayText}${isToday ? ' (today)' : ''}`}
            >
                <DailyCalendar 
                    events={combinedEvents} 
                    selectedDay={day} 
                    height={'100%'} 
                />
            </div>
        </>
    );
}

export default Day;
