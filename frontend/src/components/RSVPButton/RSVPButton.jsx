import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import postRequest from '../../utils/postRequest';
import { analytics } from '../../services/analytics/analytics';
import Popup from '../Popup/Popup';
import FormViewer from '../FormViewer/FormViewer';
import RegistrationPrompt from '../RegistrationPrompt/RegistrationPrompt';
import { hasAnonymousRegistration, saveAnonymousRegistration } from '../../utils/anonymousRegistrationStorage';
import './RSVPButton.scss';

const RSVPButton = ({ event, onRSVPUpdate, rsvpStatus, onRSVPStatusUpdate, onRegistrationPromptOpen, onRegistrationPromptClose }) => {
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(false);
    const [showFormModal, setShowFormModal] = useState(false);
    const [showRegistrationPrompt, setShowRegistrationPrompt] = useState(false);
    const [registrationForm, setRegistrationForm] = useState(event.registrationForm || null);

    const enabled = event.registrationEnabled ?? event.rsvpEnabled;
    const deadline = event.registrationDeadline ?? event.rsvpDeadline;
    const count = event.registrationCount ?? event.rsvpStats?.going ?? 0;
    const anonymousRegistered = !user && hasAnonymousRegistration(event?._id);
    const isRegistered = Boolean(rsvpStatus) || anonymousRegistered;
    // When showing the post-registration prompt, don't early-return as "registered" so the prompt stays visible
    const isRegisteredForDisplay = isRegistered && !showRegistrationPrompt;
    const hasForm = Boolean(event.registrationFormId);
    const formReady = hasForm && (event.registrationForm || registrationForm);

    // Use event.registrationForm when available (e.g. from get-event), or keep fetched form
    useEffect(() => {
        if (event.registrationForm) setRegistrationForm(event.registrationForm);
    }, [event.registrationForm]);

    const doRegister = async (formAnswers, { guestName, guestEmail } = {}) => {
        setLoading(true);
        try {
            const response = await postRequest(`/rsvp/${event._id}`, {
                guestCount: 1,
                ...(Array.isArray(formAnswers) ? { formAnswers } : {}),
                ...(guestName ? { guestName } : {}),
                ...(guestEmail ? { guestEmail } : {})
            });
            if (response.success) {
                analytics.track('event_registration', { event_id: event._id });
                if (!user) {
                    saveAnonymousRegistration(event._id, {
                        guestName: guestName || '',
                        guestEmail: guestEmail || ''
                    });
                    setShowRegistrationPrompt(true);
                    onRegistrationPromptOpen?.();
                    // Defer parent callbacks until prompt is dismissed so the page doesn't reload before the prompt is shown
                } else {
                    if (onRSVPStatusUpdate) onRSVPStatusUpdate(event._id, {});
                    if (onRSVPUpdate) onRSVPUpdate();
                }
                addNotification({
                    title: 'Registered',
                    message: 'You are registered for this event.',
                    type: 'success'
                });
                setShowFormModal(false);
            } else {
                addNotification({
                    title: 'Registration Failed',
                    message: response.message || response.error || 'Failed to register',
                    type: 'error'
                });
            }
        } catch (err) {
            addNotification({
                title: 'Registration Failed',
                message: err.message || 'Failed to register',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        if (e) e.stopPropagation();
        const form = event.registrationForm || registrationForm;
        const allowAnonymous = form?.allowAnonymous === true;
        if (!user && !allowAnonymous) {
            addNotification({
                title: 'Login Required',
                message: 'Please log in to register for events',
                type: 'error'
            });
            return;
        }
        if (hasForm && formReady) {
            analytics.track('event_registration_form_open', { event_id: event._id });
            setShowFormModal(true);
            return;
        }
        if (hasForm && !formReady) {
            addNotification({
                title: 'Registration',
                message: 'Loading form…',
                type: 'info'
            });
            try {
                const data = await postRequest(`/events/${event._id}/registration-form`, null, { method: 'GET' });
                if (data.success && data.form) {
                    setRegistrationForm(data.form);
                    if (!user && !data.form?.allowAnonymous) {
                        addNotification({
                            title: 'Login Required',
                            message: 'Please log in to register for this event',
                            type: 'error'
                        });
                        return;
                    }
                    analytics.track('event_registration_form_open', { event_id: event._id });
                    setShowFormModal(true);
                } else {
                    addNotification({ title: 'Registration Failed', message: data.message || 'Form unavailable', type: 'error' });
                }
            } catch (err) {
                addNotification({ title: 'Registration Failed', message: err.message || 'Form unavailable', type: 'error' });
            }
            return;
        }
        await doRegister(undefined);
    };

    const handleFormSubmit = (responseOrPayload) => {
        const form = event.registrationForm || registrationForm;
        if (!form || !form.questions) return;
        const isPayload = responseOrPayload && typeof responseOrPayload === 'object' && 'responses' in responseOrPayload;
        const responses = isPayload ? responseOrPayload.responses : responseOrPayload;
        const guestName = isPayload ? responseOrPayload.guestName : undefined;
        const guestEmail = isPayload ? responseOrPayload.guestEmail : undefined;
        const formAnswers = form.questions.map((q) => {
            const r = (responses || []).find((x) => (x.referenceId || x.questionId) === (q._id?.toString() || q._id));
            return r != null ? r.answer : '';
        });
        doRegister(formAnswers, { guestName, guestEmail });
    };

    if (!enabled) return null;

    const isDeadlinePassed = deadline && new Date() > new Date(deadline);
    const isAtCapacity = event.maxAttendees && count >= event.maxAttendees;

    if (isDeadlinePassed) {
        return (
            <div className="rsvp-button deadline-passed">
                <Icon icon="mdi:clock-alert" />
                <span>Registration Closed</span>
            </div>
        );
    }

    if (isAtCapacity && !isRegisteredForDisplay) {
        return (
            <div className="rsvp-button capacity-reached">
                <Icon icon="mdi:account-multiple-remove" />
                <span>Full</span>
            </div>
        );
    }

    if (isRegisteredForDisplay) {
        return (
            <div className="rsvp-button-container">
                <button className="rsvp-btn going active" disabled>
                    <Icon icon="mdi:check" />
                    <span className="button-text">Registered</span>
                </button>
            </div>
        );
    }

    const form = event.registrationForm || registrationForm;

    return (
        <>
            <div className="rsvp-button-container">
                <button
                    className={`rsvp-btn going${isRegistered ? ' active' : ''}`}
                    onClick={handleRegister}
                    disabled={loading || isAtCapacity || isRegistered}
                    title={isRegistered ? 'Registered' : 'Register'}
                >
                    <Icon icon="mdi:check" />
                    <span className="button-text">
                        {isRegistered ? 'Registered' : (count > 0 ? <><b>{count}</b> Registered — Register</> : 'Register')}
                    </span>
                </button>
            </div>
            {showFormModal && form && (
                <Popup isOpen onClose={() => setShowFormModal(false)} customClassName="rsvp-registration-form-modal">
                    <div className="rsvp-registration-form-modal-inner">
                        <div className="rsvp-registration-form-modal-body">
                            <FormViewer
                                form={form}
                                onSubmit={handleFormSubmit}
                                handleClose={null}
                                formConfig={{
                                    allowAnonymous: form.allowAnonymous === true,
                                    collectGuestDetails: form.collectGuestDetails !== false
                                }}
                                hasSubmitted={false}
                            />
                        </div>
                    </div>
                </Popup>
            )}
            {showRegistrationPrompt && (
                <Popup
                    isOpen
                    onClose={() => {
                        setShowRegistrationPrompt(false);
                        onRegistrationPromptClose?.();
                    }}
                    customClassName="registration-prompt-modal"
                >
                    <RegistrationPrompt
                        eventName={event?.name}
                        onSignUp={() => {
                            setShowRegistrationPrompt(false);
                            const redirect = encodeURIComponent(location.pathname);
                            navigate(`/register?redirect=${redirect}`);
                            onRegistrationPromptClose?.();
                        }}
                        onSignUpSuccess={() => {
                            setShowRegistrationPrompt(false);
                            onRegistrationPromptClose?.();
                        }}
                        onDismiss={() => {
                            setShowRegistrationPrompt(false);
                            onRegistrationPromptClose?.();
                        }}
                    />
                </Popup>
            )}
        </>
    );
};

export default RSVPButton;
