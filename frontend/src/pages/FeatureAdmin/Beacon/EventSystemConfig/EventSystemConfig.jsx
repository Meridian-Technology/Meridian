import React, { useState, useEffect, useMemo } from 'react';
import './EventSystemConfig.scss';
import { useFetch } from '../../../../hooks/useFetch';
import useUnsavedChanges from '../../../../hooks/useUnsavedChanges';
import UnsavedChangesBanner from '../../../../components/UnsavedChangesBanner/UnsavedChangesBanner';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import SystemSettings from './SystemSettings/SystemSettings';
import DomainManager from './DomainManager/DomainManager';
import TemplateManager from './TemplateManager/TemplateManager';
import IntegrationManager from './IntegrationManager/IntegrationManager';
import AnalyticsConfig from './AnalyticsConfig/AnalyticsConfig';
import ApprovalFlowConfig from './ApprovalFlowConfig/ApprovalFlowConfig';
import FormConfig from './FormConfig/FormConfig';
import EventsCoverConfig from './EventsCoverConfig/EventsCoverConfig';
import EventTypeConfig from './EventTypeConfig/EventTypeConfig';
import { useNotification } from '../../../../NotificationContext';
import { useGradient } from '../../../../hooks/useGradient';
import postRequest from '../../../../utils/postRequest';

const ENGAGEMENT_TAB_IDS = new Set(['system', 'templates', 'event-types', 'form-config', 'cover']);

const TAB_DEFS = [
    { id: 'system', label: 'System Settings', icon: 'mdi:cog' },
    { id: 'domains', label: 'Domains', icon: 'mdi:domain' },
    { id: 'templates', label: 'Templates', icon: 'mdi:file-document-multiple' },
    { id: 'integrations', label: 'Integrations', icon: 'mdi:connection' },
    { id: 'analytics', label: 'Analytics', icon: 'mdi:chart-line' },
    { id: 'approval', label: 'Approval Flow', icon: 'mdi:check-circle' },
    { id: 'event-types', label: 'Event Types', icon: 'mdi:shape-outline' },
    { id: 'form-config', label: 'Form Config', icon: 'mdi:form-select' },
    { id: 'cover', label: 'Page Header', icon: 'mdi:image' },
];

function EventSystemConfig({ mode = 'full' }) {
    const [activeTab, setActiveTab] = useState('system');
    const [config, setConfig] = useState(null);
    const [originalConfig, setOriginalConfig] = useState(null);
    const { addNotification } = useNotification();
    const { AdminGrad } = useGradient();
    const configData = useFetch('/api/event-system-config');

    const visibleTabs = useMemo(
        () => (mode === 'engagement' ? TAB_DEFS.filter((t) => ENGAGEMENT_TAB_IDS.has(t.id)) : TAB_DEFS),
        [mode]
    );

    useEffect(() => {
        if (mode === 'engagement' && !ENGAGEMENT_TAB_IDS.has(activeTab)) {
            setActiveTab('system');
        }
    }, [mode, activeTab]);

    useEffect(() => {
        if (configData.data?.success) {
            const config = configData.data.data;
            setConfig(config);
            setOriginalConfig(JSON.parse(JSON.stringify(config)));
        }
    }, [configData.data]);

    // Use the unsaved changes hook
    const { hasChanges, saving, handleSave: saveChanges, handleDiscard } = useUnsavedChanges(
        originalConfig,
        config,
        async () => {
            if (!config) return false;
            
            try {
                const result = await postRequest('/api/event-system-config', config, { method: 'PUT' });

                if (result.success) {
                    setOriginalConfig(JSON.parse(JSON.stringify(config)));
                    addNotification({
                        title: 'Success',
                        message: 'Configuration saved successfully',
                        type: 'success'
                    });
                    return true;
                } else {
                    throw new Error(result.message || result.error || 'Failed to save configuration');
                }
            } catch (error) {
                console.error('Failed to save configuration:', error);
                addNotification({
                    title: 'Error',
                    message: 'Failed to save configuration: ' + error.message,
                    type: 'error'
                });
                return false;
            }
        },
        () => {
            if (originalConfig) {
                setConfig(JSON.parse(JSON.stringify(originalConfig)));
                addNotification({
                    title: 'Reset',
                    message: 'Configuration reset to last saved state',
                    type: 'info'
                });
            }
        }
    );
    
    const handleConfigChange = (section, updates) => {
        setConfig(prev => ({
            ...prev,
            [section]: { ...prev[section], ...updates }
        }));
    };
    
    if (configData.loading) {
        return (
            <div className="event-system-config loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinning" />
                    <p>Loading configuration...</p>
                </div>
            </div>
        );
    }
    
    if (configData.error) {
        return (
            <div className="event-system-config error">
                <div className="error-message">
                    <Icon icon="mdi:alert-circle" />
                    <h3>Error Loading Configuration</h3>
                    <p>{configData.error.message || 'Failed to load configuration'}</p>
                    <button onClick={() => configData.refetch()}>
                        <Icon icon="mdi:refresh" />
                        Retry
                    </button>
                </div>
            </div>
        );
    }
    
    if (!config) {
        return (
            <div className="event-system-config">
                <div className="no-config">
                    <Icon icon="mdi:cog" />
                    <h3>No Configuration Found</h3>
                    <p>System configuration will be created automatically when you make your first change.</p>
                </div>
            </div>
        );
    }
    
    const headerSubtitle =
        mode === 'engagement'
            ? 'Branding, templates, and registration experience for your institution.'
            : 'Configure global settings for the event management system';

    return (
        <div className="event-system-config dash">
            <header className="header">
                <div className="header-content">
                    <h1>Event System Configuration</h1>
                    <p>{headerSubtitle}</p>
                    <img src={AdminGrad} alt="" />
                </div>
            </header>
            
            <UnsavedChangesBanner
                hasChanges={hasChanges}
                onSave={saveChanges}
                onDiscard={handleDiscard}
                saving={saving}
                saveText="Save Configuration"
                discardText="Reset Changes"
            />
            
            <div className="config-tabs">
                {visibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <Icon icon={tab.icon} />
                        {tab.label}
                    </button>
                ))}
            </div>
            
            <div className="config-content">
                {activeTab === 'system' && (
                    <SystemSettings
                        config={config.systemSettings}
                        onChange={(updates) => handleConfigChange('systemSettings', updates)}
                    />
                )}
                
                {activeTab === 'domains' && (
                    <DomainManager
                        domains={config.domains}
                        onChange={(domains) => handleConfigChange('domains', domains)}
                    />
                )}
                
                {activeTab === 'templates' && (
                    <TemplateManager
                        templates={config.eventTemplates}
                        onChange={(templates) => handleConfigChange('eventTemplates', templates)}
                    />
                )}
                
                {activeTab === 'integrations' && (
                    <IntegrationManager
                        integrations={config.integrations}
                        onChange={(integrations) => handleConfigChange('integrations', integrations)}
                    />
                )}
                
                {activeTab === 'analytics' && (
                    <AnalyticsConfig
                        analytics={config.analytics}
                        onChange={(analytics) => handleConfigChange('analytics', analytics)}
                    />
                )}
                
                {activeTab === 'approval' && (
                    <ApprovalFlowConfig
                        config={config.approvalFlow}
                        onChange={(approvalFlow) => handleConfigChange('approvalFlow', approvalFlow)}
                    />
                )}

                {activeTab === 'event-types' && (
                    <EventTypeConfig
                        config={config}
                        onChange={(updates) => {
                            setConfig((prev) => ({
                                ...prev,
                                formConfig: {
                                    ...prev.formConfig,
                                    ...(updates.formConfig || {}),
                                },
                            }));
                        }}
                    />
                )}
                
                {activeTab === 'form-config' && (
                    <FormConfig
                        config={config}
                        onChange={(updates) => {
                            // Merge formConfig updates into the main config
                            setConfig(prev => ({
                                ...prev,
                                formConfig: updates.formConfig
                            }));
                        }}
                    />
                )}
                
                {activeTab === 'cover' && (
                    <EventsCoverConfig
                        config={config.pageSettings}
                        onChange={(updates) => {
                            setConfig(prev => ({
                                ...prev,
                                pageSettings: {
                                    ...prev.pageSettings,
                                    ...updates
                                }
                            }));
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default EventSystemConfig;
