import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import defaultAvatar from '../../../assets/defaultAvatar.svg';
import './Comment.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useState } from 'react';
import postRequest from '../../../utils/postRequest';
import { useNotification } from '../../../NotificationContext';
import useAuth from '../../../hooks/useAuth';
dayjs.extend(relativeTime);

function CommentDate(date) {
    const now = dayjs();
    const created = dayjs(date);
  
    const diffInDays = now.diff(created, 'day');
  
    let displayTime = '';
    if (diffInDays > 7) {
        displayTime = created.format('MMM D, YYYY'); // e.g. "Apr 1, 2024"
    } else {
        displayTime = created.fromNow(); // e.g. "2 hours ago"
    }
  
    return displayTime;
}

function Comment({ comment, eventId, onReplyAdded, hasReplies=true, lastReply=false }) {
    const { user } = useAuth();
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const { addNotification } = useNotification();


    const handleReply = async () => {
        if (!replyText.trim()) return;

        try {
            console.log('Submitting reply:', {
                event_id: eventId,
                comment: replyText,
                parentCommentId: comment._id
            });

            const response = await postRequest('/add-approval-comment', {
                event_id: eventId,
                comment: replyText,
                parentCommentId: comment._id
            });

            if (response.success) {
                setReplyText('');
                setIsReplying(false);
                //populate user object in new comment
                response.comment.userId = user;
                response.comment.newComment = true;
                onReplyAdded?.(response.comment);
            } else {
                addNotification({
                    title: "Error",
                    content: "Failed to add reply",
                    type: "error"
                });
            }
        } catch (err) {
            console.error('Error adding reply:', err);
            addNotification({
                title: "Error",
                content: "Failed to add reply",
                type: "error"
            });
        }
    };

    return (
        <div className={`approval-comment ${comment.parentCommentId ? 'reply' : ''} ${comment.newComment ? 'new-comment' : ''}`}>
            <div className="profile-column">
                {
                    comment.parentCommentId && (
                        <>
                            <div className="reply-line-reply">
                                <div className="reply-curve"/>
                                {
                                    !lastReply && (
                                        <div className="reply-line"/>
                                    )
                                }
                            </div>
                        </>
                    )
                }
                <img 
                    src={comment.userId.picture ? comment.userId.picture : defaultAvatar} 
                    alt={comment.userId.name} 
                    className="comment-author-image" 
                />
                {
                    hasReplies && !comment.parentCommentId && (
                        <div className="reply-line"/>
                    )
                }
            </div>
            <div className="comment-body">
                <div className="comment-header">
                    <div className="comment-author-info">
                        <span className="comment-author">{comment.userId.name}</span>
                    </div>
                    <span className="comment-date">
                        {comment.newComment ? 'Just now' : CommentDate(comment.createdAt)}
                    </span>
                </div>
                <p className="comment-text">{comment.text}</p>
                <div className="comment-actions">
                    <button className="comment-action-button">
                        <Icon icon="proicons:emoji" />
                    </button>
                    <div className="separator"></div>
                    <div className="reply" onClick={() => setIsReplying(!isReplying)}>
                        <Icon icon="lets-icons:comment-fill" />
                        <p>Reply</p>
                    </div>
                </div>
                {isReplying && (
                    <div className="reply-form">
                        <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write a reply..."
                            rows={3}
                        />
                        <div className="reply-form-actions">
                            <button onClick={() => setIsReplying(false)} className="cancel-reply">
                                Cancel
                            </button>
                            <button 
                                onClick={handleReply}
                                disabled={!replyText.trim()}
                                className="submit-reply"
                            >
                                Reply
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Comment;
