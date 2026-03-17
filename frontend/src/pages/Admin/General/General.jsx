import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import './General.scss';
import GradientHeader from '../../../assets/Gradients/ApprovalGrad.png';
import SiteHealth from './SiteHealth/SiteHealth';
import Analytics from '../../../components/Analytics/Analytics';
import { useNotification } from '../../../NotificationContext';
import apiRequest from '../../../utils/postRequest';
import { useFetch } from '../../../hooks/useFetch';

function General() {
    const { addNotification } = useNotification();
    const [migrating, setMigrating] = useState(false);
    const [savingAutoClaim, setSavingAutoClaim] = useState(false);
    const { data: configData, refetch: refetchConfig } = useFetch('/org-management/config');
    const config = configData?.data;
    const autoClaimEnabled = config?.autoClaimEnabled ?? false;

    const handleAutoClaimToggle = async (checked) => {
        setSavingAutoClaim(true);
        try {
            const res = await apiRequest('/org-management/config', { autoClaimEnabled: checked }, { method: 'PUT' });
            if (res?.success) {
                addNotification({ title: 'Saved', message: 'Auto-claim setting updated', type: 'success' });
                refetchConfig();
            } else {
                addNotification({ title: 'Error', message: res?.message || 'Failed to save', type: 'error' });
            }
        } catch (e) {
            addNotification({ title: 'Error', message: e?.message || 'Failed to save', type: 'error' });
        } finally {
            setSavingAutoClaim(false);
        }
    };

    const runOrgUnlistedMigration = async () => {
        setMigrating(true);
        try {
            const res = await apiRequest('/migrate/org-add-unlisted-field', {});
            if (res?.success) {
                addNotification({
                    title: 'Migration complete',
                    message: `Orgs updated: ${res.data?.orgsUpdated ?? 0}`,
                    type: 'success'
                });
            } else {
                addNotification({
                    title: 'Migration failed',
                    message: res?.message || res?.error || 'Unknown error',
                    type: 'error'
                });
            }
        } catch (e) {
            addNotification({
                title: 'Migration failed',
                message: e?.message || 'Request failed',
                type: 'error'
            });
        } finally {
            setMigrating(false);
        }
    };

    return (
        <div className="general">
            <img src={GradientHeader} alt="" className="grad" />
            <div className="simple-header">
                <h1>Administrator</h1>
            </div>
            <div className="general-content">
                <SiteHealth />
                <div className="admin-migration-section" style={{ marginTop: 16 }}>
                    <h3>Auto-claim event registrations</h3>
                    <p className="admin-migration-hint">When enabled, anonymous event registrations are automatically linked to user accounts when they sign up with a matching email. Applies to all events with registration forms.</p>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <input
                            type="checkbox"
                            checked={autoClaimEnabled}
                            disabled={savingAutoClaim}
                            onChange={(e) => handleAutoClaimToggle(e.target.checked)}
                        />
                        <span>Auto-claim registrations when user signs up with matching email</span>
                        {savingAutoClaim && <Icon icon="mdi:loading" className="spin" />}
                    </label>
                </div>
                <div className="admin-migration-section" style={{ marginTop: 16 }}>
                    <h3>Orgs: Add unlisted field</h3>
                    <p className="admin-migration-hint">Adds unlisted: false to orgs missing the field. Safe to run multiple times.</p>
                    <button
                        type="button"
                        className="admin-migration-btn"
                        onClick={runOrgUnlistedMigration}
                        disabled={migrating}
                    >
                        {migrating ? (
                            <>
                                <Icon icon="mdi:loading" className="spin" />
                                Running…
                            </>
                        ) : (
                            <>
                                <Icon icon="mdi:database-export" />
                                Run org unlisted migration
                            </>
                        )}
                    </button>
                </div>
                <div style={{ marginTop: 16 }}>
                    <Analytics />
                </div>
            </div>
        </div>
    );
}

export default General;