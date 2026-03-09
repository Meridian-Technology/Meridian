import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify-icon/react';
import MarkdownTextarea from '../MarkdownTextarea/MarkdownTextarea';
import './RichTextEditorSpotlight.scss';

const CLOSE_ANIMATION_MS = 280;

/**
 * Spotlight-style popup for rich text (markdown) editing.
 * Renders via portal to document.body; overlay with blur; centered popup with optional morph-from-origin.
 * Escape, overlay click, or close button close the popup after exit animation.
 * Optional: pass onConfirm and confirmLabel to show a footer with a primary action (e.g. "Send announcement").
 */
function RichTextEditorSpotlight({
    isOpen,
    onClose,
    label,
    value,
    onChange,
    placeholder,
    maxLength,
    minLength,
    originRect,
    confirmLabel,
    onConfirm
}) {
    const [isClosing, setIsClosing] = useState(false);
    const closeTimeoutRef = useRef(null);
    const popupRef = useRef(null);
    const editorContainerRef = useRef(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const hasConfirm = Boolean(confirmLabel && onConfirm);

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
        closeTimeoutRef.current = setTimeout(() => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
            onClose();
            setIsClosing(false);
        }, CLOSE_ANIMATION_MS);
    };

    const handleConfirm = async () => {
        if (!hasConfirm || isSubmitting) return;
        const currentValue = value == null ? '' : value;
        setIsSubmitting(true);
        try {
            await onConfirm(currentValue);
            handleClose();
        } catch (err) {
            // Let caller handle notification; just re-enable button
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePopupAnimationEnd = (e) => {
        if (isClosing && e.target === popupRef.current) {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
            onClose();
            setIsClosing(false);
        }
    };

    useEffect(() => {
        if (!isOpen || isClosing) return;
        const handleEscape = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, isClosing]);

    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, []);

    // Focus the contenteditable when opened
    useEffect(() => {
        if (!isOpen || isClosing) return;
        const t = setTimeout(() => {
            const el = editorContainerRef.current?.querySelector?.('.markdown-textarea-editor');
            if (el && typeof el.focus === 'function') el.focus();
        }, 350);
        return () => clearTimeout(t);
    }, [isOpen, isClosing]);

    if (!isOpen && !isClosing) return null;

    const displayValue = value == null ? '' : value;
    const popupStyle = originRect
        ? {
            '--origin-top': `${originRect.top}px`,
            '--origin-left': `${originRect.left}px`,
            '--origin-width': `${originRect.width}px`,
            '--origin-height': `${originRect.height}px`
        }
        : undefined;

    return createPortal(
        <div
            className={`rich-text-editor-spotlight ${isClosing ? 'rich-text-editor-spotlight--closing' : ''}`}
            role="presentation"
        >
            <div
                className="rich-text-editor-overlay"
                onClick={handleClose}
                role="button"
                tabIndex={-1}
                aria-label="Close editor"
            />
            <div
                ref={popupRef}
                className={`rich-text-editor-popup ${originRect ? 'rich-text-editor-popup--from-origin' : ''} ${isClosing ? 'rich-text-editor-popup--closing' : ''}`}
                style={popupStyle}
                onAnimationEnd={handlePopupAnimationEnd}
                role="dialog"
                aria-modal="true"
                aria-labelledby="rich-text-editor-spotlight-title"
            >
                <div className="rich-text-editor-popup__header">
                    <h2 id="rich-text-editor-spotlight-title">{label || 'Edit content'}</h2>
                    <button
                        type="button"
                        className="rich-text-editor-popup__close"
                        onClick={handleClose}
                        aria-label="Close"
                    >
                        <Icon icon="ep:close-bold" />
                    </button>
                </div>
                <div ref={editorContainerRef} className="rich-text-editor-popup__body">
                    <MarkdownTextarea
                        value={displayValue}
                        onChange={onChange}
                        placeholder={placeholder}
                        rows={16}
                        maxLength={maxLength}
                        minLength={minLength}
                    />
                </div>
                {hasConfirm && (
                    <div className="rich-text-editor-popup__footer">
                        <button
                            type="button"
                            className="rich-text-editor-popup__footer-cancel"
                            onClick={handleClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="rich-text-editor-popup__footer-confirm"
                            onClick={handleConfirm}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Sending...' : confirmLabel}
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

export default RichTextEditorSpotlight;
