import React, { useState } from 'react';
import './CalendarEvent.scss';
import Popup from '../../../../components/Popup/Popup';
import OIEFullEvent from '../../OIEEventsComponents/FullEvent/OIEFullEvent';
import FullEvent from '../../../../components/EventsViewer/EventsGrid/EventsColumn/FullEvent/FullEvent';
import { getEventColors } from '../eventTypeColors';

function CalendarEvent({event}){
    const [popupOpen, setPopupOpen] = useState(false);

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const handleEventClick = () => {
        setPopupOpen(true);
    };
    const onPopupClose = () => {
        setPopupOpen(false);
    };

    const getEventStyle = () => {
        if (event.status === 'blocked') {
            return { backgroundColor: '#E8E8E8', borderLeft: '4px solid #999', '--event-accent': '#999' };
        }
        if (event.status === 'pending') {
            return { backgroundColor: '#FBEBBB', borderLeft: '4px solid var(--yellow)', '--event-accent': 'var(--yellow)' };
        }
        const colors = getEventColors(event);
        return {
            backgroundColor: colors.background,
            borderLeft: `4px solid ${colors.border}`,
            '--event-accent': colors.border,
        };
    };

    return (
        <div className={`calendar-event ${event.status}`} onClick={handleEventClick} style={getEventStyle()}>
            <Popup isOpen={popupOpen} onClose={onPopupClose} customClassName={"wide-content no-padding no-styling oie"} waitForLoad={true} >
                {event.OIEReference  ? 
                    <OIEFullEvent event={event} refetch={console.log} setEdited={console.log}/> :
                    <FullEvent event={event}/>
                }
            </Popup>

            <div className="event-time">
                {formatTime(event.start_time)} - {formatTime(event.end_time)}
            </div>
            <div className="event-content">
                <div className="event-name">{event.name}</div>
                <div className="event-details">
                    <span className={`event-type ${event.type}`}>{event.type}</span>
                    <span className="event-location">{event.location}</span>
                </div>
            </div>
        </div>
    )
}

export default CalendarEvent;