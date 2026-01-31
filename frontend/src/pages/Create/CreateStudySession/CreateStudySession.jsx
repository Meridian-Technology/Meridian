import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FlowComponentV2 from '../../../components/FlowComponentV2/FlowComponentV2';
import { useNotification } from '../../../NotificationContext';
import useAuth from '../../../hooks/useAuth';
import postRequest from '../../../utils/postRequest';
import Popup from '../../../components/Popup/Popup';
import { Icon } from '@iconify-icon/react';
import './CreateStudySession.scss';

// Step components
import ModeSelection from './Steps/ModeSelection/ModeSelection';
import BasicInfo from './Steps/BasicInfo/BasicInfo';
import TimeLocation from './Steps/TimeLocation/TimeLocation';
import ScheduleTime from './Steps/ScheduleTime/ScheduleTime';
import Invite from './Steps/Invite/Invite';
import Review from './Steps/Review/Review';

const CreateStudySession = ({ onClose }) => {
    const navigate = useNavigate();
    const { isAuthenticated, user } = useAuth();
    const { addNotification } = useNotification();

    const [formData, setFormData] = useState({
        sessionMode: null, // 'schedule' or 'poll'
        title: '',
        course: '',
        description: '',
        startTime: null,
        endTime: null,
        location: '',
        visibility: 'public',
        selectedTimeslots: [], // For poll mode
        invitedUsers: [],
        inviteStepVisited: false
    });
    
    const [showPollLinkModal, setShowPollLinkModal] = useState(false);
    const [pollLinkData, setPollLinkData] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        console.log(formData);
    }, [formData]);

    // Get steps based on selected mode
    const getSteps = () => {
        if (!formData.sessionMode) {
            // Mode selection step only
            return [
                {
                    id: 0,
                    title: 'Choose Mode',
                    description: 'Select how you want to schedule your study session',
                    component: ModeSelection,
                }
            ];
        }

        if (formData.sessionMode === 'schedule') {
            // Schedule mode: Basic Info -> Schedule Time -> Invite -> Review
            return [
                {
                    id: 0,
                    title: 'Basic Information',
                    description: 'Set up the basics for your study session',
                    component: BasicInfo,
                },
                {
                    id: 1,
                    title: 'Schedule Time',
                    description: 'Choose a specific date and time',
                    component: ScheduleTime,
                },
                {
                    id: 2,
                    title: 'Invite Friends',
                    description: 'Invite people to your study session (optional)',
                    component: Invite,
                },
                {
                    id: 3,
                    title: 'Review',
                    description: 'Review and create your study session',
                    component: Review,
                }
            ];
        } else {
            // Poll mode: Basic Info -> Time Options -> Invite -> Review
            return [
                {
                    id: 0,
                    title: 'Basic Information',
                    description: 'Set up the basics for your study session',
                    component: BasicInfo,
                },
                {
                    id: 1,
                    title: 'Time Options',
                    description: 'Select multiple possible meeting times',
                    component: TimeLocation,
                },
                {
                    id: 2,
                    title: 'Invite Friends',
                    description: 'Invite people to vote on their availability',
                    component: Invite,
                },
                {
                    id: 3,
                    title: 'Review',
                    description: 'Review and create your availability poll',
                    component: Review,
                }
            ];
        }
    };

    const steps = getSteps();

    const handleSubmit = async (formData) => {
        try {
            if (formData.sessionMode === 'schedule') {
                // Schedule mode: Create study session with event immediately
                const submitData = {
                    title: formData.title,
                    course: formData.course,
                    description: formData.description,
                    startTime: new Date(formData.startTime).toISOString(),
                    endTime: new Date(formData.endTime).toISOString(),
                    location: formData.location,
                    visibility: formData.visibility,
                    invitedUsers: formData.invitedUsers ? formData.invitedUsers.map(u => u._id || u) : []
                };

                const response = await postRequest('/study-sessions', submitData);

                if (response.success) {
                    const studySessionId = response.data?.studySession?._id;
                    
                    // Send invites if provided
                    if (formData.invitedUsers && formData.invitedUsers.length > 0 && studySessionId) {
                        try {
                            await postRequest(`/study-sessions/${studySessionId}/invite`, {
                                userIds: formData.invitedUsers.map(u => u._id || u)
                            });
                        } catch (inviteError) {
                            console.error('Error sending invites:', inviteError);
                        }
                    }
                    
                    addNotification({
                        title: 'Study Session Created',
                        message: 'Your study session has been created and scheduled!',
                        type: 'success'
                    });

                    if (onClose) onClose();
                    navigate('/events-dashboard?page=0');
                } else {
                    throw new Error(response.error || response.message || 'Failed to create study session');
                }
            } else {
                // Poll mode: Create study session without event, then create availability poll
                const submitData = {
                    title: formData.title,
                    course: formData.course,
                    description: formData.description,
                    visibility: formData.visibility,
                    mode: 'poll' // Signal to backend this is polling mode
                };

                const response = await postRequest('/study-sessions', submitData);

                if (response.success) {
                    const studySessionId = response.data?.studySession?._id;
                    
                    if (!studySessionId) {
                        throw new Error('Study session ID not returned');
                    }

                    // Create availability poll with time windows
                    if (formData.selectedTimeslots && formData.selectedTimeslots.length > 0) {
                        const timeWindows = formData.selectedTimeslots.map(ts => ({
                            start: new Date(ts.startTime).toISOString(),
                            end: new Date(ts.endTime).toISOString()
                        }));
                        
                        const expiresAt = new Date();
                        expiresAt.setDate(expiresAt.getDate() + 7);
                        
                        const pollData = {
                            timeWindows,
                            invitedFriendIds: formData.invitedUsers ? formData.invitedUsers.map(u => u._id || u) : [],
                            expiresAt: expiresAt.toISOString()
                        };
                        
                        const pollResponse = await postRequest(`/study-sessions/${studySessionId}/create-availability-poll`, pollData);
                        
                        if (pollResponse.success) {
                            const pollId = pollResponse.data?._id || pollResponse.data?.data?._id;
                            const pollLink = pollResponse.pollLink || pollResponse.shareableLink || 
                                           `${window.location.origin}/study-session-callback?id=${pollId}`;
                            
                            // Show poll link modal immediately
                            setPollLinkData({
                                pollLink,
                                pollId,
                                studySessionId,
                                hasInvites: formData.invitedUsers && formData.invitedUsers.length > 0,
                                inviteCount: formData.invitedUsers?.length || 0
                            });
                            setShowPollLinkModal(true);
                            
                            // Send invites if provided (in background)
                            if (pollId && formData.invitedUsers && formData.invitedUsers.length > 0) {
                                postRequest(`/study-sessions/availability-poll/${pollId}/send-invites`, {})
                                    .then((inviteResponse) => {
                                        if (inviteResponse.success) {
                                            addNotification({
                                                title: 'Invites Sent',
                                                message: `Invites sent to ${formData.invitedUsers.length} member(s).`,
                                                type: 'success'
                                            });
                                        }
                                    })
                                    .catch(err => console.error('Error sending invites:', err));
                            }
                            
                            // Store link in formData
                            setFormData(prev => ({
                                ...prev,
                                pollLink: pollLink
                            }));
                        } else {
                            throw new Error('Failed to create availability poll');
                        }
                    }
                    
                    if (onClose) onClose();
                    navigate('/events-dashboard?page=0');
                } else {
                    throw new Error(response.error || response.message || 'Failed to create study session');
                }
            }
        } catch (error) {
            console.error('Error creating study session:', error);
            throw error;
        }
    };

    const handleError = (error) => {
        addNotification({
            title: 'Create Study Session Error',
            message: error.error || error.message || 'Something went wrong. Please try again.',
            type: 'error'
        });
    };

    // Custom validation function for study session steps
    const validateStudySessionStep = (stepIndex, formData) => {
        // Mode selection step
        if (!formData.sessionMode) {
            return stepIndex === 0 ? !!formData.sessionMode : false;
        }

        if (formData.sessionMode === 'schedule') {
            switch(stepIndex) {
                case 0: // Basic Info
                    return !!(formData.title && formData.course && formData.visibility);
                case 1: // Schedule Time
                    return !!(formData.startTime && formData.endTime && formData.location &&
                             new Date(formData.startTime) < new Date(formData.endTime) &&
                             new Date(formData.startTime) > new Date());
                case 2: // Invite (optional but requires visit)
                    return formData.inviteStepVisited;
                case 3: // Review
                    return !!(formData.title && formData.course && formData.startTime && 
                             formData.endTime && formData.location && formData.visibility);
                default:
                    return false;
            }
        } else {
            // Poll mode
            switch(stepIndex) {
                case 0: // Basic Info
                    return !!(formData.title && formData.course && formData.visibility);
                case 1: // Time Options
                    return !!(formData.selectedTimeslots && formData.selectedTimeslots.length > 0 && formData.location);
                case 2: // Invite (optional but requires visit)
                    return formData.inviteStepVisited;
                case 3: // Review
                    return !!(formData.title && formData.course && formData.selectedTimeslots && 
                             formData.selectedTimeslots.length > 0 && formData.location && formData.visibility);
                default:
                    return false;
            }
        }
    };

    // Check if user is authenticated
    if (!isAuthenticated) {
        return (
            <div className="create-study-session-auth-required">
                <h2>Authentication Required</h2>
                <p>You need to be logged in to create a study session.</p>
                <button onClick={() => navigate('/login')}>Login</button>
            </div>
        );
    }

    return (
        <>
            <FlowComponentV2
                steps={steps}
                formData={formData}
                setFormData={setFormData}
                onSubmit={handleSubmit}
                onError={handleError}
                headerTitle="Create Study Session"
                headerSubtitle={formData.sessionMode === 'poll' 
                    ? "Poll for availability and finalize later" 
                    : "Organize a study group in just a few steps!"}
                submitButtonText={formData.sessionMode === 'poll' ? 'Create Poll' : 'Create Study Session'}
                submittingButtonText={formData.sessionMode === 'poll' ? 'Creating Poll...' : 'Creating...'}
                className="create-study-session-flow"
                validationFunction={validateStudySessionStep}
            />
            
            {/* Poll Link Modal */}
            <Popup 
                isOpen={showPollLinkModal} 
                onClose={() => {
                    // Only close via Done button - this handler won't be called due to disableOutsideClick
                }}
                customClassName="poll-link-modal"
                disableOutsideClick={true}
            >
                <div 
                    className="poll-link-modal-content" 
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="modal-header">
                        <h2>Poll Link Ready!</h2>
                        <p>Your availability poll has been created. Share this link with participants.</p>
                    </div>
                    
                    {pollLinkData && (
                        <>
                            <div className="link-section">
                                <label>Poll Link:</label>
                                <div className="link-input-group">
                                    <input 
                                        type="text" 
                                        value={pollLinkData.pollLink} 
                                        readOnly 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.target.select();
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    />
                                    <button 
                                        className="copy-button"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            try {
                                                await navigator.clipboard.writeText(pollLinkData.pollLink);
                                                setCopied(true);
                                                addNotification({
                                                    title: 'Link Copied!',
                                                    message: 'Poll link copied to clipboard',
                                                    type: 'success'
                                                });
                                                setTimeout(() => setCopied(false), 2000);
                                            } catch (error) {
                                                console.error('Failed to copy:', error);
                                            }
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <Icon icon={copied ? "mdi:check" : "mdi:content-copy"} />
                                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                                    </button>
                                </div>
                            </div>
                            
                            <div className="modal-actions">
                                <button 
                                    className="view-responses-button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setShowPollLinkModal(false);
                                        navigate(`/study-session/${pollLinkData.studySessionId}/responses`);
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <Icon icon="mdi:chart-box" />
                                    <span>View Responses</span>
                                </button>
                                <button 
                                    className="close-button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setShowPollLinkModal(false);
                                        if (onClose) onClose();
                                        navigate('/events-dashboard?page=0');
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <span>Done</span>
                                </button>
                            </div>
                            
                            {pollLinkData.hasInvites && (
                                <div className="invite-info">
                                    <Icon icon="mdi:information" />
                                    <span>Invites are being sent to {pollLinkData.inviteCount} participant(s).</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </Popup>
        </>
    );
};

export default CreateStudySession;
