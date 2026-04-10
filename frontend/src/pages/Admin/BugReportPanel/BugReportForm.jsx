import React, { useState, useRef, useCallback } from 'react';
import './BugReportForm.scss';
import { useGradient } from '../../../hooks/useGradient';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const CATEGORY_OPTIONS = [
    { value: '', label: 'Select a category' },
    { value: 'user-interface', label: 'User Interface' },
    { value: 'backend', label: 'Backend' },
    { value: 'performance', label: 'Performance' },
    { value: 'data', label: 'Data / Reporting' },
    { value: 'other', label: 'Other' },
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function BugReportForm() {
    const { AdminGrad } = useGradient();
    const fileInputRef = useRef(null);
    const dragDepthRef = useRef(0);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imageError, setImageError] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);

    const applyFile = useCallback((file) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setImageError('Please choose an image file.');
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setImageError('File must be 5MB or smaller.');
            return;
        }
        setImageError('');
        setImageFile(file);
    }, []);

    const handleImageInputChange = (e) => {
        const file = e.target.files?.[0] ?? null;
        if (file) applyFile(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = 0;
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) applyFile(file);
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current += 1;
        setIsDragOver(true);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current -= 1;
        if (dragDepthRef.current <= 0) {
            dragDepthRef.current = 0;
            setIsDragOver(false);
        }
    };

    const clearImage = () => {
        setImageFile(null);
        setImageError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const openFilePicker = () => fileInputRef.current?.click();

    const handleSubmit = (e) => {
        e.preventDefault();
    };

    return (
        <div className="bug-report-form dash">
            <header className="header">
                <h1>Bug Report Form</h1>
                <p>Use this form to report any bugs or issues you encounter</p>
                <img src={AdminGrad} alt="" />
            </header>

            <form className="bug-report-form__body" onSubmit={handleSubmit}>
                <div className="bug-report-form__field">
                    <label htmlFor="bug-report-title">
                        Title
                        <span className="required-indicator" aria-hidden="true">
                            *
                        </span>
                    </label>
                    <input
                        id="bug-report-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        autoComplete="off"
                        placeholder="title summary of the issue"
                    />
                </div>

                <div className="bug-report-form__field">
                    <label htmlFor="bug-report-description">
                        Description
                        <span className="required-indicator" aria-hidden="true">
                            *
                        </span>
                    </label>
                    <textarea
                        id="bug-report-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        rows={5}
                        placeholder="description of the bug"
                    />
                </div>

                <div className="bug-report-form__field">
                    <label htmlFor="bug-report-category">
                        Category
                        <span className="required-indicator" aria-hidden="true">
                            *
                        </span>
                    </label>
                    <select
                        id="bug-report-category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        required
                    >
                        {CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value || 'placeholder'} value={opt.value} disabled={opt.value === ''}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="bug-report-form__field">
                    <span className="bug-report-form__field-label" id="bug-report-image-label">
                        Upload Image
                    </span>
                    <input
                        ref={fileInputRef}
                        id="bug-report-image"
                        type="file"
                        accept="image/*"
                        className="bug-report-form__file-input-hidden"
                        aria-labelledby="bug-report-image-label"
                        onChange={handleImageInputChange}
                    />
                    <div
                        className={`bug-report-form__dropzone ${isDragOver ? 'bug-report-form__dropzone--active' : ''}`}
                        onDrop={handleDrop}
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        role="presentation"
                    >
                        {imageFile ? (
                            <div className="bug-report-form__dropzone-file">
                                <p className="bug-report-form__file-name" title={imageFile.name}>
                                    {imageFile.name}
                                </p>
                                <div className="bug-report-form__dropzone-actions">
                                    <button type="button" className="bug-report-form__link-button" onClick={openFilePicker}>
                                        Replace
                                    </button>
                                    <button type="button" className="bug-report-form__link-button" onClick={clearImage}>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label htmlFor="bug-report-image" className="bug-report-form__dropzone-label">
                                <Icon
                                    className="bug-report-form__dropzone-icon"
                                    icon="famicons:images"
                                    aria-hidden="true"
                                />
                                <span className="bug-report-form__dropzone-line">Drag your image here</span>
                                <span className="bug-report-form__dropzone-line">or</span>
                                <span className="bug-report-form__dropzone-line bug-report-form__browse">browse</span>
                                <span className="bug-report-form__dropzone-line bug-report-form__dropzone-hint">
                                    Maximum size: 5MB
                                </span>
                            </label>
                        )}
                    </div>
                    {imageError && <p className="bug-report-form__image-error">{imageError}</p>}
                </div>

                <div className="bug-report-form__actions">
                    <button type="submit" className="bug-report-form__submit">
                        Submit
                    </button>
                </div>
            </form>
        </div>
    );
}

export default BugReportForm;
