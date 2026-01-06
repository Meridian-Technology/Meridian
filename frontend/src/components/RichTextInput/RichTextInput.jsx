import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '@iconify-icon/react';
import './RichTextInput.scss';

/**
 * RichTextInput - A contenteditable input with syntax highlighting for mentions and links
 * Similar to Gmail's mention system
 * 
 * @param {string} value - The current value
 * @param {function} onChange - Callback when value changes (receives plain text)
 * @param {string} placeholder - Placeholder text
 * @param {number} rows - Number of rows (approximate)
 * @param {number} maxLength - Maximum character length
 * @param {function} onMentionTrigger - Callback when @ or # is typed (receives { trigger, search, position })
 * @param {Array} mentionOptions - Options to show in mention dropdown
 * @param {function} renderMentionOption - Function to render mention option
 * @param {function} getMentionText - Function to get text for a mention option
 */
const RichTextInput = ({
    value = '',
    onChange,
    placeholder = '',
    rows = 4,
    maxLength,
    onMentionTrigger,
    mentionOptions = [],
    renderMentionOption,
    getMentionText,
    className = '',
    disabled = false,
    error = false,
    events = [] // Array of event objects for previews
}) => {
    const editorRef = useRef(null);
    const [isFocused, setIsFocused] = useState(false);
    const [mentionState, setMentionState] = useState(null); // { trigger: '@' | '#', search: string, position: number }

    const isInternalUpdateRef = useRef(false);
    const isUpdatingRef = useRef(false);
    const lastValueRef = useRef(value);

    // Get cursor position as character offset in plain text
    const getCursorOffset = useCallback(() => {
        if (!editorRef.current) return 0;
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return editorRef.current.textContent.length;
        
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(editorRef.current);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    }, []);

    // Set cursor position by character offset
    const setCursorOffset = useCallback((offset) => {
        if (!editorRef.current) return;
        
        const text = editorRef.current.textContent;
        const targetOffset = Math.min(offset, text.length);
        
        // Walk through nodes to find the right position
        const walker = document.createTreeWalker(
            editorRef.current,
            NodeFilter.SHOW_TEXT,
            null
        );
        
        let currentOffset = 0;
        let targetNode = null;
        let targetNodeOffset = 0;
        
        let node;
        while (node = walker.nextNode()) {
            const nodeLength = node.textContent.length;
            if (currentOffset + nodeLength >= targetOffset) {
                targetNode = node;
                targetNodeOffset = targetOffset - currentOffset;
                break;
            }
            currentOffset += nodeLength;
        }
        
        // If we didn't find a node, place at end
        if (!targetNode) {
            const lastNode = editorRef.current.lastChild;
            if (lastNode && lastNode.nodeType === Node.TEXT_NODE) {
                targetNode = lastNode;
                targetNodeOffset = lastNode.textContent.length;
            } else {
                // No text nodes, place at end of container
                const range = document.createRange();
                range.selectNodeContents(editorRef.current);
                range.collapse(false);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                return;
            }
        }
        
        // Set cursor position
        try {
            const range = document.createRange();
            range.setStart(targetNode, targetNodeOffset);
            range.setEnd(targetNode, targetNodeOffset);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        } catch (e) {
            // Ignore selection errors
        }
    }, []);

    // Set plain text content and apply highlighting
    const setPlainTextContent = useCallback((text) => {
        if (!editorRef.current) return;

        // Clear existing content safely - check if node is still a child before removing
        const children = Array.from(editorRef.current.childNodes);
        children.forEach(child => {
            if (child.parentNode === editorRef.current) {
                editorRef.current.removeChild(child);
            }
        });

        if (!text) {
            return;
        }

        // Process text to add highlights
        const fragment = document.createDocumentFragment();
        let i = 0;

        // Find all URLs first
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlRanges = [];
        let urlMatch;
        while ((urlMatch = urlRegex.exec(text)) !== null) {
            urlRanges.push({
                start: urlMatch.index,
                end: urlMatch.index + urlMatch[0].length,
                url: urlMatch[0]
            });
        }

        // Helper to check if position is in URL
        const isInUrl = (pos) => urlRanges.some(r => pos >= r.start && pos < r.end);

        // Find all event mentions (ID-based only)
        const eventMentionRanges = [];
        if (events && events.length > 0) {
            // Create a map of event IDs to events for quick lookup
            const eventMap = new Map();
            events.forEach(event => {
                const id = event._id?.toString() || event.id;
                if (id) {
                    eventMap.set(id, event);
                }
            });
            
            // Pattern: @event:{id} (24 hex chars = MongoDB ObjectId)
            const idPattern = /@event:([a-fA-F0-9]{24})(?=\s|$|[\n\r@#])/gi;
            let match;
            while ((match = idPattern.exec(text)) !== null) {
                if (!isInUrl(match.index)) {
                    const eventId = match[1];
                    const event = eventMap.get(eventId);
                    if (event && event.name) {
                        // Show event name in display, but match the ID in content
                        eventMentionRanges.push({
                            start: match.index,
                            end: match.index + match[0].length,
                            event: event,
                            type: 'event',
                            displayText: `@event:${event.name}` // Show name for display
                        });
                    }
                }
            }
        }
        
        // Sort ranges by start position
        eventMentionRanges.sort((a, b) => a.start - b.start);
        
        // Remove overlapping ranges (keep first/longest)
        const nonOverlappingRanges = [];
        eventMentionRanges.forEach(range => {
            const overlaps = nonOverlappingRanges.some(existing => 
                (range.start >= existing.start && range.start < existing.end) ||
                (range.end > existing.start && range.end <= existing.end) ||
                (range.start <= existing.start && range.end >= existing.end)
            );
            if (!overlaps) {
                nonOverlappingRanges.push(range);
            }
        });

        while (i < text.length) {
            // Check if we're at a URL
            const urlAtPos = urlRanges.find(r => r.start === i);
            if (urlAtPos) {
                const link = document.createElement('a');
                link.href = urlAtPos.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'rich-text-link';
                link.textContent = urlAtPos.url;
                fragment.appendChild(link);
                i = urlAtPos.end;
                continue;
            }

            // Check if we're at an event mention
            const eventMentionAtPos = nonOverlappingRanges.find(r => r.start === i);
            if (eventMentionAtPos) {
                // Use displayText if available (for ID-based mentions showing names), otherwise use matched text
                const mention = eventMentionAtPos.displayText || text.substring(eventMentionAtPos.start, eventMentionAtPos.end);
                const span = document.createElement('span');
                span.className = 'rich-text-mention';
                span.textContent = mention;
                span.setAttribute('data-event-name', eventMentionAtPos.event.name);
                span.setAttribute('data-event-id', eventMentionAtPos.event._id || '');
                span.setAttribute('data-mention-type', eventMentionAtPos.type);
                fragment.appendChild(span);
                i = eventMentionAtPos.end;
                continue;
            }

            // Regular character
            const textNode = document.createTextNode(text[i]);
            fragment.appendChild(textNode);
            i++;
        }

        editorRef.current.appendChild(fragment);
    }, [events]);

    // Initialize content on mount
    useEffect(() => {
        if (editorRef.current && value && !editorRef.current.textContent) {
            setPlainTextContent(value);
            lastValueRef.current = value;
        }
    }, [setPlainTextContent, value]); // Only on mount

    // Update content when value prop changes externally (not during typing)
    useEffect(() => {
        if (editorRef.current && !isInternalUpdateRef.current && lastValueRef.current !== value) {
            const currentText = editorRef.current.textContent || '';
            if (currentText !== value) {
                const cursorOffset = getCursorOffset();
                setPlainTextContent(value);
                lastValueRef.current = value;
                requestAnimationFrame(() => {
                    setCursorOffset(cursorOffset);
                });
            }
        }
        isInternalUpdateRef.current = false;
    }, [value, getCursorOffset, setCursorOffset, setPlainTextContent]);

    // Get plain text from contenteditable
    const getPlainText = useCallback(() => {
        if (!editorRef.current) return '';
        return editorRef.current.textContent || '';
    }, []);

    // Handle input
    const handleInput = useCallback((e) => {
        if (isUpdatingRef.current) return;
        
        isInternalUpdateRef.current = true;
        const plainText = getPlainText();
        lastValueRef.current = plainText;
        
        // Save cursor position as character offset
        const cursorOffset = getCursorOffset();
        
        // Check for mention triggers
        const textBeforeCursor = plainText.substring(0, cursorOffset);
        
        // Check if we're inside or right after a complete @event: mention
        // Complete pattern: @event: followed by exactly 24 hex chars, optionally followed by space/end
        const completeEventMentionPattern = /@event:[a-fA-F0-9]{24}(\s|$)/;
        const isAfterCompleteEventMention = completeEventMentionPattern.test(textBeforeCursor);
        
        // Check if we're in the middle of typing an @event: mention (partial)
        const partialEventMentionPattern = /@event:[a-fA-F0-9]{0,23}$/;
        const isInPartialEventMention = partialEventMentionPattern.test(textBeforeCursor);
        
        if (!isAfterCompleteEventMention && !isInPartialEventMention) {
            const mentionMatch = textBeforeCursor.match(/([@#])([^@#\s]*)$/);
            
            if (mentionMatch) {
                const trigger = mentionMatch[1];
                const search = mentionMatch[2];
                
                setMentionState({
                    trigger,
                    search,
                    position: textBeforeCursor.length - search.length - 1
                });
                
                if (onMentionTrigger) {
                    onMentionTrigger({ trigger, search, position: textBeforeCursor.length - search.length - 1 });
                }
            } else {
                // Check if we just typed a space or newline (close mentions)
                const lastChar = textBeforeCursor.slice(-1);
                if (lastChar === ' ' || lastChar === '\n') {
                    setMentionState(null);
                } else if (mentionState) {
                    // Update search if we're still in mention mode
                    const newMatch = textBeforeCursor.match(/([@#])([^@#\s]*)$/);
                    if (newMatch) {
                        setMentionState({
                            ...mentionState,
                            search: newMatch[2]
                        });
                    } else {
                        setMentionState(null);
                    }
                }
            }
        } else {
            // We're inside or right after an @event: mention, close any open mention state
            setMentionState(null);
        }

        // Apply highlighting
        isUpdatingRef.current = true;
        setPlainTextContent(plainText);
        
        // Restore cursor position after highlighting
        requestAnimationFrame(() => {
            setCursorOffset(cursorOffset);
            isUpdatingRef.current = false;
        });

        // Notify parent of change
        if (onChange) {
            onChange(plainText);
        }
    }, [getPlainText, mentionState, onMentionTrigger, onChange, getCursorOffset, setCursorOffset, setPlainTextContent]);

    // Handle paste (strip formatting)
    const handlePaste = useCallback((e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }, []);

    // Insert mention at current position
    const insertMention = useCallback((mentionOption) => {
        if (!editorRef.current || !mentionState || isUpdatingRef.current) return;

        isInternalUpdateRef.current = true;
        isUpdatingRef.current = true;
        // Use getMentionText if provided, otherwise try to get ID or fall back to name
        let mentionText;
        if (getMentionText) {
            mentionText = getMentionText(mentionOption);
        } else if (mentionOption._id || mentionOption.id) {
            mentionText = `@event:${mentionOption._id || mentionOption.id}`;
        } else {
            mentionText = `@event:${mentionOption.name || mentionOption}`;
        }
        const currentText = getPlainText();
        const cursorOffset = getCursorOffset();
        
        // Get text before cursor
        const textBeforeCursor = currentText.substring(0, cursorOffset);
        
        // Find where the mention starts
        const mentionStart = textBeforeCursor.lastIndexOf(mentionState.trigger);
        if (mentionStart !== -1) {
            // Build new text: everything before trigger + mention + space + everything after cursor
            const textAfterCursor = currentText.substring(cursorOffset);
            const newText = currentText.substring(0, mentionStart) + mentionText + ' ' + textAfterCursor;
            lastValueRef.current = newText;
            
            // Update content
            setPlainTextContent(newText);
            
            // Set cursor after mention
            const newPosition = mentionStart + mentionText.length + 1;
            requestAnimationFrame(() => {
                setCursorOffset(newPosition);
                isUpdatingRef.current = false;
            });
            
            if (onChange) {
                onChange(newText);
            }
        } else {
            isUpdatingRef.current = false;
        }
        
        setMentionState(null);
    }, [mentionState, getMentionText, getPlainText, onChange, getCursorOffset, setCursorOffset, setPlainTextContent]);

    // Handle keydown
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape' && mentionState) {
            e.preventDefault();
            setMentionState(null);
            return;
        }

        // If in mention mode, allow Enter to select first option, Shift+Enter for newline
        if (e.key === 'Enter' && mentionState && mentionOptions.length > 0 && !e.shiftKey) {
            e.preventDefault();
            insertMention(mentionOptions[0]);
            return;
        }

        // Allow Shift+Enter for newline, Enter will bubble up to form (for submission)
        // We don't prevent default for Enter when not in mention mode
    }, [mentionState, mentionOptions, insertMention]);

    // Get event type color
    const getEventTypeColor = (eventType) => {
        const colorMap = {
            'campus': 'rgba(250, 117, 109, 1)',
            'alumni': '#5C5C5C',
            'sports': '#6EB25F',
            'arts': '#FBEBBB',
            'study': 'rgba(250, 117, 109, 1)',
            'meeting': 'rgba(250, 117, 109, 1)'
        };
        return colorMap[eventType] || 'rgba(250, 117, 109, 1)';
    };

    // Extract mentioned events from content (ID-based only)
    const getMentionedEvents = useCallback(() => {
        if (!value || !events || events.length === 0) return [];
        
        const mentionedEvents = [];
        const text = value;
        
        // Create a map of event IDs for quick lookup
        const eventMap = new Map();
        events.forEach(event => {
            const id = event._id?.toString() || event.id;
            if (id) {
                eventMap.set(id, event);
            }
        });
        
        // Find ID-based mentions (@event:{id})
        const idPattern = /@event:([a-fA-F0-9]{24})(?=\s|$|[\n\r@#])/g;
        let match;
        while ((match = idPattern.exec(text)) !== null) {
            const eventId = match[1];
            const event = eventMap.get(eventId);
            if (event) {
                mentionedEvents.push(event);
            }
        }
        
        // Remove duplicates
        return Array.from(new Map(mentionedEvents.map(e => [e._id || e.id, e])).values());
    }, [value, events]);
    
    const mentionedEvents = getMentionedEvents();

    return (
        <div className={`rich-text-input-wrapper ${className} ${error ? 'error' : ''} ${disabled ? 'disabled' : ''}`}>
            <div
                ref={editorRef}
                className={`rich-text-input ${isFocused ? 'focused' : ''} ${!getPlainText() ? 'empty' : ''}`}
                contentEditable={!disabled}
                onInput={handleInput}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                data-placeholder={placeholder}
                suppressContentEditableWarning
            >
                {!getPlainText() && !isFocused && (
                    <span className="rich-text-placeholder">{placeholder}</span>
                )}
            </div>
            {mentionState && mentionOptions.length > 0 && (
                <div className="mention-dropdown">
                    <div className="mention-dropdown-header">
                        <Icon icon="mdi:at" />
                        <span>Mentions</span>
                    </div>
                    <div className="mention-dropdown-list">
                        {mentionOptions.map((option, index) => (
                            <div
                                key={index}
                                className="mention-option"
                                onClick={() => insertMention(option)}
                                onMouseDown={(e) => e.preventDefault()} // Prevent blur
                            >
                                {renderMentionOption ? renderMentionOption(option) : (
                                    <span>{option.name || option}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {mentionedEvents.length > 0 && (
                <div className="event-embeds">
                    {mentionedEvents.map((event) => (
                        <div key={event._id} className="event-embed-card">
                            {(event.image || event.previewImage) ? (
                                <div className="event-embed-image">
                                    <img 
                                        src={event.image || event.previewImage} 
                                        alt={event.name}
                                    />
                                </div>
                            ) : (
                                <div 
                                    className="event-embed-image gradient"
                                    style={{
                                        background: `linear-gradient(135deg, ${getEventTypeColor(event.type)} 0%, white 100%)`
                                    }}
                                />
                            )}
                            <div className="event-embed-info">
                                <h4>{event.name}</h4>
                                {event.start_time && (
                                    <div className="event-embed-row">
                                        <Icon icon="heroicons:calendar-16-solid" />
                                        <span>
                                            {new Date(event.start_time).toLocaleString('default', {weekday: 'long'})} {new Date(event.start_time).toLocaleString('default', {month: 'numeric'})}/{new Date(event.start_time).getDate()}
                                        </span>
                                    </div>
                                )}
                                {event.location && (
                                    <div className="event-embed-row">
                                        <Icon icon="fluent:location-28-filled" />
                                        <span>{event.location}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RichTextInput;

