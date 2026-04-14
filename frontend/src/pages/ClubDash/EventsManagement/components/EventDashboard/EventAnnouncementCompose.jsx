import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify-icon/react';
import MarkdownTextarea from '../../../../../components/MarkdownTextarea/MarkdownTextarea';
import Popup from '../../../../../components/Popup/Popup';
import EventEmailPreview from './EventEmailPreview';
import { useFetch } from '../../../../../hooks/useFetch';
import apiRequest from '../../../../../utils/postRequest';
import { useNotification } from '../../../../../NotificationContext';
import { parseMarkdownDescription } from '../../../../../utils/markdownUtils';
import './EventAnnouncementCompose.scss';

const CLOSE_ANIMATION_MS = 280;
const MAX_ADDITIONAL_EMAILS = 20;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
/** Show a notice to open registration settings when this many guests have no email (even if some recipients exist) */
const ANONYMOUS_NO_EMAIL_NOTICE_THRESHOLD = 5;

function isValidEmail(str) {
    if (!str || typeof str !== 'string') return false;
    const t = str.trim().toLowerCase();
    return t.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function parseCommaSeparatedEmails(text, existingSet, maxNew = MAX_ADDITIONAL_EMAILS) {
    const seen = new Set(existingSet);
    const result = [];
    const raw = (text || '').split(/[\n,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const part of raw) {
        if (result.length >= maxNew) break;
        const email = part.trim().toLowerCase();
        if (!isValidEmail(email) || seen.has(email)) continue;
        seen.add(email);
        result.push(email);
    }
    return result;
}

/**
 * Spotlight-style compose UI for event announcements: implications, channel toggles,
 * recipient list (include/exclude), and rich-text message. Fetches recipients on open;
 * on send, POSTs with content, excludeUserIds, and channels.
 */
function EventAnnouncementCompose({
    isOpen,
    onClose,
    orgId,
    eventId,
    eventName,
    eventStartTime,
    orgName,
    orgProfileImage,
    organizerName,
    organizerPicture,
    onSent,
    onOpenRegistrationSettings,
    initialSubject,
    initialContent
}) {
    const [isClosing, setIsClosing] = useState(false);
    const closeTimeoutRef = useRef(null);
    const popupRef = useRef(null);
    const subjectInputRef = useRef(null);
    const [content, setContent] = useState('');
    const [subject, setSubject] = useState('');
    useEffect(() => {
        if (isOpen && initialSubject != null) setSubject(initialSubject);
        if (isOpen && initialContent != null) setContent(initialContent);
    }, [isOpen, initialSubject, initialContent]);
    const [sendAsOrg, setSendAsOrg] = useState(false);
    const [channelInApp, setChannelInApp] = useState(true);
    const [channelEmail, setChannelEmail] = useState(true);
    const [includedUserIds, setIncludedUserIds] = useState(() => new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showRecipientList, setShowRecipientList] = useState(false);
    const [showSettingsPopover, setShowSettingsPopover] = useState(false);
    const settingsAnchorRef = useRef(null);
    const [showEmailPreview, setShowEmailPreview] = useState(false);
    const [additionalEmails, setAdditionalEmails] = useState([]);
    const [showAddEmailsPopup, setShowAddEmailsPopup] = useState(false);
    const [addEmailsInput, setAddEmailsInput] = useState('');
    const [attachmentFiles, setAttachmentFiles] = useState([]); // { id: string, file: File }[]
    const attachmentInputRef = useRef(null);
    const { addNotification } = useNotification();

    const recipientsUrl = isOpen && orgId && eventId
        ? `/org-messages/${orgId}/events/${eventId}/announcement-recipients`
        : null;
    const { data: recipientsData, loading: recipientsLoading, error: recipientsError, refetch: refetchRecipients } = useFetch(recipientsUrl);

    const recipients = recipientsData?.success && Array.isArray(recipientsData?.data?.recipients)
        ? recipientsData.data.recipients
        : [];
    const anonymousWithNoEmailCount = recipientsData?.data?.anonymousWithNoEmailCount ?? 0;
    const anonymousWithEmailCount = recipients.filter(r => r.isAnonymous && r.email).length;

    // When modal opens or recipients load, default all to included
    useEffect(() => {
        if (!isOpen) return;
        if (recipients.length > 0) {
            setIncludedUserIds(new Set(recipients.map(r => r.userId)));
        }
    }, [isOpen, recipientsData]);

    const handleClose = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
        closeTimeoutRef.current = setTimeout(() => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
            onClose();
            setIsClosing(false);
            setContent('');
            setSubject('');
            setSendAsOrg(false);
            setAdditionalEmails([]);
            setAttachmentFiles([]);
        }, CLOSE_ANIMATION_MS);
    }, [isClosing, onClose]);

    const displaySubject = subject.trim() || `Announcement for ${eventName || 'this event'}`;

    const handleSend = async () => {
        if (!orgId || !eventId || isSubmitting) return;
        const excludeUserIds = [];
        const excludeEmails = [];
        recipients.forEach((r) => {
            if (includedUserIds.has(r.userId)) return;
            if (r.isAnonymous && r.email) excludeEmails.push(r.email);
            else if (!r.isAnonymous && r.userId) excludeUserIds.push(r.userId);
        });
        setIsSubmitting(true);
        try {
            const url = `/org-messages/${orgId}/events/${eventId}/announcements`;
            let res;
            if (attachmentFiles.length > 0) {
                const formData = new FormData();
                formData.append('content', content || '');
                formData.append('subject', subject.trim());
                formData.append('sendAsOrg', sendAsOrg);
                formData.append('excludeUserIds', JSON.stringify(excludeUserIds));
                formData.append('excludeEmails', JSON.stringify(excludeEmails));
                formData.append('additionalEmails', JSON.stringify(additionalEmails));
                formData.append('channels', JSON.stringify({ inApp: channelInApp, email: channelEmail }));
                attachmentFiles.forEach(({ file }) => formData.append('attachments', file));
                res = await apiRequest(url, formData, { method: 'POST' });
            } else {
                res = await apiRequest(url, {
                    content: content || '',
                    subject: subject.trim() || undefined,
                    sendAsOrg,
                    excludeUserIds,
                    excludeEmails: excludeEmails.length ? excludeEmails : undefined,
                    additionalEmails: additionalEmails.length ? additionalEmails : undefined,
                    channels: { inApp: channelInApp, email: channelEmail }
                }, { method: 'POST' });
            }
            if (res.success) {
                onSent?.();
                handleClose();
            } else {
                addNotification({
                    title: 'Could not send announcement',
                    message: res.message || res.error || 'Something went wrong.',
                    type: 'error'
                });
            }
        } catch (err) {
            addNotification({
                title: 'Could not send announcement',
                message: err.message || 'Something went wrong.',
                type: 'error'
            });
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

    const toggleUser = (userId) => {
        setIncludedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const selectAll = () => setIncludedUserIds(new Set(recipients.map(r => r.userId)));
    const selectNone = () => setIncludedUserIds(new Set());

    const removeAdditionalEmail = (email) => {
        setAdditionalEmails(prev => prev.filter(e => e !== email));
    };

    const handleAttachmentChange = (e) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length === 0) return;
        const next = [...attachmentFiles];
        for (const file of files) {
            if (next.length >= MAX_ATTACHMENTS) {
                addNotification({
                    title: 'Attachment limit',
                    message: `Maximum ${MAX_ATTACHMENTS} PDF attachments allowed.`,
                    type: 'warning'
                });
                break;
            }
            if (file.type !== 'application/pdf') {
                addNotification({
                    title: 'Invalid file',
                    message: `"${file.name}" is not a PDF. Only PDF files are allowed.`,
                    type: 'error'
                });
                continue;
            }
            if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
                addNotification({
                    title: 'File too large',
                    message: `"${file.name}" exceeds 10MB.`,
                    type: 'error'
                });
                continue;
            }
            next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file });
        }
        setAttachmentFiles(next);
        e.target.value = '';
    };

    const removeAttachment = (id) => {
        setAttachmentFiles(prev => prev.filter(a => a.id !== id));
    };

    const canSend = (channelInApp && recipients.some(r => includedUserIds.has(r.userId) && !r.isAnonymous)) || (channelEmail && (recipients.some(r => includedUserIds.has(r.userId) && r.email) || additionalEmails.length > 0));

    const handleEditorKeyDown = useCallback((e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (!isSubmitting && canSend) handleSend();
        }
    }, [isSubmitting, canSend]);

    useEffect(() => {
        if (!isOpen || isClosing) return;
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                if (showAddEmailsPopup) setShowAddEmailsPopup(false);
                else if (showEmailPreview) setShowEmailPreview(false);
                else if (showSettingsPopover) setShowSettingsPopover(false);
                else handleClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, isClosing, handleClose, showSettingsPopover, showEmailPreview, showAddEmailsPopup]);

    useEffect(() => {
        if (!isOpen || isClosing) return;
        if (recipients.length > 0 && subjectInputRef.current) {
            subjectInputRef.current.focus();
        }
    }, [isOpen, isClosing, recipients.length]);

    // Focus trap and initial focus: keep Tab inside the dialog (popup is portaled so focus can escape)
    useEffect(() => {
        if (!isOpen || isClosing || recipients.length === 0) return;
        const dialog = popupRef.current;
        if (!dialog) return;

        const getFocusable = () => {
            const sel = 'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
            return Array.from(dialog.querySelectorAll(sel)).filter((el) => {
                return el.offsetParent !== null && !el.hasAttribute('aria-hidden');
            });
        };

        // Defer initial focus so the subject input is in the DOM
        const focusSubject = () => {
            if (subjectInputRef.current) subjectInputRef.current.focus();
            else getFocusable()[0]?.focus();
        };
        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(focusSubject);
        });

        const handleKeyDown = (e) => {
            if (e.key !== 'Tab') return;
            const focusable = getFocusable();
            if (focusable.length === 0) return;
            const current = document.activeElement;
            const currentIndex = focusable.indexOf(current);
            if (currentIndex === -1) {
                // Focus is outside dialog (e.g. overlay or page); redirect into dialog
                e.preventDefault();
                if (e.shiftKey) focusable[focusable.length - 1].focus();
                else focusable[0].focus();
                return;
            }
            if (e.shiftKey) {
                if (currentIndex === 0) {
                    e.preventDefault();
                    focusable[focusable.length - 1].focus();
                }
            } else {
                if (currentIndex === focusable.length - 1) {
                    e.preventDefault();
                    focusable[0].focus();
                }
            }
        };

        dialog.addEventListener('keydown', handleKeyDown, true);
        return () => {
            cancelAnimationFrame(raf);
            dialog.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isOpen, isClosing, recipients.length]);

    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (showAddEmailsPopup) setAddEmailsInput('');
    }, [showAddEmailsPopup]);

    const handleAddEmailsSubmit = useCallback(() => {
        const existingSet = new Set([
            ...recipients.map(r => r.email).filter(Boolean),
            ...additionalEmails
        ]);
        const maxNew = MAX_ADDITIONAL_EMAILS - additionalEmails.length;
        const parsed = parseCommaSeparatedEmails(addEmailsInput, existingSet, maxNew);
        setAdditionalEmails(prev => [...prev, ...parsed].slice(0, MAX_ADDITIONAL_EMAILS));
        setAddEmailsInput('');
        setShowAddEmailsPopup(false);
        if (parsed.length > 0) {
            addNotification({
                title: 'Emails added',
                message: `${parsed.length} email${parsed.length !== 1 ? 's' : ''} added to this announcement.`,
                type: 'success'
            });
        } else if ((addEmailsInput || '').trim()) {
            addNotification({
                title: 'No new emails added',
                message: 'Addresses were invalid or already in the recipient list. Use comma-separated format (max 20).',
                type: 'info'
            });
        }
    }, [addEmailsInput, additionalEmails, recipients, addNotification]);

    if (!isOpen && !isClosing) return null;

    const includedCount = recipients.filter(r => includedUserIds.has(r.userId)).length;
    const withEmailCount = recipients.filter(r => includedUserIds.has(r.userId) && r.email).length;
    const inAppCount = channelInApp ? recipients.filter(r => includedUserIds.has(r.userId) && !r.isAnonymous).length : 0;
    const emailCount = channelEmail ? withEmailCount : 0;

    return createPortal(
        <div
            className={`event-announcement-compose ${isClosing ? 'event-announcement-compose--closing' : ''}`}
            role="presentation"
        >
            <div
                className="event-announcement-compose__overlay"
                onClick={handleClose}
                role="button"
                tabIndex={-1}
                aria-label="Close"
            />
            <div
                ref={popupRef}
                className={`event-announcement-compose__popup ${isClosing ? 'event-announcement-compose__popup--closing' : ''}`}
                onAnimationEnd={handlePopupAnimationEnd}
                role="dialog"
                aria-modal="true"
                aria-labelledby="event-announcement-compose-title"
            >
                <div className="event-announcement-compose__header">
                    <div className="event-announcement-compose__header-icon">
                        <Icon icon="mdi:email-send-outline" aria-hidden />
                    </div>
                    <div className="event-announcement-compose__header-text">
                        <h2 id="event-announcement-compose-title">Send announcement</h2>
                        <p className="event-announcement-compose__header-desc">
                            Attendees will receive this via email and/or in-app notification based on your selection below.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="event-announcement-compose__close"
                        onClick={handleClose}
                        aria-label="Close"
                    >
                        <Icon icon="ep:close-bold" />
                    </button>
                </div>

                <div className="event-announcement-compose__body">
                    {recipientsLoading && (
                        <div className="event-announcement-compose__loading">
                            <Icon icon="mdi:loading" className="spinner" />
                            <span>Loading attendees...</span>
                        </div>
                    )}
                    {recipientsError && (
                        <div className="event-announcement-compose__error">
                            {recipientsError}
                            <button type="button" onClick={() => refetchRecipients()}>Retry</button>
                        </div>
                    )}
                    {!recipientsLoading && !recipientsError && recipients.length === 0 && (
                        <div className="event-announcement-compose__empty">
                            {anonymousWithNoEmailCount > 0 ? (
                                <>
                                    <span>You have {anonymousWithNoEmailCount} guest{anonymousWithNoEmailCount !== 1 ? 's' : ''} who registered without an email address on file.</span>
                                    <span className="event-announcement-compose__empty-hint">Enable &quot;Collect guest details&quot; on your registration form, or set a &quot;Notification email&quot; question in Registration settings so you can send them announcements.</span>
                                    {typeof onOpenRegistrationSettings === 'function' && (
                                        <button
                                            type="button"
                                            className="event-announcement-compose__empty-action"
                                            onClick={() => { onOpenRegistrationSettings(); handleClose(); }}
                                        >
                                            <Icon icon="mdi:cog-outline" />
                                            Open Registration settings
                                        </button>
                                    )}
                                </>
                            ) : (
                                'No attendees to notify for this event.'
                            )}
                        </div>
                    )}

                    {!recipientsLoading && !recipientsError && recipients.length > 0 && (
                        <>
                            {anonymousWithNoEmailCount >= ANONYMOUS_NO_EMAIL_NOTICE_THRESHOLD && (
                                <div className="event-announcement-compose__anonymous-notice">
                                    <span className="event-announcement-compose__anonymous-notice-text">
                                        {anonymousWithNoEmailCount} guest{anonymousWithNoEmailCount !== 1 ? 's' : ''} registered without an email address and will not receive this announcement.
                                    </span>
                                    <span className="event-announcement-compose__empty-hint">
                                        Enable &quot;Collect guest details&quot; on your registration form, or set a &quot;Notification email&quot; question in Registration settings to reach them.
                                    </span>
                                    {typeof onOpenRegistrationSettings === 'function' && (
                                        <button
                                            type="button"
                                            className="event-announcement-compose__empty-action"
                                            onClick={() => { onOpenRegistrationSettings(); handleClose(); }}
                                        >
                                            <Icon icon="mdi:cog-outline" />
                                            Open Registration settings
                                        </button>
                                    )}
                                </div>
                            )}
                            <div className="event-announcement-compose__recipients-row event-announcement-compose__option-block">
                                <label className="event-announcement-compose__option-label">Recipients</label>
                                <div className="event-announcement-compose__recipients-pills event-announcement-compose__option-box">
                                    <span className="event-announcement-compose__pill event-announcement-compose__pill--all">
                                        All ({includedCount})
                                    </span>
                                    {anonymousWithEmailCount > 0 && (
                                        <span className="event-announcement-compose__pill event-announcement-compose__pill--guests">
                                            Anonymous registrants ({anonymousWithEmailCount})
                                        </span>
                                    )}
                                    <div className="event-announcement-compose__recipients-controls">
                                        <button
                                            type="button"
                                            className="event-announcement-compose__add-emails-btn"
                                            onClick={() => setShowAddEmailsPopup(true)}
                                            aria-label={`Add email recipients (${additionalEmails.length}/${MAX_ADDITIONAL_EMAILS} used)`}
                                        >
                                            <Icon icon="mdi:email-plus-outline" />
                                            Add emails
                                            {additionalEmails.length > 0 && (
                                                <span className="event-announcement-compose__add-emails-count">+{additionalEmails.length}</span>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className="event-announcement-compose__recipients-chevron"
                                            onClick={() => setShowRecipientList((v) => !v)}
                                            aria-expanded={showRecipientList}
                                            aria-label={showRecipientList ? 'Hide recipient list' : 'Show recipient list'}
                                        >
                                            <Icon icon={showRecipientList ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
                                        </button>
                                        {typeof onOpenRegistrationSettings === 'function' && (
                                            <div className="event-announcement-compose__settings-wrap" ref={settingsAnchorRef}>
                                            <button
                                                type="button"
                                                className="event-announcement-compose__settings-btn"
                                                onClick={() => setShowSettingsPopover((v) => !v)}
                                                aria-label="Recipient settings"
                                                aria-expanded={showSettingsPopover}
                                            >
                                                <Icon icon="mdi:cog-outline" />
                                            </button>
                                            {showSettingsPopover && (
                                                <>
                                                    <div
                                                        className="event-announcement-compose__settings-backdrop"
                                                        onClick={() => setShowSettingsPopover(false)}
                                                        aria-hidden
                                                    />
                                                    <div className="event-announcement-compose__settings-popover" role="dialog" aria-label="Anonymous registrants settings">
                                                        <div className="event-announcement-compose__settings-popover-title">
                                                            <Icon icon="mdi:account-outline" />
                                                            Anonymous registrants
                                                        </div>
                                                        <p className="event-announcement-compose__settings-popover-desc">
                                                            Guests who registered without an account can receive announcements by email. Set a notification email question in Registration settings to include them.
                                                        </p>
                                                        {anonymousWithNoEmailCount > 0 && (
                                                            <p className="event-announcement-compose__settings-popover-warn">
                                                                {anonymousWithNoEmailCount} guest{anonymousWithNoEmailCount !== 1 ? 's' : ''} have no email on file.
                                                            </p>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="event-announcement-compose__settings-popover-btn"
                                                            onClick={() => { onOpenRegistrationSettings(); handleClose(); }}
                                                        >
                                                            Open Registration settings
                                                        </button>
                                                        {(anonymousWithEmailCount > 0 || anonymousWithNoEmailCount > 0) && (
                                                            <button
                                                                type="button"
                                                                className="event-announcement-compose__settings-popover-btn event-announcement-compose__settings-popover-btn--secondary"
                                                                onClick={() => { setShowSettingsPopover(false); setShowAddEmailsPopup(true); }}
                                                            >
                                                                <Icon icon="mdi:email-plus-outline" />
                                                                Add emails manually
                                                            </button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {showRecipientList && (
                                <div className="event-announcement-compose__recipients">
                                    <div className="event-announcement-compose__recipients-header">
                                        <span>Select who receives this announcement</span>
                                        <div className="event-announcement-compose__recipients-actions">
                                            <button type="button" onClick={selectAll}>Select all</button>
                                            <button type="button" onClick={selectNone}>Select none</button>
                                        </div>
                                    </div>
                                    <ul className="event-announcement-compose__recipients-list">
                                        {recipients.map((r) => (
                                            <li key={r.userId} className="event-announcement-compose__recipient">
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={includedUserIds.has(r.userId)}
                                                        onChange={() => toggleUser(r.userId)}
                                                    />
                                                    <span className="event-announcement-compose__recipient-name">{r.name}</span>
                                                    {r.email && (
                                                        <span className="event-announcement-compose__recipient-email">{r.email}</span>
                                                    )}
                                                    {r.isAnonymous && (
                                                        <span className="event-announcement-compose__recipient-badge" title="Guest (email only)">Email only</span>
                                                    )}
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                    {additionalEmails.length > 0 && (
                                        <>
                                            <div className="event-announcement-compose__recipients-additional-label">
                                                Additional emails (added manually)
                                            </div>
                                            <ul className="event-announcement-compose__recipients-list event-announcement-compose__recipients-list--additional">
                                                {additionalEmails.map((email) => (
                                                    <li key={email} className="event-announcement-compose__recipient event-announcement-compose__recipient--additional">
                                                        <span className="event-announcement-compose__recipient-email">{email}</span>
                                                        <button
                                                            type="button"
                                                            className="event-announcement-compose__recipient-remove"
                                                            onClick={() => removeAdditionalEmail(email)}
                                                            aria-label={`Remove ${email}`}
                                                            title="Remove"
                                                        >
                                                            <Icon icon="ep:close-bold" aria-hidden />
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                    {anonymousWithNoEmailCount > 0 && (
                                        <p className="event-announcement-compose__anonymous-no-email">
                                            {anonymousWithNoEmailCount} guest{anonymousWithNoEmailCount !== 1 ? 's' : ''} registered without an email address and cannot receive announcements.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="event-announcement-compose__delivery-sender-row">
                                <div className="event-announcement-compose__channels-row event-announcement-compose__option-block" role="group" aria-labelledby="event-announcement-delivery-label">
                                    <label id="event-announcement-delivery-label" className="event-announcement-compose__option-label">Delivery</label>
                                    <span className="event-announcement-compose__option-hint">Click to toggle on or off</span>
                                    <div className="event-announcement-compose__channels event-announcement-compose__option-box">
                                    <label className={`event-announcement-compose__channel-toggle ${channelInApp ? 'event-announcement-compose__channel-toggle--checked' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={channelInApp}
                                            onChange={(e) => setChannelInApp(e.target.checked)}
                                        />
                                        <span className="event-announcement-compose__channel-icon">
                                            <Icon icon="mdi:bell-outline" />
                                        </span>
                                        <span>In-app</span>
                                    </label>
                                    <label className={`event-announcement-compose__channel-toggle ${channelEmail ? 'event-announcement-compose__channel-toggle--checked' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={channelEmail}
                                            onChange={(e) => setChannelEmail(e.target.checked)}
                                        />
                                        <span className="event-announcement-compose__channel-icon">
                                            <Icon icon="mdi:email-outline" />
                                        </span>
                                        <span>Email</span>
                                    </label>
                                </div>
                                </div>
                                <div className="event-announcement-compose__send-as-row event-announcement-compose__option-block" role="group" aria-labelledby="event-announcement-sender-label">
                                    <label id="event-announcement-sender-label" className="event-announcement-compose__option-label">Sender</label>
                                    <span className="event-announcement-compose__option-hint">Click to choose</span>
                                    <div className="event-announcement-compose__send-as-options event-announcement-compose__option-box">
                                    <label className={`event-announcement-compose__send-as-option ${!sendAsOrg ? 'event-announcement-compose__send-as-option--selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="sendAs"
                                            checked={!sendAsOrg}
                                            onChange={() => setSendAsOrg(false)}
                                        />
                                        <div className="event-announcement-compose__send-as-preview">
                                            {organizerPicture ? (
                                                <img src={organizerPicture} alt="" className="event-announcement-compose__send-as-avatar event-announcement-compose__send-as-avatar--img" />
                                            ) : (
                                                <span className="event-announcement-compose__send-as-avatar" aria-hidden>
                                                    {(organizerName || orgName || 'O').charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                            <span className="event-announcement-compose__send-as-name">{organizerName || orgName || 'You'}</span>
                                        </div>
                                    </label>
                                    <label className={`event-announcement-compose__send-as-option ${sendAsOrg ? 'event-announcement-compose__send-as-option--selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="sendAs"
                                            checked={sendAsOrg}
                                            onChange={() => setSendAsOrg(true)}
                                        />
                                        <div className="event-announcement-compose__send-as-preview">
                                            {orgProfileImage ? (
                                                <img src={orgProfileImage} alt="" className="event-announcement-compose__send-as-avatar event-announcement-compose__send-as-avatar--img" />
                                            ) : (
                                                <span className="event-announcement-compose__send-as-avatar" aria-hidden>
                                                    {(orgName || 'O').charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                            <span className="event-announcement-compose__send-as-name">{orgName || 'Organization'}</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                            </div>

                            <div className="event-announcement-compose__subject-row">
                                <label className="event-announcement-compose__editor-label" htmlFor="event-announcement-subject">Subject</label>
                                <input
                                    id="event-announcement-subject"
                                    ref={subjectInputRef}
                                    type="text"
                                    className="event-announcement-compose__subject-input"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder={`e.g. Reminder: ${eventName || 'event'} this weekend`}
                                    maxLength={200}
                                    aria-label="Email subject"
                                />
                            </div>
                            <div className="event-announcement-compose__editor" role="group" aria-labelledby="event-announcement-message-label">
                                <label id="event-announcement-message-label" className="event-announcement-compose__editor-label">Message</label>
                                <MarkdownTextarea
                                    value={content}
                                    onChange={setContent}
                                    placeholder={`Share a message with your guests for ${eventName || 'this event'}...`}
                                    rows={10}
                                    onKeyDown={handleEditorKeyDown}
                                />
                            </div>
                            <div className="event-announcement-compose__attachments-row event-announcement-compose__option-block">
                                <label className="event-announcement-compose__option-label">Attachments</label>
                                <span className="event-announcement-compose__option-hint">PDF only, max {MAX_ATTACHMENTS} files, 10MB each</span>
                                <div className="event-announcement-compose__attachments event-announcement-compose__option-box">
                                    <input
                                        ref={attachmentInputRef}
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        multiple
                                        className="event-announcement-compose__attachments-input"
                                        aria-label="Add PDF attachments"
                                        onChange={handleAttachmentChange}
                                    />
                                    <button
                                        type="button"
                                        className="event-announcement-compose__attachments-add"
                                        onClick={() => attachmentInputRef.current?.click()}
                                        disabled={attachmentFiles.length >= MAX_ATTACHMENTS}
                                        aria-label={`Add PDF attachment (${attachmentFiles.length}/${MAX_ATTACHMENTS})`}
                                    >
                                        <Icon icon="mdi:paperclip" aria-hidden />
                                        Add PDF
                                    </button>
                                    {attachmentFiles.length > 0 && (
                                        <ul className="event-announcement-compose__attachments-list">
                                            {attachmentFiles.map(({ id, file }) => (
                                                <li key={id} className="event-announcement-compose__attachment-item">
                                                    <Icon icon="mdi:file-pdf-box" className="event-announcement-compose__attachment-icon" aria-hidden />
                                                    <span className="event-announcement-compose__attachment-name" title={file.name}>{file.name}</span>
                                                    <span className="event-announcement-compose__attachment-size">
                                                        ({(file.size / 1024).toFixed(1)} KB)
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="event-announcement-compose__attachment-remove"
                                                        onClick={() => removeAttachment(id)}
                                                        aria-label={`Remove ${file.name}`}
                                                        title="Remove"
                                                    >
                                                        <Icon icon="ep:close-bold" aria-hidden />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {!recipientsLoading && !recipientsError && recipients.length > 0 && (
                    <div className="event-announcement-compose__footer">
                        <button
                            type="button"
                            className="event-announcement-compose__footer-cancel"
                            onClick={handleClose}
                            disabled={isSubmitting}
                            aria-label="Cancel and close"
                        >
                            Cancel
                        </button>
                        <div className="event-announcement-compose__footer-actions">
                            <button
                                type="button"
                                className="event-announcement-compose__footer-preview"
                                onClick={() => setShowEmailPreview(true)}
                                title="Preview email"
                                aria-label="Preview email"
                            >
                                Preview
                            </button>
                            <button
                                type="button"
                                className="event-announcement-compose__footer-schedule"
                                disabled
                                title="Coming soon"
                                aria-label="Schedule (coming soon)"
                            >
                                Schedule
                            </button>
                            <button
                                type="button"
                                className="event-announcement-compose__footer-send"
                                onClick={handleSend}
                                disabled={isSubmitting || !canSend}
                                aria-label={isSubmitting ? 'Sending announcement' : 'Send announcement'}
                            >
                                <Icon icon="mdi:send-outline" aria-hidden />
                                {isSubmitting ? 'Sending...' : 'Send'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Popup
                isOpen={showEmailPreview}
                onClose={() => setShowEmailPreview(false)}
                customClassName="event-announcement-compose__preview-popup"
            >
                    <div className="event-announcement-compose__preview-header">
                        <h3 id="event-announcement-preview-title">Email preview</h3>
                    </div>
                    <EventEmailPreview
                        eventName={eventName}
                        eventStartTime={eventStartTime}
                        orgName={orgName}
                        authorName={sendAsOrg ? (orgName || 'Organization') : (organizerName || orgName)}
                        authorPicture={sendAsOrg ? orgProfileImage : organizerPicture}
                        contentHtml={content ? parseMarkdownDescription(content) : ''}
                        emptyPlaceholder="Your message will appear here. Type something in the message field above."
                        subject={subject.trim() || undefined}
                        sendAsOrg={sendAsOrg}
                    />
                    <div className="event-announcement-compose__preview-footer">
                        <button
                            type="button"
                            className="event-announcement-compose__preview-done"
                            onClick={() => setShowEmailPreview(false)}
                        >
                            Done
                        </button>
                    </div>
                </Popup>
            <Popup
                isOpen={showAddEmailsPopup}
                onClose={() => { setShowAddEmailsPopup(false); setAddEmailsInput(''); }}
                customClassName="event-announcement-compose__add-emails-popup"
            >
                <div className="event-announcement-compose__add-emails-header">
                    <h3 id="event-announcement-add-emails-title">Add email recipients</h3>
                </div>
                <div className="event-announcement-compose__add-emails-body">
                    <p className="event-announcement-compose__add-emails-desc">
                        Enter a comma-separated list of email addresses to include in this announcement (max {MAX_ADDITIONAL_EMAILS} total). Duplicates and addresses already in the recipient list will be ignored.
                    </p>
                    <textarea
                        aria-labelledby="event-announcement-add-emails-title"
                        className="event-announcement-compose__add-emails-textarea"
                        value={addEmailsInput}
                        onChange={(e) => setAddEmailsInput(e.target.value)}
                        placeholder="e.g. guest1@example.com, guest2@example.com"
                        rows={4}
                    />
                    {additionalEmails.length > 0 && (
                        <p className="event-announcement-compose__add-emails-count-msg">
                            {additionalEmails.length} of {MAX_ADDITIONAL_EMAILS} extra email{additionalEmails.length !== 1 ? 's' : ''} added for this announcement.
                        </p>
                    )}
                </div>
                <div className="event-announcement-compose__add-emails-footer">
                    <button
                        type="button"
                        className="event-announcement-compose__footer-cancel"
                        onClick={() => { setShowAddEmailsPopup(false); setAddEmailsInput(''); }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="event-announcement-compose__footer-send"
                        onClick={handleAddEmailsSubmit}
                        disabled={additionalEmails.length >= MAX_ADDITIONAL_EMAILS}
                    >
                        Add emails
                    </button>
                </div>
            </Popup>
        </div>,
        document.body
    );
}

export default EventAnnouncementCompose;
