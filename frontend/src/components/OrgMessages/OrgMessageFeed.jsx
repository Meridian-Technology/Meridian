import React, { useState, useEffect, useRef } from 'react';
import { useFetch } from '../../hooks/useFetch';
import OrgMessageCard from './OrgMessageCard';
import OrgMessageComposer from './OrgMessageComposer';
import useAuth from '../../hooks/useAuth';
import './OrgMessages.scss';

const INTRO_ANIMATION_MS = 550;
const OUTRO_ANIMATION_MS = 420;

const OrgMessageFeed = ({ orgId, orgData }) => {
    const [page, setPage] = useState(1);
    const [messages, setMessages] = useState([]);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [justAddedId, setJustAddedId] = useState(null);
    const [exitingIds, setExitingIds] = useState(new Set());
    const animationTimeoutRef = useRef(null);
    const outroTimeoutsRef = useRef({});
    const { user } = useAuth();

    const { data, loading: fetchLoading, error, refetch } = useFetch(
        `/org-messages/${orgId}/messages?page=${page}&limit=20`,
        { method: 'GET' }
    );

    useEffect(() => {
        if (data?.success) {
            if (page === 1) {
                setMessages(data.messages || []);
            } else {
                setMessages(prev => [...prev, ...(data.messages || [])]);
            }
            setHasMore(data.pagination?.pages > page);
            setLoading(false);
        } else if (error) {
            setLoading(false);
        }
    }, [data, error, page]);

    const handleMessageDeleted = React.useCallback((messageId) => {
        setExitingIds(prev => new Set(prev).add(messageId));
        if (outroTimeoutsRef.current[messageId]) clearTimeout(outroTimeoutsRef.current[messageId]);
        outroTimeoutsRef.current[messageId] = setTimeout(() => {
            setMessages(prev => prev.filter(m => m._id !== messageId));
            setExitingIds(prev => {
                const next = new Set(prev);
                next.delete(messageId);
                return next;
            });
            delete outroTimeoutsRef.current[messageId];
        }, OUTRO_ANIMATION_MS);
    }, []);

    useEffect(() => {
        return () => {
            if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
            Object.values(outroTimeoutsRef.current).forEach(clearTimeout);
        };
    }, []);

    // Reset to page 1 when refetching
    const handleRefetch = () => {
        setPage(1);
        refetch();
    };

    const handleNewMessage = (createdMessage) => {
        setPage(1);
        if (createdMessage && createdMessage._id) {
            if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
            setJustAddedId(createdMessage._id);
            setMessages(prev => [createdMessage, ...prev]);
            animationTimeoutRef.current = setTimeout(() => {
                setJustAddedId(null);
                animationTimeoutRef.current = null;
            }, INTRO_ANIMATION_MS);
        } else {
            refetch();
        }
    };

    const handleLoadMore = () => {
        if (!loading && hasMore) {
            setPage(prev => prev + 1);
        }
    };

    // Check if user can post (messageSettings live on org.overview from get-org-by-name)
    const canPost = orgData?.org?.isMember && orgData?.org?.overview?.messageSettings?.enabled !== false;

    if (loading && messages.length === 0) {
        return (
            <div className="org-message-feed">
                <div className="loading-state">Loading messages...</div>
            </div>
        );
    }

    if (error && messages.length === 0) {
        return (
            <div className="org-message-feed">
                <div className="error-state">Error loading messages. Please try again.</div>
            </div>
        );
    }

    return (
        <div className="org-message-feed org-message-feed--comments">
            {canPost && (
                <div className="composer-container">
                    <OrgMessageComposer orgId={orgId} orgData={orgData} onMessageCreated={handleNewMessage} />
                </div>
            )}

            <div className="messages-list">
                {messages.length > 0 && (
                    <div className="comments-section-header">
                        <h3 className="comments-section-title">
                            {messages.length} {(messages.length === 1 ? 'announcement' : 'announcements')}
                        </h3>
                    </div>
                )}
                {messages.length === 0 ? (
                    <div className="empty-state">
                        <p>No announcements yet. Be the first to post!</p>
                    </div>
                ) : (
                    <>
                        {messages.map(message => (
                            <OrgMessageCard
                                key={message._id}
                                message={message}
                                orgId={orgId}
                                orgData={orgData}
                                onUpdate={handleNewMessage}
                                onMessageDeleted={handleMessageDeleted}
                                isJustAdded={message._id === justAddedId}
                                isExiting={exitingIds.has(message._id)}
                            />
                        ))}
                        {hasMore && (
                            <button 
                                className="load-more-btn"
                                onClick={handleLoadMore}
                                disabled={loading}
                            >
                                {loading ? 'Loading...' : 'Load More'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default OrgMessageFeed;

