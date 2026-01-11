import React, { useState, useEffect } from 'react';
import './BannerImage.scss';
import ImageUpload from '../../../../components/ImageUpload/ImageUpload';
import Popup from '../../../../components/Popup/Popup';
import { Icon } from '@iconify-icon/react';

const BannerImage = ({ formData, setFormData, onComplete }) => {
    const [showBannerUploadPopup, setShowBannerUploadPopup] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);

    // Create preview from formData.bannerImage
    useEffect(() => {
        if (formData.bannerImage) {
            const reader = new FileReader();
            reader.onload = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(formData.bannerImage);
        } else {
            setImagePreview(null);
        }
    }, [formData.bannerImage]);

    // Mark step as complete on mount (optional step)
    useEffect(() => {
        onComplete(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFileSelect = (file) => {
        if (!file) return;
        
        // Save to formData immediately when image is selected
        setFormData(prev => ({ ...prev, bannerImage: file }));
        
        // Close popup after selection
        setShowBannerUploadPopup(false);
        
        // Mark step as complete since image requirement is fulfilled
        onComplete(true);
    };

    const handleRemoveImage = (e) => {
        e.stopPropagation();
        setFormData(prev => ({ ...prev, bannerImage: null }));
        // Still allow proceeding even without image (optional step)
        onComplete(true);
    };

    return (
        <div className="banner-image-step">
            <div className="form-section">
                <h3>Upload a banner image</h3>
                <p>Add a banner image to showcase your organization at the top of your page</p>
                
                <div className="image-preview-container">
                    <div 
                        className="current-image banner-image-editable"
                        onClick={() => setShowBannerUploadPopup(true)}
                    >
                        <div className="edit-icon-container banner-container">
                            {imagePreview ? (
                                <img 
                                    src={imagePreview} 
                                    alt="Organization banner" 
                                    className="banner-preview"
                                />
                            ) : (
                                <div className="upload-placeholder banner-placeholder">
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
                    Click the image above to upload a new banner image. This image will be displayed at the top of your organization's page. Recommended size: 1200x300px. You can always change it later.
                </p>
            </div>

            <Popup
                isOpen={showBannerUploadPopup}
                onClose={() => setShowBannerUploadPopup(false)}
                customClassName="image-upload-popup"
                defaultStyling={false}
            >
                <div className="image-upload-popup-content">
                    <h2>Upload Banner Image</h2>
                    <ImageUpload
                        value={formData.bannerImage}
                        onFileSelect={handleFileSelect}
                        uploadText="Drag and Drop to Upload"
                        maxSize={5}
                        showPrompt={true}
                        previewImageParams={{ shape: 'rectangle' }}
                        showActions={false}
                    />
                </div>
            </Popup>
        </div>
    );
};

export default BannerImage;
