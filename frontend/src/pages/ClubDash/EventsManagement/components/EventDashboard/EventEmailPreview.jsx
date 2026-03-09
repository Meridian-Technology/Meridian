import React from 'react';
import './EventEmailPreview.scss';

/**
 * Preview of the event announcement email. Matches the structure of the actual
 * email built in orgInviteService.buildEventAnnouncementEmail.
 */
function EventEmailPreview({
    eventName,
    eventStartTime,
    orgName,
    authorName,
    authorPicture,
    contentHtml,
    emptyPlaceholder,
    subject,
    sendAsOrg
}) {
    const hasContent = contentHtml && String(contentHtml).trim().length > 0;
    const displayName = eventName || 'Event';
    const displayOrg = orgName || 'Your organization';
    const displayAuthor = authorName || orgName || 'Someone';
    const initial = (displayAuthor.charAt(0) || 'O').toUpperCase();
    const showOrgInHeader = !sendAsOrg;

    return (
        <div className="event-email-preview">
            <div className="event-email-preview_ui__header">
                <img src="https://lh3.googleusercontent.com/a/default-user=s80-p" alt="" className="event-email-preview_ui__org-logo" />
                <div className="event-email-preview_ui__org-name-container">
                    <h3 className="event-email-preview_ui__org-name">{displayOrg}</h3>
                    <p className="event-email-preview_ui__recipient">to me</p>
                </div>
                <div className="event-email-preview_ui__date-container">
                    <h3 className="event-email-preview_ui__date">{new Date(eventStartTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</h3>
                </div>

            </div>
            <div className="event-email-preview__header">
                <h1 className="event-email-preview__title">{displayName}</h1>
                {eventStartTime && (
                    <p className="event-email-preview__date">
                        {new Date(eventStartTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                )}
                {showOrgInHeader && <p className="event-email-preview__org">{displayOrg}</p>}
            </div>
            <div className="event-email-preview__sender">
                {authorPicture ? (
                    <img src={authorPicture} alt="" className="event-email-preview__avatar event-email-preview__avatar--img" />
                ) : (
                    <span className="event-email-preview__avatar" aria-hidden>
                        {initial}
                    </span>
                )}
                <strong className="event-email-preview__sender-name">{displayAuthor}</strong>
            </div>
            <div className="event-email-preview__content-block">
                {subject && String(subject).trim() ? (
                    <h2 className="event-email-preview__subject">{subject}</h2>
                ) : null}
                {hasContent ? (
                    <div
                        className="event-email-preview__content"
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />
                ) : emptyPlaceholder ? (
                    <p className="event-email-preview__placeholder">{emptyPlaceholder}</p>
                ) : null}
                <span className="event-email-preview__cta-btn">View Event</span>
                <p className="event-email-preview__disclaimer">
                    You received this email because you are registered for <span className="event-email-preview__disclaimer-link">{displayName}</span> on Meridian. To contact the host, reply to this email.
                </p>
            </div>
        </div>
    );
}

export default EventEmailPreview;
