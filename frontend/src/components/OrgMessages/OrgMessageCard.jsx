import React, { useState } from 'react';
import apiRequest from '../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import MessageReplies from './MessageReplies';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import './OrgMessages.scss';

// Event Embed Card Component (Twitter/LinkedIn style)
const EventEmbedCard = ({ event }) => {
    const navigate = useNavigate();
    const date = new Date(event?.start_time || Date.now());
    
    const getEventTypeColor = (eventType) => {
        const colorMap = {
            'campus': 'rgba(250, 117, 109, 1)',
            'alumni': '#5C5C5C',
            'sports': '#6EB25F',
            'arts': '#FBEBBB',
            'study': 'rgba(250, 117, 109, 1)',
            'meeting': 'rgba(250, 117, 109, 1)'
        };
        return colorMap[eventType] || 'rgba(250, 117, 109, 1)';
    };

    const eventTypeColor = getEventTypeColor(event?.type);
    const hasPreviewImage = event?.image || event?.previewImage;

    const handleClick = (e) => {
        e.preventDefault();
        if (event?._id) {
            navigate(`/event/${event._id}`);
        }
    };

    return (
        <div className="event-embed-card" onClick={handleClick}>
            {(hasPreviewImage) ? (
                <div className="event-embed-image">
                    <img 
                        src={event.image || event.previewImage} 
                        alt={event?.name || "Event"}
                    />
                </div>
            ) : (
                <div 
                    className="event-embed-image gradient"
                    style={{
                        background: `linear-gradient(135deg, ${eventTypeColor} 0%, white 100%)`
                    }}
                />
            )}
            <div className="event-embed-info">
                <h4>{event?.name || "Event Title"}</h4>
                {event?.start_time && (
                    <div className="event-embed-row">
                        <Icon icon="heroicons:calendar-16-solid" />
                        <span>
                            {date.toLocaleString('default', {weekday: 'long'})} {date.toLocaleString('default', {month: 'numeric'})}/{date.getDate()}
                        </span>
                    </div>
                )}
                {event?.location && (
                    <div className="event-embed-row">
                        <Icon icon="fluent:location-28-filled" />
                        <span>{event.location}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const OrgMessageCard = ({ message, orgId, orgData, onUpdate }) => {
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(message.likeCount || 0);
    const [showReplies, setShowReplies] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { user } = useAuth();
    const { addNotification } = useNotification();

    // Check if user has liked this message
    React.useEffect(() => {
        if (message.likes && user?._id) {
            const liked = message.likes.some(likeId => likeId.toString() === user._id.toString());
            setIsLiked(liked);
        }
    }, [message.likes, user]);

    const handleLike = async () => {
        try {
            const response = await apiRequest(`/org-messages/${orgId}/messages/${message._id}/like`, {});

            if (response.success) {
                setIsLiked(response.liked);
                setLikeCount(response.likeCount);
            } else {
                addNotification({
                    title: 'Error',
                    content: 'Failed to update like',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error liking message:', error);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this message?')) {
            return;
        }

        setIsDeleting(true);
        try {
            const response = await apiRequest(
                `/org-messages/${orgId}/messages/${message._id}`,
                {},
                { method: 'DELETE' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    content: 'Message deleted successfully',
                    type: 'success'
                });
                onUpdate?.();
            } else {
                addNotification({
                    title: 'Error',
                    content: response.message || 'Failed to delete message',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            addNotification({
                title: 'Error',
                content: 'Failed to delete message',
                type: 'error'
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const canDelete = user?._id && (
        (message.authorId?._id?.toString() === user._id.toString() || 
         message.authorId?.toString() === user._id.toString()) ||
        user.admin === true
    );

    const eventMatchData = React.useMemo(() => {
        if (!Array.isArray(message.mentionedEvents)) {
            return [];
        }

        return message.mentionedEvents
            .filter(event => event && typeof event === 'object' && event.name)
            .map(event => ({
                event,
                lowerName: event.name.toLowerCase(),
                eventId: event._id?.toString?.() || event._id || event.id
            }));
    }, [message.mentionedEvents]);

    const embedEvents = React.useMemo(() => {
        if (eventMatchData.length > 0) {
            return eventMatchData.map(data => data.event);
        }
        return Array.isArray(message.mentionedEvents) ? message.mentionedEvents : [];
    }, [eventMatchData, message.mentionedEvents]);

    const escapeHtml = (unsafe) => {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const formatContent = (text) => {
        if (!text) return '';

        // Identify URL ranges first
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlRanges = [];
        let urlMatch;
        while ((urlMatch = urlRegex.exec(text)) !== null) {
            urlRanges.push({
                start: urlMatch.index,
                end: urlMatch.index + urlMatch[0].length,
                url: urlMatch[0]
            });
        }
        const isInUrl = (pos) => urlRanges.some(range => pos >= range.start && pos < range.end);

        const lowerText = text.toLowerCase();
        const eventRanges = [];

        eventMatchData.forEach(({ event, lowerName, eventId }) => {
            if (!eventId) {
                return;
            }

            // Match ID-based mentions (@event:{id})
            const idMentionKey = `@event:${eventId}`;
            let idx = 0;
            while ((idx = lowerText.indexOf(idMentionKey.toLowerCase(), idx)) !== -1) {
                if (!isInUrl(idx)) {
                    const afterMatch = idx + idMentionKey.length;
                    const charAfter = afterMatch < text.length ? text[afterMatch] : '';
                    const isWordBoundary = !charAfter || 
                        /[\s\n\r@#]/.test(charAfter) || 
                        /[.,!?;:]/.test(charAfter);
                    
                    if (isWordBoundary) {
                        // Use event name for display, but match the ID in content
                        eventRanges.push({
                            start: idx,
                            end: idx + idMentionKey.length,
                            event,
                            displayText: `@event:${lowerName}` // Show name in display
                        });
                    }
                }
                idx += idMentionKey.length;
            }
        });

        // No fallback - only ID-based mentions are supported

        const sortedRanges = eventRanges
            .sort((a, b) => {
                if (a.start === b.start) {
                    return (b.end - b.start) - (a.end - a.start);
                }
                return a.start - b.start;
            })
            .reduce((acc, range) => {
                const overlaps = acc.some(existing =>
                    range.start < existing.end && range.end > existing.start
                );
                if (!overlaps) {
                    acc.push(range);
                }
                return acc;
            }, []);

        let result = '';
        let i = 0;
        let rangeIndex = 0;

        while (i < text.length) {
            const urlAtPos = urlRanges.find(range => range.start === i);
            if (urlAtPos) {
                result += `<a href="${urlAtPos.url}" target="_blank" rel="noopener noreferrer" class="message-link">${escapeHtml(urlAtPos.url)}</a>`;
                i = urlAtPos.end;
                continue;
            }

            const currentRange = sortedRanges[rangeIndex];
            if (currentRange && currentRange.start === i) {
                // Use displayText if available (for ID-based mentions showing names), otherwise use the matched text
                const displayMention = currentRange.displayText || text.substring(currentRange.start, currentRange.end);
                const linkTarget = currentRange.event?._id ? `/event/${currentRange.event._id}` : null;
                const mentionHtml = linkTarget
                    ? `<a href="${linkTarget}" class="event-mention">${escapeHtml(displayMention)}</a>`
                    : `<span class="event-mention">${escapeHtml(displayMention)}</span>`;
                result += mentionHtml;
                i = currentRange.end;
                rangeIndex += 1;
                continue;
            }

            const char = text[i];
            if (char === '\n') {
                result += '<br />';
            } else {
                result += escapeHtml(char);
            }
            i += 1;
        }

        return result;
    };

    const formattedContent = formatContent(message.content);
    const timeAgo = message.createdAt ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true }) : '';

    return (
        <div className="org-message-card">
            <div className="profile-column">
                {message.authorId?.picture ? (
                    <img 
                        src={message.authorId.picture} 
                        alt={message.authorId.name || message.authorId.username}
                        className="author-avatar"
                    />
                ) : (
                    <div className="author-avatar placeholder">
                        <Icon icon="mdi:account" />
                    </div>
                )}
                {showReplies && message.replyCount > 0 && (
                    <div className="reply-line"/>
                )}
            </div>
            <div className="message-body">
                <div className="message-header">
                    <div className="comment-author-info">
                        <span className="comment-author">
                            {message.authorId?.name || message.authorId?.username || 'Unknown'}
                        </span>
                        {message.authorRoleDisplayName && (
                            <span className="author-role">
                                {message.authorRoleDisplayName}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="comment-date">{timeAgo}</span>
                        {canDelete && (
                            <button 
                                className="delete-btn"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                title="Delete message"
                            >
                                <Icon icon="mdi:delete-outline" />
                            </button>
                        )}
                    </div>
                </div>
                <div 
                    className="comment-text"
                    dangerouslySetInnerHTML={{ __html: formattedContent }}
                />
                {embedEvents && embedEvents.length > 0 && (
                    <div className="event-embeds">
                        {embedEvents.map(event => (
                            <EventEmbedCard key={event?._id || event?.id || event?.name} event={event} />
                        ))}
                    </div>
                )}
                <div className="comment-actions">
                    <div 
                        className={`reply ${isLiked ? 'liked' : ''}`}
                        onClick={handleLike}
                        style={{ cursor: 'pointer' }}
                    >
                        <Icon icon={isLiked ? "mdi:heart" : "mdi:heart-outline"} />
                        <p>{likeCount || 0}</p>
                    </div>
                    <div className="separator"></div>
                    <div 
                        className="reply" 
                        onClick={() => setShowReplies(!showReplies)}
                    >
                        <Icon icon="lets-icons:comment-fill" />
                        <p>{message.replyCount || 0}</p>
                    </div>
                </div>
                {showReplies && (
                    <MessageReplies 
                        messageId={message._id}
                        orgId={orgId}
                        orgData={orgData}
                        onReplyAdded={onUpdate}
                    />
                )}
            </div>
        </div>
    );
};

export default OrgMessageCard;

