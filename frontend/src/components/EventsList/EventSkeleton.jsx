import React from 'react';
import './EventSkeleton.scss';

const EventSkeleton = ({ count = 3 }) => {
    return (
        <div className="event-skeleton-container">
            {Array.from({ length: count }).map((_, index) => (
                <div key={index} className="event-skeleton">
                    <div className="skeleton-header">
                        <div className="skeleton-title"></div>
                        <div className="skeleton-badge"></div>
                    </div>
                    <div className="skeleton-content">
                        <div className="skeleton-time"></div>
                        <div className="skeleton-location"></div>
                        <div className="skeleton-description">
                            <div className="skeleton-line"></div>
                            <div className="skeleton-line short"></div>
                        </div>
                    </div>
                    <div className="skeleton-footer">
                        <div className="skeleton-avatar"></div>
                        <div className="skeleton-host"></div>
                        <div className="skeleton-rsvp"></div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default EventSkeleton;