import React, { useState } from 'react';
import { useFetch } from '../../../../../hooks/useFetch';
import Popup from '../../../../../components/Popup/Popup';
import FormBuilder from '../../../../../components/FormBuilder/FormBuilder';
import FormConfigMenu from '../../../../../components/FormBuilder/FormConfigMenu';
import apiRequest from '../../../../../utils/postRequest';
import { useNotification } from '../../../../../NotificationContext';
import './FeedbackFormConfig.scss';

function getFeedbackStarterTemplate() {
    const ts = Date.now();
    return {
        title: 'Event Feedback',
        description: 'Share your experience with us',
        allowAnonymous: true,
        collectGuestDetails: false,
        questions: [
            {
                _id: `NEW_QUESTION_${ts}_1`,
                type: 'rating_scale',
                question: 'How was your experience?',
                required: true,
                options: ['1', '2', '3', '4', '5']
            },
            {
                _id: `NEW_QUESTION_${ts}_2`,
                type: 'long',
                question: 'What was the best part?',
                required: false
            },
            {
                _id: `NEW_QUESTION_${ts}_3`,
                type: 'long',
                question: 'Any suggestions for improvement?',
                required: false
            }
        ]
    };
}

export default function FeedbackFormConfig({ orgId, eventId, feedbackFormId, initialForm, onSaved, onClose }) {
    const { addNotification } = useNotification();
    const [saving, setSaving] = useState(false);

    const { data: formData } = useFetch(
        feedbackFormId && !initialForm ? `/get-form-by-id/${feedbackFormId}` : null
    );
    const fetchedForm = formData?.form;
    const effectiveInitialForm = initialForm || fetchedForm;
    const isEdit = Boolean(feedbackFormId && effectiveInitialForm);

    const handleSave = async (form) => {
        if (!orgId || !eventId) return;
        setSaving(true);
        try {
            let formId = feedbackFormId;
            if (isEdit) {
                const res = await apiRequest(
                    `/org-event-management/${orgId}/forms/${feedbackFormId}`,
                    { form },
                    { method: 'PUT' }
                );
                if (!res?.success) {
                    addNotification({
                        title: 'Failed to update form',
                        message: res?.message || res?.error || 'Unknown error',
                        type: 'error'
                    });
                    return;
                }
            } else {
                const res = await apiRequest(`/org-event-management/${orgId}/forms`, { form });
                if (!res?.success || !res?.data?._id) {
                    addNotification({
                        title: 'Failed to create form',
                        message: res?.message || res?.error || 'Unknown error',
                        type: 'error'
                    });
                    return;
                }
                formId = res.data._id;
            }

            const patchRes = await apiRequest(
                `/org-event-management/${orgId}/events/${eventId}`,
                { feedbackFormId: formId },
                { method: 'PUT' }
            );
            if (patchRes?.success) {
                addNotification({
                    title: 'Feedback form saved',
                    message: isEdit ? 'Form updated and linked to event.' : 'Form created and linked to event.',
                    type: 'success'
                });
                onSaved?.(formId);
                onClose?.();
            } else {
                addNotification({
                    title: 'Failed to link form',
                    message: patchRes?.message || 'Could not update event.',
                    type: 'error'
                });
            }
        } catch (err) {
            addNotification({
                title: isEdit ? 'Failed to update form' : 'Failed to create form',
                message: err?.message || 'Request failed',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const initialFormData = effectiveInitialForm || getFeedbackStarterTemplate();

    return (
        <Popup isOpen onClose={onClose} customClassName="feedback-form-config-modal" defaultStyling={false}>
            <div className="feedback-form-config wide-content">
                <FormBuilder
                    initialForm={initialFormData}
                    onSave={handleSave}
                    handleClose={null}
                    menuComponent={<FormConfigMenu />}
                    existingResponseCount={0}
                />
                {saving && (
                    <div className="feedback-form-config__saving">Saving...</div>
                )}
            </div>
        </Popup>
    );
}
