import React from 'react';
import './Month.scss';
import MonthEvent from './MonthEvent/MonthEvent';

const getDaysInMonth = (month, year) => {
    return new Date(year, month, 0).getDate();
};
  
const getFirstDayOfWeek = (month, year) => {
    return new Date(year, month - 1, 1).getDay();
};

const getMonthName = (month) => {
    const months = [
        "January", "February", "March", "April",
        "May", "June", "July", "August",
        "September", "October", "November", "December"
    ];
    return months[month - 1];
};

const MonthDisplay = ({ 
    month, 
    year, 
    events, 
    height, 
    currentMonth, 
    currentYear, 
    currentDay,
    onWeekClick,
    monthYearText
}) => {
    const daysInMonth = getDaysInMonth(month, year);
    const firstDayOfWeek = getFirstDayOfWeek(month, year);

    const emptyCells = Array.from({ length: firstDayOfWeek }, (_, i) => (
        <div key={`empty-${i}`} className="calendar__day is-disabled" aria-hidden="true"></div>
    ));

    const getEventByDay = (day) => {
        if (!events) return [];
        return events.filter((event) => {
            const eventDate = new Date(event.start_time);
            return eventDate.getDate() === day;
        });
    };

    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
        const dayNumber = i + 1;
        const isToday = dayNumber === currentDay && month === currentMonth && year === currentYear;
        const dayEvents = getEventByDay(dayNumber);
        const eventCount = dayEvents.length;
        
        return (
            <div key={`day-${i}`} className="calendar__day">
                <div className={`day-header ${isToday ? "is-today" : ""}`}>
                    <span 
                        className="day-number"
                        aria-label={`${getMonthName(month)} ${dayNumber}, ${year}${isToday ? ' (today)' : ''}`}
                    >
                        {dayNumber}
                    </span>
                </div>
                <div className="events" aria-label={`${eventCount} event${eventCount !== 1 ? 's' : ''} on ${getMonthName(month)} ${dayNumber}`}>
                    {dayEvents.map((event) => (
                        <MonthEvent key={event._id} event={event} show={i===10} />
                    ))}
                </div>
            </div>
        );
    });

    const totalCells = emptyCells.length + dayCells.length;
    const remainingCells = Math.ceil(totalCells / 7) * 7 - totalCells;
    const remainingEmptyCells = Array.from({ length: remainingCells }, (_, i) => (
        <div key={`empty-last-${i}`} className="calendar__day is-disabled" aria-hidden="true"></div>
    ));

    const allCells = [...emptyCells, ...dayCells, ...remainingEmptyCells];
    const rows = [];
    for (let i = 0; i < allCells.length; i += 7) {
        rows.push(allCells.slice(i, i + 7));
    }

    const getFirstDayOfWeekFromRow = (rowIndex) => {
        const firstDayOfMonth = new Date(year, month - 1, 1);
        const firstDayOfWeek = firstDayOfMonth.getDay();
        const firstDayOfRow = new Date(year, month - 1, 1 + (rowIndex * 7) - firstDayOfWeek);
        return firstDayOfRow;
    };

    const handleWeekClick = (rowIndex) => {
        const weekStart = getFirstDayOfWeekFromRow(rowIndex);
        onWeekClick(weekStart);
    };

    const handleWeekKeyDown = (event, rowIndex) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleWeekClick(rowIndex);
        }
    };

    return (
        <div 
            className="month" 
            style={{ height: `${height}` }}
            role="grid"
            aria-labelledby="month-year-display"
            aria-label={`${monthYearText} calendar`}
        >
            <div className="calendar-header" role="row">
                {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
                    <div key={day} className="day" role="columnheader" aria-label={day}>
                        <span>{day}</span>
                    </div>
                ))}
            </div>
            <div className="calendar">
                {rows.map((row, rowIndex) => (
                    <div 
                        key={`row-${rowIndex}`} 
                        className="calendar__row" 
                        onClick={() => handleWeekClick(rowIndex)}
                        onKeyDown={(e) => handleWeekKeyDown(e, rowIndex)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Week starting ${getFirstDayOfWeekFromRow(rowIndex).toLocaleDateString()}`}
                    >
                        {row}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MonthDisplay; 