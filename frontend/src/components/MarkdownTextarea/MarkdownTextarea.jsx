import React, { useRef, useEffect, useCallback } from 'react';
import { Icon } from '@iconify-icon/react';
import { valueToEditorHtml } from '../../utils/markdownUtils';
import './MarkdownTextarea.scss';

/**
 * MarkdownTextarea - WYSIWYG contenteditable editor with formatting toolbar.
 * Stores HTML. Supports both new HTML content and legacy markdown (converted on load).
 */
const MarkdownTextarea = ({
    value = '',
    onChange,
    placeholder = '',
    rows = 4,
    maxLength,
    minLength,
    id,
    className = '',
    required = false,
}) => {
    const editorRef = useRef(null);
    const isInternalChangeRef = useRef(false);
    const lastValueRef = useRef(value);
    const initializedRef = useRef(false);

    const getHtml = useCallback(() => {
        if (!editorRef.current) return '';
        const text = editorRef.current.textContent?.trim() || '';
        if (!text) return '';
        const html = editorRef.current.innerHTML;
        return html === '<br>' ? '' : html;
    }, []);

    const emitChange = useCallback(() => {
        const html = getHtml();
        if (html !== lastValueRef.current) {
            lastValueRef.current = html;
            isInternalChangeRef.current = true;
            onChange(html);
        }
        // Toggle placeholder visibility
        if (editorRef.current) {
            const text = editorRef.current.textContent?.trim() || '';
            editorRef.current.classList.toggle('is-empty', !text);
        }
    }, [getHtml, onChange]);

    // Sync value from parent into editor (e.g. initial load, external update)
    useEffect(() => {
        if (isInternalChangeRef.current) {
            isInternalChangeRef.current = false;
            return;
        }
        if (!editorRef.current || value === lastValueRef.current) return;
        const html = valueToEditorHtml(value);
        if (editorRef.current.innerHTML !== html) {
            editorRef.current.innerHTML = html;
            lastValueRef.current = value;
        }
    }, [value]);

    const handleToolbar = (command, valueArg = null) => {
        editorRef.current?.focus();
        document.execCommand(command, false, valueArg);
        emitChange();
    };

    const handleInput = () => {
        emitChange();
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
        emitChange();
    };

    const handleKeyDown = (e) => {
        if (e.key === ' ') {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            let node = selection.anchorNode;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            while (node && node !== editorRef.current) {
                if (['P', 'LI'].includes(node.tagName)) {
                    const range = document.createRange();
                    range.setStart(node, 0);
                    range.setEnd(selection.anchorNode, selection.anchorOffset);
                    const text = range.toString().trim();
                    if (text === '-') {
                        e.preventDefault();
                        // Convert to list first to establish structure, then clear the "-"
                        document.execCommand('insertUnorderedList', false, null);
                        // Find the new list item and remove the "-" (cursor should be in it)
                        setTimeout(() => {
                            const sel = window.getSelection();
                            if (!sel.rangeCount || !editorRef.current) return;
                            let n = sel.anchorNode;
                            if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
                            const li = n?.closest?.('li');
                            if (li && li.textContent.trim() === '-') {
                                li.innerHTML = '<br>';
                                emitChange();
                            }
                        }, 0);
                    }
                    break;
                }
                node = node.parentElement;
            }
        }
    };

    // Set initial content on mount
    useEffect(() => {
        if (editorRef.current && !initializedRef.current) {
            initializedRef.current = true;
            const html = valueToEditorHtml(value ?? '');
            editorRef.current.innerHTML = html || '<p><br></p>';
            lastValueRef.current = value ?? '';
            editorRef.current.classList.toggle('is-empty', !(value?.trim()));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={`markdown-textarea ${className}`}>
            <div className="markdown-textarea-toolbar">
                <button
                    type="button"
                    className="markdown-toolbar-btn"
                    onClick={() => handleToolbar('bold')}
                    title="Bold"
                    aria-label="Bold"
                >
                    <Icon icon="mdi:format-bold" />
                </button>
                <button
                    type="button"
                    className="markdown-toolbar-btn"
                    onClick={() => handleToolbar('italic')}
                    title="Italic"
                    aria-label="Italic"
                >
                    <Icon icon="mdi:format-italic" />
                </button>
                <button
                    type="button"
                    className="markdown-toolbar-btn"
                    onClick={() => handleToolbar('insertUnorderedList')}
                    title="Bullet list"
                    aria-label="Bullet list"
                >
                    <Icon icon="mdi:format-list-bulleted" />
                </button>
                <button
                    type="button"
                    className="markdown-toolbar-btn"
                    onClick={() => handleToolbar('insertParagraph')}
                    title="New line"
                    aria-label="New line"
                >
                    <Icon icon="mdi:format-paragraph" />
                </button>
            </div>
            <div
                ref={editorRef}
                id={id}
                contentEditable
                suppressContentEditableWarning
                className="markdown-textarea-editor"
                data-placeholder={placeholder}
                onInput={handleInput}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                style={{ minHeight: `${Math.max(4, rows) * 1.5}em` }}
            />
        </div>
    );
};

export default MarkdownTextarea;
