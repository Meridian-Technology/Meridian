import React, { useState, useRef } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import apiRequest from '../../../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import UnsavedChangesBanner from '../../../../components/UnsavedChangesBanner/UnsavedChangesBanner';
import useUnsavedChanges from '../../../../hooks/useUnsavedChanges';
import './Configuration.scss';

function Configuration({ section = 'general' }) {
    const { data: config, loading, error, refetch } = useFetch('/org-management/config');
    const [localConfig, setLocalConfig] = useState(null);
    const [selectedTypeKey, setSelectedTypeKey] = useState(null);
    const [benefitDraft, setBenefitDraft] = useState('');
    const [inputValues, setInputValues] = useState({});
    const originalDataRef = useRef(null);
    const { AtlasMain } = useGradient();

    React.useEffect(() => {
        if (config?.data) {
            setLocalConfig(config.data);
            // Always update original data ref when config changes (including after refetch)
            originalDataRef.current = JSON.parse(JSON.stringify(config.data));
            // Reset input values when config changes
            setInputValues({});
        }
    }, [config]);

    React.useEffect(() => {
        if (!localConfig?.verificationTiers) return;
        const entries = Object.keys(localConfig.verificationTiers);
        if (!entries.length) return;
        if (!selectedTypeKey || !localConfig.verificationTiers[selectedTypeKey]) {
            setSelectedTypeKey(entries[0]);
        }
    }, [localConfig, selectedTypeKey]);

    // Original data for comparison
    const originalData = config?.data ? JSON.parse(JSON.stringify(config.data)) : null;

    const handleSave = async () => {
        if (!localConfig) return false;
        
        try {
            const response = await apiRequest('/org-management/config', localConfig, { method: 'PUT' });
            if (response.success) {
                refetch();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error saving configuration:', error);
            return false;
        }
    };

    const handleDiscard = () => {
        // Reset to original values
        if (originalDataRef.current) {
            setLocalConfig(JSON.parse(JSON.stringify(originalDataRef.current)));
        }
    };

    // Only set up the hook when we have both original data and local config
    const { hasChanges, saving, handleSave: saveChanges, handleDiscard: discardChanges } = useUnsavedChanges(
        originalDataRef.current,
        localConfig,
        handleSave,
        handleDiscard
    );

    // Debug logging
    console.log('Configuration Debug:', {
        hasOriginalData: !!originalDataRef.current,
        hasLocalConfig: !!localConfig,
        hasChanges,
        originalDataKeys: originalDataRef.current ? Object.keys(originalDataRef.current) : null,
        localConfigKeys: localConfig ? Object.keys(localConfig) : null
    });

    // Render different sections based on the section prop
    const renderSection = () => {
        switch (section) {
            case 'verification-types':
                return renderVerificationTypes();
            case 'review-workflow':
                return renderReviewWorkflow();
            case 'policies':
                return renderPolicies();
            case 'messaging':
                return renderMessaging();
            case 'general':
            default:
                return renderGeneral();
        }
    };

    const updateConfig = (path, value) => {
        if (!localConfig) return;
        
        const keys = path.split('.');
        const newConfig = JSON.parse(JSON.stringify(localConfig)); // Deep clone
        let current = newConfig;
        
        // Navigate to the parent object, creating nested objects if they don't exist
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        // Set the value
        current[keys[keys.length - 1]] = value;
        setLocalConfig(newConfig);
    };

    const updateVerificationType = (typeKey, field, value) => {
        if (!localConfig) return;
        
        const newConfig = { ...localConfig };
        if (!newConfig.verificationTiers) {
            newConfig.verificationTiers = {};
        }
        if (!newConfig.verificationTiers[typeKey]) {
            newConfig.verificationTiers[typeKey] = {};
        }
        
        newConfig.verificationTiers[typeKey][field] = value;
        setLocalConfig(newConfig);
    };

    const updateVerificationTypeRequirement = (typeKey, requirement, value) => {
        if (!localConfig) return;
        
        const newConfig = { ...localConfig };
        if (!newConfig.verificationTiers) {
            newConfig.verificationTiers = {};
        }
        if (!newConfig.verificationTiers[typeKey]) {
            newConfig.verificationTiers[typeKey] = {};
        }
        if (!newConfig.verificationTiers[typeKey].requirements) {
            newConfig.verificationTiers[typeKey].requirements = {};
        }
        
        newConfig.verificationTiers[typeKey].requirements[requirement] = value;
        setLocalConfig(newConfig);
    };

    const addVerificationType = () => {
        if (!localConfig) return;
        
        const newConfig = { ...localConfig };
        if (!newConfig.verificationTiers) {
            newConfig.verificationTiers = {};
        }
        
        // Generate a unique key for the new verification type
        const baseKey = 'new_verification_type';
        let key = baseKey;
        let counter = 1;
        while (newConfig.verificationTiers[key]) {
            key = `${baseKey}_${counter}`;
            counter++;
        }
        
        // Add default verification type
        newConfig.verificationTiers[key] = {
            name: 'New Verification Type',
            description: 'Description for the new verification type',
            color: '#4caf50',
            icon: 'mdi:shield-check',
            requirements: {
                minMembers: 5,
                minAge: 30
            },
            benefits: ['event_creation', 'member_management']
        };
        
        setLocalConfig(newConfig);
    };

    const removeVerificationType = (typeKey) => {
        if (!localConfig) return;
        
        // Don't allow removing 'basic' as it's the default fallback
        if (typeKey === 'basic') {
            alert('Cannot remove the basic verification type as it is required for system functionality.');
            return;
        }
        
        // Show confirmation dialog
        const verificationTypeName = localConfig.verificationTiers[typeKey]?.name || typeKey;
        const confirmed = window.confirm(
            `Are you sure you want to remove the verification type "${verificationTypeName}"?\n\n` +
            'This action cannot be undone and may affect existing organizations using this verification type.'
        );
        
        if (!confirmed) return;
        
        const newConfig = { ...localConfig };
        if (newConfig.verificationTiers && newConfig.verificationTiers[typeKey]) {
            delete newConfig.verificationTiers[typeKey];
            
            // If this was the default verification type, reset to basic
            if (newConfig.defaultVerificationType === typeKey) {
                newConfig.defaultVerificationType = 'basic';
            }
            
            setLocalConfig(newConfig);
        }
    };

    const renameVerificationType = (oldKey, newKey) => {
        if (!localConfig) return;
        
        // Don't allow renaming 'basic' as it's the default fallback
        if (oldKey === 'basic') {
            alert('Cannot rename the basic verification type as it is required for system functionality.');
            return;
        }
        
        // Validate new key format
        if (!/^[a-z_][a-z0-9_]*$/.test(newKey)) {
            alert('Verification type key must contain only lowercase letters, numbers, and underscores, and must start with a letter or underscore.');
            return;
        }
        
        // Check if new key already exists
        if (localConfig.verificationTiers[newKey] && newKey !== oldKey) {
            alert('A verification type with this key already exists.');
            return;
        }
        
        const newConfig = { ...localConfig };
        if (newConfig.verificationTiers && newConfig.verificationTiers[oldKey]) {
            // Copy the verification type to the new key
            newConfig.verificationTiers[newKey] = { ...newConfig.verificationTiers[oldKey] };
            
            // Remove the old key
            delete newConfig.verificationTiers[oldKey];
            
            // Update default verification type if it was the renamed one
            if (newConfig.defaultVerificationType === oldKey) {
                newConfig.defaultVerificationType = newKey;
            }
            
            setLocalConfig(newConfig);
        }
    };

    const duplicateVerificationType = (typeKey) => {
        if (!localConfig?.verificationTiers?.[typeKey]) return;
        const newConfig = { ...localConfig, verificationTiers: { ...localConfig.verificationTiers } };
        const baseKey = `${typeKey}_copy`;
        let duplicateKey = baseKey;
        let counter = 1;
        while (newConfig.verificationTiers[duplicateKey]) {
            duplicateKey = `${baseKey}_${counter}`;
            counter += 1;
        }
        newConfig.verificationTiers[duplicateKey] = {
            ...JSON.parse(JSON.stringify(newConfig.verificationTiers[typeKey])),
            name: `${newConfig.verificationTiers[typeKey].name} Copy`
        };
        setLocalConfig(newConfig);
        setSelectedTypeKey(duplicateKey);
    };

    const setDefaultVerificationType = (typeKey) => {
        updateConfig('defaultVerificationType', typeKey);
    };

    const handleAddBenefit = (typeKey) => {
        const draft = benefitDraft.trim();
        if (!draft) return;
        const currentBenefits = localConfig?.verificationTiers?.[typeKey]?.benefits || [];
        if (currentBenefits.includes(draft)) {
            setBenefitDraft('');
            return;
        }
        updateVerificationType(typeKey, 'benefits', [...currentBenefits, draft]);
        setBenefitDraft('');
    };

    const handleRemoveBenefit = (typeKey, benefit) => {
        const benefits = localConfig?.verificationTiers?.[typeKey]?.benefits || [];
        updateVerificationType(typeKey, 'benefits', benefits.filter((item) => item !== benefit));
    };

    if (loading) {
        return (
            <div className="configuration">
                <div className="loading">Loading configuration...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="configuration">
                <div className="error">Error loading configuration: {error}</div>
            </div>
        );
    }

    if (!localConfig) {
        return (
            <div className="configuration">
                <div className="loading">Initializing configuration...</div>
            </div>
        );
    }

    const ALLOWED_ACTIONS_OPTIONS = [
        { value: 'view_page', label: 'View page' },
        { value: 'edit_profile', label: 'Edit profile' },
        { value: 'manage_members', label: 'Manage members' },
        { value: 'create_events', label: 'Create events' },
        { value: 'post_messages', label: 'Post messages' }
    ];

    // Render functions for different sections
    const renderGeneral = () => {
        const orgApproval = localConfig.orgApproval || {
            mode: 'none',
            autoApproveMemberThreshold: 5,
            pendingOrgLimits: { discoverable: false, allowedActions: ['view_page', 'edit_profile'] }
        };
        const pendingLimits = orgApproval.pendingOrgLimits || { discoverable: false, allowedActions: [] };
        const showThreshold = ['auto', 'both'].includes(orgApproval.mode);

        return (
            <div className="config-sections">
                <div className="config-section">
                    <h2>
                        <Icon icon="mdi:shield-check" />
                        Verification Settings
                    </h2>
                    <div className="config-group">
                        <div className="config-item">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={localConfig.verificationEnabled}
                                    onChange={(e) => updateConfig('verificationEnabled', e.target.checked)}
                                />
                                Enable Verification System
                            </label>
                            <p>Allow organizations to submit verification requests</p>
                        </div>
                        <div className="config-item">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={localConfig.verificationRequired}
                                    onChange={(e) => updateConfig('verificationRequired', e.target.checked)}
                                />
                                Require Verification
                            </label>
                            <p>Make verification mandatory for all organizations</p>
                        </div>
                    </div>
                </div>

                <div className="config-section">
                    <h2>
                        <Icon icon="mdi:clipboard-check" />
                        Org Approval
                    </h2>
                    <div className="config-group">
                        <div className="config-item">
                            <label>Approval Mode</label>
                            <select
                                value={orgApproval.mode}
                                onChange={(e) => updateConfig('orgApproval.mode', e.target.value)}
                            >
                                <option value="none">None</option>
                                <option value="manual">Manual</option>
                                <option value="auto">Auto (member threshold)</option>
                                <option value="both">Both</option>
                            </select>
                            <p>New orgs require approval before full access. Manual = admin approves. Auto = approve when member count reaches threshold.</p>
                        </div>
                        {showThreshold && (
                            <div className="config-item">
                                <label>Auto-approve member threshold</label>
                                <input
                                    type="number"
                                    value={orgApproval.autoApproveMemberThreshold ?? 5}
                                    onChange={(e) => updateConfig('orgApproval.autoApproveMemberThreshold', parseInt(e.target.value) || 0)}
                                    min="1"
                                />
                                <p>Minimum members required for auto-approval</p>
                            </div>
                        )}
                        <div className="config-item">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={pendingLimits.discoverable}
                                    onChange={(e) => updateConfig('orgApproval.pendingOrgLimits.discoverable', e.target.checked)}
                                />
                                Discoverable in browse
                            </label>
                            <p>Allow pending orgs to appear in org browse/search (default: hidden)</p>
                        </div>
                        <div className="config-item">
                            <label>Allowed actions for pending orgs</label>
                            <div className="allowed-actions-checkboxes">
                                {ALLOWED_ACTIONS_OPTIONS.map((opt) => (
                                    <label key={opt.value} className="checkbox-inline">
                                        <input
                                            type="checkbox"
                                            checked={(pendingLimits.allowedActions || []).includes(opt.value)}
                                            onChange={(e) => {
                                                const current = pendingLimits.allowedActions || [];
                                                const next = e.target.checked
                                                    ? [...current, opt.value]
                                                    : current.filter((a) => a !== opt.value);
                                                updateConfig('orgApproval.pendingOrgLimits.allowedActions', next);
                                            }}
                                        />
                                        {opt.label}
                                    </label>
                                ))}
                            </div>
                            <p>Actions pending orgs can perform before approval</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderVerificationTypes = () => {
        const verificationTypes = localConfig.verificationTiers || {};
        const verificationEntries = Object.entries(verificationTypes);
        const selectedType = selectedTypeKey ? verificationTypes[selectedTypeKey] : null;

        return (
            <div className="config-sections">
                <div className="config-section verification-types-section">
                    <h2>
                        <Icon icon="mdi:shield-star" />
                        Verification Types Management
                    </h2>

                    <div className="config-group">
                        <div className="config-item">
                            <label>Enable Custom Verification Types</label>
                            <input
                                type="checkbox"
                                checked={localConfig.enableCustomVerificationTypes}
                                onChange={(e) => updateConfig('enableCustomVerificationTypes', e.target.checked)}
                            />
                            <p>Allow organizations to request different verification levels</p>
                        </div>

                        <div className="config-item inline">
                            <div>
                                <label>Auto-upgrade Threshold (days)</label>
                                <input
                                    type="number"
                                    value={localConfig.autoUpgradeThreshold}
                                    onChange={(e) => updateConfig('autoUpgradeThreshold', parseInt(e.target.value) || 0)}
                                    min="0"
                                />
                                <p>Days before an org can request a higher tier</p>
                            </div>
                            <div className="summary-pills">
                                <span className="pill">
                                    <Icon icon="mdi:layers" />
                                    {verificationEntries.length} tiers
                                </span>
                                <span className="pill default">
                                    <Icon icon="mdi:star" />
                                    Default: {localConfig.defaultVerificationType}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="verification-types-layout">
                        <div className="verification-type-list">
                            <div className="verification-list-header">
                                <div>
                                    <h3>Tiers</h3>
                                    <p>Select a tier to edit its settings</p>
                                </div>
                                <button className="add-verification-type-btn" onClick={addVerificationType}>
                                    <Icon icon="mdi:plus" />
                                    New Tier
                                </button>
                            </div>
                            <div className="verification-type-list-cards">
                                {verificationEntries.map(([key, type]) => (
                                    <button
                                        key={key}
                                        className={`verification-type-card ${selectedTypeKey === key ? 'active' : ''}`}
                                        onClick={() => setSelectedTypeKey(key)}
                                    >
                                        <div className="card-header">
                                            <div className="card-title">
                                                <span className="color-indicator" style={{ backgroundColor: type.color }} />
                                                <div>
                                                    <h4>{type.name}</h4>
                                                    <small>{key}</small>
                                                </div>
                                            </div>
                                            {localConfig.defaultVerificationType === key && (
                                                <span className="status-pill">Default</span>
                                            )}
                                        </div>
                                        <p>{type.description}</p>
                                        <div className="card-meta">
                                            <span>
                                                <Icon icon="mdi:account-group" />
                                                {type.requirements?.minMembers || 0} members
                                            </span>
                                            <span>
                                                <Icon icon="mdi:calendar-clock" />
                                                {type.requirements?.minAge || 0} days
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="verification-type-details">
                            {selectedType ? (
                                <>
                                    <div className="details-header">
                                        <div>
                                            <h3>Edit {selectedType.name}</h3>
                                            <p>Update the rules, requirements, and benefits for this tier</p>
                                        </div>
                                        <div className="details-actions">
                                            <button
                                                className="ghost-btn"
                                                onClick={() => duplicateVerificationType(selectedTypeKey)}
                                            >
                                                <Icon icon="mdi:content-copy" />
                                                Duplicate
                                            </button>
                                            <button
                                                className="ghost-btn"
                                                onClick={() => setDefaultVerificationType(selectedTypeKey)}
                                                disabled={localConfig.defaultVerificationType === selectedTypeKey}
                                            >
                                                <Icon icon="mdi:star-outline" />
                                                Set Default
                                            </button>
                                            <button
                                                className="remove-verification-type-btn"
                                                onClick={() => removeVerificationType(selectedTypeKey)}
                                                disabled={selectedTypeKey === 'basic'}
                                            >
                                                <Icon icon="mdi:delete" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="details-grid">
                                        <div className="panel">
                                            <h4>Identity</h4>
                                            <div className="form-group inline-group">
                                                <label>Display Name</label>
                                                <input
                                                    type="text"
                                                    value={selectedType.name}
                                                    onChange={(e) => updateVerificationType(selectedTypeKey, 'name', e.target.value)}
                                                />
                                            </div>
                                            <div className="form-group inline-group">
                                                <label>Internal Key</label>
                                                <input
                                                    type="text"
                                                    value={selectedTypeKey}
                                                    onChange={(e) => renameVerificationType(selectedTypeKey, e.target.value)}
                                                    disabled={selectedTypeKey === 'basic'}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Description</label>
                                                <textarea
                                                    rows={3}
                                                    value={selectedType.description}
                                                    onChange={(e) => updateVerificationType(selectedTypeKey, 'description', e.target.value)}
                                                />
                                            </div>
                                            <div className="visual-pickers">
                                                <label className="color-picker">
                                                    Accent Color
                                                    <input
                                                        type="color"
                                                        value={selectedType.color}
                                                        onChange={(e) => updateVerificationType(selectedTypeKey, 'color', e.target.value)}
                                                    />
                                                </label>
                                                <div className="form-group">
                                                    <label>Icon</label>
                                                    <input
                                                        type="text"
                                                        value={selectedType.icon}
                                                        onChange={(e) => updateVerificationType(selectedTypeKey, 'icon', e.target.value)}
                                                        placeholder="mdi:shield-check"
                                                    />
                                                    <small>Material Design icon identifier</small>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="panel">
                                            <h4>Requirements</h4>
                                            <div className="requirements-grid">
                                                <div className="form-group">
                                                    <label>Minimum Members</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={selectedType.requirements?.minMembers || 0}
                                                        onChange={(e) =>
                                                            updateVerificationTypeRequirement(
                                                                selectedTypeKey,
                                                                'minMembers',
                                                                parseInt(e.target.value) || 0
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Minimum Age (days)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={selectedType.requirements?.minAge || 0}
                                                        onChange={(e) =>
                                                            updateVerificationTypeRequirement(
                                                                selectedTypeKey,
                                                                'minAge',
                                                                parseInt(e.target.value) || 0
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="panel">
                                            <h4>Benefits</h4>
                                            <div className="benefit-chips">
                                                {(selectedType.benefits || []).map((benefit) => (
                                                    <span key={benefit} className="chip" onClick={() => handleRemoveBenefit(selectedTypeKey, benefit)}>
                                                        {benefit}
                                                        <Icon icon="mdi:close" />
                                                    </span>
                                                ))}
                                                {!selectedType.benefits?.length && (
                                                    <p className="empty">No benefits specified for this tier yet.</p>
                                                )}
                                            </div>
                                            <div className="benefit-input">
                                                <input
                                                    type="text"
                                                    value={benefitDraft}
                                                    placeholder="Add benefit and press Enter"
                                                    onChange={(e) => setBenefitDraft(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            handleAddBenefit(selectedTypeKey);
                                                        }
                                                    }}
                                                />
                                                <button onClick={() => handleAddBenefit(selectedTypeKey)}>
                                                    <Icon icon="mdi:plus" />
                                                    Add
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="empty-state">
                                    <Icon icon="mdi:shield-alert" />
                                    <h4>Select a verification tier</h4>
                                    <p>Choose a tier from the list to view and edit its configuration.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderReviewWorkflow = () => (
        <div className="config-sections">
            {/* Review Workflow */}
            <div className="config-section">
                <h2>
                    <Icon icon="mdi:clipboard-check" />
                    Review Workflow Settings
                </h2>
                
                <div className="config-group">
                    <div className="config-item">
                        <label>
                            <input
                                type="checkbox"
                                checked={localConfig.reviewWorkflow?.requireMultipleApprovers}
                                onChange={(e) => updateConfig('reviewWorkflow.requireMultipleApprovers', e.target.checked)}
                            />
                            Require Multiple Approvers
                        </label>
                    </div>

                    <div className="config-item">
                        <label>Minimum Approvers</label>
                        <input
                            type="number"
                            value={localConfig.reviewWorkflow?.minApprovers}
                            onChange={(e) => updateConfig('reviewWorkflow.minApprovers', parseInt(e.target.value))}
                            min="1"
                        />
                    </div>

                    <div className="config-item">
                        <label>Auto-escalate after (days)</label>
                        <input
                            type="number"
                            value={localConfig.reviewWorkflow?.autoEscalateAfterDays}
                            onChange={(e) => updateConfig('reviewWorkflow.autoEscalateAfterDays', parseInt(e.target.value))}
                            min="1"
                        />
                    </div>
                </div>
            </div>
        </div>
    );

    const renderPolicies = () => (
        <div className="config-sections">
            {/* Policies */}
            <div className="config-section">
                <h2>
                    <Icon icon="mdi:policy" />
                    Organization Policies
                </h2>
                
                <div className="config-group">
                    <div className="config-item">
                        <label>Max Members per Organization</label>
                        <input
                            type="number"
                            value={localConfig.policies?.maxMembersPerOrg}
                            onChange={(e) => updateConfig('policies.maxMembersPerOrg', parseInt(e.target.value))}
                            min="1"
                        />
                    </div>

                    <div className="config-item">
                        <label>Max Events per Month</label>
                        <input
                            type="number"
                            value={localConfig.policies?.maxEventsPerMonth}
                            onChange={(e) => updateConfig('policies.maxEventsPerMonth', parseInt(e.target.value))}
                            min="0"
                        />
                    </div>

                    <div className="config-item">
                        <label>
                            <input
                                type="checkbox"
                                checked={localConfig.policies?.requireFacultyAdvisor}
                                onChange={(e) => updateConfig('policies.requireFacultyAdvisor', e.target.checked)}
                            />
                            Require Faculty Advisor
                        </label>
                    </div>

                    <div className="config-item">
                        <label>Minimum Meeting Frequency</label>
                        <select
                            value={localConfig.policies?.minMeetingFrequency}
                            onChange={(e) => updateConfig('policies.minMeetingFrequency', e.target.value)}
                        >
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Bi-weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderMessaging = () => (
        <div className="config-sections">
            <div className="config-section">
                <h2>
                    <Icon icon="mdi:message-text" />
                    Messaging System Configuration
                </h2>
                
                <div className="config-group">
                    <div className="config-item">
                        <label>
                            <input
                                type="checkbox"
                                checked={localConfig.messaging?.enabled !== false}
                                onChange={(e) => updateConfig('messaging.enabled', e.target.checked)}
                            />
                            Enable Messaging System
                        </label>
                        <p>Allow organizations to post messages and announcements</p>
                    </div>

                    <div className="config-item">
                        <label>Default Character Limit</label>
                        <input
                            type="number"
                            value={inputValues['messaging.defaultCharacterLimit'] !== undefined 
                                ? inputValues['messaging.defaultCharacterLimit'] 
                                : (localConfig.messaging?.defaultCharacterLimit ?? 500)}
                            onChange={(e) => {
                                const inputVal = e.target.value;
                                setInputValues(prev => ({ ...prev, 'messaging.defaultCharacterLimit': inputVal }));
                                if (inputVal !== '') {
                                    const numVal = parseInt(inputVal, 10);
                                    if (!isNaN(numVal) && numVal >= 0) {
                                        updateConfig('messaging.defaultCharacterLimit', numVal);
                                    }
                                }
                            }}
                            onBlur={(e) => {
                                const inputVal = e.target.value;
                                if (inputVal === '') {
                                    // Reset to current config value
                                    setInputValues(prev => {
                                        const newVals = { ...prev };
                                        delete newVals['messaging.defaultCharacterLimit'];
                                        return newVals;
                                    });
                                } else {
                                    const numVal = parseInt(inputVal, 10);
                                    if (!isNaN(numVal) && numVal >= 0) {
                                        updateConfig('messaging.defaultCharacterLimit', numVal);
                                        setInputValues(prev => {
                                            const newVals = { ...prev };
                                            delete newVals['messaging.defaultCharacterLimit'];
                                            return newVals;
                                        });
                                    }
                                }
                            }}
                            min={localConfig.messaging?.minCharacterLimit ?? 100}
                            max={localConfig.messaging?.maxCharacterLimit ?? 2000}
                        />
                        <p>Default character limit for messages (between {localConfig.messaging?.minCharacterLimit ?? 100} and {localConfig.messaging?.maxCharacterLimit ?? 2000})</p>
                    </div>

                    <div className="config-item">
                        <label>Minimum Character Limit</label>
                        <input
                            type="number"
                            value={inputValues['messaging.minCharacterLimit'] !== undefined 
                                ? inputValues['messaging.minCharacterLimit'] 
                                : (localConfig.messaging?.minCharacterLimit ?? 100)}
                            onChange={(e) => {
                                const inputVal = e.target.value;
                                setInputValues(prev => ({ ...prev, 'messaging.minCharacterLimit': inputVal }));
                                if (inputVal !== '') {
                                    const numVal = parseInt(inputVal, 10);
                                    if (!isNaN(numVal) && numVal >= 1) {
                                        updateConfig('messaging.minCharacterLimit', numVal);
                                    }
                                }
                            }}
                            onBlur={(e) => {
                                const inputVal = e.target.value;
                                if (inputVal === '') {
                                    // Reset to current config value
                                    setInputValues(prev => {
                                        const newVals = { ...prev };
                                        delete newVals['messaging.minCharacterLimit'];
                                        return newVals;
                                    });
                                } else {
                                    const numVal = parseInt(inputVal, 10);
                                    if (!isNaN(numVal) && numVal >= 1) {
                                        updateConfig('messaging.minCharacterLimit', numVal);
                                        setInputValues(prev => {
                                            const newVals = { ...prev };
                                            delete newVals['messaging.minCharacterLimit'];
                                            return newVals;
                                        });
                                    }
                                }
                            }}
                            min="1"
                        />
                        <p>Minimum characters required for a message</p>
                    </div>

                    <div className="config-item">
                        <label>Maximum Character Limit</label>
                        <input
                            type="number"
                            value={inputValues['messaging.maxCharacterLimit'] !== undefined 
                                ? inputValues['messaging.maxCharacterLimit'] 
                                : (localConfig.messaging?.maxCharacterLimit ?? 2000)}
                            onChange={(e) => {
                                const inputVal = e.target.value;
                                setInputValues(prev => ({ ...prev, 'messaging.maxCharacterLimit': inputVal }));
                                if (inputVal !== '') {
                                    const numVal = parseInt(inputVal, 10);
                                    if (!isNaN(numVal) && numVal >= 100) {
                                        updateConfig('messaging.maxCharacterLimit', numVal);
                                    }
                                }
                            }}
                            onBlur={(e) => {
                                const inputVal = e.target.value;
                                if (inputVal === '') {
                                    // Reset to current config value
                                    setInputValues(prev => {
                                        const newVals = { ...prev };
                                        delete newVals['messaging.maxCharacterLimit'];
                                        return newVals;
                                    });
                                } else {
                                    const numVal = parseInt(inputVal, 10);
                                    if (!isNaN(numVal) && numVal >= 100) {
                                        updateConfig('messaging.maxCharacterLimit', numVal);
                                        setInputValues(prev => {
                                            const newVals = { ...prev };
                                            delete newVals['messaging.maxCharacterLimit'];
                                            return newVals;
                                        });
                                    }
                                }
                            }}
                            min="100"
                        />
                        <p>Maximum characters allowed for a message</p>
                    </div>

                    <div className="config-item">
                        <label>Default Visibility</label>
                        <select
                            value={localConfig.messaging?.defaultVisibility || 'members_and_followers'}
                            onChange={(e) => updateConfig('messaging.defaultVisibility', e.target.value)}
                        >
                            <option value="members_only">Members Only</option>
                            <option value="members_and_followers">Members and Followers</option>
                            <option value="public">Public</option>
                        </select>
                        <p>Default visibility setting for new messages</p>
                    </div>

                    <div className="config-item">
                        <label>
                            <input
                                type="checkbox"
                                checked={localConfig.messaging?.moderationEnabled || false}
                                onChange={(e) => updateConfig('messaging.moderationEnabled', e.target.checked)}
                            />
                            Enable Moderation
                        </label>
                        <p>Require messages to be approved before being visible</p>
                    </div>

                    <div className="config-item">
                        <label>
                            <input
                                type="checkbox"
                                checked={localConfig.messaging?.requireProfanityFilter !== false}
                                onChange={(e) => updateConfig('messaging.requireProfanityFilter', e.target.checked)}
                            />
                            Require Profanity Filter
                        </label>
                        <p>Automatically filter profanity from messages</p>
                    </div>

                    <div className="config-item">
                        <label>
                            <input
                                type="checkbox"
                                checked={localConfig.messaging?.allowEventMentions !== false}
                                onChange={(e) => updateConfig('messaging.allowEventMentions', e.target.checked)}
                            />
                            Allow Event Mentions
                        </label>
                        <p>Allow organizations to mention events in messages</p>
                    </div>

                    <div className="config-item">
                        <label>
                            <input
                                type="checkbox"
                                checked={localConfig.messaging?.allowLinks !== false}
                                onChange={(e) => updateConfig('messaging.allowLinks', e.target.checked)}
                            />
                            Allow Links
                        </label>
                        <p>Allow URLs in messages</p>
                    </div>
                </div>

                <div className="config-section">
                    <h3>
                        <Icon icon="mdi:bell" />
                        Notification Settings
                    </h3>
                    
                    <div className="config-group">
                        <div className="config-item">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={localConfig.messaging?.notificationSettings?.notifyOnNewMessage !== false}
                                    onChange={(e) => updateConfig('messaging.notificationSettings.notifyOnNewMessage', e.target.checked)}
                                />
                                Notify on New Messages
                            </label>
                            <p>Send notifications when organizations post new messages</p>
                        </div>

                        <div className="config-item">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={localConfig.messaging?.notificationSettings?.notifyOnMention !== false}
                                    onChange={(e) => updateConfig('messaging.notificationSettings.notifyOnMention', e.target.checked)}
                                />
                                Notify on Event Mentions
                            </label>
                            <p>Send notifications when events are mentioned in messages</p>
                        </div>

                        <div className="config-item">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={localConfig.messaging?.notificationSettings?.notifyOnReply !== false}
                                    onChange={(e) => updateConfig('messaging.notificationSettings.notifyOnReply', e.target.checked)}
                                />
                                Notify on Replies
                            </label>
                            <p>Send notifications when messages receive replies</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="configuration dash">
            <UnsavedChangesBanner
                hasChanges={hasChanges}
                onSave={saveChanges}
                onDiscard={discardChanges}
                saving={saving}
            />
            
            <header className="header">
                <h1>{section === 'general' ? 'General Configuration' : 
                     section === 'verification-types' ? 'Verification Types' :
                     section === 'review-workflow' ? 'Review Workflow' :
                     section === 'policies' ? 'Organization Policies' :
                     section === 'messaging' ? 'Messaging Configuration' : 'Configuration'}</h1>
                <p>Manage organization management system settings</p>
                <img src={AtlasMain} alt="Configuration Grad" />
            </header>

            <div className="content">
                {renderSection()}
            </div>
        </div>
    );
}

export default Configuration;
