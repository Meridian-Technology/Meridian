import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrgPermissions, useOrgSave } from './settingsHelpers';
import { useGradient } from '../../../../hooks/useGradient';
import UnsavedChangesBanner from '../../../../components/UnsavedChangesBanner/UnsavedChangesBanner';
import { Icon } from '@iconify-icon/react';
import DraggableList from '../../../../components/DraggableList/DraggableList';
import './SocialLinksSettings.scss';

const SocialLinksSettings = ({ org, expandedClass, adminBypass = false }) => {
    const location = useLocation();
    const [formData, setFormData] = useState([]);
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [canManageSettings, setCanManageSettings] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const { AtlasMain } = useGradient();
    const { checkUserPermissions } = useOrgPermissions(org, { adminBypass });
    const { saveOrgSettings } = useOrgSave(org);

    const [originalData, setOriginalData] = useState([]);

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

    // Generate a stable unique ID for links that don't have one
    const ensureLinkId = (link, index) => {
        // If link already has an id or _id, use it
        if (link.id) return link;
        if (link._id) return { ...link, id: link._id };
        
        // For existing links without IDs, create a stable ID based on content
        // This ensures the same link always gets the same ID
        const stableId = link.type === 'website' 
            ? `link-website-${link.url || link.title || index}`
            : `link-${link.type}-${link.username || index}`;
        return { ...link, id: stableId };
    };

    const initializeFormData = () => {
        if (org) {
            const links = (org.socialLinks || []).sort((a, b) => (a.order || 0) - (b.order || 0));
            // Strip https:// from website URLs for display (we'll add it back on save)
            const processedLinks = links.map((link, index) => {
                let processedLink = ensureLinkId(link, index);
                if (link.type === 'website' && link.url) {
                    processedLink = {
                        ...processedLink,
                        url: link.url.replace(/^https?:\/\//i, '')
                    };
                }
                return processedLink;
            });
            setFormData(processedLinks);
            setOriginalData(processedLinks);
        }
    };

    const getAvailableTypes = () => {
        const usedTypes = formData.map(link => link.type);
        const typeCounts = {
            instagram: usedTypes.filter(t => t === 'instagram').length,
            youtube: usedTypes.filter(t => t === 'youtube').length,
            tiktok: usedTypes.filter(t => t === 'tiktok').length,
            website: usedTypes.filter(t => t === 'website').length
        };
        
        const available = [];
        if (typeCounts.instagram < 1) available.push('instagram');
        if (typeCounts.youtube < 1) available.push('youtube');
        if (typeCounts.tiktok < 1) available.push('tiktok');
        if (typeCounts.website < 3) available.push('website');
        
        return available;
    };

    const handleAddLink = (type) => {
        const newLink = {
            id: `link-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            username: type !== 'website' ? '' : undefined,
            url: type === 'website' ? '' : undefined,
            title: type === 'website' ? '' : undefined,
            order: formData.length
        };
        setFormData([...formData, newLink]);
    };

    const handleDeleteLink = (index) => {
        const newLinks = formData.filter((_, i) => i !== index);
        // Reorder remaining links
        newLinks.forEach((link, i) => {
            link.order = i;
        });
        setFormData(newLinks);
        // Clear any errors for this index
        const newErrors = { ...fieldErrors };
        delete newErrors[`${index}_username`];
        delete newErrors[`${index}_url`];
        delete newErrors[`${index}_title`];
        delete newErrors[`${index}_type`];
        setFieldErrors(newErrors);
    };


    const handleInputChange = (index, field, value) => {
        const newLinks = [...formData];
        
        // For website URLs, strip https:// if user types it (we'll add it back on save)
        if (field === 'url' && newLinks[index].type === 'website') {
            value = value.replace(/^https?:\/\//i, '');
        }
        
        newLinks[index] = {
            ...newLinks[index],
            [field]: value
        };
        setFormData(newLinks);
        
        // Clear field error when user starts typing
        const errorKey = `${index}_${field}`;
        if (fieldErrors[errorKey]) {
            setFieldErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[errorKey];
                return newErrors;
            });
        }
    };

    const handleReorder = (newOrderedLinks) => {
        // Update order values based on new order, preserving IDs
        const updatedLinks = newOrderedLinks.map((link, index) => ({
            ...link,
            order: index
        }));
        setFormData(updatedLinks);
    };

    const validateLinks = () => {
        const errors = {};
        
        formData.forEach((link, index) => {
            if (link.type === 'website') {
                if (!link.url || link.url.trim() === '') {
                    errors[`${index}_url`] = 'URL is required for website links';
                } else {
                    // Basic URL validation - prepend https:// for validation
                    try {
                        const urlToValidate = link.url.startsWith('http://') || link.url.startsWith('https://') 
                            ? link.url 
                            : `https://${link.url}`;
                        new URL(urlToValidate);
                    } catch {
                        errors[`${index}_url`] = 'Please enter a valid URL';
                    }
                }
                if (!link.title || link.title.trim() === '') {
                    errors[`${index}_title`] = 'Title is required for website links';
                }
            } else {
                if (!link.username || link.username.trim() === '') {
                    errors[`${index}_username`] = 'Username is required';
                } else {
                    // Basic username validation (alphanumeric, underscore, dot, hyphen)
                    const usernameRegex = /^[a-zA-Z0-9._-]+$/;
                    if (!usernameRegex.test(link.username)) {
                        errors[`${index}_username`] = 'Username can only contain letters, numbers, dots, underscores, and hyphens';
                    }
                }
            }
        });
        
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        if (!canManageSettings) {
            return false;
        }

        if (!validateLinks()) {
            return false;
        }

        // Prepare data for saving - prepend https:// to website URLs if not present
        const dataToSave = formData.map(link => {
            if (link.type === 'website' && link.url) {
                // Prepend https:// if URL doesn't already start with http:// or https://
                const url = link.url.trim();
                const hasProtocol = /^https?:\/\//i.test(url);
                return {
                    ...link,
                    url: hasProtocol ? url : `https://${url}`
                };
            }
            return link;
        });

        const result = await saveOrgSettings({ socialLinks: dataToSave });
        
        if (result && typeof result === 'object' && result.error) {
            return false;
        }
        
        if (result) {
            // Update originalData to match the formData (with URLs without https://)
            // This ensures the unsaved changes detection works correctly
            setOriginalData([...formData]);
            setFieldErrors({});
        }
        
        return !!result;
    };

    const handleDiscard = () => {
        setFormData([...originalData]);
        setFieldErrors({});
    };

    const hasFormChanges = JSON.stringify(originalData) !== JSON.stringify(formData);
    const hasChanges = hasFormChanges;

    const [saving, setSaving] = useState(false);

    const saveChanges = async () => {
        setSaving(true);
        try {
            const success = await handleSave();
            return success;
        } finally {
            setSaving(false);
        }
    };

    const discardChanges = () => {
        handleDiscard();
    };

    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (hasChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

    if (!hasAccess) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="settings-section">
                    <h2>Social Links</h2>
                    <div className="permission-warning">
                        <p>You don't have access to this organization's settings.</p>
                        <p>You must be a member with appropriate permissions to view settings.</p>
                    </div>
                </div>
            </div>
        );
    }

    const getTypeIcon = (type) => {
        switch (type) {
            case 'instagram':
                return 'mdi:instagram';
            case 'youtube':
                return 'mdi:youtube';
            case 'tiktok':
                return 'simple-icons:tiktok';
            case 'website':
                return 'mdi:web';
            default:
                return 'mdi:link';
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'instagram':
                return 'Instagram';
            case 'youtube':
                return 'YouTube';
            case 'tiktok':
                return 'TikTok';
            case 'website':
                return 'Website';
            default:
                return 'Link';
        }
    };

    const getPlaceholder = (type) => {
        switch (type) {
            case 'instagram':
                return 'username';
            case 'youtube':
                return 'username';
            case 'tiktok':
                return 'username';
            case 'website':
                return 'url';
            default:
                return '';
        }
    };

    const getPrefix = (type) => {
        switch (type) {
            case 'instagram':
                return '@';
            case 'youtube':
                return 'youtube.com/@';
            case 'tiktok':
                return '@';
            case 'website':
                return 'https://';
            default:
                return '';
        }
    };

    const getTooltip = (type) => {
        switch (type) {
            case 'instagram':
                return 'Enter your Instagram username (without @)';
            case 'youtube':
                return 'Enter your YouTube username or channel handle';
            case 'tiktok':
                return 'Enter your TikTok username (without @)';
            case 'website':
                return 'Enter the full URL (e.g., https://example.com)';
            default:
                return '';
        }
    };

    const availableTypes = getAvailableTypes();
    const canAddMore = availableTypes.length > 0;

    return (
        <div className="dash settings-section social-links-settings">
            <UnsavedChangesBanner
                hasChanges={hasChanges}
                onSave={saveChanges}
                onDiscard={discardChanges}
                saving={saving}
            />
            
            <header className="header">
                <h1>Social Links</h1>
                <p>Manage your organization's social media profiles and external links</p>
                <img src={AtlasMain} alt="" />
            </header>
            <div className="settings-content">
                <div className="social-links-section">
                    <div className="social-links-container">
                        {formData.length > 0 && (
                            <DraggableList
                                items={formData}
                                onReorder={handleReorder}
                                getItemId={(link) => link.id || link._id || `link-${link.type}-${link.order}`}
                                disabled={!canManageSettings}
                                className="links-list"
                                gap="12px"
                                renderItem={(link, index) => (
                                    <div className="link-row" data-link-type={link.type}>
                                        {canManageSettings && (
                                            <div className="drag-handle">
                                                <Icon icon="mdi:drag" />
                                            </div>
                                        )}
                                        <div className="link-icon-container">
                                            <Icon icon={getTypeIcon(link.type)} className="link-icon" />
                                        </div>
                                        
                                        {link.type === 'website' ? (
                                            <div className="website-inputs">
                                                <input
                                                    type="text"
                                                    placeholder="Title"
                                                    value={link.title || ''}
                                                    onChange={(e) => handleInputChange(index, 'title', e.target.value)}
                                                    disabled={!canManageSettings}
                                                    className={`link-input website-title-input ${fieldErrors[`${index}_title`] ? 'error' : ''}`}
                                                    title={getTooltip(link.type)}
                                                />
                                                <div className={`input-with-prefix website-url-input ${fieldErrors[`${index}_url`] ? 'error' : ''}`}>
                                                    <span className="input-prefix">https://</span>
                                                    <input
                                                        type="url"
                                                        placeholder=""
                                                        value={link.url || ''}
                                                        onChange={(e) => handleInputChange(index, 'url', e.target.value)}
                                                        disabled={!canManageSettings}
                                                        className="link-input prefix-input"
                                                        title={getTooltip(link.type)}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={`input-with-prefix ${fieldErrors[`${index}_username`] ? 'error' : ''}`}>
                                                <span className="input-prefix">{getPrefix(link.type)}</span>
                                                <input
                                                    type="text"
                                                    placeholder={getPlaceholder(link.type)}
                                                    value={link.username || ''}
                                                    onChange={(e) => handleInputChange(index, 'username', e.target.value)}
                                                    disabled={!canManageSettings}
                                                    className="link-input prefix-input"
                                                    title={getTooltip(link.type)}
                                                />
                                            </div>
                                        )}
                                        
                                        <button
                                            type="button"
                                            className="delete-btn"
                                            onClick={() => handleDeleteLink(index)}
                                            disabled={!canManageSettings}
                                            title="Delete link"
                                        >
                                            <Icon icon="mdi:delete" />
                                        </button>
                                        
                                        {(fieldErrors[`${index}_username`] || fieldErrors[`${index}_url`] || fieldErrors[`${index}_title`]) && (
                                            <div className="row-errors">
                                                {fieldErrors[`${index}_username`] && (
                                                    <span className="error-message">{fieldErrors[`${index}_username`]}</span>
                                                )}
                                                {fieldErrors[`${index}_url`] && (
                                                    <span className="error-message">{fieldErrors[`${index}_url`]}</span>
                                                )}
                                                {fieldErrors[`${index}_title`] && (
                                                    <span className="error-message">{fieldErrors[`${index}_title`]}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            />
                        )}
                        
                        {canAddMore && (
                            <div className="add-links-section">
                                <p className="add-label">Add Link:</p>
                                <div className="add-buttons">
                                    {availableTypes.includes('instagram') && (
                                        <button
                                            type="button"
                                            className="add-link-btn"
                                            onClick={() => handleAddLink('instagram')}
                                            disabled={!canManageSettings}
                                            title="Add Instagram"
                                        >
                                            <Icon icon="mdi:instagram" />
                                        </button>
                                    )}
                                    {availableTypes.includes('youtube') && (
                                        <button
                                            type="button"
                                            className="add-link-btn"
                                            onClick={() => handleAddLink('youtube')}
                                            disabled={!canManageSettings}
                                            title="Add YouTube"
                                        >
                                            <Icon icon="mdi:youtube" />
                                        </button>
                                    )}
                                    {availableTypes.includes('tiktok') && (
                                        <button
                                            type="button"
                                            className="add-link-btn"
                                            onClick={() => handleAddLink('tiktok')}
                                            disabled={!canManageSettings}
                                            title="Add TikTok"
                                        >
                                            <Icon icon="simple-icons:tiktok" />
                                        </button>
                                    )}
                                    {availableTypes.includes('website') && (
                                        <button
                                            type="button"
                                            className="add-link-btn"
                                            onClick={() => handleAddLink('website')}
                                            disabled={!canManageSettings}
                                            title="Add Website"
                                        >
                                            <Icon icon="mdi:web" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {!canAddMore && formData.length === 0 && (
                            <p className="no-links-message">No links added yet. Use the buttons above to add links.</p>
                        )}
                        
                        <div className="coming-soon-note">
                            <p>
                                <Icon icon="mdi:information-outline" />
                                <span>Analytics & more platforms coming soon! We're working on adding link analytics and support for additional social media platforms.</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SocialLinksSettings;

