import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import Popup from '../../../../../../components/Popup/Popup';
import SettingsList from '../../../../../../components/SettingsList/SettingsList';
import CreateRegistrationFormModal from '../CreateRegistrationFormModal';
import '../EventSettingsModal.scss';

function RegistrationSettingsModal({ isOpen, onClose, event, orgId, orgForms = [], onSaved, refetchForms, color }) {
    const { addNotification } = useNotification();
    const [form, setForm] = useState({
        registrationRequired: false,
        registrationDeadline: null,
        maxAttendees: null,
        registrationFormId: null
    });
    const [saving, setSaving] = useState(false);
    const [showCreateFormModal, setShowCreateFormModal] = useState(false);
    const [editingFormId, setEditingFormId] = useState(null);

    useEffect(() => {
        if (isOpen && event) {
            setForm({
                registrationRequired: event.registrationRequired ?? false,
                registrationDeadline: event.registrationDeadline ? new Date(event.registrationDeadline) : null,
                maxAttendees: event.maxAttendees ?? null,
                registrationFormId: event.registrationFormId ?? null
            });
        }
    }, [isOpen, event?.registrationRequired, event?.registrationDeadline, event?.maxAttendees, event?.registrationFormId]);

    const handleSave = async () => {
        if (!orgId || !event?._id) return;
        setSaving(true);
        try {
            const res = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}`,
                {
                    registrationRequired: form.registrationRequired,
                    registrationDeadline: form.registrationDeadline ? form.registrationDeadline.toISOString() : null,
                    maxAttendees: form.maxAttendees ?? null,
                    registrationFormId: form.registrationFormId || null
                },
                { method: 'PUT' }
            );
            if (res?.success) {
                addNotification({ title: 'Saved', message: 'Registration settings updated', type: 'success' });
                onClose();
                onSaved?.();
            } else {
                addNotification({ title: 'Error', message: res?.message || 'Failed to save settings', type: 'error' });
            }
        } catch (err) {
            addNotification({ title: 'Error', message: err?.message || 'Failed to save settings', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const items = [
        {
            title: 'Require registration',
            subtitle: 'Attendees must register to attend',
            action: (
                <input
                    type="checkbox"
                    checked={form.registrationRequired}
                    onChange={(e) => setForm(s => ({ ...s, registrationRequired: e.target.checked }))}
                />
            )
        },
        {
            title: 'Registration deadline',
            subtitle: 'Last date/time attendees can register',
            action: (
                <input
                    type="datetime-local"
                    value={form.registrationDeadline ? new Date(form.registrationDeadline).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setForm(s => ({ ...s, registrationDeadline: e.target.value ? new Date(e.target.value) : null }))}
                />
            )
        },
        {
            title: 'Max attendees',
            subtitle: 'Leave empty for no limit',
            action: (
                <input
                    type="number"
                    value={form.maxAttendees ?? ''}
                    onChange={(e) => setForm(s => ({ ...s, maxAttendees: e.target.value ? parseInt(e.target.value, 10) : null }))}
                    placeholder="No limit"
                    min="1"
                />
            )
        },
        {
            title: 'Registration form',
            subtitle: 'Optional form attendees fill out when registering',
            action: (
                <div className="registration-form-select-row">
                    <select
                        value={form.registrationFormId || ''}
                        onChange={(e) => setForm(s => ({ ...s, registrationFormId: e.target.value || null }))}
                    >
                        <option value="">None</option>
                        {orgForms.map((f) => (
                            <option key={f._id} value={f._id}>{f.title}</option>
                        ))}
                    </select>
                    <button type="button" className="create-form-btn" onClick={() => { setEditingFormId(null); setShowCreateFormModal(true); }}>
                        <Icon icon="mdi:plus" />
                        Create form
                    </button>
                    {form.registrationFormId && (
                        <button type="button" className="edit-form-btn" onClick={() => { setEditingFormId(form.registrationFormId); setShowCreateFormModal(true); }}>
                            <Icon icon="mdi:pencil" />
                            Edit form
                        </button>
                    )}
                </div>
            )
        }
    ];

    return (
        <>
            <Popup
                isOpen={isOpen}
                onClose={onClose}
                customClassName="event-settings-modal"
                defaultStyling={false}
                hideCloseButton={true}
            >
                <div
                    className="event-settings-modal-content"
                    style={color ? { '--event-settings-color': color } : undefined}
                >
                    <div className="event-settings-header">
                        <h3>Registration Settings</h3>
                        <button type="button" className="event-settings-close" onClick={onClose} aria-label="Close">
                            <Icon icon="mdi:close" />
                        </button>
                    </div>
                    <div className="event-settings-body">
                        <SettingsList items={items} />
                    </div>
                    <div className="event-settings-actions">
                        <button type="button" className="event-settings-btn secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="event-settings-btn primary"
                            disabled={saving}
                            onClick={handleSave}
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </Popup>

            {showCreateFormModal && (
                <CreateRegistrationFormModal
                    orgId={orgId}
                    formId={editingFormId || undefined}
                    initialForm={editingFormId ? orgForms.find((f) => f._id === editingFormId) : undefined}
                    onCreated={(newFormId) => {
                        if (newFormId) {
                            setForm(prev => ({ ...prev, registrationFormId: newFormId }));
                        }
                        refetchForms?.();
                        onSaved?.();
                    }}
                    onClose={() => { setShowCreateFormModal(false); setEditingFormId(null); }}
                />
            )}
        </>
    );
}

export default RegistrationSettingsModal;
