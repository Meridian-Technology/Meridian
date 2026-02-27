import React, { useState } from 'react';
import Popup from '../../../../../components/Popup/Popup';
import FormBuilder from '../../../../../components/FormBuilder/FormBuilder';
import FormConfigMenu from '../../../../../components/FormBuilder/FormConfigMenu';
import apiRequest from '../../../../../utils/postRequest';
import { useNotification } from '../../../../../NotificationContext';
import './CreateRegistrationFormModal.scss';

export default function CreateRegistrationFormModal({ orgId, onCreated, onClose, formId, initialForm, existingResponseCount = 0 }) {
    const { addNotification } = useNotification();
    const [, setSaving] = useState(false);
    const isEdit = Boolean(formId && initialForm);

    const handleSave = async (form) => {
        if (!orgId) return;
        setSaving(true);
        try {
            if (isEdit) {
                const res = await apiRequest(
                    `/org-event-management/${orgId}/forms/${formId}`,
                    { form },
                    { method: 'PUT' }
                );
                if (res?.success && res?.data) {
                    addNotification({ title: 'Form updated', message: 'Registration form saved.', type: 'success' });
                    onCreated(formId);
                    onClose();
                } else {
                    addNotification({
                        title: 'Failed to update form',
                        message: res?.message || res?.error || 'Unknown error',
                        type: 'error'
                    });
                }
            } else {
                const res = await apiRequest(`/org-event-management/${orgId}/forms`, { form });
                if (res?.success && res?.data?._id) {
                    addNotification({ title: 'Form created', message: 'You can now attach it to this event.', type: 'success' });
                    onCreated(res.data._id);
                    onClose();
                } else {
                    addNotification({
                        title: 'Failed to create form',
                        message: res?.message || res?.error || 'Unknown error',
                        type: 'error'
                    });
                }
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

    return (
        <Popup isOpen onClose={onClose} customClassName="create-registration-form-modal" defaultStyling={false}>
            <FormBuilder
                initialForm={initialForm || { title: '', description: '', questions: [] }}
                onSave={handleSave}
                handleClose={null}
                menuComponent={<FormConfigMenu />}
                existingResponseCount={existingResponseCount}
            />
        </Popup>
    );
}
