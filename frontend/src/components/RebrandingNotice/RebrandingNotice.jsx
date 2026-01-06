import React, { useState, useEffect } from 'react';
import './RebrandingNotice.scss';
import StudyCompassLogo from '../../assets/Brand Image/Logo.svg';
import MeridianLogo from '../../assets/Brand Image/BEACON.svg';
import { Icon } from '@iconify-icon/react';
import GradientTR from '../../assets/Gradients/RebrandTR.png';
import GradientBL from '../../assets/Gradients/RebrandBL.png';

const RebrandingNotice = () => {
    const [countdown, setCountdown] = useState(10);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Only show notice on study-compass.com domain (or localhost for development)
        const currentDomain = window.location.hostname;
        const isStudyCompassDomain = currentDomain === 'study-compass.com' || 
                                   currentDomain === 'www.study-compass.com' ||
                                   currentDomain === 'localhost' || 
                                   currentDomain.includes('127.0.0.1');
        
        // Allow testing with ?test-rebranding=true query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const isTestMode = urlParams.get('test-rebranding') === 'true';
        
        if (!isStudyCompassDomain && !isTestMode) {
            setIsVisible(false);
            return;
        }

        // Check if user has already seen the notice (skip this check in test mode)
        if (!isTestMode) {
            const hasSeenNotice = localStorage.getItem('hasSeenRebrandingNotice');
            if (hasSeenNotice) {
                setIsVisible(false);
                return;
            }
        }

        // Mark that user has seen the notice (only in non-test mode)
        if (!isTestMode) {
            localStorage.setItem('hasSeenRebrandingNotice', 'true');
        }

        // Countdown timer
        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    // Redirect to meridian.study
                    window.location.href = 'https://meridian.study';
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const handleSkipNow = () => {
        window.location.href = 'https://meridian.study';
    };

    if (!isVisible) {
        return null;
    }

    return (
        <div className="rebranding-notice-overlay">
            <div className="rebranding-notice">
                {/* <div className="notice-header">
                    <h2>Exciting News!</h2>
                </div> */}
                <img src={GradientTR} alt="Gradient" className="gradient tr" />
                <img src={GradientBL} alt="Gradient" className="gradient bl" />
                <div className="notice-content">
                    <p className="main-message">
                        <div className="logos">
                            <img src={StudyCompassLogo} alt="Study Compass Logo" className="study-compass-logo" /> 
                            <Icon icon="line-md:arrow-right" className="arrow-right" />
                            <img src={MeridianLogo} alt="Meridian Logo" className="meridian-logo" />
                        </div>
                        <p><strong className="study-compass-text">Study Compass</strong> is now under the umbrella of <strong className="meridian-text">Meridian</strong> to better encompass all areas of student life!</p>
                    </p>
                    
                    <div className="notice-details">
                        <div className="notice">
                            <Icon icon="mingcute:compass-fill" className="arrow-right" />
                            <p>Our core study room functionality is currently under maintenance and will be back soon</p>
                        </div>
                        <div className="notice">
                            <Icon icon="icomoon-free:books" className="icomoon-free:books" />
                            <p>We remain <strong>by students, for students</strong></p>
                        </div>
                        <div className="notice">
                            <Icon icon="majesticons:data" className="arrow-right" />
                            <p>Your accounts and data are safe and will be preserved</p>
                        </div>
                    </div>
                    
                    <div className="redirect-info">
                        <p>You will be redirected to <strong>meridian.study</strong> in <span className="countdown">{countdown}</span> seconds</p>
                    </div>
                </div>
                
                <div className="notice-actions">
                    <button className="skip-button" onClick={handleSkipNow}>
                        To Meridian!
                        <Icon icon="flowbite:rocket-solid" className="arrow-right" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RebrandingNotice;
