import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FlowComponentV2 from '../../../components/FlowComponentV2/FlowComponentV2';
import { useNotification } from '../../../NotificationContext';
import useAuth from '../../../hooks/useAuth';
import postRequest from '../../../utils/postRequest';

// Step component   s (we'll create these)
import BasicInfo from './Steps/BasicInfo/BasicInfo';
import TimeLocation from './Steps/TimeLocation/TimeLocation';
import Invite from './Steps/Invite/Invite';
import Review from './Steps/Review/Review';

const CreateStudySession = ({ onClose }) => {
    const navigate = useNavigate();
    const { isAuthenticated, user } = useAuth();
    const { addNotification } = useNotification();

    const [formData, setFormData] = useState({
        title: '',
        course: '',
        description: '',
        startTime: null,
        endTime: null,
        location: '',
        visibility: 'public',
        invitedUsers: [],
        inviteStepVisited: false
    });

    const steps = [
        {
            id: 0,
            title: 'Basic Information',
            description: 'Set up the basics for your study session',
            component: BasicInfo,
        },
        {
            id: 1,
            title: 'Time & Location',
            description: 'Choose when and where to meet',
            component: TimeLocation,
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

    const handleSubmit = async (formData) => {
        try {
            // Format the data for the backend
            const submitData = {
                title: formData.title,
                course: formData.course,
                description: formData.description,
                startTime: formData.startTime,
                endTime: formData.endTime,
                location: formData.location,
                visibility: formData.visibility,
                invitedUsers: formData.invitedUsers
            };

            const response = await postRequest('/study-sessions', submitData);

            if (response.success) {
                addNotification({
                    title: 'Study Session Created',
                    message: 'Your study session has been created successfully!',
                    type: 'success'
                });

                // Close popup and navigate back to events dashboard
                if (onClose) {
                    onClose();
                }
                navigate('/events-dashboard?page=0');
            } else {
                throw new Error(response.error || response.message || 'Failed to create study session');
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
        switch(stepIndex) {
            case 0: // Basic Info
                return !!(formData.title && formData.course && formData.visibility);
            case 1: // Time & Location
                return !!(formData.startTime && formData.endTime && formData.location &&
                         new Date(formData.startTime) < new Date(formData.endTime) &&
                         new Date(formData.startTime) > new Date());
            case 2: // Invite (optional but requires visit)
                return formData.inviteStepVisited;
            case 3: // Review (only valid when all required fields are present)
                return !!(formData.title && formData.course && formData.startTime && formData.endTime && formData.location && formData.visibility);
            default:
                return false;
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
            headerSubtitle="Organize a study group in just a few steps!"
            submitButtonText="Create Study Session"
            submittingButtonText="Creating..."
            className="create-study-session-flow"
            validationFunction={validateStudySessionStep}
        />
    );
};

export default CreateStudySession;
