import React, { useState, useEffect } from 'react';
import './ProfileImage.scss';
import ImageUpload from '../../../../components/ImageUpload/ImageUpload';
import Popup from '../../../../components/Popup/Popup';
import { Icon } from '@iconify-icon/react';

const ProfileImage = ({ formData, setFormData, onComplete }) => {
    const [showImageUploadPopup, setShowImageUploadPopup] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);

    // Create preview from formData.profileImage
    useEffect(() => {
        if (formData.profileImage) {
            const reader = new FileReader();
            reader.onload = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(formData.profileImage);
        } else {
            setImagePreview(null);
        }
    }, [formData.profileImage]);

    // Mark step as complete on mount (optional step)
    useEffect(() => {
        onComplete(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFileSelect = (file) => {
        if (!file) return;
        
        // Save to formData immediately when image is selected
        setFormData(prev => ({ ...prev, profileImage: file }));
        
        // Close popup after selection
        setShowImageUploadPopup(false);
        
        // Mark step as complete since image requirement is fulfilled
        onComplete(true);
    };

    const handleRemoveImage = (e) => {
        e.stopPropagation();
        setFormData(prev => ({ ...prev, profileImage: null }));
        // Still allow proceeding even without image (optional step)
        onComplete(true);
    };

    return (
        <div className="profile-image-step">
            <div className="form-section">
                <h3>Upload a profile picture</h3>
                <p>Let's make it feel like home in here, feel free to customize your logo!</p>
                
                <div className="image-preview-container">
                    <div 
                        className="current-image profile-image-editable"
                        onClick={() => setShowImageUploadPopup(true)}
                    >
                        <div className="edit-icon-container">
                            {imagePreview ? (
                                <img 
                                    src={imagePreview} 
                                    alt="Organization profile" 
                                />
                            ) : (
                                <div className="upload-placeholder">
                                    <Icon icon="mdi:image-plus" className="upload-placeholder-icon" />
                                </div>
                            )}
                            <Icon icon="mdi:pencil" className="edit-icon" />
                            {imagePreview && (
                                <button 
                                    className="remove-image-button"
                                    onClick={handleRemoveImage}
                                    type="button"
                                    aria-label="Remove image"
                                >
                                    <Icon icon="mdi:close" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                
                <p className="help-text">
                    Click the image above to upload a new profile picture. This image will be displayed as your organization's profile picture. You can always change it later.
                </p>
            </div>

            <Popup
                isOpen={showImageUploadPopup}
                onClose={() => setShowImageUploadPopup(false)}
                customClassName="image-upload-popup"
                defaultStyling={false}
            >
                <div className="image-upload-popup-content">
                    <h2>Upload Profile Picture</h2>
                    <ImageUpload
                        value={formData.profileImage}
                        onFileSelect={handleFileSelect}
                        uploadText="Drag and Drop to Upload"
                        maxSize={5}
                        showPrompt={true}
                        previewImageParams={{ shape: 'circle' }}
                        showActions={false}
                    />
                </div>
            </Popup>
        </div>
    );
};

export default ProfileImage;
