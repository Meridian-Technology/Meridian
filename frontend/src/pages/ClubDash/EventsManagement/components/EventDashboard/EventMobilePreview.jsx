import React from 'react';
import EventPageContent from '../../../../EventPage/EventPageContent';
import '../../../../EventPage/EventPage.scss';
import './EventMobilePreview.scss';

/**
 * Mobile preview - phone-frame mockup showing how the event page looks on mobile.
 * Uses EventPageContent with mobile layout styling (column, image full width).
 */
function EventMobilePreview({ event }) {
    if (!event) return null;

    const eventWithAgenda = {
        ...event,
        eventAgenda: event.eventAgenda || { items: [], isPublished: false }
    };

    return (
        <div className="event-mobile-preview">
            <div className="event-mobile-preview-phone">
                <div className="event-mobile-preview-screen">
                    <div className="event-page event-mobile-preview-page">
                        <EventPageContent
                            event={eventWithAgenda}
                            onRefetch={() => {}}
                            previewMode={true}
                            showAnalytics={false}
                            variant="mobile"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EventMobilePreview;
