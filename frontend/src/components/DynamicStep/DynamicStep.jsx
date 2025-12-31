import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DynamicFormField from '../DynamicFormField/DynamicFormField';
import RoomSelectorV2 from '../../pages/CreateEventV2/Steps/Where/RoomSelectorV2/RoomSelectorV2';
import When from '../../pages/CreateEventV2/Steps/When/When';
import './DynamicStep.scss';

const DynamicStep = ({ step, formData, setFormData, onComplete, formConfig }) => {
    const [errors, setErrors] = useState({});
    const [isValid, setIsValid] = useState(false);
    const prevFormDataRef = useRef(null);
    const onCompleteRef = useRef(onComplete);

    // Keep onComplete ref up to date
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    // Memoize fields for this step to prevent unnecessary re-renders
    const stepFields = useMemo(() => {
        return formConfig?.fields
            ?.filter(field => step.fields.includes(field.name) && field.isActive)
            .sort((a, b) => (a.order || 0) - (b.order || 0)) || [];
    }, [formConfig?.fields, step.fields]);

    // Special step handlers
    const isSpecialStep = (stepId) => {
        return stepId === 'location' || stepId === 'date-time';
    };

    // Validate step - accepts optional formDataOverride to validate with updated data
    const validateStep = useCallback((formDataOverride = null) => {
        const dataToValidate = formDataOverride || formData;
        const newErrors = {};
        let valid = true;

        // Special validation for special steps
        if (step.id === 'location') {
            valid = !!(dataToValidate.selectedRoomIds && dataToValidate.selectedRoomIds.length > 0);
        } else if (step.id === 'date-time') {
            valid = !!(dataToValidate.start_time && dataToValidate.end_time);
        } else {
            // Validate all fields in this step
            stepFields.forEach(field => {
                const value = dataToValidate[field.name];
                const isRequired = field.isRequired || field.validation?.required;

                if (isRequired) {
                    if (value === undefined || value === null || value === '') {
                        newErrors[field.name] = `${field.label} is required`;
                        valid = false;
                    }
                }

                // Additional validation
                if (value !== undefined && value !== null && value !== '') {
                    if (field.validation?.minLength && value.length < field.validation.minLength) {
                        newErrors[field.name] = `${field.label} must be at least ${field.validation.minLength} characters`;
                        valid = false;
                    }
                    if (field.validation?.maxLength && value.length > field.validation.maxLength) {
                        newErrors[field.name] = `${field.label} must be no more than ${field.validation.maxLength} characters`;
                        valid = false;
                    }
                    if (field.validation?.min !== undefined && typeof value === 'number' && value < field.validation.min) {
                        newErrors[field.name] = `${field.label} must be at least ${field.validation.min}`;
                        valid = false;
                    }
                    if (field.validation?.max !== undefined && typeof value === 'number' && value > field.validation.max) {
                        newErrors[field.name] = `${field.label} must be no more than ${field.validation.max}`;
                        valid = false;
                    }
                    if (field.validation?.pattern) {
                        const regex = new RegExp(field.validation.pattern);
                        if (!regex.test(value)) {
                            newErrors[field.name] = `${field.label} format is invalid`;
                            valid = false;
                        }
                    }
                }
            });
        }

        // Only update state if values actually changed
        setErrors(prevErrors => {
            const errorsChanged = JSON.stringify(prevErrors) !== JSON.stringify(newErrors);
            return errorsChanged ? newErrors : prevErrors;
        });
        
        setIsValid(prevValid => {
            if (prevValid !== valid) {
                // Defer onComplete call to avoid setState during render
                setTimeout(() => {
                    onCompleteRef.current(valid);
                }, 0);
                return valid;
            }
            return prevValid;
        });
    }, [step.id, stepFields, formData]);

    // Validate step when relevant formData fields change
    useEffect(() => {
        // Create a string representation of relevant formData fields for comparison
        const relevantFields = stepFields.map(f => formData[f.name]);
        const currentDataKey = JSON.stringify({
            stepId: step.id,
            fields: relevantFields,
            selectedRoomIds: formData.selectedRoomIds,
            start_time: formData.start_time,
            end_time: formData.end_time
        });

        const prevDataKey = prevFormDataRef.current;
        
        // Only validate if data actually changed
        if (prevDataKey !== currentDataKey) {
            prevFormDataRef.current = currentDataKey;
            validateStep();
        }
    }, [formData, stepFields, step.id, validateStep]);


    const handleFieldChange = useCallback((fieldName, value) => {
        // Update formData
        setFormData(prev => {
            const updated = {
                ...prev,
                [fieldName]: value
            };
            
            // Defer validation to avoid setState during render
            setTimeout(() => {
                validateStep(updated);
            }, 0);
            
            return updated;
        });
    }, [validateStep]);

        // Render special steps
        if (isSpecialStep(step.id)) {
            if (step.id === 'location') {
                return <RoomSelectorV2 formData={formData} setFormData={setFormData} onComplete={onComplete} />;
            } else if (step.id === 'date-time') {
                return <When formData={formData} setFormData={setFormData} onComplete={onComplete} />;
            }
        }

    // Render dynamic fields
    return (
        <div className="dynamic-step">
            <div className="step-fields">
                {stepFields.map(field => (
                    <DynamicFormField
                        key={field.name}
                        field={field}
                        value={formData[field.name]}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={errors}
                    />
                ))}
            </div>
        </div>
    );
};

export default DynamicStep;

