import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import HeaderContainer from '../../../../../../components/HeaderContainer/HeaderContainer';
import Popup from '../../../../../../components/Popup/Popup';
import EventEmailPreview from '../EventEmailPreview';
import { useFetch } from '../../../../../../hooks/useFetch';
import { parseMarkdownDescription } from '../../../../../../utils/markdownUtils';
import './CommunicationsTab.scss';

function stripHtml(html) {
    if (!html || typeof html !== 'string') return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function CommunicationsTab({
    event,
    orgId,
    onSendAnnouncement,
    onOpenRegistrationSettings,
    onNavigateToAnalytics
}) {
    const [previewMessage, setPreviewMessage] = useState(null);

    const announcementsUrl = event?._id && orgId
        ? `/org-messages/${orgId}/events/${event._id}/announcements`
        : null;
    const { data: announcementsData } = useFetch(announcementsUrl);
    const announcements = announcementsData?.success && Array.isArray(announcementsData?.data?.announcements)
        ? announcementsData.data.announcements
        : [];

    const analyticsUrl = event?._id ? `/event-analytics/event/${event._id}?timeRange=30d` : null;
    const { data: analyticsData } = useFetch(analyticsUrl);
    const emailViews = analyticsData?.success && analyticsData?.data?.platform?.referrerSources?.email != null
        ? analyticsData.data.platform.referrerSources.email
        : 0;
    const emailViewsByAnnouncement = analyticsData?.success && analyticsData?.data?.platform?.emailViewsByAnnouncement
        ? analyticsData.data.platform.emailViewsByAnnouncement
        : {};

    const eventName = event?.name || 'Event';
    const eventStartTime = event?.start_time;
    const orgName = event?.hostingId?.org_name || 'Organization';

    return (
        <div className="communications-tab">
            <HeaderContainer
                icon="mdi:email-send-outline"
                header="Communications"
                subheader="Send announcements and manage how attendees receive updates"
                classN="communications-tab-hero"
                size="1rem"
            >
                <div className="communications-tab-hero__content">
                    <p className="communications-tab-hero__desc">
                        Reach registrants and attendees by email and in-app notification. Choose who receives each announcement and preview the email before sending.
                    </p>
                    <div className="communications-tab-hero__actions">
                        <button
                            type="button"
                            className="communications-tab-hero__cta"
                            onClick={onSendAnnouncement}
                        >
                            <Icon icon="mdi:email-send-outline" />
                            Send announcement
                        </button>
                    </div>
                </div>
            </HeaderContainer>

            {/* Past announcements + analytics summary */}
            <HeaderContainer
                icon="mdi:history"
                header="Past announcements"
                subheader={announcements.length > 0 ? `${announcements.length} sent` : 'None yet'}
                classN="communications-tab-card"
                size="1rem"
            >
                {announcements.length > 0 ? (
                    <>
                        <div className="communications-tab-analytics-summary">
                            <span className="communications-tab-analytics-label">Event views from email (last 30 days):</span>
                            <strong className="communications-tab-analytics-value">{emailViews}</strong>
                            {typeof onNavigateToAnalytics === 'function' && (
                                <button
                                    type="button"
                                    className="communications-tab-link-btn"
                                    onClick={onNavigateToAnalytics}
                                >
                                    <Icon icon="mdi:chart-line" />
                                    View analytics
                                </button>
                            )}
                        </div>
                        <div className="communications-tab-table-wrap">
                            <table className="communications-tab-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>From</th>
                                        <th>Subject</th>
                                        <th>Preview</th>
                                        <th className="communications-tab-table-views">Event Clicks</th>
                                        <th className="communications-tab-table-actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {announcements.map((msg) => {
                                        const author = msg.authorId;        
                                        const authorName = author?.name || author?.username || 'Someone';
                                        const msgSubject = msg.subject && String(msg.subject).trim() ? msg.subject : null;
                                        const snippet = stripHtml(msg.content).substring(0, 60);
                                        const dateStr = msg.createdAt
                                            ? new Date(msg.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                                            : '—';
                                        const msgIdStr = msg._id ? String(msg._id) : '';
                                        const viewsCount = msgIdStr ? (emailViewsByAnnouncement[msgIdStr] ?? 0) : 0;
                                        return (
                                            <tr key={msg._id}>
                                                <td className="communications-tab-table-date">{dateStr}</td>
                                                <td className="communications-tab-table-from">{authorName}</td>
                                                <td className="communications-tab-table-subject" title={msgSubject || undefined}>
                                                    {msgSubject || '—'}
                                                </td>
                                                <td className="communications-tab-table-preview" title={stripHtml(msg.content)}>
                                                    {snippet}{snippet.length >= 60 ? '…' : ''}
                                                </td>
                                                <td className="communications-tab-table-views" title="Clicks from this email (last 30 days)">
                                                    {viewsCount}
                                                </td>
                                                <td className="communications-tab-table-actions">
                                                    <button
                                                        type="button"
                                                        className="communications-tab-row-btn"
                                                        onClick={() => setPreviewMessage(msg)}
                                                    >
                                                        <Icon icon="mdi:eye-outline" />
                                                        Preview
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <p className="communications-tab-card__text">No announcements have been sent for this event yet.</p>
                )}
            </HeaderContainer>

            <HeaderContainer
                icon="mdi:email-outline"
                header="Email announcements"
                subheader="How it works"
                classN="communications-tab-card"
                size="1rem"
            >
                <ul className="communications-tab-list">
                    <li>
                        <Icon icon="mdi:check-circle" className="communications-tab-list__icon" />
                        <span>Recipients get a formatted email with your message and a &quot;View Event&quot; button.</span>
                    </li>
                    <li>
                        <Icon icon="mdi:check-circle" className="communications-tab-list__icon" />
                        <span>Clicks from the email are tracked in <strong>Analytics</strong> under Sources → Email.</span>
                    </li>
                    <li>
                        <Icon icon="mdi:check-circle" className="communications-tab-list__icon" />
                        <span>Guests who registered without an account can be included if you set a notification email question in Registration settings.</span>
                    </li>
                </ul>
                {typeof onOpenRegistrationSettings === 'function' && (
                    <button
                        type="button"
                        className="communications-tab-link-btn"
                        onClick={onOpenRegistrationSettings}
                    >
                        <Icon icon="mdi:cog-outline" />
                        Open Registration settings
                    </button>
                )}
            </HeaderContainer>

            <HeaderContainer
                icon="mdi:bell-outline"
                header="In-app notifications"
                subheader="Optional channel"
                classN="communications-tab-card"
                size="1rem"
            >
                <p className="communications-tab-card__text">
                    When you send an announcement, you can enable in-app notifications so signed-in attendees see the update in their Meridian inbox as well as by email.
                </p>
            </HeaderContainer>

            {/* Preview modal via Popup */}
            <Popup
                isOpen={!!previewMessage}
                onClose={() => setPreviewMessage(null)}
                customClassName="communications-tab-preview-popup"
            >
                <div className="communications-tab-preview-header">
                    <h3 id="communications-preview-title">Email preview</h3>
                </div>
                <EventEmailPreview
                    eventName={eventName}
                    eventStartTime={eventStartTime}
                    orgName={orgName}
                    authorName={previewMessage?.sendAsOrg ? orgName : (previewMessage?.authorId?.name || previewMessage?.authorId?.username || orgName)}
                    authorPicture={previewMessage?.sendAsOrg ? event?.hostingId?.org_profile_image : previewMessage?.authorId?.picture}
                    contentHtml={parseMarkdownDescription(previewMessage?.content || '')}
                    subject={previewMessage?.subject}
                    sendAsOrg={!!previewMessage?.sendAsOrg}
                />
                <div className="communications-tab-preview-footer">
                    <button type="button" className="communications-tab-preview-done" onClick={() => setPreviewMessage(null)}>
                        Done
                    </button>
                </div>
            </Popup>
        </div>
    );
}

export default CommunicationsTab;
