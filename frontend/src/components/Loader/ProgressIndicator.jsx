import React, { useState, useEffect } from 'react';
import './ProgressIndicator.scss';

const ProgressIndicator = ({ 
    progress = 0, 
    total = 100, 
    message = 'Loading...',
    showPercentage = true,
    animated = true 
}) => {
    const [displayProgress, setDisplayProgress] = useState(0);
    
    useEffect(() => {
        if (animated) {
            const timer = setTimeout(() => {
                setDisplayProgress(progress);
            }, 100);
            return () => clearTimeout(timer);
        } else {
            setDisplayProgress(progress);
        }
    }, [progress, animated]);

    const percentage = Math.round((displayProgress / total) * 100);

    return (
        <div className="progress-indicator">
            <div className="progress-header">
                <span className="progress-message">{message}</span>
                {showPercentage && (
                    <span className="progress-percentage">{percentage}%</span>
                )}
            </div>
            <div className="progress-bar-container">
                <div 
                    className="progress-bar"
                    style={{ width: `${percentage}%` }}
                >
                    <div className="progress-bar-fill"></div>
                </div>
            </div>
        </div>
    );
};

export default ProgressIndicator;
