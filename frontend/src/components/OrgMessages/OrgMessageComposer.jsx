import React, { useState, useRef, useEffect } from 'react';
import apiRequest from '../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import { useFetch } from '../../hooks/useFetch';
import RichTextInput from '../RichTextInput/RichTextInput';
import './OrgMessages.scss';

const OrgMessageComposer = ({ orgId, orgData, onMessageCreated }) => {
    const [content, setContent] = useState('');
    const [visibility, setVisibility] = useState('members_and_followers');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationError, setValidationError] = useState('');
    const [characterLimit, setCharacterLimit] = useState(500);
    const [minCharacterLimit, setMinCharacterLimit] = useState(100);
    const { user } = useAuth();
    const { addNotification } = useNotification();

    // Fetch system config for character limits
    const { data: systemConfig } = useFetch('/org-management/config');
    
    // Fetch events for this organization
    const { data: eventsData } = useFetch(
        orgId ? `/org-event-management/${orgId}/events?page=1&limit=50&status=all` : null
    );
    
    // The response structure is { success: true, data: { events: [...] } }
    const events = eventsData?.data?.events || eventsData?.events || [];
    
    // Filter events based on search
    const [eventSearch, setEventSearch] = useState('');
    const filteredEvents = events.filter(event => 
        event.name?.toLowerCase().includes(eventSearch.toLowerCase())
    ).slice(0, 10);

    useEffect(() => {
        // Calculate character limits from org settings and system config
        const systemMaxLimit = systemConfig?.data?.messaging?.maxCharacterLimit || 2000;
        const systemMinLimit = systemConfig?.data?.messaging?.minCharacterLimit || 100;
        const orgLimit = orgData?.org?.messageSettings?.characterLimit || 500;
        
        const maxLimit = Math.min(orgLimit, systemMaxLimit);
        setCharacterLimit(maxLimit);
        setMinCharacterLimit(systemMinLimit);
        
        // Set default visibility from org settings or system config
        const defaultVisibility = orgData?.org?.messageSettings?.defaultVisibility || 
                                  systemConfig?.data?.messaging?.defaultVisibility || 
                                  'members_and_followers';
        setVisibility(defaultVisibility);
    }, [orgId, orgData, systemConfig]);

    // Handle mention trigger from RichTextInput
    const handleMentionTrigger = ({ trigger, search }) => {
        setEventSearch(search);
    };

    // Get mention text for an event (use ID for storage, name for display)
    const getEventMentionText = (event) => {
        // Store as @event:{id} for better performance and resilience to name changes
        return `@event:${event._id || event.id}`;
    };

    // Render event mention option
    const renderEventMentionOption = (event) => (
        <>
            <Icon icon="mdi:calendar-text" />
            <div className="event-mention-info">
                <span className="event-mention-name">{event.name}</span>
                {event.start_time && (
                    <span className="event-mention-date">
                        {new Date(event.start_time).toLocaleDateString()}
                    </span>
                )}
            </div>
        </>
    );

    // Handle content change
    const handleContentChange = (newContent) => {
        setContent(newContent);
        
        // Clear validation error when user starts typing
        if (validationError) {
            const error = validateContent(newContent);
            if (!error) {
                setValidationError('');
            }
        }
    };

    const validateContent = (text) => {
        const trimmed = text.trim();
        
        if (!trimmed) {
            return 'Message content is required';
        }
        
        if (trimmed.length < minCharacterLimit) {
            return `Message must be at least ${minCharacterLimit} characters`;
        }
        
        if (text.length > characterLimit) {
            return `Message exceeds character limit of ${characterLimit}`;
        }
        
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Clear previous validation error
        setValidationError('');
        
        // Validate content
        const error = validateContent(content);
        if (error) {
            setValidationError(error);
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await apiRequest(`/org-messages/${orgId}/messages`, {
                content: content.trim(),
                visibility: visibility
            });

            if (response.success) {
                setContent('');
                setValidationError('');
                setEventSearch('');
                onMessageCreated?.();
                addNotification({
                    title: 'Success',
                    content: 'Message posted successfully',
                    type: 'success'
                });
            } else {
                // Backend validation error (e.g., profanity)
                setValidationError(response.message || 'Failed to post message');
                addNotification({
                    title: 'Error',
                    content: response.message || 'Failed to post message',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error posting message:', error);
            setValidationError('Failed to post message. Please try again.');
            addNotification({
                title: 'Error',
                content: 'Failed to post message. Please try again.',
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };



    const remainingChars = characterLimit - content.length;
    const isOverLimit = content.length > characterLimit;
    const isUnderMin = content.trim().length > 0 && content.trim().length < minCharacterLimit;
    const isValid = !validateContent(content);

    return (
        <div className="org-message-composer">
            <form onSubmit={handleSubmit} className="composer-form">
                <div className="composer-header">
                    <div className="author-info">
                        {user?.picture && (
                            <img src={user.picture} alt={user.name || user.username} className="author-avatar" />
                        )}
                        <span className="author-name">{user?.name || user?.username || 'You'}</span>
                    </div>
                </div>
                
                <div className="composer-content-wrapper">
                    <RichTextInput
                        value={content}
                        onChange={handleContentChange}
                        placeholder="What's happening? Type @ or # to mention events..."
                        rows={4}
                        maxLength={characterLimit + 100}
                        onMentionTrigger={handleMentionTrigger}
                        mentionOptions={filteredEvents}
                        renderMentionOption={renderEventMentionOption}
                        getMentionText={getEventMentionText}
                        className="composer-rich-text"
                        error={!!validationError}
                        disabled={isSubmitting}
                        events={events}
                    />
                </div>
                
                {validationError && (
                    <div className="validation-error">
                        <Icon icon="mdi:alert-circle" />
                        <span>{validationError}</span>
                    </div>
                )}
                
                <div className="composer-options">
                    <div className="visibility-selector">
                        <label>
                            <Icon icon="mdi:eye" />
                            <span>Visibility:</span>
                        </label>
                        <select
                            value={visibility}
                            onChange={(e) => setVisibility(e.target.value)}
                            className="visibility-select"
                        >
                            <option value="members_only">Members Only</option>
                            <option value="members_and_followers">Members & Followers</option>
                            <option value="public">Public</option>
                        </select>
                    </div>
                </div>
                
                <div className="composer-footer">
                    <div className="character-count-wrapper">
                        {isUnderMin && (
                            <span className="min-limit-hint">
                                Minimum: {minCharacterLimit} characters
                            </span>
                        )}
                        <div className="character-count">
                            <span className={isOverLimit ? 'over-limit' : remainingChars < 50 ? 'warning' : ''}>
                                {remainingChars}
                            </span>
                            <span className="separator">/</span>
                            <span>{characterLimit}</span>
                        </div>
                    </div>
                    
                    <button
                        type="submit"
                        className="submit-btn"
                        disabled={!isValid || isSubmitting}
                    >
                        {isSubmitting ? (
                            <>
                                <Icon icon="mdi:loading" className="spinning" />
                                <span>Posting...</span>
                            </>
                        ) : (
                            <>
                                <Icon icon="mdi:send" />
                                <span>Post</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default OrgMessageComposer;

