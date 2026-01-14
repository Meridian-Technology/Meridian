import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import './SocialLinks.scss';

const SocialLinks = ({ formData, setFormData, onComplete }) => {
    const [links, setLinks] = useState(formData.socialLinks || []);
    const [fieldErrors, setFieldErrors] = useState({});

    useEffect(() => {
        setFormData(prev => ({ ...prev, socialLinks: links }));
    }, [links, setFormData]);

    useEffect(() => {
        // Social links are optional, so always allow proceeding once component is mounted (user has visited this step)
        onComplete(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getAvailableTypes = () => {
        const usedTypes = links.map(link => link.type);
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
            type,
            username: type !== 'website' ? '' : undefined,
            url: type === 'website' ? '' : undefined,
            title: type === 'website' ? '' : undefined,
            order: links.length
        };
        setLinks([...links, newLink]);
    };

    const handleDeleteLink = (index) => {
        const newLinks = links.filter((_, i) => i !== index);
        newLinks.forEach((link, i) => {
            link.order = i;
        });
        setLinks(newLinks);
        const newErrors = { ...fieldErrors };
        delete newErrors[`${index}_username`];
        delete newErrors[`${index}_url`];
        delete newErrors[`${index}_title`];
        setFieldErrors(newErrors);
    };

    const handleInputChange = (index, field, value) => {
        const newLinks = [...links];
        
        if (field === 'url' && newLinks[index].type === 'website') {
            value = value.replace(/^https?:\/\//i, '');
        }
        
        newLinks[index] = {
            ...newLinks[index],
            [field]: value
        };
        setLinks(newLinks);
        
        const errorKey = `${index}_${field}`;
        if (fieldErrors[errorKey]) {
            setFieldErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[errorKey];
                return newErrors;
            });
        }
    };

    const handleMoveUp = (index) => {
        if (index === 0) return;
        const newLinks = [...links];
        [newLinks[index - 1], newLinks[index]] = [newLinks[index], newLinks[index - 1]];
        newLinks.forEach((link, i) => {
            link.order = i;
        });
        setLinks(newLinks);
    };

    const handleMoveDown = (index) => {
        if (index === links.length - 1) return;
        const newLinks = [...links];
        [newLinks[index], newLinks[index + 1]] = [newLinks[index + 1], newLinks[index]];
        newLinks.forEach((link, i) => {
            link.order = i;
        });
        setLinks(newLinks);
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'instagram': return 'mdi:instagram';
            case 'youtube': return 'mdi:youtube';
            case 'tiktok': return 'simple-icons:tiktok';
            case 'website': return 'mdi:web';
            default: return 'mdi:link';
        }
    };

    const getPrefix = (type) => {
        switch (type) {
            case 'instagram': return '@';
            case 'youtube': return 'youtube.com/@';
            case 'tiktok': return '@';
            case 'website': return 'https://';
            default: return '';
        }
    };

    const getPlaceholder = (type) => {
        switch (type) {
            case 'instagram': return 'username';
            case 'youtube': return 'username';
            case 'tiktok': return 'username';
            case 'website': return 'url';
            default: return '';
        }
    };

    const availableTypes = getAvailableTypes();
    const canAddMore = availableTypes.length > 0;

    return (
        <div className="social-links-step">
            <div className="form-section">
                <h3>Add social links (optional)</h3>
                <p>Connect your organization's social media profiles and external links</p>
                
                <div className="social-links-container">
                    {links.length > 0 && (
                        <div className="links-list">
                            {links.map((link, index) => (
                                <div key={index} className="link-row" data-link-type={link.type}>
                                    <div className="link-controls">
                                        <button
                                            type="button"
                                            className="move-btn move-up"
                                            onClick={() => handleMoveUp(index)}
                                            disabled={index === 0}
                                            title="Move up"
                                        >
                                            <Icon icon="mdi:chevron-up" />
                                        </button>
                                        <button
                                            type="button"
                                            className="move-btn move-down"
                                            onClick={() => handleMoveDown(index)}
                                            disabled={index === links.length - 1}
                                            title="Move down"
                                        >
                                            <Icon icon="mdi:chevron-down" />
                                        </button>
                                    </div>
                                    
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
                                                className={`link-input website-title-input ${fieldErrors[`${index}_title`] ? 'error' : ''}`}
                                            />
                                            <div className={`input-with-prefix website-url-input ${fieldErrors[`${index}_url`] ? 'error' : ''}`}>
                                                <span className="input-prefix">https://</span>
                                                <input
                                                    type="url"
                                                    placeholder=""
                                                    value={link.url || ''}
                                                    onChange={(e) => handleInputChange(index, 'url', e.target.value)}
                                                    className="link-input prefix-input"
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
                                                className="link-input prefix-input"
                                            />
                                        </div>
                                    )}
                                    
                                    <button
                                        type="button"
                                        className="delete-btn"
                                        onClick={() => handleDeleteLink(index)}
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
                            ))}
                        </div>
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
                                        title="Add Website"
                                    >
                                        <Icon icon="mdi:web" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {!canAddMore && links.length === 0 && (
                        <p className="no-links-message">No links added yet. Use the buttons above to add links.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SocialLinks;

