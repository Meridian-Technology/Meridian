import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import './General.scss';
import GradientHeader from '../../../assets/Gradients/ApprovalGrad.png';
import SiteHealth from './SiteHealth/SiteHealth';
import Analytics from '../../../components/Analytics/Analytics';
import { useNotification } from '../../../NotificationContext';
import postRequest from '../../../utils/postRequest';

function General() {
    const { addNotification } = useNotification();
    const [migrating, setMigrating] = useState(false);

    const runOrgUnlistedMigration = async () => {
        setMigrating(true);
        try {
            const res = await postRequest('/migrate/org-add-unlisted-field', {});
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