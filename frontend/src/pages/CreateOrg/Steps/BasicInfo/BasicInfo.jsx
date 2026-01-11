import React, { useState, useEffect } from 'react';
import './BasicInfo.scss';
import check from '../../../../assets/Icons/Check.svg';
import waiting from '../../../../assets/Icons/Waiting.svg';
import error from '../../../../assets/circle-warning.svg';
import unavailable from '../../../../assets/Icons/Circle-X.svg';
import postRequest from '../../../../utils/postRequest';

const BasicInfo = ({ formData, setFormData, onComplete }) => {
    const [name, setName] = useState(formData.name || '');
    const [description, setDescription] = useState(formData.description || '');
    const [nameValid, setNameValid] = useState(null);
    const [nameError, setNameError] = useState('');
    const [errors, setErrors] = useState({});
    const [nameTouched, setNameTouched] = useState(false);
    const [descriptionTouched, setDescriptionTouched] = useState(false);

    const validOrgName = async (orgName) => {
        try {
            const response = await postRequest('/check-org-name', { orgName });
            
            if (response.error) {
                const errorWithCode = new Error(response.error);
                errorWithCode.code = response.code;
                throw errorWithCode;
            }
            
            setNameValid(1);
            setNameError('');
            return response.valid;
        } catch (error) {
            setNameValid(3);
            setNameError(error.message);
            return false;
        }
    };

    useEffect(() => {
        // Always save the name to formData when it changes
        setFormData(prev => ({ ...prev, name }));

        // Only validate if the field has been touched
        if (!nameTouched) {
            onComplete(false);
            return;
        }

        if (name === '') {
            setNameValid(3);
            setNameError('Org name is required');
            onComplete(false);
            return;
        }
        setNameValid(0);
        setNameError('');
        
        const timeoutId = setTimeout(() => {
            validOrgName(name).then(isValid => {
                // Name is already saved above, validation just updates the status
            });
        }, 500);

        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, nameTouched]);


    useEffect(() => {
        // Always save description to formData when it changes
        setFormData(prev => ({ ...prev, description }));

        const newErrors = {};
        
        // Only show errors if the field has been touched
        if (descriptionTouched) {
            if (!description.trim()) {
                newErrors.description = 'Description is required';
            } else if (description.length < 10) {
                newErrors.description = 'Description must be at least 10 characters';
            } else if (description.length > 500) {
                newErrors.description = 'Description must be 500 characters or less';
            }
        }

        setErrors(newErrors);

        // Only validate completion if both fields have been touched
        const isValid = nameTouched && descriptionTouched &&
                       nameValid === 1 && 
                       name.trim() && 
                       description.trim() && 
                       description.length >= 10 && 
                       description.length <= 500 &&
                       Object.keys(newErrors).length === 0;

        onComplete(isValid);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, description, nameValid, nameTouched, descriptionTouched]);

    const handleNameChange = (e) => {
        setNameTouched(true);
        setName(e.target.value);
    };

    const handleNameBlur = () => {
        setNameTouched(true);
    };

    const handleDescChange = (e) => {
        setDescriptionTouched(true);
        const value = e.target.value;
        if (value.length <= 500) {
            setDescription(value);
        }
    };

    const handleDescBlur = () => {
        setDescriptionTouched(true);
    };

    return (
        <div className="basic-info-step">
            <div className="form-section">
                <h3>What should we call your organization?</h3>
                <p>This name will be publicly visible to users, and should be unique as well</p>
                
                <div className="input-group">
                    <label htmlFor="orgName">Organization Name</label>
                    <div className="username-input">
                        <input
                            id="orgName"
                            type="text"
                            value={name}
                            onChange={handleNameChange}
                            onBlur={handleNameBlur}
                            className={`text-input ${nameTouched && nameValid === 3 ? 'error' : ''}`}
                            placeholder="Enter organization name"
                        />
                        {nameTouched && (
                            <div className="status">
                                {nameValid === 0 && (
                                    <div className="checking">
                                        <img src={waiting} alt="" />
                                        <p className="checking-text">checking name...</p>
                                    </div>
                                )}
                                {nameValid === 1 && (
                                    <div className="available">
                                        <img src={check} alt="" />
                                        <p className="checking-text">name is available</p>
                                    </div>
                                )}
                                {nameValid === 3 && (
                                    <div className="invalid">
                                        <img src={error} alt="" />
                                        <p className="checking-text">{nameError}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="input-group">
                    <label htmlFor="description">Description</label>
                    <textarea
                        id="description"
                        value={description}
                        onChange={handleDescChange}
                        onBlur={handleDescBlur}
                        className={`text-input ${descriptionTouched && errors.description ? 'error' : ''}`}
                        placeholder="Tell us a little bit about your organization"
                        rows={6}
                        maxLength={500}
                    />
                    <div className="char-count">
                        {description.length}/500 characters
                    </div>
                    {descriptionTouched && errors.description && (
                        <span className="error-message">{errors.description}</span>
                    )}
                    <p className="help-text">
                        Give users a description of what your org is about, feel free to be descriptive!
                    </p>
                </div>
            </div>
        </div>
    );
};

export default BasicInfo;

