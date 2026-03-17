import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import apiRequest from '../../../../../utils/postRequest';
import { useNotification } from '../../../../../NotificationContext';
import EventAnnouncementCompose from '../EventDashboard/EventAnnouncementCompose';
import './FeedbackRequestPanel.scss';

function FeedbackRequestPanel({ orgId, eventId, eventName, feedbackFormId, orgName, orgProfileImage, organizerName, organizerPicture, onOpenRegistrationSettings }) {
    const { addNotification } = useNotification();
    const [allowAnonymous, setAllowAnonymous] = useState(false);
    const [showEmailCompose, setShowEmailCompose] = useState(false);

    const formUrl = feedbackFormId && eventId
        ? `${window.location.origin}/form/${feedbackFormId}?event=${eventId}`
        : '';

    const { data: formData } = useFetch(
        feedbackFormId ? `/get-form-by-id/${feedbackFormId}` : null
    );
    const form = formData?.form;

    useEffect(() => {
        if (form?.allowAnonymous !== undefined) {
            setAllowAnonymous(form.allowAnonymous === true);
        }
    }, [form?.allowAnonymous]);

    const handleToggleAnonymous = async (checked) => {
        if (!orgId || !feedbackFormId || !form) return;
        setAllowAnonymous(checked);
        try {
            const updatedForm = { ...form, allowAnonymous: checked };
            await apiRequest(
                `/org-event-management/${orgId}/forms/${feedbackFormId}`,
                { form: updatedForm },
                { method: 'PUT' }
            );
        } catch (err) {
            addNotification({
                title: 'Failed to update form',
                message: err?.message || 'Could not update anonymous setting',
                type: 'error'
            });
            setAllowAnonymous(!checked);
        }
    };

    const handleCopyLink = () => {
        if (!formUrl) return;
        navigator.clipboard.writeText(formUrl).then(() => {
            addNotification({ title: 'Link copied', message: 'Feedback form link copied to clipboard.', type: 'success' });
        }).catch(() => {
            addNotification({ title: 'Copy failed', message: 'Could not copy to clipboard.', type: 'error' });
        });
    };

    const feedbackEmailSubject = `Share your feedback: ${eventName || 'Event'}`;
    const feedbackEmailBody = `Thank you for attending! We'd love to hear about your experience.\n\nPlease take a moment to share your feedback:\n${formUrl}`;

    return (
        <div className="feedback-request-panel">
            <div className="feedback-request-panel__section">
                <h4>Send feedback request</h4>
                <p className="feedback-request-panel__hint">Email attendees with a link to the feedback form.</p>
                <button
                    type="button"
                    className="feedback-request-panel__btn feedback-request-panel__btn-primary"
                    onClick={() => setShowEmailCompose(true)}
                >
                    <Icon icon="mdi:email-send-outline" />
                    Send email to attendees
                </button>
            </div>

            <div className="feedback-request-panel__section">
                <h4>Or share the link</h4>
                <div className="feedback-request-panel__link-row">
                    <span className="feedback-request-panel__link-text">
                        <a href={formUrl} target="_blank" rel="noopener noreferrer" className="feedback-request-panel__link">
                            Feedback form link
                        </a>
                    </span>
                    <button
                        type="button"
                        className="feedback-request-panel__btn feedback-request-panel__btn-secondary"
                        onClick={handleCopyLink}
                    >
                        <Icon icon="mdi:content-copy" />
                        Copy link
                    </button>
                </div>
                <label className="feedback-request-panel__toggle">
                    <input
                        type="checkbox"
                        checked={allowAnonymous}
                        onChange={(e) => handleToggleAnonymous(e.target.checked)}
                    />
                    <span>Allow anonymous responses</span>
                </label>
            </div>

            {showEmailCompose && (
                <EventAnnouncementCompose
                    isOpen={showEmailCompose}
                    onClose={() => setShowEmailCompose(false)}
                    orgId={orgId}
                    eventId={eventId}
                    eventName={eventName}
                    orgName={orgName}
                    orgProfileImage={orgProfileImage}
                    organizerName={organizerName}
                    organizerPicture={organizerPicture}
                    onSent={() => setShowEmailCompose(false)}
                    onOpenRegistrationSettings={onOpenRegistrationSettings}
                    initialSubject={feedbackEmailSubject}
                    initialContent={feedbackEmailBody}
                />
            )}
        </div>
    );
}

export default FeedbackRequestPanel;
