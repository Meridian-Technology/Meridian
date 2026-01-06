import React, { useState, useEffect } from 'react';
import { useFetch } from '../../hooks/useFetch';
import apiRequest from '../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import './OrgMessages.scss';

const MessageReplies = ({ messageId, orgId, orgData, onReplyAdded }) => {
    const [replies, setReplies] = useState([]);
    const [newReply, setNewReply] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationError, setValidationError] = useState('');
    const [characterLimit, setCharacterLimit] = useState(500);
    const [minCharacterLimit, setMinCharacterLimit] = useState(100);
    const { user } = useAuth();
    const { addNotification } = useNotification();

    // Fetch system config for character limits
    const { data: systemConfig } = useFetch('/org-management/config');

    const { data, loading, refetch } = useFetch(
        `/org-messages/${orgId}/messages/${messageId}`,
        { method: 'GET' }
    );

    useEffect(() => {
        if (data?.success) {
            setReplies(data.replies || []);
        }
    }, [data]);

    useEffect(() => {
        // Calculate character limits from org settings and system config
        const systemMaxLimit = systemConfig?.data?.messaging?.maxCharacterLimit || 2000;
        const systemMinLimit = systemConfig?.data?.messaging?.minCharacterLimit || 100;
        const orgLimit = orgData?.org?.messageSettings?.characterLimit || 500;
        
        const maxLimit = Math.min(orgLimit, systemMaxLimit);
        setCharacterLimit(maxLimit);
        setMinCharacterLimit(systemMinLimit);
    }, [orgId, orgData, systemConfig]);

    const validateContent = (text) => {
        const trimmed = text.trim();
        
        if (!trimmed) {
            return 'Reply content is required';
        }
        
        if (trimmed.length < minCharacterLimit) {
            return `Reply must be at least ${minCharacterLimit} characters`;
        }
        
        if (text.length > characterLimit) {
            return `Reply exceeds character limit of ${characterLimit}`;
        }
        
        return null;
    };

    const handleAddReply = async () => {
        // Clear previous validation error
        setValidationError('');
        
        // Validate content
        const error = validateContent(newReply);
        if (error) {
            setValidationError(error);
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await apiRequest(`/org-messages/${orgId}/messages/${messageId}/reply`, {
                content: newReply.trim()
            });

            if (response.success) {
                setNewReply('');
                setValidationError('');
                refetch();
                onReplyAdded?.();
                addNotification({
                    title: 'Success',
                    content: 'Reply posted successfully',
                    type: 'success'
                });
            } else {
                // Backend validation error (e.g., profanity)
                setValidationError(response.message || 'Failed to post reply');
                addNotification({
                    title: 'Error',
                    content: response.message || 'Failed to post reply',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error posting reply:', error);
            setValidationError('Failed to post reply. Please try again.');
            addNotification({
                title: 'Error',
                content: 'Failed to post reply. Please try again.',
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isSubmitting && !validateContent(newReply)) {
                handleAddReply();
            }
        }
    };

    const handleReplyChange = (e) => {
        const newContent = e.target.value;
        setNewReply(newContent);
        
        // Clear validation error when user starts typing
        if (validationError) {
            const error = validateContent(newContent);
            if (!error) {
                setValidationError('');
            }
        }
    };

    // Format content with links
    const formatContent = (text) => {
        if (!text) return '';
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="message-link">${url}</a>`;
        });
    };

    const isValid = !validateContent(newReply);

    return (
        <div className="message-replies">
            <div className="reply-form">
                <textarea
                    className={`reply-textarea ${validationError ? 'error' : ''}`}
                    value={newReply}
                    onChange={handleReplyChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Write a reply..."
                    rows={3}
                />
                {validationError && (
                    <div className="validation-error">
                        <Icon icon="mdi:alert-circle" />
                        <span>{validationError}</span>
                    </div>
                )}
                <div className="reply-form-actions">
                    <button
                        onClick={() => {
                            setNewReply('');
                            setValidationError('');
                        }}
                        className="cancel-reply"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAddReply}
                        disabled={!isValid || isSubmitting}
                        className="submit-reply"
                    >
                        {isSubmitting ? 'Posting...' : 'Reply'}
                    </button>
                </div>
            </div>

            {loading && replies.length === 0 ? (
                <div className="replies-loading">Loading replies...</div>
            ) : replies.length > 0 ? (
                <div className="replies-list">
                    {replies.map((reply, index) => (
                        <div key={reply._id} className={`reply-item ${index === replies.length - 1 ? 'last-reply' : ''}`}>
                            <div className="profile-column">
                                <div className="reply-line-reply">
                                    <div className="reply-curve"/>
                                    {index !== replies.length - 1 && (
                                        <div className="reply-line"/>
                                    )}
                                </div>
                                {reply.authorId?.picture ? (
                                    <img 
                                        src={reply.authorId.picture} 
                                        alt={reply.authorId.name || reply.authorId.username}
                                        className="reply-avatar-small"
                                    />
                                ) : (
                                    <div className="reply-avatar-small placeholder">
                                        <Icon icon="mdi:account" />
                                    </div>
                                )}
                            </div>
                            <div className="reply-body">
                                <div className="reply-header">
                                    <div className="comment-author-info">
                                        <span className="comment-author">
                                            {reply.authorId?.name || reply.authorId?.username || 'Unknown'}
                                        </span>
                                        {reply.authorRoleDisplayName && (
                                            <span className="author-role">
                                                {reply.authorRoleDisplayName}
                                            </span>
                                        )}
                                    </div>
                                    <span className="comment-date">
                                        {reply.createdAt ? formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true }) : ''}
                                    </span>
                                </div>
                                <p 
                                    className="comment-text"
                                    dangerouslySetInnerHTML={{ __html: formatContent(reply.content) }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
};

export default MessageReplies;

