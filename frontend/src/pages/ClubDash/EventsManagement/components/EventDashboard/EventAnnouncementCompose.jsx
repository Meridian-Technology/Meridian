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
    onOpenRegistrationSettings
}) {
    const [isClosing, setIsClosing] = useState(false);
    const closeTimeoutRef = useRef(null);
    const popupRef = useRef(null);
    const [content, setContent] = useState('');
    const [subject, setSubject] = useState('');
    const [sendAsOrg, setSendAsOrg] = useState(false);
    const [channelInApp, setChannelInApp] = useState(true);
    const [channelEmail, setChannelEmail] = useState(true);
    const [includedUserIds, setIncludedUserIds] = useState(() => new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showRecipientList, setShowRecipientList] = useState(false);
    const [showSettingsPopover, setShowSettingsPopover] = useState(false);
    const settingsAnchorRef = useRef(null);
    const [showEmailPreview, setShowEmailPreview] = useState(false);
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
            const res = await apiRequest(
                `/org-messages/${orgId}/events/${eventId}/announcements`,
                {
                    content: content || '',
                    subject: subject.trim() || undefined,
                    sendAsOrg,
                    excludeUserIds,
                    excludeEmails: excludeEmails.length ? excludeEmails : undefined,
                    channels: { inApp: channelInApp, email: channelEmail }
                },
                { method: 'POST' }
            );
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

    useEffect(() => {
        if (!isOpen || isClosing) return;
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                if (showEmailPreview) setShowEmailPreview(false);
                else if (showSettingsPopover) setShowSettingsPopover(false);
                else handleClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, isClosing, handleClose, showSettingsPopover, showEmailPreview]);

    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, []);

    if (!isOpen && !isClosing) return null;

    const includedCount = recipients.filter(r => includedUserIds.has(r.userId)).length;
    const withEmailCount = recipients.filter(r => includedUserIds.has(r.userId) && r.email).length;
    const inAppCount = channelInApp ? recipients.filter(r => includedUserIds.has(r.userId) && !r.isAnonymous).length : 0;
    const emailCount = channelEmail ? withEmailCount : 0;
    const canSend = (channelInApp && recipients.some(r => includedUserIds.has(r.userId) && !r.isAnonymous)) || (channelEmail && recipients.some(r => includedUserIds.has(r.userId) && r.email));

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
                                    {anonymousWithNoEmailCount > 0 && (
                                        <p className="event-announcement-compose__anonymous-no-email">
                                            {anonymousWithNoEmailCount} guest{anonymousWithNoEmailCount !== 1 ? 's' : ''} registered without an email address and cannot receive announcements.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="event-announcement-compose__delivery-sender-row">
                                <div className="event-announcement-compose__channels-row event-announcement-compose__option-block">
                                    <label className="event-announcement-compose__option-label">Delivery</label>
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
                                <div className="event-announcement-compose__send-as-row event-announcement-compose__option-block">
                                    <label className="event-announcement-compose__option-label">Sender</label>
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
                                    type="text"
                                    className="event-announcement-compose__subject-input"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder={`e.g. Reminder: ${eventName || 'event'} this weekend`}
                                    maxLength={200}
                                />
                            </div>
                            <div className="event-announcement-compose__editor">
                                <label className="event-announcement-compose__editor-label">Message</label>
                                <MarkdownTextarea
                                    value={content}
                                    onChange={setContent}
                                    placeholder={`Share a message with your guests for ${eventName || 'this event'}...`}
                                    rows={10}
                                />
                            </div>
                        </>
                    )}
                </div>

                {!recipientsLoading && !recipientsError && recipients.length > 0 && (
                    <div className="event-announcement-compose__footer">
                        <button
                            type="button"
                            className="event-announcement-compose__footer-send"
                            onClick={handleSend}
                            disabled={isSubmitting || !canSend}
                        >
                            <Icon icon="mdi:send-outline" />
                            {isSubmitting ? 'Sending...' : 'Send'}
                        </button>
                        <button
                            type="button"
                            className="event-announcement-compose__footer-schedule"
                            disabled
                            title="Coming soon"
                        >
                            Schedule
                        </button>
                        <button
                            type="button"
                            className="event-announcement-compose__footer-preview"
                            onClick={() => setShowEmailPreview(true)}
                            title="Preview email"
                        >
                            Preview
                        </button>
                        <button
                            type="button"
                            className="event-announcement-compose__footer-cancel"
                            onClick={handleClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
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
        </div>,
        document.body
    );
}

export default EventAnnouncementCompose;
