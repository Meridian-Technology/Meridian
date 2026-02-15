import React from 'react';
import { Icon } from '@iconify-icon/react';
import EventPageContent from '../../../../EventPage/EventPageContent';
import EventMobilePreview from './EventMobilePreview';
import '../../../../EventPage/EventPage.scss';
import './EventPreview.scss';

function EventPreview({ event, onRefetch }) {
    if (!event) return null;

    return (
        <div className="event-preview">
            <div className="event-preview-layout">
                <div className="event-preview-wrapper event-preview-desktop">
                    <div className="event-preview-scaled">
                        <div className="event-page event-preview-page">
                            <EventPageContent
                                event={event}
                                onRefetch={onRefetch}
                                previewMode={true}
                                showAnalytics={false}
                            />
                        </div>
                    </div>
                </div>
                {/* <div className="event-preview-wrapper event-preview-mobile">
                    <EventMobilePreview event={event} />
                </div> */}
            </div>
        </div>
    );
}

export default EventPreview;
