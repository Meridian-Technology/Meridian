import React, { useEffect } from 'react';
import './Review.scss';
import { Icon } from '@iconify-icon/react';

const Review = ({ formData, setFormData, onComplete, allStepsValid }) => {
    


    // Call onComplete once on mount - validation is handled by FlowComponentV2
    useEffect(() => {
        onComplete(true);
    }, []);

    return (
        <div className="review-step">
            <div className="form-section">
                <h3>Review Your Study Session</h3>
                <p>Please review all the details before creating your study session.</p>

                <div className="review-sections">
                    {/* Basic Information */}
                    <div className="review-section">
                        <div className="section-header">
                            <Icon icon="mingcute:book-6-fill" />
                            <h4>Basic Information</h4>
                        </div>
                        <div className="review-items">
                            <div className="review-item">
                                <span className="label">Title:</span>
                                <span className="value">{formData.title}</span>
                            </div>
                            <div className="review-item">
                                <span className="label">Course/Subject:</span>
                                <span className="value">{formData.course}</span>
                            </div>
                            {formData.description && (
                                <div className="review-item">
                                    <span className="label">Description:</span>
                                    <span className="value description">{formData.description}</span>
                                </div>
                            )}
                            <div className="review-item">
                                <span className="label">Visibility:</span>
                                <span className="value visibility">
                                    <span className={`visibility-badge ${formData.visibility}`}>
                                        {formData.visibility === 'public' ? 'Public - Anyone can join' : 'Private - Invite only'}
                                    </span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Available Times & Location */}
                    <div className="review-section">
                        <div className="section-header">
                            <Icon icon="mingcute:time-fill" />
                            <h4>Available Times & Location</h4>
                        </div>
                        <div className="review-items">
                            <div className="review-item">
                                <span className="label">Possible Meeting Times:</span>
                                <div className="value timeslots-list">
                                    {formData.selectedTimeslots && formData.selectedTimeslots.length > 0 ? (
                                        formData.selectedTimeslots.map((timeslot, index) => (
                                            <div key={timeslot.id || index} className="timeslot-review-item">
                                                <Icon icon="mingcute:calendar-fill" />
                                                <span>{timeslot.displayText}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <span className="no-timeslots">No timeslots selected</span>
                                    )}
                                </div>
                            </div>
                            <div className="review-item">
                                <span className="label">Location:</span>
                                <span className="value">{formData.location}</span>
                            </div>
                            {formData.selectedTimeslots && formData.selectedTimeslots.length > 0 && (
                                <div className="review-item">
                                    <span className="label">Total Options:</span>
                                    <span className="value">{formData.selectedTimeslots.length} possible meeting time{formData.selectedTimeslots.length !== 1 ? 's' : ''}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Invited Users */}
                    {formData.invitedUsers && formData.invitedUsers.length > 0 && (
                        <div className="review-section">
                            <div className="section-header">
                                <Icon icon="mingcute:group-fill" />
                                <h4>Invited Users</h4>
                            </div>
                            <div className="review-items">
                                <div className="review-item">
                                    <span className="label">Invited Friends:</span>
                                    <div className="value invited-users">
                                        {formData.invitedUsers.map((user) => (
                                            <div key={user._id} className="invited-user">
                                                <div className="user-avatar">
                                                    {user.picture ? (
                                                        <img 
                                                            src={user.picture} 
                                                            alt={user.name}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none';
                                                                e.target.nextSibling.style.display = 'flex';
                                                            }}
                                                        />
                                                    ) : null}
                                                    <div className="avatar-fallback" style={{ display: user.picture ? 'none' : 'flex' }}>
                                                        {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                                                    </div>
                                                </div>
                                                <span>{user.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Review;
