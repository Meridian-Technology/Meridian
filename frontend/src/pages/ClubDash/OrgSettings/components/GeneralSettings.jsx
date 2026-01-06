import React, { useState, useEffect } from 'react';
import { useOrgPermissions, useOrgSave } from './settingsHelpers';
import { useGradient } from '../../../../hooks/useGradient';
import UnsavedChangesBanner from '../../../../components/UnsavedChangesBanner/UnsavedChangesBanner';
import useUnsavedChanges from '../../../../hooks/useUnsavedChanges';
import SettingsList from '../../../../components/SettingsList/SettingsList';

const GeneralSettings = ({ org, expandedClass }) => {
    const [formData, setFormData] = useState({
        org_name: '',
        org_description: '',
        org_profile_image: '',
        weekly_meeting: '',
        positions: []
    });
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [canManageSettings, setCanManageSettings] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);
    const {AtlasMain} = useGradient();
    const { checkUserPermissions } = useOrgPermissions(org);
    const { saveOrgSettings } = useOrgSave(org);

    useEffect(() => {
        if (org && !permissionsChecked) {
            initializePermissions();
            initializeFormData();
        }
    }, [org, permissionsChecked]);

    const initializePermissions = async () => {
        const permissions = await checkUserPermissions();
        setCanManageSettings(permissions.canManageSettings);
        setHasAccess(permissions.hasAccess);
        setPermissionsChecked(true);
    };

    const initializeFormData = () => {
        if (org) {
            setFormData({
                org_name: org.org_name || '',
                org_description: org.org_description || '',
                org_profile_image: org.org_profile_image || '',
                weekly_meeting: org.weekly_meeting || '',
                positions: org.positions || []
            });
        }
    };

    // Original data for comparison
    const originalData = {
        org_name: org?.org_name || '',
        org_description: org?.org_description || '',
        org_profile_image: org?.org_profile_image || '',
        weekly_meeting: org?.weekly_meeting || '',
        positions: org?.positions || []
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSave = async () => {
        if (!canManageSettings) {
            return false;
        }

        const success = await saveOrgSettings(formData);
        if (success) {
            // Optionally refresh the org data or update local state
            initializeFormData();
        }
        return success;
    };

    const handleDiscard = () => {
        // Reset to original values
        setFormData({
            org_name: org?.org_name || '',
            org_description: org?.org_description || '',
            org_profile_image: org?.org_profile_image || '',
            weekly_meeting: org?.weekly_meeting || '',
            positions: org?.positions || []
        });
    };

    const { hasChanges, saving, handleSave: saveChanges, handleDiscard: discardChanges } = useUnsavedChanges(
        originalData,
        formData,
        handleSave,
        handleDiscard
    );

    if (!hasAccess) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="settings-section">
                    <h2>General Settings</h2>
                    <div className="permission-warning">
                        <p>You don't have access to this organization's settings.</p>
                        <p>You must be a member with appropriate permissions to view settings.</p>
                    </div>
                </div>
            </div>
        );
    }

    const generalSettingsItems = [
        {
            title: 'Organization Name',
            subtitle: 'The name of your organization',
            action: (
                <div className="form-group">
                    <input
                        type="text"
                        id="org_name"
                        name="org_name"
                        value={formData.org_name}
                        onChange={handleInputChange}
                        disabled={!canManageSettings}
                        placeholder="Enter organization name"
                    />
                </div>
            )
        },
        {
            title: 'Description',
            subtitle: 'A brief description of your organization',
            action: (
                <div className="form-group">
                    <textarea
                        id="org_description"
                        name="org_description"
                        value={formData.org_description}
                        onChange={handleInputChange}
                        disabled={!canManageSettings}
                        placeholder="Describe your organization"
                        rows={4}
                        maxLength={500}
                    />
                    <span className="char-count">{formData.org_description.length}/500</span>
                </div>
            )
        },
        {
            title: 'Weekly Meeting Time',
            subtitle: 'The time of your weekly meeting',
            action: (
                <div className="form-group">
                    <input
                        type="text"
                        id="weekly_meeting"
                        name="weekly_meeting"
                        value={formData.weekly_meeting}
                        onChange={handleInputChange}
                        disabled={!canManageSettings}
                        placeholder="e.g., Every Monday at 6 PM"
                    />
                </div>
            )
        }
    ];

    return (
        <div className="dash settings-section">
            <UnsavedChangesBanner
                hasChanges={hasChanges}
                onSave={saveChanges}
                onDiscard={discardChanges}
                saving={saving}
            />
            
            <header className="header">
                <h1>General Settings</h1>
                <p>Manage basic organization information</p>
                <img src={AtlasMain} alt="" />
            </header>
            <div className="settings-content">
                <SettingsList items={generalSettingsItems} />
            </div>
        </div>
    );
};

export default GeneralSettings; 