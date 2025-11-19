import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import FlowComponentV2 from '../../components/FlowComponentV2/FlowComponentV2';
import apiRequest from '../../utils/postRequest';
import DynamicStep from '../../components/DynamicStep/DynamicStep';
import { useFetch } from '../../hooks/useFetch';
import './CreateEventV2.scss';
import logo from '../../assets/Brand Image/Globe.svg';

import { useNotification } from '../../NotificationContext';
import useAuth from '../../hooks/useAuth';
import HostSelector from './Components/HostSelector/HostSelector';

import defaultAvatar from '../../assets/defaultAvatar.svg';

// Step components (kept for backward compatibility)
import GenInfo from './Steps/GenInfo/GenInfo';
import RoomSelectorV2 from './Steps/Where/RoomSelectorV2/RoomSelectorV2';
import When from './Steps/When/When';
import Review from './Steps/Review/Review';

const CreateEventV2 = () => {
    // general vars:
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, isAuthenticating, user } = useAuth();
    
    // Create Event Specific:
    const [alias, setAlias] =  useState(null);
    const [selectedHost, setSelectedHost] = useState(null);

    // Initialize selectedHost when user is available
    useEffect(() => {
        if (user && !selectedHost) {
            setSelectedHost({
                id: user._id,
                type: 'User'
            });
        }
    }, [user, selectedHost]);

    // authenticate user from old createEvent
    // UNCOMMENT WHEN MOVING TO LIVE
    // useEffect(()=>{
    //     if(isAuthenticating){
    //         return;
    //     }
    //     if(!isAuthenticated){
    //         navigate('/');
    //     }
    //     if(!user){
    //         return;
    //     }
    //     if(!(user.roles.includes('oie') || user.roles.includes('admin') || user.roles.includes('developer'))){
    //         navigate('/');
    //     }
    //     if(origin && origin !== ""){
    //         const club = user.clubAssociations.find((org)=>org.org_name === origin);
    //         if(club){
    //             setAlias({
    //                 img: club.org_profile_image,
    //                 text: club.org_name,
    //                 id: club._id,
    //                 type: 'club'
    //             });
    //         } else {
    //             navigate('/');
    //         }
    //     } else {
    //         setAlias({
    //             img: user.pfp ? user.pfp : defaultAvatar,
    //             text: user.username,
    //             id: user._id,
    //             type: 'user'
    //         });
    //     }
    // }, [isAuthenticating, isAuthenticated, user]);

    const {addNotification} = useNotification();
    const formConfigData = useFetch('/api/event-system-config/form-config');
    
    // Initialize form data with defaults from config
    const [formData, setFormData] = useState({
            name: '',
            type: '',
            hostingId: user?._id || null,
            hostingType: user ? 'User' : '',
            going: [],
            location: "",
            start_time: null,
            end_time: null,
            description: '',
            image: null,
            classroom_id: null,
            visibility: '',
            expectedAttendance: 0,
            approvalReference: null,
            status: '',
            contact: '',
            isDeleted: false,
            selectedRoomIds: [],
            // RSVP fields
            rsvpEnabled: false,
            rsvpRequired: false,
            rsvpDeadline: null,
            maxAttendees: null
    });

    // Update formData when selectedHost changes
    useEffect(() => {
        if (selectedHost) {
            setFormData(prev => ({
                ...prev,
                hostingId: selectedHost.id,
                hostingType: selectedHost.type
            }));
        }
    }, [selectedHost]);

    // Handle host selection change
    const handleHostChange = (host) => {
        setSelectedHost(host);
    };

    // Default steps as fallback - always available
    const defaultSteps = [
        {
            id: 0,
            title: 'Basic Information',
            description: 'General information about your event',
            component: GenInfo,
        },
        {
            id: 1,
            title: 'Location',
            description: 'Select a room for your event',
            component: RoomSelectorV2,
        },
        {
            id: 2,
            title: 'Date & Time',
            description: 'Choose your preferred time slot',
            component: When,
        },
        {
            id: 3,
            title: 'Review',
            description: 'Double check your Event details',
            component: Review,
        }
    ];

    // Build steps from form configuration
    const steps = useMemo(() => {
        // If config is not available yet, return default steps immediately
        if (!formConfigData.data?.data) {
            return defaultSteps;
        }

        const config = formConfigData.data.data;
        
        // If no steps in config, return default
        if (!config.steps || config.steps.length === 0) {
            return defaultSteps;
        }

        const activeSteps = config.steps
            .filter(step => step.isActive)
            .sort((a, b) => a.order - b.order);

        // If no active steps, return default
        if (activeSteps.length === 0) {
            return defaultSteps;
        }

        return activeSteps.map((step, index) => ({
            id: index,
            title: step.title,
            description: step.description || '',
            component: (props) => (
                <DynamicStep
                    step={step}
                    formConfig={config}
                    {...props}
                />
            ),
            stepId: step.id // Store original step ID for reference
        }));
    }, [formConfigData.data]);

    // Initialize form data with default values from config
    useEffect(() => {
        if (formConfigData.data?.data) {
            const config = formConfigData.data.data;
            const defaultValues = {};
            
            config.fields.forEach(field => {
                if (field.validation?.defaultValue !== undefined && field.validation?.defaultValue !== null) {
                    defaultValues[field.name] = field.validation.defaultValue;
                }
            });

            setFormData(prev => ({
                ...prev,
                ...defaultValues
            }));
        }
    }, [formConfigData.data]);

    const handleSubmit = async (formData) => {
        try {
            // Handle create mode (existing logic)
            const submitData = new FormData();

            // Prepare data - include all fields from form config
            const data = {
                name: formData.name,
                type: formData.type,
                hostingId: selectedHost?.id || formData.hostingId || user?._id,
                hostingType: selectedHost?.type || formData.hostingType || (user ? 'User' : ''),
                going: formData.going || [],
                location: formData.location,
                start_time: formData.start_time,
                end_time: formData.end_time,
                description: formData.description,
                classroom_id: formData.classroom_id || formData.classroomId,
                visibility: formData.visibility,
                expectedAttendance: formData.expectedAttendance,
                contact: formData.contact,
                // RSVP fields
                rsvpEnabled: formData.rsvpEnabled || false,
                rsvpRequired: formData.rsvpRequired || false,
                rsvpDeadline: formData.rsvpDeadline || null,
                maxAttendees: formData.maxAttendees || null,
                // Include orgId if creating as organization
                orgId: selectedHost?.type === 'Org' ? selectedHost.id : null
            };

            // Append all data fields to FormData
            Object.keys(data).forEach(key => {
                if (data[key] !== null && data[key] !== undefined) {
                    if (data[key] instanceof Date) {
                        submitData.append(key, data[key].toISOString());
                    } else if (Array.isArray(data[key])) {
                        submitData.append(key, JSON.stringify(data[key]));
                    } else if (typeof data[key] === 'object') {
                        submitData.append(key, JSON.stringify(data[key]));
                    } else {
                        submitData.append(key, data[key]);
                    }
                }
            });

            // Handle image separately
            if (formData.image) {
                submitData.append('image', formData.image);
            }

            // Use apiRequest with the correct endpoint
            const response = await apiRequest('/create-event', submitData, {
                method: 'POST'
            });
            
            if (response.success) {
                addNotification({
                    title: 'Event Created',
                    message: `Your event has been created successfully, you'll be contacted shortly upon it's approval!`,
                    type: 'success'
                });
                
                navigate(`/events-dashboard`);
            } else {
                throw new Error(response.message || response.error || 'Failed to create event');
            }
        } catch (error) {
            console.error('Error creating event:', error);
            throw error;
        }
    };

    const handleError = (error) => {
        addNotification({
            title: 'Create Event Error',
            message: error.message || 'Something went wrong. Please try again.',
            type: 'error'
        });
    };

    // Function to get missing required fields
    const getMissingFields = useMemo(() => {
        return (formData, formConfig) => {
            const missingFields = [];
            
            // Check special steps first (location and date-time)
            if (formConfig?.steps) {
                formConfig.steps.forEach(step => {
                    if (!step.isActive) return;
                    
                    // Check location step
                    if (step.id === 'location') {
                        if (!formData.selectedRoomIds || (Array.isArray(formData.selectedRoomIds) && formData.selectedRoomIds.length === 0)) {
                            missingFields.push({
                                fieldName: 'selectedRoomIds',
                                label: 'Room Selection',
                                step: step.id,
                                stepTitle: step.title || 'Location'
                            });
                        }
                    }
                    
                    // Check date-time step
                    if (step.id === 'date-time') {
                        if (!formData.start_time) {
                            missingFields.push({
                                fieldName: 'start_time',
                                label: 'Start Time',
                                step: step.id,
                                stepTitle: step.title || 'Date & Time'
                            });
                        }
                        if (!formData.end_time) {
                            missingFields.push({
                                fieldName: 'end_time',
                                label: 'End Time',
                                step: step.id,
                                stepTitle: step.title || 'Date & Time'
                            });
                        }
                    }
                });
            }
            
            // Check regular form fields
            if (formConfig?.fields) {
                formConfig.fields.forEach(field => {
                    if (!field.isActive) return;
                    
                    // Skip fields that belong to special steps (already checked above)
                    if (field.step === 'location' || field.step === 'date-time') return;
                    
                    const isRequired = field.isRequired || field.validation?.required;
                    if (!isRequired) return;
                    
                    const value = formData[field.name];
                    let isMissing = false;
                    
                    // Special handling for different field types
                    if (field.name === 'selectedRoomIds') {
                        isMissing = !value || (Array.isArray(value) && value.length === 0);
                    } else if (field.name === 'start_time' || field.name === 'end_time') {
                        isMissing = !value;
                    } else if (typeof value === 'string') {
                        isMissing = !value.trim();
                    } else if (typeof value === 'number') {
                        isMissing = value === undefined || value === null || value <= 0;
                    } else {
                        isMissing = value === undefined || value === null || value === '';
                    }
                    
                    if (isMissing) {
                        missingFields.push({
                            fieldName: field.name,
                            label: field.label,
                            step: field.step,
                            stepTitle: formConfig.steps?.find(s => s.id === field.step)?.title || 'Unknown Step'
                        });
                    }
                });
            }
            
            return missingFields;
        };
    }, []);

    // Get formConfig for validation
    const formConfig = formConfigData.data?.data;

    // Steps should always be available (defaultSteps), but show loading if config is still loading
    // This ensures FlowComponentV2 never receives empty steps
    if (formConfigData.loading && !formConfigData.data) {
        return (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh',
                flexDirection: 'column',
                gap: '1rem'
            }}>
                <div>Loading form configuration...</div>
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
            headerTitle={"Create Event"}
            headerSubtitle={"Create an event in just a few quick steps!"}
            submitButtonText={"Publish"}
            submittingButtonText={"Creating..."}
            className="create-line-v2"
            formConfig={formConfig}
            getMissingFields={getMissingFields}
            hostSelector={
                user && (
                    <HostSelector 
                        selectedHost={selectedHost}
                        onHostChange={handleHostChange}
                    />
                )
            }
            logo={logo}
        />
    );
};

export default CreateEventV2; 