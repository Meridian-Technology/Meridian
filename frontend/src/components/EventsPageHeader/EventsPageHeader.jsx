import React, { useState, useEffect } from 'react';
import './EventsPageHeader.scss';

const EventsPageHeader = ({ 
    coverImage, 
    title = 'Events', 
    subtitle,
    titleStyle,
    subtitleStyle,
    isCompressed = false,
    isSticky = false,
    isLoading = false
}) => {
    const [imageLoaded, setImageLoaded] = useState(false);

    useEffect(() => {
        if (!coverImage) {
            setImageLoaded(false);
            return;
        }
        const img = new Image();
        img.onload = () => setImageLoaded(true);
        img.onerror = () => setImageLoaded(true);
        img.src = coverImage;
    }, [coverImage]);

    const titleStyles = titleStyle ? {
        color: titleStyle.color,
        fontSize: titleStyle.fontSize,
        fontWeight: titleStyle.fontWeight,
        fontFamily: titleStyle.fontFamily
    } : {};
    
    const subtitleStyles = subtitleStyle ? {
        color: subtitleStyle.color,
        fontSize: subtitleStyle.fontSize,
        fontWeight: subtitleStyle.fontWeight,
        fontFamily: subtitleStyle.fontFamily
    } : {};
    
    const showCoverImage = coverImage && imageLoaded && !isLoading;
    const showLoadingPlaceholder = isLoading || (coverImage && !imageLoaded);

    return (
        <header className={`events-page-header ${isCompressed ? 'compressed' : ''} ${isSticky ? 'sticky' : ''}`} role="banner">
            {showCoverImage ? (
                <div 
                    className="cover-image cover-image--loaded" 
                    style={{ backgroundImage: `url(${coverImage})` }}
                    aria-label="Events page cover"
                >
                    <div className="cover-overlay">
                        <div className="header-content">
                            {title && <h1 style={titleStyles}>{title}</h1>}
                            {subtitle && <p className="subtitle" style={subtitleStyles}>{subtitle}</p>}
                        </div>
                    </div>
                </div>
            ) : showLoadingPlaceholder ? (
                <div className="cover-image cover-image--loading" aria-label="Loading">
                    <div className="cover-overlay">
                        <div className="header-content">
                            {title && <h1 style={titleStyles}>{title}</h1>}
                            {subtitle && <p className="subtitle" style={subtitleStyles}>{subtitle}</p>}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="header-content no-image">
                    {title && <h1 style={titleStyles}>{title}</h1>}
                    {subtitle && <p className="subtitle" style={subtitleStyles}>{subtitle}</p>}
                </div>
            )}
        </header>
    );
};

export default EventsPageHeader;

