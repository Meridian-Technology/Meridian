import React, { useEffect, useState, useRef } from 'react';
import Switch from '../../../components/Switch/Switch';
import './EventsCalendar.scss';
import Month from './Month/Month';
import Week from './Week/Week';
import Day from './Day/Day';
import Filter from '../../../components/Filter/Filter';


function EventsCalendar({expandedClass, allowCrossDaySelection = true, timeIncrement = 15}){
    const [view, setView] = useState(0); //0: month, 1: week:, 2: day, 3: list
    const [contentHeight, setContentHeight] = useState(100);
    const [start, setStart] = useState("2025-2-2");
    const [selected, setSelected] = useState("2025-2-5");
    const contentRef = useRef(null);
    const [filter, setFilter] = useState({type: "all"});

    // look into this blocking system, could likely be optimized using shared logic with true events.
    const blockedEvents = [];

    useEffect(() => {
        if(contentRef.current){
            setContentHeight(contentRef.current.clientHeight-50);
        }
    },[contentRef.current]);

    const changeToWeek = (week) => {
        //calculate start date of week
        console.log(week);
        setStart(week);
        setView(1);
    }

    const changeToDay = (day) => {
        console.log(day);
        setSelected(day);
        setView(2);
    }

    return (
        <div className={`events-calendar ${expandedClass}`}>
            <div className="top-bar">
                <Switch options={["month", "week", "day", "list"]} onChange={setView} selectedPass={view} setSelectedPass={setView}/>
                <Filter options={["all", "study", "campus", "social", "club", "meeting", "sports"]} selected={filter.type} setSelected={(type)=>setFilter({...filter, type})} label={"filter"}/>
            </div>

            <div className="content" ref={contentRef}>
                {
                    view === 0 && <Month height={`${contentHeight}px`} changeToWeek={changeToWeek} view={view} setView={setView} filter={filter} blockedEvents={blockedEvents}/>
                }
                {
                    view === 1 && <Week height={`${contentHeight}px`} changeToDay={changeToDay} start={start} filter={filter} view={view} setView={setView} allowCrossDaySelection={allowCrossDaySelection} timeIncrement={timeIncrement}/>
                }
                {
                    view === 2 && <Day height={`${contentHeight}px`} start={selected} filter={filter} view={view} setView={setView} blockedEvents={blockedEvents}/>
                }

            </div>
        </div>
    )
}

export default EventsCalendar;