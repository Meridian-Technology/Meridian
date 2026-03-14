import React from 'react';
import { Icon } from '@iconify-icon/react';
import { formatDistanceToNow } from 'date-fns';
import { useFetch } from '../../../hooks/useFetch';
import { parseMarkdownDescription } from '../../../utils/markdownUtils';

function EventAnnouncementsFeed({ eventId }) {
    const { data, loading } = useFetch(
        eventId ? `/events/${eventId}/announcements` : null
    );
    const announcements = data?.success && Array.isArray(data?.data?.announcements)
        ? data.data.announcements
        : [];

    if (loading) {
        return (
            <div className="event-checked-in-view__announcements-card">
                <h3 className="event-checked-in-view__section-title">
                    <Icon icon="mdi:chat-outline" />
                    Announcements
                </h3>
                <p className="event-checked-in-view__announcements-loading">Loading…</p>
            </div>
        );
    }

    if (announcements.length === 0) {
        return (
            <div className="event-checked-in-view__announcements-card">
                <h3 className="event-checked-in-view__section-title">
                    <Icon icon="mdi:chat-outline" />
                    Announcements
                </h3>
                <p className="event-checked-in-view__announcements-empty">No announcements yet.</p>
            </div>
        );
    }

    return (
        <div className="event-checked-in-view__announcements-card">
            <h3 className="event-checked-in-view__section-title">
                <Icon icon="mdi:chat-outline" />
                Announcements
            </h3>
            <div className="event-checked-in-view__announcements-list">
                {announcements.map((msg) => {
                    const author = msg.authorId;
                    const authorName = author?.name || author?.username || 'Organizer';
                    const subject = msg.subject && String(msg.subject).trim() ? msg.subject : null;
                    const timeAgo = msg.createdAt ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true }) : '';
                    return (
                        <div key={msg._id} className="event-checked-in-view__announcement-bubble">
                            <div className="event-checked-in-view__announcement-avatar">
                                {author?.picture ? (
                                    <img src={author.picture} alt="" />
                                ) : (
                                    <div className="event-checked-in-view__announcement-avatar-placeholder">
                                        <Icon icon="mdi:account" />
                                    </div>
                                )}
                            </div>
                            <div className="event-checked-in-view__announcement-body">
                                <div className="event-checked-in-view__announcement-header">
                                    <span className="event-checked-in-view__announcement-author">{authorName}</span>
                                    <span className="event-checked-in-view__announcement-time">{timeAgo}</span>
                                </div>
                                {subject && (
                                    <div className="event-checked-in-view__announcement-subject">{subject}</div>
                                )}
                                <div
                                    className="event-checked-in-view__announcement-content"
                                    dangerouslySetInnerHTML={{ __html: parseMarkdownDescription(msg.content) }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default EventAnnouncementsFeed;
