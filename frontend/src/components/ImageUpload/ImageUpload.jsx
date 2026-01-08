import React, { useState, useRef } from 'react';
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
    showActions = true // Enable/disable upload/cancel buttons
}) => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [message, setMessage] = useState('');
    const [fileName, setFileName] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [image, setImage] = useState(null);
    const fileInputRef = useRef(null);

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
        if (fileInputRef.current) fileInputRef.current.value = null;
        onFileClear?.();
    };

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
            className={`file-upload image-upload ${isDragging ? 'drag-over' : ''} ${selectedFile ? 'active' : ''} ${orientation === "horizontal" ? "horizontal" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleBoxClick}
            style={{ '--text-size': `${fontSize}px` }}
        >   
            {image ? (
                <div className="preview-container">
                    <img 
                        src={image} 
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
                    {selectedFile ? fileName : uploadText}
                    {
                        selectedFile ? 
                        ""
                        :
                        <>
                            ,<br />or{" "}
                            <label htmlFor="fileInput" className="browse">browse</label>
                        </>
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
                    selectedFile && showPrompt && showActions ? 
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
                        {selectedFile && !showActions ? (
                            <p className="preview-message">Drag a new image to replace, or click outside to save</p>
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
