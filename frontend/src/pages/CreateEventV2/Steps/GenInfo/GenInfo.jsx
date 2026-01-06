import React, { useState, useEffect } from 'react';
import './GenInfo.scss';
import Global from '../../../../assets/Icons/Global.svg';
import Internal from '../../../../assets/Icons/Internal.svg';
import InviteOnly from '../../../../assets/Icons/InviteOnly.svg';
import ImageUpload from '../../../../components/ImageUpload/ImageUpload';

const GenInfo = ({ formData, setFormData, onComplete }) => {
    console.log('GenInfo formData:', formData);
    const [errors, setErrors] = useState({});
    // update this to have max passed in
    const [maxAttendance, setMaxAttendance] = useState(10000);

    // content updated on this page
    const [title, setTitle] = useState(formData.name || '');
    const [description, setDescription] = useState(formData.description || '');
    const [eventType, setEventType] = useState(formData.type || "");
    const [visibility, setVisibility] = useState(formData.visibility || "");
    const [expectedAttendance, setExpectedAttendance] = useState(formData.expectedAttendance || 1);
    

    // Image upload state
    const [selectedFile, setSelectedFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    // Update local state when formData changes (for edit mode)
    useEffect(() => {
        if (formData.name !== title) setTitle(formData.name || '');
        if (formData.description !== description) setDescription(formData.description || '');
        if (formData.type !== eventType) setEventType(formData.type || '');
        if (formData.visibility !== visibility) setVisibility(formData.visibility || '');
        if (formData.expectedAttendance !== expectedAttendance) setExpectedAttendance(formData.expectedAttendance || '');
    }, [formData.name, formData.description, formData.type, formData.visibility, formData.expectedAttendance]);

    // Validate form when any field changes
    useEffect(() => {
        validateForm();
    }, [title, description, eventType, visibility, expectedAttendance]);

    const validateForm = () => {
        const newErrors = {};

        if (!title.trim()) {
            newErrors.title = 'Title is required';
        } else if (title.length < 3) {
            newErrors.title = 'Title must be at least 3 characters';
        } else if (title.length > 100) {
            newErrors.title = 'Title must be 100 characters or less';
        }

        if (!description.trim()) {
            newErrors.description = 'Description is required';
        } else if (description.length < 10) {
            newErrors.description = 'Description must be at least 10 characters';
        }

        if (!eventType) {
            newErrors.eventType = 'Event type is required';
        }

        if (!visibility) {
            newErrors.visibility = 'Visibility is required';
        }

        if (!expectedAttendance || expectedAttendance <= 0) {
            newErrors.expectedAttendance = 'Expected attendance is required and must be greater than 0';
        }

        setErrors(newErrors);

        const isValid = Object.keys(newErrors).length === 0 && 
                       title.trim() && 
                       description.trim() &&
                       eventType &&
                       visibility &&
                       expectedAttendance > 0;

        console.log('GenInfo validation result:', isValid);
        onComplete(isValid);
    };

    const handleTitleChange = (e) => {
        const value = e.target.value;
        setTitle(value);
        setFormData(prev => ({ ...prev, name: value }));
    };

    const handleDescriptionChange = (e) => {
        const value = e.target.value;
        setDescription(value);
        setFormData(prev => ({ ...prev, description: value }));
    };

    const handleEventTypeChange = (value) => {
        setEventType(value);
        setFormData(prev => ({ ...prev, type: value }));
    };

    const handleVisibilityChange = (value) => {
        setVisibility(value);
        setFormData(prev => ({ ...prev, visibility: value }));
    };

    const handleExpectedAttendanceChange = (e) => {
        if(parseInt(e.target.value) <= maxAttendance+1){
            const value = parseInt(e.target.value) || 0;
            setExpectedAttendance(value);
            setFormData(prev => ({ ...prev, expectedAttendance: value }));
        } else {
            const value = maxAttendance;
            setExpectedAttendance(value);
            setFormData(prev => ({ ...prev, expectedAttendance: value }));
            // ERROR: give an error saying you're at max
        }

    };

    const handleFileSelect = (file) => {
        setSelectedFile(file);
        setFormData(prev => ({ ...prev, image: file }));
        // Create a preview URL for the image
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleFileClear = () => {
        setSelectedFile(null);
        setImagePreview(null);
        setFormData(prev => ({ ...prev, image: null }));
    };

    return (
        <div className="title-desc-step">
            <div className="form-section">
                <div className="input-group">
                    <label htmlFor="title">Event Title</label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={handleTitleChange}
                        placeholder="Enter your event title"
                        className={errors.title ? 'error' : ''}
                        maxLength={100}
                    />
                    {errors.title && (
                        <span className="error-message">{errors.title}</span>
                    )}
                    <p className="help-text">
                        Choose a clear, descriptive title that explains what your event is about
                    </p>
                </div>

                <div className="input-group">
                    <label htmlFor="description">Description</label>
                    <textarea
                        id="description"
                        value={description}
                        onChange={handleDescriptionChange}
                        placeholder="Tell us a little about your event"
                        className={errors.description ? 'error' : ''}
                        rows={4}
                    />
                    {errors.description && (
                        <span className="error-message">{errors.description}</span>
                    )}
                    <p className="help-text">
                        Explain what your event is about, what you're trying to achieve, and how others can get involved
                    </p>
                </div>

                <div className="input-group">
                    <label>Event Type</label>
                    <div className="event-type-options">
                        <div 
                            className={`event-type-option ${eventType === "study" ? "selected" : ""}`} 
                            onClick={() => handleEventTypeChange("study")}
                        >
                            Study Event
                        </div>
                        <div 
                            className={`event-type-option ${eventType === "workshop" ? "selected" : ""}`} 
                            onClick={() => handleEventTypeChange("workshop")}
                        >
                            Workshop
                        </div>
                        <div 
                            className={`event-type-option ${eventType === "campus" ? "selected" : ""}`} 
                            onClick={() => handleEventTypeChange("campus")}
                        >
                            Campus Event
                        </div>
                        <div 
                            className={`event-type-option ${eventType === "social" ? "selected" : ""}`} 
                            onClick={() => handleEventTypeChange("social")}
                        >
                            Social Event
                        </div>
                        <div 
                            className={`event-type-option ${eventType === "club" ? "selected" : ""}`} 
                            onClick={() => handleEventTypeChange("club")}
                        >
                            Club Event
                        </div>
                        <div 
                            className={`event-type-option ${eventType === "meeting" ? "selected" : ""}`} 
                            onClick={() => handleEventTypeChange("meeting")}
                        >
                            Club Meeting
                        </div>
                        <div 
                            className={`event-type-option ${eventType === "sports" ? "selected" : ""}`} 
                            onClick={() => handleEventTypeChange("sports")}
                        >
                            Sports Event
                        </div>
                    </div>
                    {errors.eventType && (
                        <span className="error-message">{errors.eventType}</span>
                    )}
                    <p className="help-text">
                        Choose the category that best describes your event
                    </p>
                </div>

                <div className="input-group">
                    <label>Event Visibility</label>
                    <div className="visibility-options">
                        <div 
                            className={`visibility-option ${visibility === "public" ? "selected" : ""}`} 
                            onClick={() => handleVisibilityChange("public")}
                        >
                            <img src={Global} alt="Public" />
                            <div className="option-content">
                                <h3>Public</h3>
                                <p>Visible to the entire student body</p>
                            </div>
                        </div>
                        <div 
                            className={`visibility-option ${visibility === "internal" ? "selected" : ""}`} 
                            onClick={() => handleVisibilityChange("internal")}
                        >
                            <img src={Internal} alt="Internal" />
                            <div className="option-content">
                                <h3>Internal</h3>
                                <p>Only visible to members of your org</p>
                            </div>
                        </div>
                        <div 
                            className={`visibility-option ${visibility === "inviteOnly" ? "selected" : ""}`} 
                            onClick={() => handleVisibilityChange("inviteOnly")}
                        >
                            <img src={InviteOnly} alt="Invite Only" />
                            <div className="option-content">
                                <h3>Invite Only</h3>
                                <p>Only visible to invited students</p>
                            </div>
                        </div>
                    </div>
                    {errors.visibility && (
                        <span className="error-message">{errors.visibility}</span>
                    )}
                    <p className="help-text">
                        Choose who can see and join your event
                    </p>
                </div>

                <div className="input-group">
                    <label htmlFor="expectedAttendance">Expected Attendance</label>
                    <div className="slider-container">
                        <div className="slider-value">
                            <input
                                id="sliderPreview"
                                type="text"
                                value={expectedAttendance}
                                onChange={handleExpectedAttendanceChange}
                                className="slider-preview"
                                style={{
                                    position: 'absolute',
                                    left: `${((expectedAttendance - 1) / (maxAttendance - 1)) * 100}%`,
                                    transform: 'translateX(-50%)',
                                    transition: 'none',
                                }}
                            />
                        </div>
                        <input
                            id="expectedAttendance"
                            type="range"
                            min="1"
                            max={maxAttendance}
                            value={expectedAttendance}
                            onChange={handleExpectedAttendanceChange}
                            className={errors.expectedAttendance ? 'error' : ''}
                        />
                        <div className="slider-labels">
                            <span>1</span>
                            <span>10,000+</span>
                        </div>
                        {/* <div className="slider-value">
                            {expectedAttendance === 10000 ? '10,000+' : expectedAttendance.toLocaleString()} people
                        </div> */}
                    </div>
                    {errors.expectedAttendance && (
                        <span className="error-message">{errors.expectedAttendance}</span>
                    )}
                    <p className="help-text">
                        Estimate the number of people you expect to attend
                    </p>
                </div>

                <div className="input-group">
                    <label>Event Flier</label>
                    <ImageUpload 
                        uploadText="Drag your image here" 
                        onFileSelect={handleFileSelect}
                        onFileClear={handleFileClear}
                        showPrompt={false}
                    />
                    <p className="help-text">
                        Upload an image to promote your event (optional)
                    </p>
                </div>
            </div>

            <div className="tips-section">
                <h4>Preview Your Event</h4>
                <p>Use the preview to see how your event will look once published. You can always come back and edit it later.</p>
            </div>
        </div>
    );
};

export default GenInfo; 