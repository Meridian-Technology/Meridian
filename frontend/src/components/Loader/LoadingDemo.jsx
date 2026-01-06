import React, { useState, useEffect } from 'react';
import EnhancedLoader from './EnhancedLoader';
import LoadingOverlay from './LoadingOverlay';
import ProgressIndicator from './ProgressIndicator';
import EventSkeleton from '../EventsList/EventSkeleton';
import './LoadingDemo.scss';

const LoadingDemo = () => {
    const [progress, setProgress] = useState(0);
    const [showOverlay, setShowOverlay] = useState(false);
    const [loadingType, setLoadingType] = useState('default');

    useEffect(() => {
        if (progress < 100) {
            const timer = setTimeout(() => {
                setProgress(prev => Math.min(prev + 10, 100));
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [progress]);

    const resetProgress = () => {
        setProgress(0);
    };

    const toggleOverlay = () => {
        setShowOverlay(!showOverlay);
    };

    return (
        <div className="loading-demo">
            <h2>Loading Components Demo</h2>
            
            <div className="demo-section">
                <h3>Enhanced Loaders</h3>
                <div className="loader-grid">
                    <div className="loader-item">
                        <h4>Default Loader</h4>
                        <EnhancedLoader type="default" message="Loading..." />
                    </div>
                    <div className="loader-item">
                        <h4>Events Loader</h4>
                        <EnhancedLoader type="events" message="Loading events..." />
                    </div>
                    <div className="loader-item">
                        <h4>Compact Loader</h4>
                        <EnhancedLoader type="compact" message="Loading..." />
                    </div>
                    <div className="loader-item">
                        <h4>Pulse Loader</h4>
                        <EnhancedLoader type="pulse" message="Processing..." />
                    </div>
                </div>
            </div>

            <div className="demo-section">
                <h3>Progress Indicator</h3>
                <div className="progress-demo">
                    <ProgressIndicator 
                        progress={progress} 
                        message="Loading data..." 
                    />
                    <button onClick={resetProgress} className="reset-btn">
                        Reset Progress
                    </button>
                </div>
            </div>

            <div className="demo-section">
                <h3>Event Skeleton</h3>
                <div className="skeleton-demo">
                    <EventSkeleton count={3} />
                </div>
            </div>

            <div className="demo-section">
                <h3>Loading Overlay</h3>
                <button onClick={toggleOverlay} className="overlay-btn">
                    {showOverlay ? 'Hide' : 'Show'} Overlay
                </button>
                <LoadingOverlay 
                    isVisible={showOverlay}
                    message="Loading overlay demo..."
                    type="events"
                />
            </div>

            <div className="demo-section">
                <h3>Loader Types</h3>
                <div className="type-selector">
                    <button 
                        onClick={() => setLoadingType('default')}
                        className={loadingType === 'default' ? 'active' : ''}
                    >
                        Default
                    </button>
                    <button 
                        onClick={() => setLoadingType('events')}
                        className={loadingType === 'events' ? 'active' : ''}
                    >
                        Events
                    </button>
                    <button 
                        onClick={() => setLoadingType('compact')}
                        className={loadingType === 'compact' ? 'active' : ''}
                    >
                        Compact
                    </button>
                    <button 
                        onClick={() => setLoadingType('pulse')}
                        className={loadingType === 'pulse' ? 'active' : ''}
                    >
                        Pulse
                    </button>
                </div>
                <div className="selected-loader">
                    <EnhancedLoader type={loadingType} message={`${loadingType} loading...`} />
                </div>
            </div>
        </div>
    );
};

export default LoadingDemo;
