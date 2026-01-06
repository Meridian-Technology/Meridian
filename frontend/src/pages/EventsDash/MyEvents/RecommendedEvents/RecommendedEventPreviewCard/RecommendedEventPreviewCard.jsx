import React from "react";
import "./RecommendedEventPreviewCard.scss";
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNavigate } from "react-router-dom";

const RecommendedEventPreviewCard = ({ event }) => {
    const navigate = useNavigate();
  const date = new Date(event?.start_time || Date.now());

  // Color mapping based on event type (from Explore.jsx color legend)
  const getEventTypeColor = (eventType) => {
    const colorMap = {
      'campus': '#6D8EFA',
      'alumni': '#5C5C5C',
      'sports': '#6EB25F', // athletics in legend
      'arts': '#FBEBBB',   // arts/EMPAC in legend
      'study': 'rgba(250, 117, 109, 1)', // default to campus color
      'meeting': 'rgba(250, 117, 109, 1)' // default to campus color
    };
    return colorMap[eventType] || 'rgba(250, 117, 109, 1)'; // default to campus color
  };

  const eventTypeColor = getEventTypeColor(event?.type);
  const hasPreviewImage = event?.image || event?.previewImage;

  return (
    <div className="recommended-event-preview-card" onClick={()=>{navigate(`/event/${event._id}`)}}>
      {/* Preview Image or Gradient */}
      <div 
        className={`event-image ${!hasPreviewImage ? 'gradient-background' : ''}`}
        style={!hasPreviewImage ? {
          background: `linear-gradient(135deg, ${eventTypeColor} 0%, white 100%)`
        } : {}}
      >
        {hasPreviewImage && (
          <img 
            src={event.image || event.previewImage} 
            alt={event?.name || "Event"} 
            className="actual-image"
          />
        )}
      </div>
      
      <div className="info">
        <h2>{event?.name || "Event Title"}</h2>
        
        {/* Date Row */}
        <div className="row">
          <Icon icon="heroicons:calendar-16-solid" />
          <p>{date.toLocaleString('default', {weekday: 'long'})} {date.toLocaleString('default', {month: 'numeric'})}/{date.getDate()}</p>
        </div>
        
        {/* Location Row */}
        <div className="row">
          <Icon icon="fluent:location-28-filled" />
          <p className="location">{event?.location || "Location TBD"}</p>
        </div>
      </div>
    </div>
  );
};

export default RecommendedEventPreviewCard;
