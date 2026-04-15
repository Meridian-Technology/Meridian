import React, { useState } from 'react';
import axios from 'axios';
import { useFetch } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import { useGradient } from '../../../../hooks/useGradient';
import './LifecycleSettings.scss';

export default function LifecycleSettings({ org, expandedClass }) {
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();
    const orgId = org?._id;
    const { data: configRes } = useFetch('/org-management/config');
    const atlasPolicy = configRes?.data?.atlasPolicy;
    const statuses = atlasPolicy?.lifecycle?.statuses || [
        { key: 'active', label: 'Active' },
        { key: 'sunset', label: 'Sunset' },
        { key: 'inactive', label: 'Inactive' }
    ];
    const [nextStatus, setNextStatus] = useState(org?.lifecycleStatus || 'active');
    const [saving, setSaving] = useState(false);

    if (!orgId) return null;

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await axios.patch(
                `/org-roles/${orgId}/lifecycle`,
                { lifecycleStatus: nextStatus },
                { withCredentials: true }
            );
            addNotification({ title: 'Saved', message: 'Lifecycle status updated.', type: 'success' });
            window.location.reload();
        } catch (err) {
            addNotification({
                title: 'Error',
                message: err.response?.data?.message || err.message,
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={`dash settings-section ${expandedClass || ''}`}>
            <header className="header">
                <h1>Organization lifecycle</h1>
                <p>
                    Operational status for your organization (separate from verification). Allowed transitions follow
                    campus policy.
                </p>
                <img src={AtlasMain} alt="" />
            </header>
            <div className="settings-content">
                <div className="lifecycle-settings">
                    <p className="lifecycle-settings__current">
                        Current: <strong>{org?.lifecycleStatus || 'active'}</strong>
                    </p>
                    <form onSubmit={submit} className="lifecycle-settings__form">
                        <label>
                            New status
                            <select value={nextStatus} onChange={(ev) => setNextStatus(ev.target.value)}>
                                {statuses.map((s) => (
                                    <option key={s.key} value={s.key}>
                                        {s.label || s.key}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button type="submit" disabled={saving}>
                            {saving ? 'Saving…' : 'Update status'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
