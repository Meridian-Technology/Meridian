import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import apiRequest from '../../../utils/postRequest';
import './Configurations.scss';

const audienceListParams = { page: 1, limit: 30 };
const defaultConfig = {
    attributes: [],
    dataSource: { primarySource: '', lastSyncAt: null, syncedStudentCount: 0 },
    roles: [],
    delivery: { emailEnabled: true, inAppEnabled: true },
};

function Configurations() {
    const {
        data: audienceData,
        loading: audienceLoading,
        error: audienceError,
        refetch: refetchAudiences
    } = useFetch('/admin/outreach/audiences', { params: audienceListParams });
    const {
        data: configData,
        loading: configLoading,
        error: configError,
        refetch: refetchConfig
    } = useFetch('/admin/outreach/configurations');

    const [deletingId, setDeletingId] = useState(null);
    const [deleteMessage, setDeleteMessage] = useState(null);
    const [draftConfig, setDraftConfig] = useState(defaultConfig);
    const [savingConfig, setSavingConfig] = useState(false);
    const [configMessage, setConfigMessage] = useState(null);

    const audiences = useMemo(() => {
        if (!audienceData?.success || !Array.isArray(audienceData.data)) return [];
        return audienceData.data;
    }, [audienceData]);

    const serverConfig = useMemo(() => {
        if (!configData?.success || !configData.data) return defaultConfig;
        return {
            attributes: Array.isArray(configData.data.attributes) ? configData.data.attributes : [],
            dataSource: {
                primarySource: configData.data.dataSource?.primarySource || '',
                lastSyncAt: configData.data.dataSource?.lastSyncAt || null,
                syncedStudentCount: Number.isFinite(configData.data.dataSource?.syncedStudentCount)
                    ? configData.data.dataSource.syncedStudentCount
                    : 0,
            },
            roles: Array.isArray(configData.data.roles) ? configData.data.roles : [],
            delivery: {
                emailEnabled: !!configData.data.delivery?.emailEnabled,
                inAppEnabled: !!configData.data.delivery?.inAppEnabled,
            },
        };
    }, [configData]);

    useEffect(() => {
        setDraftConfig(serverConfig);
    }, [serverConfig]);

    const hasUnsavedChanges = useMemo(
        () => JSON.stringify(draftConfig) !== JSON.stringify(serverConfig),
        [draftConfig, serverConfig]
    );

    const handleDeleteAudience = useCallback(async (id) => {
        setDeleteMessage(null);
        setDeletingId(id);
        const res = await apiRequest(`/admin/outreach/audiences/${id}`, null, { method: 'DELETE' });
        setDeletingId(null);
        if (res?.error) {
            setDeleteMessage(res.error);
            return;
        }
        if (res?.success === false) {
            setDeleteMessage(res.message || 'Delete failed');
            return;
        }
        setDeleteMessage('Audience removed.');
        refetchAudiences({ silent: true });
    }, [refetchAudiences]);

    const saveConfigurations = useCallback(async () => {
        setSavingConfig(true);
        setConfigMessage(null);
        const res = await apiRequest('/admin/outreach/configurations', draftConfig, { method: 'PUT' });
        setSavingConfig(false);
        if (res?.error) {
            setConfigMessage({ type: 'error', text: res.error });
            return;
        }
        if (!res?.success) {
            setConfigMessage({ type: 'error', text: res?.message || 'Failed to save configuration' });
            return;
        }
        setConfigMessage({ type: 'success', text: 'Configuration saved.' });
        refetchConfig({ silent: true });
    }, [draftConfig, refetchConfig]);

    const discardConfigurations = useCallback(() => {
        setDraftConfig(serverConfig);
        setConfigMessage(null);
    }, [serverConfig]);

    const formatSyncText = useCallback((dataSource) => {
        if (!dataSource?.lastSyncAt) return 'Last sync: Not synced yet';
        const date = new Date(dataSource.lastSyncAt);
        const formatted = date.toLocaleString();
        const count = Number.isFinite(dataSource.syncedStudentCount)
            ? dataSource.syncedStudentCount.toLocaleString()
            : '0';
        return `Last sync: ${formatted} - ${count} students`;
    }, []);

    return (
        <div className='configurations'>
            <header className="configurations-header">
                <h2>Outreach configurations</h2>
                <p className="subtitle">Student attributes, data source, roles, and delivery settings.</p>
            </header>

            <div className="configurations-toolbar">
                <div className="configurations-list">
                    <div className="configurations-card">
                        <div className="configurations-header">
                            <p>Saved audiences</p>
                            <p className="subtext">Segments stored for reuse when composing outreach (from the API).</p>
                        </div>
                        {audienceError && (
                            <p className="configurations-api-message configurations-api-error" role="alert">
                                {audienceError}
                            </p>
                        )}
                        {deleteMessage && (
                            <p
                                className={`configurations-api-message ${
                                    deleteMessage.includes('failed') || deleteMessage.includes('Forbidden')
                                        ? 'configurations-api-error'
                                        : 'configurations-api-success'
                                }`}
                                role="status"
                            >
                                {deleteMessage}
                            </p>
                        )}
                        <div className="configurations-audiences-body">
                            {audienceLoading && <p className="configurations-audiences-muted">Loading audiences...</p>}
                            {!audienceLoading && audiences.length === 0 && (
                                <p className="configurations-audiences-muted">
                                    No saved audiences yet. Create targeting in New Outreach and save as an audience when
                                    that flow is available, or use the API.
                                </p>
                            )}
                            {audiences.map((audience) => (
                                <div key={audience._id} className="configurations-audiences-row">
                                    <div>
                                        <p className="configurations-audiences-name">{audience.name}</p>
                                        {audience.description ? (
                                            <p className="configurations-audiences-desc">{audience.description}</p>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        className="configurations-audiences-delete"
                                        disabled={deletingId === audience._id}
                                        onClick={() => handleDeleteAudience(audience._id)}
                                    >
                                        {deletingId === audience._id ? 'Removing...' : 'Remove'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="configurations-list">
                    <div className="configurations-card">
                        <div className="configurations-header">
                            <p>Student attributes</p>
                            <p className="subtext">Attributes used for targeting. List updates when data source syncs.</p>

                            <div className="configurations-card">
                                <div className="configurations-att configurations-att-four">
                                    <p>Attribute</p>
                                    <p>Label</p>
                                    <p>Source</p>
                                    <p>Editable</p>
                                </div>

                                {draftConfig.attributes.map((attr) => (
                                    <div className="configurations-content configurations-content-four" key={attr.key}>
                                        <div className="configurations-content-body">
                                            <p className="btn">{attr.key}</p>
                                        </div>
                                        <p>{attr.label}</p>
                                        <p>{attr.source}</p>
                                        <p>{attr.editable ? 'Yes' : 'No'}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="configurations-list">
                    <div className="configurations-card">
                        <div className="configurations-header">
                            <p>Data Source</p>
                            <p className="subtext">Where student attributes are pulled from.</p>
                        </div>

                        <div className="configurations-body">
                            <div className="search-wrapper">
                                <p className="subject">Primary source</p>
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Primary student source"
                                    value={draftConfig.dataSource.primarySource}
                                    onChange={(e) => setDraftConfig((prev) => ({
                                        ...prev,
                                        dataSource: { ...prev.dataSource, primarySource: e.target.value }
                                    }))}
                                />
                                <div className="count">
                                    <p>{formatSyncText(draftConfig.dataSource)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="configurations-list">
                    <div className="configurations-card">
                        <div className="configurations-header">
                            <p>Admin role & permissions</p>
                            <p className="subtext">Who can send outreach and who can change these settings.</p>

                            <div className="configurations-card">
                                <div className="configurations-att">
                                    <p>Role</p>
                                    <p>Can send</p>
                                    <p>Can configure</p>
                                </div>

                                {draftConfig.roles.map((role) => (
                                    <div className="configurations-content" key={role.role}>
                                        <div className="configurations-content-body">
                                            <p>{role.role}</p>
                                        </div>
                                        <p>{role.canSend ? 'Yes' : 'No'}</p>
                                        <p>{role.canConfigure ? 'Yes' : 'No'}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="configurations-list">
                    <div className="configurations-card">
                        <div className="configurations-header">
                            <p>Delivery</p>
                            <p className="subtext">How outreach messages are delivered.</p>
                        </div>

                        <div className="configurations-body">
                            <div className="delivery-wrapper">
                                <label className="container">
                                    <input
                                        type="checkbox"
                                        checked={draftConfig.delivery.emailEnabled}
                                        onChange={(e) => setDraftConfig((prev) => ({
                                            ...prev,
                                            delivery: { ...prev.delivery, emailEnabled: e.target.checked }
                                        }))}
                                    />
                                    <span className="checkmark" />
                                    Send via email
                                </label>

                                <label className="container">
                                    <input
                                        type="checkbox"
                                        checked={draftConfig.delivery.inAppEnabled}
                                        onChange={(e) => setDraftConfig((prev) => ({
                                            ...prev,
                                            delivery: { ...prev.delivery, inAppEnabled: e.target.checked }
                                        }))}
                                    />
                                    <span className="checkmark" />
                                    Send in-app notification
                                </label>

                                <div className="count">
                                    <p>Default from address and templates are set in system email config.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="send">
                    {configError && (
                        <p className="configurations-api-message configurations-api-error" role="alert">
                            {configError}
                        </p>
                    )}
                    {configMessage && (
                        <p
                            className={`configurations-api-message ${
                                configMessage.type === 'error'
                                    ? 'configurations-api-error'
                                    : 'configurations-api-success'
                            }`}
                            role="status"
                        >
                            {configMessage.text}
                        </p>
                    )}
                    <button
                        className="btn btn-send"
                        type="button"
                        disabled={savingConfig || configLoading || !hasUnsavedChanges}
                        onClick={saveConfigurations}
                    >
                        {savingConfig ? 'Saving...' : 'Save configuration'}
                    </button>
                    <button
                        className="btn btn-draft"
                        type="button"
                        disabled={savingConfig || configLoading || !hasUnsavedChanges}
                        onClick={discardConfigurations}
                    >
                        Discard changes
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Configurations;