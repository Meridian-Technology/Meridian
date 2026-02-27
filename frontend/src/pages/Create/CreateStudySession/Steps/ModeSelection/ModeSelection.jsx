import React, { useEffect, useRef } from 'react';
import { Icon } from '@iconify-icon/react';
import StudySessionDrafts from '../../Components/StudySessionDrafts/StudySessionDrafts';
import useAuth from '../../../../../hooks/useAuth';
import './ModeSelection.scss';

const ModeSelection = ({ formData, setFormData, onComplete }) => {
    const { user } = useAuth();
    const onCompleteRef = useRef(onComplete);
    
    // Keep ref updated
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);
    
    const handleModeChange = (mode) => {
        setFormData(prev => ({
            ...prev,
            sessionMode: mode
        }));
    };

    // Call onComplete once mode is selected
    useEffect(() => {
        if (formData.sessionMode) {
            onCompleteRef.current(true);
        } else {
            onCompleteRef.current(false);
        }
    }, [formData.sessionMode]);

    return (
        <div className="mode-selection-step">
            <div className="form-section">
                <h3>How would you like to schedule?</h3>
                <p>Choose how you want to organize your study session.</p>
                
                <div className="mode-options">
                    <div 
                        className={`mode-option ${formData.sessionMode === 'schedule' ? 'selected' : ''}`}
                        onClick={() => handleModeChange('schedule')}
                    >
                        <div className="mode-icon">
                            <Icon icon="mingcute:calendar-check-fill" />
                        </div>
                        <div className="mode-content">
                            <h4>Schedule Now</h4>
                            <p>Set a specific date and time for your study session. Perfect when you know exactly when you want to meet.</p>
                            <ul className="mode-features">
                                <li><Icon icon="mingcute:check-fill" /> Immediate scheduling</li>
                                <li><Icon icon="mingcute:check-fill" /> Event created right away</li>
                                <li><Icon icon="mingcute:check-fill" /> Direct RSVP</li>
                            </ul>
                        </div>
                    </div>
                    
                    <div 
                        className={`mode-option ${formData.sessionMode === 'poll' ? 'selected' : ''}`}
                        onClick={() => handleModeChange('poll')}
                    >
                        <div className="mode-icon">
                            <Icon icon="mingcute:time-fill" />
                        </div>
                        <div className="mode-content">
                            <h4>Poll for Availability</h4>
                            <p>Let participants vote on their preferred times. You'll finalize the session after everyone responds.</p>
                            <ul className="mode-features">
                                <li><Icon icon="mingcute:check-fill" /> Multiple time options</li>
                                <li><Icon icon="mingcute:check-fill" /> Group consensus</li>
                                <li><Icon icon="mingcute:check-fill" /> Finalize later</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                {/* Study Session Drafts */}
                <StudySessionDrafts userId={user?.userId || user?._id} />
            </div>
        </div>
    );
};

export default ModeSelection;

