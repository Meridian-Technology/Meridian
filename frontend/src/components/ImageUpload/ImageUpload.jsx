import React, { useState, useRef, useEffect } from 'react';
import './ImageUpload.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import CircleX from '../../assets/Icons/Circle-X.svg';

const ImageUpload = ({ 
    onFileSelect,
    onUpload,
    uploadText = "Upload Image",
    maxSize = 5, // in MB
    onFileClear,
    isUploading = false,
    uploadMessage = "Maximum size: 5MB",
    fontSize = 15,
    showPrompt = true,
    orientation = "vertical",
    previewImageParams = {}, // { shape: 'circle' | 'square' | 'rectangle' }
    showActions = true, // Enable/disable upload/cancel buttons
    previewMessage = "", // Custom message when image is selected
    value = null, // Initial file value to restore preview
    color, // Optional: CSS color for accents (e.g. 'var(--primary-color)'). Default: var(--dark-blue)
    initialImageUrl // Optional: URL of existing image to show (e.g. event.image). Shown when no file selected.
}) => {
    const [selectedFile, setSelectedFile] = useState(value);
    const [message, setMessage] = useState('');
    const [fileName, setFileName] = useState(value?.name || '');
    const [isDragging, setIsDragging] = useState(false);
    const [image, setImage] = useState(null);
    const [clearedInitial, setClearedInitial] = useState(false);
    const fileInputRef = useRef(null);

    // Helper function to compare files by properties (not reference)
    const filesEqual = (file1, file2) => {
        if (!file1 && !file2) return true;
        if (!file1 || !file2) return false;
        return file1.name === file2.name && 
               file1.size === file2.size && 
               file1.lastModified === file2.lastModified;
    };

    // Restore preview when value prop changes (e.g., navigating back to step)
    useEffect(() => {
        if (value && !filesEqual(value, selectedFile)) {
            setSelectedFile(value);
            setFileName(value.name || '');
            // Create preview from File object
            const reader = new FileReader();
            reader.onload = () => {
                setImage(reader.result);
            };
            reader.readAsDataURL(value);
        } else if (!value && selectedFile) {
            // Clear if value is null but we have a selected file
            setSelectedFile(null);
            setFileName('');
            setImage(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useEffect(() => {
        setClearedInitial(false);
    }, [initialImageUrl]);

    const onFileChange = event => {
        const file = event.target.files[0];
        handleFile(file);
    };

    const handleFile = (file) => {
        if (file) {
            if (file.size > maxSize * 1024 * 1024) {
                setMessage(`File size must be less than ${maxSize}MB`);
                return;
            }
            setSelectedFile(file);
            setFileName(file.name);
            setMessage('');
            const reader = new FileReader();
            reader.onload = () => {
                setImage(reader.result);
                onFileSelect?.(file);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        handleFile(file);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleClear = (e) => {
        e.stopPropagation(); // Prevent triggering file input
        setSelectedFile(null);
        setFileName('');
        setMessage('');
        setImage(null);
        setClearedInitial(true);
        if (fileInputRef.current) fileInputRef.current.value = null;
        onFileClear?.();
    };

    // Display: selected file preview, or initial image URL (if not cleared), or nothing
    const displayImage = image || (initialImageUrl && !clearedInitial ? initialImageUrl : null);
    const hasImage = Boolean(displayImage);

    const handleBoxClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleUpload = () => {
        if (selectedFile) {
            onUpload?.(selectedFile);
        }
    };

    return (
        <div
            className={`file-upload image-upload ${isDragging ? 'drag-over' : ''} ${hasImage ? 'active' : ''} ${orientation === "horizontal" ? "horizontal" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleBoxClick}
            style={{ 
                '--text-size': `${fontSize}px`,
                ...(color && { '--image-upload-color': color })
            }}
        >   
            {displayImage ? (
                <div className="preview-container">
                    <img 
                        src={displayImage} 
                        alt="preview" 
                        className={`preview ${previewImageParams.shape ? `preview-${previewImageParams.shape}` : ''}`}
                    />
                    {!showActions && (
                        <button 
                            className="clear-preview-button"
                            onClick={handleClear}
                            aria-label="Clear image"
                            type="button"
                        >
                            <Icon icon="mdi:close" />
                        </button>
                    )}
                </div>
            ) : (
                <Icon className={`upload-icon ${isDragging ? 'drag-over' : ''}`} icon="famicons:images" />
            )}
            <div className="text-container">
                <h3 className="upload-text">
                    {selectedFile ? fileName : hasImage ? 'Current image' : uploadText}
                    {
                        !hasImage ? (
                        <>
                            ,<br />or{" "}
                            <label className="browse">browse</label>
                        </>
                        ) : ""
                    }
                </h3>
                <input
                    type="file"
                    ref={fileInputRef}
                    id="fileInput"
                    onChange={onFileChange}
                    accept="image/*"
                    style={{ display: 'none' }}
                />
                {
                    hasImage && showPrompt && showActions ? 
                    <div className="upload-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="clear-button"
                            onClick={handleClear}
                            type="button"
                        >
                            Clear
                        </button>
                        <button 
                            className="upload-button" 
                            onClick={handleUpload}
                            disabled={isUploading}
                            type="button"
                        >
                            {isUploading ? 'Uploading...' : 'Upload'}
                        </button>
                        {/* <img src={CircleX} className="clear" onClick={handleClear}/> */}
                    </div>
                    :
                    <>
                        {hasImage && !showActions ? (
                            <p className="preview-message">{previewMessage}</p>
                        ) : (
                            <p className="upload-message">{message || uploadMessage}</p>
                        )}
                    </>
                }
            </div>
        </div>
    );
};

export default ImageUpload;
