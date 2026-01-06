import React from 'react';
import EnhancedLoader from './EnhancedLoader';
import './LoadingOverlay.scss';

const LoadingOverlay = ({ 
    isVisible, 
    message = 'Loading...', 
    type = 'default',
    blurBackground = true,
    zIndex = 1000 
}) => {
    if (!isVisible) return null;

    return (
        <div 
            className={`loading-overlay ${blurBackground ? 'blur' : ''}`}
            style={{ zIndex }}
        >
            <div className="overlay-content">
                <EnhancedLoader 
                    type={type} 
                    message={message} 
                    size="medium"
                />
            </div>
        </div>
    );
};

export default LoadingOverlay;
