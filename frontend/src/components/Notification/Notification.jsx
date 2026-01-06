import React from 'react';
import './Notification.scss';

function Notification({ title, description, time, verbose=false}) {
    return (
        <div className="notification-item">
            <div className="details">
                <h4>{title}</h4>
                {
                    verbose &&
                    <p>{description}</p>
                }
            </div>
            {
                time &&
                <div className="time">
                    <p>{time.toLocaleTimeString()}</p>
                </div>
            }
        </div>
    )
}

export default Notification;