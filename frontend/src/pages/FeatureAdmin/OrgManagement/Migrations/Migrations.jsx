import React, { useState } from 'react';
import { useGradient } from '../../../../hooks/useGradient';
import apiRequest from '../../../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../NotificationContext';
import './Migrations.scss';

function Migrations() {
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();
    const [migrating, setMigrating] = useState(false);
    const [lastResult, setLastResult] = useState(null);

    const handleMigrateOrgPositionsIds = async () => {
        if (!window.confirm('Add _id to org role positions that don\'t have it? This enables role rename detection. Run once per tenant.')) {
            return;
        }
        setMigrating(true);
        setLastResult(null);
        try {
            const response = await apiRequest('/org-management/migrate/org-positions-ids', {}, {
                method: 'POST'
            });
            if (response.success) {
                setLastResult(response);
                addNotification({
                    title: 'Migration complete',
                    message: response.message || 'Migration completed successfully',
                    type: 'success'
                });
            } else {
                addNotification({
                    title: 'Migration failed',
                    message: response.message || response.error || 'Migration failed',
                    type: 'error'
                });
            }
        } catch (err) {
            console.error('Migration error:', err);
            addNotification({
                title: 'Migration failed',
                message: err.message || 'Migration failed',
                type: 'error'
            });
        } finally {
            setMigrating(false);
        }
    };

    return (
        <div className="migrations dash">
            <header className="header">
                <h1>Migrations</h1>
                <p>Run database migrations for the current tenant</p>
                <img src={AtlasMain} alt="" />
            </header>

            <div className="content">
                <div className="migration-card">
                    <div className="migration-info">
                        <h3>
                            <Icon icon="mdi:database-sync-outline" />
                            Org Positions: Add _id
                        </h3>
                        <p>
                            Adds <code>_id</code> to role positions that don't have it. Required for role rename detection
                            (so members keep their role when a role name is changed). Run once per tenant.
                        </p>
                    </div>
                    <div className="migration-actions">
                        <button
                            className="migrate-btn"
                            onClick={handleMigrateOrgPositionsIds}
                            disabled={migrating}
                        >
                            {migrating ? (
                                <>
                                    <Icon icon="mdi:loading" className="spin" />
                                    Migrating...
                                </>
                            ) : (
                                <>
                                    <Icon icon="mdi:database-export" />
                                    Run Migration
                                </>
                            )}
                        </button>
                    </div>
                    {lastResult?.data && (
                        <div className="migration-result">
                            Updated {lastResult.data.orgsUpdated} organization(s)
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Migrations;
