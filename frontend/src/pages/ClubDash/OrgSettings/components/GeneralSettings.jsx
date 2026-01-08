import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrgPermissions, useOrgSave } from './settingsHelpers';
import { useGradient } from '../../../../hooks/useGradient';
import UnsavedChangesBanner from '../../../../components/UnsavedChangesBanner/UnsavedChangesBanner';
import SettingsList from '../../../../components/SettingsList/SettingsList';
import ImageUpload from '../../../../components/ImageUpload/ImageUpload';
import Popup from '../../../../components/Popup/Popup';
import { Icon } from '@iconify-icon/react';
import './GeneralSettings.scss';

const GeneralSettings = ({ org, expandedClass }) => {
    const location = useLocation();
    const [formData, setFormData] = useState({
        org_name: '',
        org_description: '',
        org_profile_image: '',
        org_banner_image: '',
        weekly_meeting: '',
        positions: []
    });
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [canManageSettings, setCanManageSettings] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [selectedBannerFile, setSelectedBannerFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    const [bannerPreview, setBannerPreview] = useState('');
    const [showImageUploadPopup, setShowImageUploadPopup] = useState(false);
    const [showBannerUploadPopup, setShowBannerUploadPopup] = useState(false);
    const [isInvalidImageType, setIsInvalidImageType] = useState(false);
    const [isInvalidBannerImageType, setIsInvalidBannerImageType] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
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

    const [originalData, setOriginalData] = useState({
        org_name: '',
        org_description: '',
        org_profile_image: '',
        org_banner_image: '',
        weekly_meeting: '',
        positions: []
    });

    const initializeFormData = () => {
        if (org) {
            const initialData = {
                org_name: org.org_name || '',
                org_description: org.org_description || '',
                org_profile_image: org.org_profile_image || '',
                org_banner_image: org.org_banner_image || '',
                weekly_meeting: org.weekly_meeting || '',
                positions: org.positions || []
            };
            setFormData(initialData);
            setOriginalData(initialData);
            setImagePreview(org.org_profile_image || '');
            setBannerPreview(org.org_banner_image || '');
        }
    };

    // Valid image MIME types (matching backend validation)
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    const validateImageType = (file) => {
        return ALLOWED_IMAGE_TYPES.includes(file.type);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        // Clear field error when user starts typing
        if (fieldErrors[name]) {
            setFieldErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[name];
                return newErrors;
            });
        }
    };

    const handleFileSelect = (file) => {
        if (!file) return;
        
        // Validate image type
        const isValidType = validateImageType(file);
        setIsInvalidImageType(!isValidType);
        
        if (!isValidType) {
            // Still show preview but mark as invalid
            const reader = new FileReader();
            reader.onload = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
            setSelectedFile(file); // Keep file so user can see the error
            return;
        }
        
        // Valid file - clear any previous errors
        setIsInvalidImageType(false);
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = () => {
            setImagePreview(reader.result);
        };
        reader.readAsDataURL(file);
        
        // Clear image field error if it exists
        if (fieldErrors.org_profile_image) {
            setFieldErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors.org_profile_image;
                return newErrors;
            });
        }
    };

    const handleImageUploadFromPopup = (file) => {
        handleFileSelect(file);
        // Don't close popup if invalid image type so user can see the error
        if (file && validateImageType(file)) {
            setShowImageUploadPopup(false);
        }
    };

    const handleBannerFileSelect = (file) => {
        if (!file) return;
        
        // Validate image type
        const isValidType = validateImageType(file);
        setIsInvalidBannerImageType(!isValidType);
        
        if (!isValidType) {
            // Still show preview but mark as invalid
            const reader = new FileReader();
            reader.onload = () => {
                setBannerPreview(reader.result);
            };
            reader.readAsDataURL(file);
            setSelectedBannerFile(file); // Keep file so user can see the error
            return;
        }
        
        // Valid file - clear any previous errors
        setIsInvalidBannerImageType(false);
        setSelectedBannerFile(file);
        const reader = new FileReader();
        reader.onload = () => {
            setBannerPreview(reader.result);
        };
        reader.readAsDataURL(file);
        
        // Clear banner image field error if it exists
        if (fieldErrors.org_banner_image) {
            setFieldErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors.org_banner_image;
                return newErrors;
            });
        }
    };

    const handleBannerImageUploadFromPopup = (file) => {
        handleBannerFileSelect(file);
        // Don't close popup if invalid image type so user can see the error
        if (file && validateImageType(file)) {
            setShowBannerUploadPopup(false);
        }
    };

    const handleSave = async () => {
        if (!canManageSettings) {
            return false;
        }

        // Validate image types before saving
        if (selectedFile && !validateImageType(selectedFile)) {
            setFieldErrors(prev => ({
                ...prev,
                org_profile_image: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
            }));
            setIsInvalidImageType(true);
            return false;
        }

        if (selectedBannerFile && !validateImageType(selectedBannerFile)) {
            setFieldErrors(prev => ({
                ...prev,
                org_banner_image: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
            }));
            setIsInvalidBannerImageType(true);
            return false;
        }

        // Clear any previous field errors
        setFieldErrors({});

        const oldOrgName = originalData.org_name;
        const newOrgName = formData.org_name;

        const result = await saveOrgSettings(formData, selectedFile, selectedBannerFile);
        
        // Check if result contains error information
        if (result && typeof result === 'object' && result.error) {
            // Handle field-specific errors
            if (result.field) {
                setFieldErrors(prev => ({
                    ...prev,
                    [result.field]: result.message || 'Invalid input'
                }));
                
                // If it's an image error, mark image as invalid
                if (result.field === 'org_profile_image' || result.message?.toLowerCase().includes('image') || result.message?.toLowerCase().includes('file type')) {
                    if (result.field === 'org_banner_image') {
                        setIsInvalidBannerImageType(true);
                    } else {
                        setIsInvalidImageType(true);
                    }
                }
            }
            return false;
        }
        
        if (result) {
            // Get the cleaned org name from the response if available, otherwise use formData
            const savedOrgName = (result && typeof result === 'object' && result.org_name) 
                ? result.org_name 
                : newOrgName;
            
            // Get the updated image URLs from the response if available
            const savedImageUrl = (result && typeof result === 'object' && result.org_profile_image)
                ? result.org_profile_image
                : (selectedFile ? imagePreview : formData.org_profile_image);
            
            const savedBannerUrl = (result && typeof result === 'object' && result.org_banner_image)
                ? result.org_banner_image
                : (selectedBannerFile ? bannerPreview : formData.org_banner_image);
            
            // Update originalData to match the saved formData so unsaved changes banner disappears
            const updatedFormData = (result && typeof result === 'object' && result.org_name)
                ? { ...formData, org_name: savedOrgName, org_profile_image: savedImageUrl, org_banner_image: savedBannerUrl }
                : { ...formData, org_profile_image: savedImageUrl, org_banner_image: savedBannerUrl };
            
            setOriginalData(updatedFormData);
            setFormData(updatedFormData);
            
            // Clear selectedFiles after successful save
            setSelectedFile(null);
            setSelectedBannerFile(null);
            setIsInvalidImageType(false);
            setIsInvalidBannerImageType(false);
            // Clear any field errors on successful save
            setFieldErrors({});
            // Update imagePreviews to use the actual URLs if we got them from the response
            if (result && typeof result === 'object' && result.org_profile_image) {
                setImagePreview(result.org_profile_image);
            }
            if (result && typeof result === 'object' && result.org_banner_image) {
                setBannerPreview(result.org_banner_image);
            }
            
            // If the org name changed, navigate to the new route with a full page reload
            // This ensures ClubDash refetches the org data with the new name
            if (oldOrgName && savedOrgName && oldOrgName !== savedOrgName) {
                // Preserve query parameters if any exist
                const searchParams = location.search;
                const newPath = `/club-dashboard/${encodeURIComponent(savedOrgName)}${searchParams}`;
                
                // Add a small delay to allow React to process state updates and clear unsaved changes
                // This prevents the "leaving this page may cause data loss" warning
                setTimeout(() => {
                    // Use window.location.href for full page reload to ensure data is refetched
                    window.location.href = newPath;
                }, 100); // 100ms delay should be enough for state updates to process
                
                return true; // Return true but navigation will happen via page reload
            }
        }
        return !!result;
    };

    const handleDiscard = () => {
        // Reset to original values
        setFormData({ ...originalData });
        setSelectedFile(null);
        setSelectedBannerFile(null);
        setImagePreview(originalData.org_profile_image || '');
        setBannerPreview(originalData.org_banner_image || '');
        setIsInvalidImageType(false);
        setIsInvalidBannerImageType(false);
        setFieldErrors({});
    };

    // Enhanced change detection that includes file uploads
    const hasFormChanges = JSON.stringify(originalData) !== JSON.stringify(formData);
    const hasFileChanges = selectedFile !== null || selectedBannerFile !== null;
    const hasChanges = hasFormChanges || hasFileChanges;

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

    // Prevent navigation when there are unsaved changes
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
                        className={fieldErrors.org_name ? 'error' : ''}
                    />
                    {fieldErrors.org_name && (
                        <span className="error-message">{fieldErrors.org_name}</span>
                    )}
                </div>
            )
        },
        {
            title: 'Description',
            subtitle: 'A brief description of your organization',
            action: (
                <div className="form-group">
                    <div className="textarea-wrapper">
                        <textarea
                            id="org_description"
                            name="org_description"
                            value={formData.org_description}
                            onChange={handleInputChange}
                            disabled={!canManageSettings}
                            placeholder="Describe your organization"
                            rows={4}
                            maxLength={500}
                            className={fieldErrors.org_description ? 'error' : ''}
                        />
                        <span className="char-count">{formData.org_description.length}/500</span>
                    </div>
                    {fieldErrors.org_description && (
                        <span className="error-message">{fieldErrors.org_description}</span>
                    )}
                </div>
            )
        },
        {
            title: 'Weekly Meeting Time - NOTE: on reoccuring meeting refactor replace this with a create event button that creates popup for event creation w/ reoccurance embeded.',
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
                        className={fieldErrors.weekly_meeting ? 'error' : ''}
                    />
                    {fieldErrors.weekly_meeting && (
                        <span className="error-message">{fieldErrors.weekly_meeting}</span>
                    )}
                </div>
            )
        },
        {
            title: 'Profile Picture',
            subtitle: 'Upload an image that represents your organization',
            action: (
                <div className="form-group">
                    <div 
                        className={`current-image profile-image-editable ${isInvalidImageType || fieldErrors.org_profile_image ? 'invalid-image' : ''}`}
                        onClick={() => canManageSettings && setShowImageUploadPopup(true)}
                        style={{ cursor: canManageSettings ? 'pointer' : 'default' }}
                    >
                        <div className={`edit-icon-container ${canManageSettings ? '' : 'read-only'}`}>
                            <img 
                                src={imagePreview || '/Logo.svg'} 
                                alt="Organization profile" 
                            />
                            {canManageSettings && (
                                <>
                                    <Icon icon="mdi:pencil" className="edit-icon" />
                                    {isInvalidImageType && (
                                        <div className="invalid-image-overlay">
                                            <p className="invalid-image-message">improper image type</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                    {fieldErrors.org_profile_image && (
                        <span className="error-message">{fieldErrors.org_profile_image}</span>
                    )}
                </div>
            )
        },
        {
            title: 'Banner Image',
            subtitle: 'Upload a banner image for your organization',
            action: (
                <div className="form-group">
                    <div 
                        className={`current-image banner-image-editable ${isInvalidBannerImageType || fieldErrors.org_banner_image ? 'invalid-image' : ''}`}
                        onClick={() => canManageSettings && setShowBannerUploadPopup(true)}
                        style={{ cursor: canManageSettings ? 'pointer' : 'default' }}
                    >
                        <div className={`edit-icon-container banner-container ${canManageSettings ? '' : 'read-only'}`}>
                            <img 
                                src={bannerPreview || '/Logo.svg'} 
                                alt="Organization banner" 
                                className="banner-preview"
                            />
                            {canManageSettings && (
                                <>
                                    <Icon icon="mdi:pencil" className="edit-icon" />
                                    {isInvalidBannerImageType && (
                                        <div className="invalid-image-overlay">
                                            <p className="invalid-image-message">improper image type</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                    {fieldErrors.org_banner_image && (
                        <span className="error-message">{fieldErrors.org_banner_image}</span>
                    )}
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

            <Popup
                isOpen={showImageUploadPopup}
                onClose={() => {
                    setShowImageUploadPopup(false);
                    // Clear invalid image state when closing popup if no file selected
                    if (!selectedFile) {
                        setIsInvalidImageType(false);
                    }
                }}
                customClassName="image-upload-popup"
                defaultStyling={false}
            >
                <div className="image-upload-popup-content">
                    <h2>Upload Profile Picture</h2>
                    <ImageUpload
                        onFileSelect={handleImageUploadFromPopup}
                        uploadText="Upload new profile picture"
                        maxSize={5}
                        showPrompt={true}
                        previewImageParams={{ shape: 'circle' }}
                        showActions={false}
                    />
                    {isInvalidImageType && (
                        <div className="popup-error-message">
                            <Icon icon="mdi:alert-circle" />
                            <span>Invalid file type. Only JPEG, PNG, and WebP images are allowed.</span>
                        </div>
                    )}
                </div>
            </Popup>

            <Popup
                isOpen={showBannerUploadPopup}
                onClose={() => {
                    setShowBannerUploadPopup(false);
                    // Clear invalid image state when closing popup if no file selected
                    if (!selectedBannerFile) {
                        setIsInvalidBannerImageType(false);
                    }
                }}
                customClassName="image-upload-popup"
                defaultStyling={false}
            >
                <div className="image-upload-popup-content">
                    <h2>Upload Banner Image</h2>
                    <ImageUpload
                        onFileSelect={handleBannerImageUploadFromPopup}
                        uploadText="Upload new banner image"
                        maxSize={5}
                        showPrompt={true}
                        previewImageParams={{ shape: 'rectangle' }}
                        showActions={false}
                    />
                    {isInvalidBannerImageType && (
                        <div className="popup-error-message">
                            <Icon icon="mdi:alert-circle" />
                            <span>Invalid file type. Only JPEG, PNG, and WebP images are allowed.</span>
                        </div>
                    )}
                </div>
            </Popup>
        </div>
    );
};

export default GeneralSettings; 