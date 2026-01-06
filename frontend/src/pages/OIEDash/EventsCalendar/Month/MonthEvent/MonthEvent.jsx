import React, { useState, useRef, useEffect } from 'react';
import './MonthEvent.scss';
import ReactDOM from "react-dom";
import OIEEvent from '../../../OIEEventsComponents/Event/OIEEvent';

function MonthEvent({ event }) {
    const [showHover, setShowHover] = useState(false);
    const [yPos, setYPos] = useState(null);
    const [xPos, setXPos] = useState(null);
    const [below, setBelow] = useState(false);
    const [right, setRight] = useState(false);
    const eventRef = useRef(null);
    const hoverRef = useRef(null);

    // Portal content

    function PortalContent({yPos, xPos, below, right}) {
        const screenHeight = window.innerHeight;
        const screenWidth = window.innerWidth;

        return ReactDOM.createPortal(
            <div 
            className={`hover-event ${showHover ? 'show' : ''}`}
            ref={hoverRef}
            style={{
                top: below ? `${yPos}px` : 'auto',
                bottom: below ? 'auto' : `${screenHeight - yPos}px`,
                right: right ? `${screenWidth - xPos}px` : 'auto',
                left: right ? 'auto' : `${xPos}px`,
            }}
            >
                <OIEEvent event={event} showStatus={true} showExpand={false}/>
            </div>,
          document.body // Attach to the body
        );
      }

    const handleMouseEnter = () => {
        if (!eventRef.current) return;
        const rect = eventRef.current.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        //check for space at top
        if(rect.top < 200){
            setYPos(rect.bottom +10);
            setBelow(true);
        } else {
            setYPos(rect.top - 10);
            setBelow(false);
        }

        //check for space at right
        if(screenWidth - rect.right < 300){
            setXPos(rect.right);
            setRight(true);
        } else {
            setXPos(rect.left);
            setRight(false);
        }
        setShowHover(true);
    };

    const handleMouseLeave = () => {
        setShowHover(false);
    };

    const getColor = (event) => {
        if(event.type === 'study'){
            return '#000000';
        } else if(event.type === 'campus'){
            return '#D3DDFD';
        } else if(event.type === 'alumni'){
            return '#D6D6D6';
        } else if(event.type === 'sports'){
            return '#D3E8CF';
        } else if(event.type === 'arts'){
            return '#FBEBBB';
        } else {
            return '#FBD8D6';
        }
    }

    const getBorderColor = (event) => {
        if(event.type === 'study'){
            return '#000000';
        } else if(event.type === 'campus'){
            return '#6D8EFA';
        } else if(event.type === 'alumni'){
            return '#5C5C5C';
        } else if(event.type === 'sports'){
            return '#6EB25F';
        } else if(event.type === 'arts'){
            return '#FBBC05';
        } else {
            return 'rgba(250, 117, 109, 1)';
        }
    }

    return (
        <div
            className="month-event"
            ref={eventRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
                '--color': getColor(event),
                '--border-color': getBorderColor(event),
            }}
        >
            <div className="event-info">
                <p>{event.name}</p>
            </div>

            {showHover && <PortalContent yPos={yPos} xPos={xPos} showHover={showHover} below={below} right={right} />}
        </div>
    );
}

export default MonthEvent;
