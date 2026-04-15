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
    const [classroomBuildingMigrating, setClassroomBuildingMigrating] = useState(false);
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

    const runClassroomBuildingMigration = async () => {
        if (
            !window.confirm(
                'Create Building documents from classroom building names and switch classrooms to ObjectId refs? This is intended to run once per school database. Continue?'
            )
        ) {
            return;
        }
        setClassroomBuildingMigrating(true);
        try {
            const res = await apiRequest('/admin/migrate-classroom-building-refs', {});
            if (res?.success) {
                const d = res.data || {};
                if (d.skipped) {
                    addNotification({
                        title: 'Already completed',
                        message: d.reason === 'already_run' ? 'This migration was already run for this tenant.' : 'Skipped.',
                        type: 'info',
                    });
                } else {
                    addNotification({
                        title: 'Migration complete',
                        message: `Rooms updated: ${d.classroomsUpdated ?? 0}. New buildings: ${d.buildingsCreatedCount ?? 0}.`,
                        type: 'success',
                    });
                }
            } else {
                addNotification({
                    title: 'Migration failed',
                    message: res?.message || res?.error || 'Unknown error',
                    type: 'error',
                });
            }
        } catch (e) {
            addNotification({
                title: 'Migration failed',
                message: e?.message || 'Request failed',
                type: 'error',
            });
        } finally {
            setClassroomBuildingMigrating(false);
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
                    <h3>Classrooms: Building references</h3>
                    <p className="admin-migration-hint">
                        Backfills the buildings collection from each classroom&apos;s legacy string building field,
                        then stores an ObjectId reference on the classroom. Guarded so it normally runs once per tenant;
                        support can re-run by calling the same endpoint with a JSON body of force: true if needed.
                        Upgrading an existing database: run the CLI migration once before restarting servers on this
                        release (see backend/migrations/migrateClassroomBuildingRefs.js header), or run this button
                        immediately after deploy before other traffic hits room APIs.
                    </p>
                    <button
                        type="button"
                        className="admin-migration-btn"
                        onClick={runClassroomBuildingMigration}
                        disabled={classroomBuildingMigrating}
                    >
                        {classroomBuildingMigrating ? (
                            <>
                                <Icon icon="mdi:loading" className="spin" />
                                Running…
                            </>
                        ) : (
                            <>
                                <Icon icon="mdi:office-building" />
                                Run classroom → building migration
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