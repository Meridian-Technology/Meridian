import { useState, useEffect } from 'react';
import postRequest from '../../utils/postRequest';
import { useNotification } from '../../NotificationContext';
import './CommentsSection.scss';
import useAuth from '../../hooks/useAuth';
import Comment from './Comment/Comment';

function CommentsSection({ comments: initialComments, eventId, onCommentAdded }) {
    const [comments, setComments] = useState(initialComments);
    const [newComment, setNewComment] = useState('');
    const [groupedComments, setGroupedComments] = useState({});
    const { addNotification } = useNotification();
    const {user} = useAuth();

    useEffect(() => {
        setComments(initialComments);
    }, [initialComments]);

    const addOptimisticComment = (comment) => {
        setComments(prev => [comment, ...prev]);
    }

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        //generate random id

        setNewComment('');

        try {
            const response = await postRequest('/add-approval-comment', {
                event_id: eventId,
                comment: newComment
            });

            if (response.success) {
                // Remove optimistic comment and let parent component handle the refetch
                setComments(prev => prev.filter(comment => !comment.isOptimistic));
                //populate user object in new comment
                response.comment.userId = user;
                response.comment.newComment = true; //just for load in animation
                //add the new comment to the comments array
                setComments(prev => [response.comment, ...prev]);
                onCommentAdded?.();
            } else {
                // Revert optimistic update on error
                setComments(prev => prev.filter(comment => !comment.isOptimistic));
                addNotification({
                    title: "Error",
                    content: "Failed to add comment",
                    type: "error"
                });
            }
        } catch (err) {
            // Revert optimistic update on error
            setComments(prev => prev.filter(comment => !comment.isOptimistic));
            addNotification({
                title: "Error",
                content: "Failed to add comment",
                type: "error"
            });
        }
    };

    useEffect(() => {
        // Group comments by parent
        const grouped = comments.reduce((acc, comment) => {
            if (!comment.parentCommentId) {
                if(acc[comment._id]){
                    acc[comment._id].comment = comment;
                } else {
                    acc[comment._id] = {
                        comment,
                        replies: []
                    };
                }
            } else {
                if (acc[comment.parentCommentId]) {
                    acc[comment.parentCommentId].replies.unshift(comment);
                } else {
                    // If parent comment not found, create a placeholder
                    // check if parent comment is a reply
                    const parentComment = comments.find(c => c._id === comment.parentCommentId);
                    if(parentComment && parentComment.parentCommentId){
                        if(acc[parentComment.parentCommentId]){
                            acc[parentComment.parentCommentId].replies.unshift(comment);
                        } else {
                            acc[parentComment.parentCommentId] = {
                                comment: null,
                                replies: [comment]
                            }
                        }
                    } else {
                        acc[comment.parentCommentId] = {
                            comment: null,
                            replies: [comment]
                        };
                    }
                }
            }
            return acc;
        }, {});

        setGroupedComments(grouped);
        
    }, [comments]);



    return (
        <div className="comments-section">
            <h2>Comments</h2>
            <div className="add-comment">
                <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment();
                        }
                    }}
                    placeholder="Add a comment..."
                    rows={3}
                />
                <button 
                    onClick={handleAddComment}
                    disabled={!newComment.trim()}
                    className="submit-comment"
                >
                    Add Comment
                </button>
            </div>
            <div className="comments-list">
                {Object.values(groupedComments).map(({ comment, replies }) => (
                    comment && (
                        <div key={comment._id} className="comment-group">
                            <Comment 
                                comment={comment} 
                                eventId={eventId}
                                onReplyAdded={addOptimisticComment}
                                hasReplies={replies.length > 0}
                            />
                            {replies.map((reply, index) => (
                                <Comment 
                                    key={reply._id} 
                                    comment={reply} 
                                    eventId={eventId}
                                    onReplyAdded={addOptimisticComment}
                                    lastReply={index === replies.length - 1}
                                />
                            ))}
                        </div>
                    )
                ))}
            </div>
        </div>
    );
}

export default CommentsSection;