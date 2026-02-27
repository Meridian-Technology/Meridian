import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import FlowComponentV2 from '../../components/FlowComponentV2/FlowComponentV2';
import { useNotification } from '../../NotificationContext';
import useAuth from '../../hooks/useAuth';
import postRequest from '../../utils/postRequest';
import Popup from '../../components/Popup/Popup';
import RegistrationPrompt from '../../components/RegistrationPrompt/RegistrationPrompt';
import BasicInfo from '../CreateOrg/Steps/BasicInfo/BasicInfo';
import ProfileImage from '../CreateOrg/Steps/ProfileImage/ProfileImage';
import BannerImage from '../CreateOrg/Steps/BannerImage/BannerImage';
import SocialLinks from '../CreateOrg/Steps/SocialLinks/SocialLinks';
import Membership from '../CreateOrg/Steps/Membership/Membership';
import '../CreateOrg/CreateOrg.scss';

const PENDING_STORAGE_KEY = 'signUpCreateClub_pendingFormData';

function getSerializableFormData(formData) {
    return {
        name: formData.name,
        description: formData.description,
        socialLinks: formData.socialLinks || [],
        requireApprovalForJoin: formData.requireApprovalForJoin || false,
        memberForm: formData.memberForm || null,
    };
}

function buildSubmitFormData(formData) {
    const submitData = new FormData();
    submitData.append('org_name', formData.name || '');
    submitData.append('org_description', formData.description || '');
    if (formData.socialLinks && formData.socialLinks.length > 0) {
        const processedLinks = formData.socialLinks.map((link) => {
            if (link.type === 'website' && link.url) {
                const url = link.url.trim();
                const hasProtocol = /^https?:\/\//i.test(url);
                return { ...link, url: hasProtocol ? url : `https://${url}` };
            }
            return link;
        });
        submitData.append('socialLinks', JSON.stringify(processedLinks));
    }
    if (formData.profileImage) submitData.append('image', formData.profileImage);
    if (formData.bannerImage) submitData.append('bannerImage', formData.bannerImage);
    submitData.append('requireApprovalForJoin', formData.requireApprovalForJoin ? 'true' : 'false');
    if (formData.memberForm) {
        const formWithoutNewIds = {
            ...formData.memberForm,
            questions: (formData.memberForm.questions || []).map((q) => {
                const { _id, ...rest } = q;
                if (_id && _id.startsWith('NEW_QUESTION_')) return rest;
                return q;
            }),
        };
        submitData.append('memberForm', JSON.stringify(formWithoutNewIds));
    }
    return submitData;
}

const SignUpCreateClub = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isAuthenticating, validateToken } = useAuth();
    const { addNotification } = useNotification();

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        profileImage: null,
        bannerImage: null,
        socialLinks: [],
        requireApprovalForJoin: false,
        memberForm: null,
    });
    const [showSignUpPrompt, setShowSignUpPrompt] = useState(false);
    const [pendingFormData, setPendingFormData] = useState(null);
    const [creatingAfterSignUp, setCreatingAfterSignUp] = useState(false);
    const restoredRef = useRef(false);

    const steps = [
        { id: 0, title: 'Basic Information', description: 'Set up the basics for your organization', component: BasicInfo },
        { id: 1, title: 'Profile Picture', description: "Upload your organization's profile picture", component: ProfileImage },
        { id: 2, title: 'Banner Image', description: 'Add a banner image for your organization', component: BannerImage },
        { id: 3, title: 'Social Links', description: 'Connect your social media profiles', component: SocialLinks },
        { id: 4, title: 'Membership', description: 'Configure how members join your organization', component: Membership },
    ];

    const validateOrgStep = (stepIndex, data) => {
        switch (stepIndex) {
            case 0:
                return !!(data.name && data.description);
            case 1:
            case 2:
            case 3:
            case 4:
                return false;
            default:
                return false;
        }
    };

    const doCreateOrg = async (data) => {
        const submitData = buildSubmitFormData(data);
        const response = await postRequest('/create-org', submitData);
        if (response.error) {
            const err = new Error(response.error);
            err.code = response.code;
            throw err;
        }
        if (response.success && response.org) {
            await validateToken();
            addNotification({
                title: 'Organization Created',
                message: `Congratulations! ${data.name} is now a Study Compass organization!`,
                type: 'success',
            });
            sessionStorage.removeItem(PENDING_STORAGE_KEY);
            navigate(`/club-dashboard/${response.org.org_name}`);
        } else {
            throw new Error(response.message || 'Failed to create organization');
        }
    };

    const handleSubmit = async (data) => {
        if (user) {
            await doCreateOrg(data);
            return;
        }
        setPendingFormData(data);
        sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(getSerializableFormData(data)));
        setShowSignUpPrompt(true);
    };

    // Restore from sessionStorage after email sign-up redirect
    useEffect(() => {
        if (isAuthenticating || restoredRef.current) return;
        if (!user) return;
        const stored = sessionStorage.getItem(PENDING_STORAGE_KEY);
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored);
            restoredRef.current = true;
            setCreatingAfterSignUp(true);
            doCreateOrg(parsed)
                .catch((err) => {
                    addNotification({
                        title: 'Create Organization Error',
                        message: err.message || 'Something went wrong. Please try again.',
                        type: 'error',
                    });
                })
                .finally(() => setCreatingAfterSignUp(false));
        } catch (e) {
            sessionStorage.removeItem(PENDING_STORAGE_KEY);
        }
    }, [user, isAuthenticating]);

    const handleError = (error) => {
        addNotification({
            title: 'Create Organization Error',
            message: error.message || error.error || 'Something went wrong. Please try again.',
            type: 'error',
        });
    };

    const handleSignUpSuccess = () => {
        if (!pendingFormData) return;
        setShowSignUpPrompt(false);
        setCreatingAfterSignUp(true);
        doCreateOrg(pendingFormData)
            .catch((err) => handleError(err))
            .finally(() => {
                setCreatingAfterSignUp(false);
                setPendingFormData(null);
            });
    };

    const handleSignUpEmail = () => {
        setShowSignUpPrompt(false);
        const redirect = encodeURIComponent(location.pathname);
        navigate(`/register?redirect=${redirect}`);
    };

    const handleDismissPrompt = () => {
        setShowSignUpPrompt(false);
        setPendingFormData(null);
        sessionStorage.removeItem(PENDING_STORAGE_KEY);
    };

    if (creatingAfterSignUp) {
        return (
            <div className="create-org-loading">
                <div>Creating your club...</div>
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
                headerTitle="Create your club"
                headerSubtitle="Sign up for an account and create your club in a few steps. Perfect for club leaders."
                submitButtonText="Sign up & create club"
                submittingButtonText="Creating..."
                className="create-org-flow"
                validationFunction={validateOrgStep}
            />
            {showSignUpPrompt && (
                <Popup
                    isOpen
                    onClose={handleDismissPrompt}
                    customClassName="registration-prompt-modal"
                >
                    <RegistrationPrompt
                        title="Create your account to create your club"
                        subtitle="Sign up with Google, Apple, or email. We'll create your club right after."
                        dismissButtonText="Cancel"
                        onSignUp={handleSignUpEmail}
                        onSignUpSuccess={handleSignUpSuccess}
                        onDismiss={handleDismissPrompt}
                    />
                </Popup>
            )}
        </>
    );
};

export default SignUpCreateClub;
