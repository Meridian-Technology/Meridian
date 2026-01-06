import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useFetch } from '../../../../hooks/useFetch';
import './Week.scss';
import WeeklyCalendar from './WeeklyCalendar/WeeklyCalendar';
import Switch from '../../../../components/Switch/Switch';

function Week({ height, changeToDay, start = new Date(new Date().setDate(new Date().getDate() - new Date().getDay())), startingText = "", nav=true , filter, setView = () => {}, view = 1, showSwitch = true, allowCrossDaySelection = true, timeIncrement = 15, blockedEvents = [], autoEnableSelection = false }) {
    const initialStartDate = typeof start === 'string' ? new Date(start) : start;
    const initialEndDate = new Date(initialStartDate);
    console.log(initialStartDate);
    initialEndDate.setDate(initialEndDate.getDate() + 6);
    initialEndDate.setHours(23, 59, 59, 999);

    const [startOfWeek, setStartOfWeek] = useState(initialStartDate);
    const [endOfWeek, setEndOfWeek] = useState(initialEndDate);


    const formattedDate = (date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const updateWeek = (days) => {
        setStartOfWeek((prev) => {
            const newStart = new Date(prev);
            newStart.setDate(newStart.getDate() + days);
            return newStart;
        });

        setEndOfWeek((prev) => {
            const newEnd = new Date(prev);
            newEnd.setDate(newEnd.getDate() + days);
            newEnd.setHours(23, 59, 59, 999);
            return newEnd;
        });
    };

    const handleKeyDown = (event, direction) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (direction === 'next') {
                updateWeek(7);
            } else {
                updateWeek(-7);
            }
        }
    };

    const url = `/get-events-by-range?start=${encodeURIComponent(startOfWeek.toISOString())}&end=${encodeURIComponent(endOfWeek.toISOString())}${filter ? `&filter=${JSON.stringify(filter)}` : ''}`;
    const events = useFetch(url);

    // Filter blocked events to only show those within the current week
    const weekBlockedEvents = blockedEvents.filter(event => {
        const eventStart = new Date(event.start_time);
        return eventStart >= startOfWeek && eventStart <= endOfWeek;
    });
    const weekRangeText = `${formattedDate(startOfWeek)} to ${formattedDate(endOfWeek)}`;
    // Combine regular events with blocked events
    const combinedEvents = [
        ...(events.data ? events.data.events : []),
        ...weekBlockedEvents
    ];

    return (
        <>  
            {
                nav || startingText || showSwitch ?
                <header className="weekly-header">
                <div className="time-period">
                    {nav &&
                        <div className="arrows" role="group" aria-label="Week navigation">
                            <button 
                                className="left-arrow" 
                                onClick={() => updateWeek(-7)}
                                onKeyDown={(e) => handleKeyDown(e, 'prev')}
                                aria-label={`Previous week, ${formattedDate(new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000))} to ${formattedDate(new Date(startOfWeek.getTime() - 24 * 60 * 60 * 1000))}`}
                                type="button"
                            >
                                <Icon icon="charm:chevron-left" aria-hidden="true" />
                            </button>
                            <button 
                                className="right-arrow" 
                                onClick={() => updateWeek(7)}
                                onKeyDown={(e) => handleKeyDown(e, 'next')}
                                aria-label={`Next week, ${formattedDate(new Date(endOfWeek.getTime() + 24 * 60 * 60 * 1000))} to ${formattedDate(new Date(endOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000))}`}
                                type="button"
                            >
                                <Icon icon="charm:chevron-right" aria-hidden="true" />
                            </button>  
                        </div>
                    }
                    <h3 id="week-range-display">
                        {startingText}{nav && weekRangeText}
                    </h3>
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

                :
                null
            }
            <div 
                className="week" 
                style={{ height: `${height}` }}
                role="region"
                aria-labelledby="week-range-display"
                aria-label={`Week view from ${weekRangeText}`}
            >
                <WeeklyCalendar 
                    events={combinedEvents} 
                    startOfWeek={startOfWeek} 
                    height={"100%"} 
                    dayClick={(date) => {
                        if (changeToDay) {
                            changeToDay(date);
                        }
                    }}
                    onTimeSelection={(selection) => {
                        console.log('Time selection:', selection);
                        // You can add custom logic here to handle the time selection
                        // For example, create a new event, show a modal, etc.
                    }}
                    allowCrossDaySelection={allowCrossDaySelection}
                    timeIncrement={timeIncrement}
                    autoEnableSelection={autoEnableSelection}
                />
            </div>
        </>
    );
}

export default Week;
