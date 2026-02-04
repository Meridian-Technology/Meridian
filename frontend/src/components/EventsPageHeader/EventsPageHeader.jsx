import React from 'react';
import './EventsPageHeader.scss';

const EventsPageHeader = ({ 
    coverImage, 
    title = 'Events', 
    subtitle,
    titleStyle,
    subtitleStyle,
    isCompressed = false,
    isSticky = false
}) => {
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
    
    return (
        <header className={`events-page-header ${isCompressed ? 'compressed' : ''} ${isSticky ? 'sticky' : ''}`} role="banner">
            {coverImage ? (
                <div 
                    className="cover-image" 
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

