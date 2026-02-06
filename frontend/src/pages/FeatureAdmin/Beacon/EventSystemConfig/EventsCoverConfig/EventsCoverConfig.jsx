import React, { useState } from 'react';
import './EventsCoverConfig.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNotification } from '../../../../../NotificationContext';
import EventsPageHeader from '../../../../../components/EventsPageHeader/EventsPageHeader';

const EventsCoverConfig = ({ config, onChange }) => {
    const { addNotification } = useNotification();
    const coverImage = config?.explorePage?.coverImage || null;
    const isUrl = coverImage && coverImage.startsWith('http');
    const [imagePreview, setImagePreview] = useState(coverImage);
    const [inputMethod, setInputMethod] = useState(isUrl ? 'url' : 'upload');
    const [imageUrl, setImageUrl] = useState(isUrl ? coverImage : '');
    
    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                addNotification({
                    title: 'Invalid File',
                    message: 'Please select an image file',
                    type: 'error'
                });
                return;
            }
            
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                addNotification({
                    title: 'File Too Large',
                    message: 'Image must be less than 5MB',
                    type: 'error'
                });
                return;
            }
            
            // Create preview
            const reader = new FileReader();
            reader.onloadend = () => {
                const imageUrl = reader.result;
                setImagePreview(imageUrl);
                onChange({
                    explorePage: {
                        ...config?.explorePage,
                        coverImage: imageUrl
                    }
                });
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleRemoveImage = () => {
        setImagePreview(null);
        setImageUrl('');
        onChange({
            explorePage: {
                ...config?.explorePage,
                coverImage: null
            }
        });
    };
    
    const handleUrlChange = (e) => {
        const url = e.target.value;
        setImageUrl(url);
        
        // Validate URL format
        if (url && isValidImageUrl(url)) {
            setImagePreview(url);
            onChange({
                explorePage: {
                    ...config?.explorePage,
                    coverImage: url
                }
            });
        } else if (!url) {
            setImagePreview(null);
            onChange({
                explorePage: {
                    ...config?.explorePage,
                    coverImage: null
                }
            });
        }
    };
    
    const isValidImageUrl = (url) => {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch {
            return false;
        }
    };
    
    const handleInputMethodChange = (method) => {
        setInputMethod(method);
        if (method === 'url') {
            // If switching to URL and we have an existing image URL, populate it
            if (coverImage && coverImage.startsWith('http')) {
                setImageUrl(coverImage);
                setImagePreview(coverImage);
            } else {
                // Clear preview if switching from upload to URL without a URL set
                setImageUrl('');
                setImagePreview(null);
                onChange({
                    explorePage: {
                        ...config?.explorePage,
                        coverImage: null
                    }
                });
            }
        } else {
            // If switching to upload, clear URL input but keep preview if it's a data URL
            if (coverImage && !coverImage.startsWith('http')) {
                setImagePreview(coverImage);
            } else {
                setImageUrl('');
                setImagePreview(null);
                onChange({
                    explorePage: {
                        ...config?.explorePage,
                        coverImage: null
                    }
                });
            }
        }
    };
    
    const handleTitleChange = (e) => {
        onChange({
            explorePage: {
                ...config?.explorePage,
                title: e.target.value
            }
        });
    };
    
    const handleSubtitleChange = (e) => {
        onChange({
            explorePage: {
                ...config?.explorePage,
                subtitle: e.target.value
            }
        });
    };
    
    const handleTitleStyleChange = (property, value) => {
        onChange({
            explorePage: {
                ...config?.explorePage,
                titleStyle: {
                    ...config?.explorePage?.titleStyle,
                    [property]: value
                }
            }
        });
    };
    
    const handleSubtitleStyleChange = (property, value) => {
        onChange({
            explorePage: {
                ...config?.explorePage,
                subtitleStyle: {
                    ...config?.explorePage?.subtitleStyle,
                    [property]: value
                }
            }
        });
    };
    
    const currentConfig = config?.explorePage || {};
    
    return (
        <div className="events-cover-config">
            <div className="config-section">
                <h2>Explore Page Header</h2>
                <p className="section-description">
                    Customize the header image and text displayed on the events explore page
                </p>
                
                {/* Live Preview */}
                <div className="preview-section">
                    <h3>
                        <Icon icon="mdi:eye" />
                        Live Preview
                    </h3>
                    <div className="preview-container">
                        <EventsPageHeader
                            coverImage={currentConfig.coverImage}
                            title={currentConfig.title || 'Events'}
                            subtitle={currentConfig.subtitle}
                            titleStyle={currentConfig.titleStyle}
                            subtitleStyle={currentConfig.subtitleStyle}
                        />
                    </div>
                </div>
                
                <div className="form-group">
                    <label htmlFor="cover-image">
                        <Icon icon="mdi:image" />
                        Cover Image
                    </label>
                    
                    {/* Input method toggle */}
                    <div className="input-method-toggle">
                        <button
                            type="button"
                            className={`toggle-btn ${inputMethod === 'upload' ? 'active' : ''}`}
                            onClick={() => handleInputMethodChange('upload')}
                        >
                            <Icon icon="mdi:upload" />
                            Upload Image
                        </button>
                        <button
                            type="button"
                            className={`toggle-btn ${inputMethod === 'url' ? 'active' : ''}`}
                            onClick={() => handleInputMethodChange('url')}
                        >
                            <Icon icon="mdi:link" />
                            Image URL
                        </button>
                    </div>
                    
                    {inputMethod === 'upload' ? (
                        <div className="image-upload-area">
                            {imagePreview && !imagePreview.startsWith('http') ? (
                                <div className="image-preview">
                                    <img src={imagePreview} alt="Cover preview" />
                                    <button 
                                        type="button" 
                                        className="remove-image"
                                        onClick={handleRemoveImage}
                                        aria-label="Remove cover image"
                                    >
                                        <Icon icon="mdi:close" />
                                    </button>
                                </div>
                            ) : (
                                <label htmlFor="cover-image-input" className="upload-placeholder">
                                    <Icon icon="mdi:image-plus" />
                                    <span>Click to upload cover image</span>
                                    <span className="hint">Recommended: 1920x400px, max 5MB</span>
                                </label>
                            )}
                            <input
                                id="cover-image-input"
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                style={{ display: 'none' }}
                            />
                        </div>
                    ) : (
                        <div className="url-input-area">
                            <input
                                id="cover-image-url"
                                type="url"
                                value={imageUrl}
                                onChange={handleUrlChange}
                                placeholder="https://example.com/image.jpg"
                                className="url-input"
                            />
                            {imageUrl && !isValidImageUrl(imageUrl) && (
                                <p className="error-message">
                                    <Icon icon="mdi:alert-circle" />
                                    Please enter a valid URL (must start with http:// or https://)
                                </p>
                            )}
                            {imagePreview && imagePreview.startsWith('http') && (
                                <div className="image-preview">
                                    <img src={imagePreview} alt="Cover preview" onError={() => {
                                        addNotification({
                                            title: 'Image Error',
                                            message: 'Failed to load image from URL',
                                            type: 'error'
                                        });
                                    }} />
                                    <button 
                                        type="button" 
                                        className="remove-image"
                                        onClick={handleRemoveImage}
                                        aria-label="Remove cover image"
                                    >
                                        <Icon icon="mdi:close" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                {/* Text Configuration Section */}
                <div className="text-config-section">
                    <h3 className="section-subtitle">
                        <Icon icon="mdi:text" />
                        Text Configuration
                    </h3>
                    
                    <div className="form-group">
                        <label htmlFor="page-title">
                            <Icon icon="mdi:format-title" />
                            Title (Line 1)
                        </label>
                        <input
                            id="page-title"
                            type="text"
                            value={config?.explorePage?.title || 'Events'}
                            onChange={handleTitleChange}
                            placeholder="Events"
                            maxLength={100}
                        />
                        <p className="field-hint">Main title displayed on the first line</p>
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="page-subtitle">
                            <Icon icon="mdi:text" />
                            Subtitle (Line 2 - Optional)
                        </label>
                        <input
                            id="page-subtitle"
                            type="text"
                            value={config?.explorePage?.subtitle || ''}
                            onChange={handleSubtitleChange}
                            placeholder="Discover events happening around campus"
                            maxLength={200}
                        />
                        <p className="field-hint">Subtitle displayed on the second line below the title</p>
                    </div>
                </div>
                
                {/* Title Styling */}
                <div className="form-group styling-group">
                    <label>
                        <Icon icon="mdi:format-font" />
                        Title Styling
                    </label>
                    <div className="style-controls">
                        <div className="style-control">
                            <label htmlFor="title-color">Color</label>
                            <input
                                id="title-color"
                                type="color"
                                value={currentConfig.titleStyle?.color || '#ffffff'}
                                onChange={(e) => handleTitleStyleChange('color', e.target.value)}
                            />
                        </div>
                        <div className="style-control">
                            <label htmlFor="title-size">Font Size</label>
                            <input
                                id="title-size"
                                type="text"
                                value={currentConfig.titleStyle?.fontSize || '48px'}
                                onChange={(e) => handleTitleStyleChange('fontSize', e.target.value)}
                                placeholder="48px"
                            />
                        </div>
                        <div className="style-control">
                            <label htmlFor="title-weight">Font Weight</label>
                            <select
                                id="title-weight"
                                value={currentConfig.titleStyle?.fontWeight || '700'}
                                onChange={(e) => handleTitleStyleChange('fontWeight', e.target.value)}
                            >
                                <option value="300">Light (300)</option>
                                <option value="400">Regular (400)</option>
                                <option value="500">Medium (500)</option>
                                <option value="600">Semi Bold (600)</option>
                                <option value="700">Bold (700)</option>
                                <option value="800">Extra Bold (800)</option>
                                <option value="900">Black (900)</option>
                            </select>
                        </div>
                        <div className="style-control">
                            <label htmlFor="title-font">Font Family</label>
                            <select
                                id="title-font"
                                value={currentConfig.titleStyle?.fontFamily || 'Satoshi'}
                                onChange={(e) => handleTitleStyleChange('fontFamily', e.target.value)}
                            >
                                <option value="Satoshi">Satoshi</option>
                                <option value="Inter">Inter</option>
                                <option value="Arial">Arial</option>
                                <option value="Helvetica">Helvetica</option>
                                <option value="Georgia">Georgia</option>
                                <option value="Times New Roman">Times New Roman</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                {/* Subtitle Styling */}
                <div className="form-group styling-group">
                    <label>
                        <Icon icon="mdi:format-font" />
                        Subtitle Styling
                    </label>
                    <div className="style-controls">
                        <div className="style-control">
                            <label htmlFor="subtitle-color">Color</label>
                            <input
                                id="subtitle-color"
                                type="color"
                                value={currentConfig.subtitleStyle?.color || 'rgba(255, 255, 255, 0.95)'}
                                onChange={(e) => handleSubtitleStyleChange('color', e.target.value)}
                            />
                        </div>
                        <div className="style-control">
                            <label htmlFor="subtitle-size">Font Size</label>
                            <input
                                id="subtitle-size"
                                type="text"
                                value={currentConfig.subtitleStyle?.fontSize || '18px'}
                                onChange={(e) => handleSubtitleStyleChange('fontSize', e.target.value)}
                                placeholder="18px"
                            />
                        </div>
                        <div className="style-control">
                            <label htmlFor="subtitle-weight">Font Weight</label>
                            <select
                                id="subtitle-weight"
                                value={currentConfig.subtitleStyle?.fontWeight || '400'}
                                onChange={(e) => handleSubtitleStyleChange('fontWeight', e.target.value)}
                            >
                                <option value="300">Light (300)</option>
                                <option value="400">Regular (400)</option>
                                <option value="500">Medium (500)</option>
                                <option value="600">Semi Bold (600)</option>
                                <option value="700">Bold (700)</option>
                            </select>
                        </div>
                        <div className="style-control">
                            <label htmlFor="subtitle-font">Font Family</label>
                            <select
                                id="subtitle-font"
                                value={currentConfig.subtitleStyle?.fontFamily || 'Inter'}
                                onChange={(e) => handleSubtitleStyleChange('fontFamily', e.target.value)}
                            >
                                <option value="Inter">Inter</option>
                                <option value="Satoshi">Satoshi</option>
                                <option value="Arial">Arial</option>
                                <option value="Helvetica">Helvetica</option>
                                <option value="Georgia">Georgia</option>
                                <option value="Times New Roman">Times New Roman</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EventsCoverConfig;

