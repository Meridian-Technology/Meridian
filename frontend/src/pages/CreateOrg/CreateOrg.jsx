import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FlowComponentV2 from '../../components/FlowComponentV2/FlowComponentV2';
import { useNotification } from '../../NotificationContext';
import useAuth from '../../hooks/useAuth';
import postRequest from '../../utils/postRequest';
import './CreateOrg.scss';

// Step components
import BasicInfo from './Steps/BasicInfo/BasicInfo';
import ProfileImage from './Steps/ProfileImage/ProfileImage';
import BannerImage from './Steps/BannerImage/BannerImage';
import SocialLinks from './Steps/SocialLinks/SocialLinks';
import InviteMembers from './Steps/InviteMembers/InviteMembers';

const CreateOrg = () => {
    const navigate = useNavigate();
    const { isAuthenticated, isAuthenticating, user, validateToken } = useAuth();
    const { addNotification } = useNotification();

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        profileImage: null,
        bannerImage: null,
        socialLinks: [],
        invitedMembers: []
    });

    const steps = [
        {
            id: 0,
            title: 'Basic Information',
            description: 'Set up the basics for your organization',
            component: BasicInfo,
        },
        {
            id: 1,
            title: 'Profile Picture',
            description: 'Upload your organization\'s profile picture',
            component: ProfileImage,
        },
        {
            id: 2,
            title: 'Banner Image',
            description: 'Add a banner image for your organization',
            component: BannerImage,
        },
        {
            id: 3,
            title: 'Social Links',
            description: 'Connect your social media profiles',
            component: SocialLinks,
        },
        {
            id: 4,
            title: 'Invite Members',
            description: 'Invite friends to join your organization',
            component: InviteMembers,
        }
    ];

    // Custom validation function for org creation steps
    // Note: Optional steps should return false initially - they'll be marked complete via onComplete callback
    const validateOrgStep = (stepIndex, formData) => {
        switch(stepIndex) {
            case 0: // BasicInfo - required
                return !!(formData.name && formData.description);
            case 1: // ProfileImage - optional, marked complete when visited
            case 2: // BannerImage - optional, marked complete when visited
            case 3: // SocialLinks - optional, marked complete when visited
            case 4: // InviteMembers - optional, marked complete when visited
                return false; // Don't mark as complete until step component calls onComplete
            default:
                return false;
        }
    };

    const handleSubmit = async (formData) => {
        try {
            const submitData = new FormData();
            
            // Append basic fields
            submitData.append('org_name', formData.name);
            submitData.append('org_description', formData.description);
            
            // Append social links if provided
            if (formData.socialLinks && formData.socialLinks.length > 0) {
                // Process website URLs to add https:// if needed
                const processedLinks = formData.socialLinks.map(link => {
                    if (link.type === 'website' && link.url) {
                        const url = link.url.trim();
                        const hasProtocol = /^https?:\/\//i.test(url);
                        return {
                            ...link,
                            url: hasProtocol ? url : `https://${url}`
                        };
                    }
                    return link;
                });
                submitData.append('socialLinks', JSON.stringify(processedLinks));
            }
            
            // Append profile image if provided
            if (formData.profileImage) {
                submitData.append('image', formData.profileImage);
            }
            
            // Append banner image if provided
            if (formData.bannerImage) {
                submitData.append('bannerImage', formData.bannerImage);
            }

            const response = await postRequest('/create-org', submitData);
            
            if (response.error) {
                const errorWithCode = new Error(response.error);
                errorWithCode.code = response.code;
                throw errorWithCode;
            }
            
            if (response.success && response.org) {
                
                await validateToken();
                
                // Handle member invitations if provided
                if (formData.invitedMembers && formData.invitedMembers.length > 0) {
                    // TODO: Send invitations to members
                    // This would require a separate API endpoint to invite members
                    console.log('Members to invite:', formData.invitedMembers);
                }
                
                addNotification({
                    title: 'Organization Created',
                    message: `Congratulations! ${formData.name} is now a Study Compass organization!`,
                    type: 'success'
                });
                
                navigate(`/club-dashboard/${response.org.org_name}`);
            } else {
                throw new Error(response.message || 'Failed to create organization');
            }
        } catch (error) {
            console.error('Error creating organization:', error);
            throw error;
        }
    };

    // Clean up localStorage on unmount or navigation away
    useEffect(() => {
        return () => {
            // Only clean up if user is navigating away (not on successful submit)
            // We'll clean up on successful submit in handleSubmit
            // For now, we'll keep images in storage until org is created or user explicitly cancels
        };
    }, []);

    const handleError = (error) => {
        addNotification({
            title: 'Create Organization Error',
            message: error.message || error.error || 'Something went wrong. Please try again.',
            type: 'error'
        });
    };

    // Check authentication
    useEffect(() => {
        if (isAuthenticating) {
            return;
        }
        if (!isAuthenticated) {
            navigate('/login');
        }
    }, [isAuthenticating, isAuthenticated, navigate]);

    if (isAuthenticating || !user) {
        return (
            <div className="create-org-loading">
                <div>Loading...</div>
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
            headerTitle="Create Organization"
            headerSubtitle="Set up your Study Compass organization in just a few steps!"
            submitButtonText="Create Organization"
            submittingButtonText="Creating..."
            className="create-org-flow"
            validationFunction={validateOrgStep}
        />
    );
};

export default CreateOrg;
