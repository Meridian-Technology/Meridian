import React, { useState, useEffect } from 'react';
import ImageUpload from '../ImageUpload/ImageUpload';
import './DynamicFormField.scss';

const DynamicFormField = ({ field, value, onChange, formData, errors = {} }) => {
    // Normalize value to never be null - use empty string instead
    const normalizeValue = (val) => {
        if (val === null || val === undefined) {
            return field.validation?.defaultValue || '';
        }
        return val;
    };
    
    const [localValue, setLocalValue] = useState(normalizeValue(value));

    useEffect(() => {
        const normalized = normalizeValue(value);
        if (normalized !== localValue) {
            setLocalValue(normalized);
        }
    }, [value]);

    const handleChange = (newValue) => {
        setLocalValue(newValue);
        onChange(field.name, newValue);
    };

    const shouldShow = () => {
        if (!field.conditional || !field.conditional.dependsOn) {
            return true;
        }
        const dependentValue = formData[field.conditional.dependsOn];
        if (Array.isArray(field.conditional.showWhen)) {
            return field.conditional.showWhen.includes(dependentValue);
        }
        return dependentValue === field.conditional.showWhen;
    };

    if (!shouldShow()) {
        return null;
    }

    const renderField = () => {
        switch (field.inputType) {
            case 'text':
            case 'email':
            case 'tel':
            case 'url':
                return (
                    <input
                        type={field.inputType}
                        id={field.name}
                        value={localValue === null || localValue === undefined ? '' : localValue}
                        onChange={(e) => handleChange(e.target.value)}
                        placeholder={field.placeholder || ''}
                        className={errors[field.name] ? 'error' : ''}
                        maxLength={field.validation?.maxLength}
                        minLength={field.validation?.minLength}
                        pattern={field.validation?.pattern}
                        required={field.isRequired || field.validation?.required}
                    />
                );

            case 'number':
                return (
                    <input
                        type="number"
                        id={field.name}
                        value={localValue === null || localValue === undefined ? '' : localValue}
                        onChange={(e) => handleChange(parseFloat(e.target.value) || 0)}
                        placeholder={field.placeholder || ''}
                        className={errors[field.name] ? 'error' : ''}
                        min={field.validation?.min}
                        max={field.validation?.max}
                        required={field.isRequired || field.validation?.required}
                    />
                );

            case 'range':
                const rangeValue = localValue === null || localValue === undefined ? (field.validation?.min || 0) : localValue;
                return (
                    <div className="range-field">
                        <div className="range-value-display">
                            <input
                                type="text"
                                value={rangeValue}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || field.validation?.min || 0;
                                    const clamped = Math.max(
                                        field.validation?.min || 0,
                                        Math.min(field.validation?.max || 10000, val)
                                    );
                                    handleChange(clamped);
                                }}
                                className="range-preview"
                                style={{
                                    position: 'absolute',
                                    left: `${((rangeValue - (field.validation?.min || 0)) / ((field.validation?.max || 10000) - (field.validation?.min || 0))) * 100}%`,
                                    transform: 'translateX(-50%)',
                                }}
                            />
                        </div>
                        <input
                            type="range"
                            id={field.name}
                            value={rangeValue}
                            onChange={(e) => handleChange(parseInt(e.target.value))}
                            className={errors[field.name] ? 'error' : ''}
                            min={field.validation?.min || 1}
                            max={field.validation?.max || 10000}
                            required={field.isRequired || field.validation?.required}
                        />
                        <div className="range-labels">
                            <span>{field.validation?.min || 1}</span>
                            <span>{field.validation?.max || 10000}+</span>
                        </div>
                    </div>
                );

            case 'textarea':
                return (
                    <textarea
                        id={field.name}
                        value={localValue === null || localValue === undefined ? '' : localValue}
                        onChange={(e) => handleChange(e.target.value)}
                        placeholder={field.placeholder || ''}
                        className={errors[field.name] ? 'error' : ''}
                        rows={4}
                        maxLength={field.validation?.maxLength}
                        minLength={field.validation?.minLength}
                        required={field.isRequired || field.validation?.required}
                    />
                );

            case 'select':
                return (
                    <select
                        id={field.name}
                        value={localValue === null || localValue === undefined ? '' : localValue}
                        onChange={(e) => handleChange(e.target.value)}
                        className={errors[field.name] ? 'error' : ''}
                        required={field.isRequired || field.validation?.required}
                    >
                        <option value="">Select an option</option>
                        {field.validation?.options?.map((option, index) => (
                            <option key={index} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                );

            case 'checkbox':
                return (
                    <label className="checkbox-field">
                        <input
                            type="checkbox"
                            id={field.name}
                            checked={localValue || false}
                            onChange={(e) => handleChange(e.target.checked)}
                            className={errors[field.name] ? 'error' : ''}
                            required={field.isRequired || field.validation?.required}
                        />
                        <span>{field.description || field.label}</span>
                    </label>
                );

            case 'datetime-local':
                return (
                    <input
                        type="datetime-local"
                        id={field.name}
                        value={localValue ? new Date(localValue).toISOString().slice(0, 16) : ''}
                        onChange={(e) => handleChange(new Date(e.target.value).toISOString())}
                        className={errors[field.name] ? 'error' : ''}
                        required={field.isRequired || field.validation?.required}
                    />
                );

            case 'date':
                return (
                    <input
                        type="date"
                        id={field.name}
                        value={localValue ? new Date(localValue).toISOString().slice(0, 10) : ''}
                        onChange={(e) => handleChange(new Date(e.target.value).toISOString())}
                        className={errors[field.name] ? 'error' : ''}
                        required={field.isRequired || field.validation?.required}
                    />
                );

            case 'time':
                return (
                    <input
                        type="time"
                        id={field.name}
                        value={localValue || ''}
                        onChange={(e) => handleChange(e.target.value)}
                        className={errors[field.name] ? 'error' : ''}
                        required={field.isRequired || field.validation?.required}
                    />
                );

            case 'file':
            case 'image':
                return (
                    <ImageUpload
                        uploadText={field.placeholder || "Drag your image here"}
                        onFileSelect={(file) => handleChange(file)}
                        onFileClear={() => handleChange(null)}
                        showPrompt={false}
                    />
                );

            case 'location':
                // This is a special case - we'll need to handle location selection
                // For now, treat it as a text input
                return (
                    <input
                        type="text"
                        id={field.name}
                        value={localValue === null || localValue === undefined ? '' : localValue}
                        onChange={(e) => handleChange(e.target.value)}
                        placeholder={field.placeholder || 'Enter location'}
                        className={errors[field.name] ? 'error' : ''}
                        required={field.isRequired || field.validation?.required}
                    />
                );

            default:
                return (
                    <input
                        type="text"
                        id={field.name}
                        value={localValue === null || localValue === undefined ? '' : localValue}
                        onChange={(e) => handleChange(e.target.value)}
                        placeholder={field.placeholder || ''}
                        className={errors[field.name] ? 'error' : ''}
                        required={field.isRequired || field.validation?.required}
                    />
                );
        }
    };

    return (
        <div className={`dynamic-form-field ${field.type}`}>
            <label htmlFor={field.name}>
                {field.label}
                {(field.isRequired || field.validation?.required) && (
                    <span className="required-indicator">*</span>
                )}
            </label>
            {field.description && (
                <p className="field-description">{field.description}</p>
            )}
            {renderField()}
            {errors[field.name] && (
                <span className="error-message">{errors[field.name]}</span>
            )}
            {field.helpText && (
                <p className="help-text">{field.helpText}</p>
            )}
        </div>
    );
};

export default DynamicFormField;

