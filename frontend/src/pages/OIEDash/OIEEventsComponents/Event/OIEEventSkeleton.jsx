import React from 'react';
import './OIEEvent.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import defaultAvatar from '../../../../assets/defaultAvatar.svg';

function OIEEventSkeleton({ index, showExpand = true, manage = false, showHosting = true, extraInfo, loading = true }) {
    // Hardcoded values for loading state
    const skeletonEvent = {
        name: "Loading Event Name...",
        start_time: new Date(),
        location: "Loading location...",
        hostingType: "User",
        hostingId: {
            image: defaultAvatar,
            name: "Loading Host Name",
            roles: ["student"]
        }
    };

    const date = new Date(skeletonEvent.start_time);

    const renderHostingStatus = () => {
        const hostingImage = skeletonEvent.hostingId.image;
        const hostingName = skeletonEvent.hostingId.name;
        const level = "Student";
        
        return (
            <div className={`row ${level.toLowerCase()}`}>
                <img src={hostingImage} alt="" />
                <p className="user-name">{hostingName}</p>
                <div className={`level ${level.toLowerCase()}`}>
                    {level}
                </div>
            </div>
        );
    }

    return(
        <div className={`oie-event-component skeleton ${loading ? '' : 'invisible'}`} style={{animationDelay: index ? `${index * 0.1}s` : '0s'}}>
            <div className="info">
                {extraInfo && extraInfo}
                <h2>{skeletonEvent.name}</h2>
                {showHosting && renderHostingStatus()}
                <div className="row">
                    <Icon icon="heroicons:calendar-16-solid" />
                    <p>{date.toLocaleString('default', {weekday: 'long'})} {date.toLocaleString('default', {month: 'numeric'})}/{date.getDate()}</p>
                </div>
                <div className="row">
                    <Icon icon="fluent:location-28-filled" />
                    <p>{skeletonEvent.location}</p>
                </div>
            </div>
            <div className="event-button-container">
                {
                    showExpand && 
                    <button className="button skeleton-button" disabled>
                        <Icon icon="material-symbols:expand-content-rounded" />
                        <p>details</p>
                    </button>
                }
                {
                    manage &&
                    <button className="button skeleton-button" disabled>
                        <Icon icon="fluent:edit-48-filled" />
                        <p>manage</p>
                    </button>
                }
            </div>
        </div>
    );
}

export default OIEEventSkeleton; 