import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import Popup from '../../../../../../components/Popup/Popup';
import SettingsList from '../../../../../../components/SettingsList/SettingsList';
import '../EventSettingsModal.scss';

function CheckInSettingsModal({ isOpen, onClose, event, orgId, onSaved, color }) {
    const { addNotification } = useNotification();
    const [form, setForm] = useState({
        method: 'both',
        allowOnPageCheckIn: true,
        requireRegistration: false,
        autoCheckIn: false
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen && event?.checkInSettings) {
            setForm({
                method: event.checkInSettings?.method || 'both',
                allowOnPageCheckIn: event.checkInSettings?.allowOnPageCheckIn !== false,
                requireRegistration: event.checkInSettings?.requireRegistration ?? false,
                autoCheckIn: event.checkInSettings?.autoCheckIn || false
            });
        }
    }, [isOpen, event?.checkInSettings?.method, event?.checkInSettings?.allowOnPageCheckIn, event?.checkInSettings?.requireRegistration, event?.checkInSettings?.autoCheckIn]);

    const handleSave = async () => {
        if (!orgId || !event?._id) return;
        setSaving(true);
        try {
            const res = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}`,
                {
                    checkInSettings: {
                        method: form.method,
                        allowOnPageCheckIn: form.allowOnPageCheckIn,
                        requireRegistration: form.requireRegistration,
                        autoCheckIn: form.autoCheckIn
                    }
                },
                { method: 'PUT' }
            );
            if (res?.success) {
                addNotification({ title: 'Saved', message: 'Check-in settings updated', type: 'success' });
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
            title: 'Ways to check in',
            subtitle: 'QR code only, link only, or both',
            action: (
                <div className="radio-group">
                    <label className="radio-label">
                        <input type="radio" name="checkInMethod" value="qr" checked={form.method === 'qr'} onChange={(e) => setForm(s => ({ ...s, method: e.target.value }))} />
                        <span>QR only</span>
                    </label>
                    <label className="radio-label">
                        <input type="radio" name="checkInMethod" value="link" checked={form.method === 'link'} onChange={(e) => setForm(s => ({ ...s, method: e.target.value }))} />
                        <span>Link only</span>
                    </label>
                    <label className="radio-label">
                        <input type="radio" name="checkInMethod" value="both" checked={form.method === 'both'} onChange={(e) => setForm(s => ({ ...s, method: e.target.value }))} />
                        <span>Both</span>
                    </label>
                </div>
            )
        },
        {
            title: 'Allow check-in from event page',
            subtitle: 'Show a "Check in" button on the event page during the event',
            action: (
                <input
                    type="checkbox"
                    checked={form.allowOnPageCheckIn}
                    onChange={(e) => setForm(s => ({ ...s, allowOnPageCheckIn: e.target.checked }))}
                />
            )
        },
        {
            title: 'Require registration to check in',
            subtitle: 'Attendees must register before they can check in',
            action: (
                <input
                    type="checkbox"
                    checked={form.requireRegistration}
                    onChange={(e) => setForm(s => ({ ...s, requireRegistration: e.target.checked }))}
                />
            )
        },
        {
            title: 'Auto check-in when using link or QR',
            subtitle: 'Skip confirmation and check in immediately',
            action: (
                <input
                    type="checkbox"
                    checked={form.autoCheckIn}
                    onChange={(e) => setForm(s => ({ ...s, autoCheckIn: e.target.checked }))}
                />
            )
        }
    ];

    return (
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
                    <h3>Check-In Settings</h3>
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
    );
}

export default CheckInSettingsModal;
