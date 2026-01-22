import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FlowComponentV2 from '../../../components/FlowComponentV2/FlowComponentV2';
import { useNotification } from '../../../NotificationContext';
import useAuth from '../../../hooks/useAuth';
import postRequest from '../../../utils/postRequest';

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
                            
                            // Send invites if provided
                            if (pollId && formData.invitedUsers && formData.invitedUsers.length > 0) {
                                await postRequest(`/study-sessions/availability-poll/${pollId}/send-invites`, {});
                            }
                            
                            addNotification({
                                title: 'Availability Poll Created',
                                message: 'Your study session poll has been created! Invited members can now vote on their preferred times.',
                                type: 'success'
                            });
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
    );
};

export default CreateStudySession;
