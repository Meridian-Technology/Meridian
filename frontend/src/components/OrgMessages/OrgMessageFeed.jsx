import React, { useState, useEffect } from 'react';
import { useFetch } from '../../hooks/useFetch';
import OrgMessageCard from './OrgMessageCard';
import OrgMessageComposer from './OrgMessageComposer';
import useAuth from '../../hooks/useAuth';
import './OrgMessages.scss';

const OrgMessageFeed = ({ orgId, orgData }) => {
    const [page, setPage] = useState(1);
    const [messages, setMessages] = useState([]);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
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

    // Reset to page 1 when refetching
    const handleRefetch = () => {
        setPage(1);
        refetch();
    };

    const handleNewMessage = () => {
        // Refetch messages from page 1
        setPage(1);
        setTimeout(() => {
            refetch();
        }, 100);
    };

    const handleLoadMore = () => {
        if (!loading && hasMore) {
            setPage(prev => prev + 1);
        }
    };

    // Check if user can post
    const canPost = orgData?.org?.isMember && orgData?.overview?.messageSettings?.enabled !== false;

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
        <div className="org-message-feed">
            {canPost && (
                <div className="composer-container">
                    <OrgMessageComposer orgId={orgId} orgData={orgData} onMessageCreated={handleNewMessage} />
                </div>
            )}
            
            <div className="messages-list">
                {messages.length === 0 ? (
                    <div className="empty-state">
                        <p>No messages yet. Be the first to post!</p>
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

