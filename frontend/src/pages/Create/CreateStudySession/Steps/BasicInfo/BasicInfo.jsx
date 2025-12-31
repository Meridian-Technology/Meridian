import React, { useEffect } from 'react';
import './BasicInfo.scss';

const BasicInfo = ({ formData, setFormData, onComplete }) => {
    
    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleVisibilityChange = (value) => {
        handleInputChange('visibility', value);
    };

    // Call onComplete once on mount - validation is handled by FlowComponentV2
    useEffect(() => {
        onComplete(true);
    }, []);

    return (
        <div className="basic-info-step">
            <div className="form-section">
                <h3>Study Session Details</h3>
                <p>Let's start with the basic information about your study session.</p>
                
                <div className="form-group">
                    <label htmlFor="title">Session Title *</label>
                    <input
                        id="title"
                        type="text"
                        placeholder="e.g., Calculus Midterm Prep"
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        maxLength={100}
                    />
                    <span className="char-count">{formData.title.length}/100</span>
                </div>

                <div className="form-group">
                    <label htmlFor="course">Course/Subject *</label>
                    <input
                        id="course"
                        type="text"
                        placeholder="e.g., MATH-1010, Computer Science, Biology"
                        value={formData.course}
                        onChange={(e) => handleInputChange('course', e.target.value)}
                        maxLength={100}
                    />
                    <span className="char-count">{formData.course.length}/100</span>
                </div>

                <div className="form-group">
                    <label htmlFor="description">Description</label>
                    <textarea
                        id="description"
                        placeholder="Describe what you'll be studying, topics to cover, or any specific goals..."
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        rows={4}
                        maxLength={1000}
                    />
                    <span className="char-count">{formData.description.length}/1000</span>
                </div>

                <div className="form-group">
                    <label>Visibility *</label>
                    <div className="visibility-options">
                        <div 
                            className={`visibility-option ${formData.visibility === 'public' ? 'selected' : ''}`}
                            onClick={() => handleVisibilityChange('public')}
                        >
                            <div className="option-content">
                                <h4>Public</h4>
                                <p>Anyone can discover and join this study session</p>
                            </div>
                        </div>
                        <div 
                            className={`visibility-option ${formData.visibility === 'private' ? 'selected' : ''}`}
                            onClick={() => handleVisibilityChange('private')}
                        >
                            <div className="option-content">
                                <h4>Private</h4>
                                <p>Only people you invite can see and join</p>
                            </div>
                        </div>
                    </div>
                    <p className="help-text">Choose who can see and join your study session</p>
                </div>
            </div>
        </div>
    );
};

export default BasicInfo;