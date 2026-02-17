import React, { useState, useEffect, useRef, useMemo } from 'react';
import './AddMemberForm.scss';
import apiRequest from '../../utils/postRequest';
import useOutsideClick from '../../hooks/useClickOutside';
import { Icon } from '@iconify-icon/react';
import pfp from '../../assets/defaultAvatar.svg';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BATCH_MAX = 30;
const SEARCH_DEBOUNCE_MS = 300;

function parseEmails(text) {
    return [...new Set(
        text.split(/[\n,]/).map(e => e.trim().toLowerCase()).filter(Boolean)
    )];
}

function validateEmails(emails) {
    const valid = [];
    const invalid = [];
    for (const e of emails) {
        if (EMAIL_REGEX.test(e)) valid.push(e);
        else invalid.push(e);
    }
    return { valid, invalid };
}

function AddMemberForm({
    orgId,
    roles = [],
    existingMembers = [],
    onMemberAdded,
    onClose,
    addNotification
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [selectedToInvite, setSelectedToInvite] = useState([]);
    const [sending, setSending] = useState(false);
    const [emailListMode, setEmailListMode] = useState(false);
    const [batchStep, setBatchStep] = useState(1);
    const [batchEmailsRaw, setBatchEmailsRaw] = useState('');
    const [batchPreviewData, setBatchPreviewData] = useState(null);
    const [batchPreviewLoading, setBatchPreviewLoading] = useState(false);
    const [batchInviteRoles, setBatchInviteRoles] = useState({});
    const [addingLoading, setAddingLoading] = useState(false);
    const searchWrapperRef = useRef(null);
    const debounceRef = useRef(null);

    const roleOptions = roles.length ? roles : [{ name: 'member', displayName: 'Member' }];
    const existingMemberIds = useMemo(
        () => existingMembers.map(m => m.user_id?._id || m.user_id).filter(Boolean),
        [existingMembers]
    );

    useEffect(() => {
        const q = searchQuery.trim();
        if (!q || q.length < 2) {
            setSearchResults([]);
            return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const params = { query: q, limit: 10 };
                if (existingMemberIds.length > 0) {
                    params.excludeIds = JSON.stringify(existingMemberIds);
                }
                const response = await apiRequest('/search-users', null, { method: 'GET', params });
                if (response.success && response.data) {
                    setSearchResults(response.data);
                } else {
                    setSearchResults([]);
                }
            } catch {
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [searchQuery, existingMemberIds]);

    useOutsideClick(searchWrapperRef, () => setShowSearchDropdown(false), ['add-member-form__search-input', 'add-member-form__search-result']);

    const handleSelectUser = (user) => {
        const email = (user.email || '').trim().toLowerCase();
        if (!email || selectedToInvite.some(s => s.email === email)) return;
        setAddingLoading(true);
        apiRequest(`/org-invites/${orgId}/batch-preview`, { emails: [email] }, { method: 'POST' })
            .then((response) => {
                if (response.success) {
                    const d = response.data || {};
                    if (d.members?.includes(email)) {
                        addNotification({ title: 'Already a member', message: `${user.name || user.email} is already in this org`, type: 'info' });
                    } else if (d.invited?.includes(email)) {
                        addNotification({ title: 'Already invited', message: `An invite was already sent to ${email}`, type: 'info' });
                    } else if (d.toInvite?.length > 0) {
                        setSelectedToInvite(prev => [...prev, { ...d.toInvite[0], role: 'member' }]);
                        setSearchQuery('');
                        setSearchResults([]);
                        setShowSearchDropdown(false);
                    }
                }
            })
            .catch(() => addNotification({ title: 'Error', message: 'Could not add', type: 'error' }))
            .finally(() => setAddingLoading(false));
    };

    const handleSelectEmailInvite = (emailToInvite) => {
        const email = emailToInvite.trim().toLowerCase();
        if (!EMAIL_REGEX.test(email) || selectedToInvite.some(s => s.email === email)) return;
        setAddingLoading(true);
        apiRequest(`/org-invites/${orgId}/batch-preview`, { emails: [email] }, { method: 'POST' })
            .then((response) => {
                if (response.success) {
                    const d = response.data || {};
                    if (d.members?.includes(email)) {
                        addNotification({ title: 'Already a member', message: `${email} is already in this org`, type: 'info' });
                    } else if (d.invited?.includes(email)) {
                        addNotification({ title: 'Already invited', message: `An invite was already sent to ${email}`, type: 'info' });
                    } else if (d.toInvite?.length > 0) {
                        setSelectedToInvite(prev => [...prev, { ...d.toInvite[0], role: 'member' }]);
                        setSearchQuery('');
                        setSearchResults([]);
                        setShowSearchDropdown(false);
                    }
                }
            })
            .catch(() => addNotification({ title: 'Error', message: 'Could not add', type: 'error' }))
            .finally(() => setAddingLoading(false));
    };

    const handleRemoveFromList = (email) => {
        setSelectedToInvite(prev => prev.filter(s => s.email !== email));
    };

    const handleSendInvites = async () => {
        if (selectedToInvite.length === 0 || !orgId) return;
        const invites = selectedToInvite.map(item => ({
            email: item.email,
            role: item.role || 'member'
        }));
        setSending(true);
        try {
            const response = await apiRequest(`/org-invites/${orgId}/invite-batch`, { invites }, { method: 'POST' });
            if (response.success) {
                const d = response.data || {};
                const msg = d.errors?.length > 0
                    ? `${d.sent} sent, ${d.skipped} skipped, ${d.errors.length} failed`
                    : `${d.sent} invitation(s) sent`;
                addNotification({ title: 'Success', message: msg, type: 'success' });
                setSelectedToInvite([]);
                if (onMemberAdded) onMemberAdded();
                handleClose();
            } else {
                addNotification({ title: 'Error', message: response?.message || response?.error || 'Failed to send', type: 'error' });
            }
        } catch (err) {
            addNotification({ title: 'Error', message: err?.message || err?.error || 'Failed to send', type: 'error' });
        } finally {
            setSending(false);
        }
    };

    const handleBatchSend = async () => {
        if (!batchPreviewData?.toInvite?.length || !orgId) return;
        const invites = batchPreviewData.toInvite.map(item => ({
            email: item.email,
            role: batchInviteRoles[item.email] || item.role || 'member'
        }));
        setSending(true);
        try {
            const response = await apiRequest(`/org-invites/${orgId}/invite-batch`, { invites }, { method: 'POST' });
            if (response.success) {
                const d = response.data || {};
                const msg = d.errors?.length > 0
                    ? `${d.sent} sent, ${d.skipped} skipped, ${d.errors.length} failed`
                    : `${d.sent} invitation(s) sent`;
                addNotification({ title: 'Success', message: msg, type: 'success' });
                setBatchEmailsRaw('');
                setBatchPreviewData(null);
                setEmailListMode(false);
                if (onMemberAdded) onMemberAdded();
                handleClose();
            } else {
                addNotification({ title: 'Error', message: response?.message || response?.error || 'Failed to send', type: 'error' });
            }
        } catch (err) {
            addNotification({ title: 'Error', message: err?.message || err?.error || 'Failed to send', type: 'error' });
        } finally {
            setSending(false);
        }
    };

    const handleClose = () => {
        setSearchQuery('');
        setSelectedToInvite([]);
        setBatchEmailsRaw('');
        setBatchPreviewData(null);
        setBatchInviteRoles({});
        setBatchStep(1);
        setEmailListMode(false);
        if (onClose) onClose();
    };

    const handleBatchNextStep = async () => {
        const emails = parseEmails(batchEmailsRaw);
        if (emails.length === 0) {
            addNotification({ title: 'Error', message: 'Enter at least one email', type: 'error' });
            return;
        }
        if (emails.length > BATCH_MAX) {
            addNotification({ title: 'Error', message: `Max ${BATCH_MAX} emails`, type: 'error' });
            return;
        }
        const { valid, invalid } = validateEmails(emails);
        if (invalid.length > 0) {
            addNotification({ title: 'Error', message: `Invalid: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '...' : ''}`, type: 'error' });
            return;
        }
        setBatchPreviewLoading(true);
        setBatchPreviewData(null);
        try {
            const response = await apiRequest(`/org-invites/${orgId}/batch-preview`, { emails: valid }, { method: 'POST' });
            if (response.success) {
                setBatchPreviewData(response.data);
                const defaults = {};
                (response.data.toInvite || []).forEach((item) => {
                    defaults[item.email] = item.role || 'member';
                });
                setBatchInviteRoles(defaults);
                setBatchStep(2);
            } else {
                addNotification({ title: 'Error', message: response?.message || response?.error || 'Failed to preview', type: 'error' });
            }
        } catch (err) {
            addNotification({ title: 'Error', message: err?.message || err?.error || 'Failed to preview', type: 'error' });
        } finally {
            setBatchPreviewLoading(false);
        }
    };

    const handleBatchBack = () => {
        setBatchStep(1);
        setBatchPreviewData(null);
    };

    const updateSelectedRole = (email, newRole) => {
        setSelectedToInvite(prev => prev.map(s => s.email === email ? { ...s, role: newRole } : s));
    };

    if (emailListMode) {
        return (
            <div className="add-member-form add-member-form--atlas">
                <div className="add-member-form__body">
                <div className="add-member-form__header add-member-form__header--with-back">
                    <button
                        type="button"
                        className="add-member-form__back-btn"
                        onClick={batchStep === 2 ? handleBatchBack : () => { setEmailListMode(false); setBatchPreviewData(null); setBatchEmailsRaw(''); setBatchStep(1); }}
                    >
                        <Icon icon="mdi:arrow-left" /> Back
                    </button>
                    <h3>Invite by email list</h3>
                    <p>{batchStep === 1 ? `Paste emails (comma or newline separated, max ${BATCH_MAX})` : 'Review and assign roles'}</p>
                </div>

                {batchStep === 1 && (
                    <>
                        <div className="add-member-form__field">
                            <textarea
                                placeholder="email1@example.com, email2@example.com"
                                value={batchEmailsRaw}
                                onChange={(e) => setBatchEmailsRaw(e.target.value)}
                                rows={4}
                            />
                        </div>
                        <button type="button" className="add-member-form__preview-btn" onClick={handleBatchNextStep} disabled={batchPreviewLoading}>
                            {batchPreviewLoading ? 'Loading...' : 'Next step'}
                        </button>
                    </>
                )}

                {batchStep === 2 && batchPreviewData && (
                    <div className="add-member-form__batch-preview">
                        {(batchPreviewData.members?.length > 0 || batchPreviewData.invited?.length > 0) && (
                            <div className="add-member-form__batch-skipped">
                                {batchPreviewData.members?.length > 0 && <span>{batchPreviewData.members.length} already member(s)</span>}
                                {batchPreviewData.invited?.length > 0 && <span>{batchPreviewData.invited.length} already invited</span>}
                            </div>
                        )}
                        {batchPreviewData.toInvite?.length > 0 ? (
                            <>
                                <div className="add-member-form__batch-list">
                                    {batchPreviewData.toInvite.map((item) => (
                                        <div key={item.email} className="add-member-form__batch-row">
                                            <div className="add-member-form__batch-info">
                                                {item.user ? (
                                                    <>
                                                        {item.user.picture ? (
                                                            <img src={item.user.picture} alt="" className="add-member-form__avatar" />
                                                        ) : (
                                                            <div className="add-member-form__avatar-placeholder add-member-form__avatar-placeholder--sm">
                                                                {item.user.name?.charAt(0) || item.user.username?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                        <span>{item.user.name || item.user.username}</span>
                                                        <span className="add-member-form__batch-email">{item.email}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Icon icon="mdi:account-plus-outline" className="add-member-form__batch-new-icon" />
                                                        <span className="add-member-form__batch-email-only">{item.email}</span>
                                                        <span className="add-member-form__batch-new-badge">New</span>
                                                    </>
                                                )}
                                            </div>
                                            <select
                                                value={batchInviteRoles[item.email] || 'member'}
                                                onChange={(e) => setBatchInviteRoles(prev => ({ ...prev, [item.email]: e.target.value }))}
                                                className="add-member-form__role-select"
                                            >
                                                {roleOptions.map(r => (
                                                    <option key={r.name} value={r.name}>{r.displayName || r.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="add-member-form__primary-btn add-member-form__primary-btn--full"
                                    onClick={handleBatchSend}
                                    disabled={sending}
                                >
                                    {sending ? 'Sending...' : `Send ${batchPreviewData.toInvite.length} invite(s)`}
                                </button>
                            </>
                        ) : (
                            <p className="add-member-form__batch-empty">All emails are already members or invited.</p>
                        )}
                    </div>
                )}

                </div>
                <div className="add-member-form__actions">
                    <button type="button" className="add-member-form__secondary-btn" onClick={handleClose}>Cancel</button>
                </div>
            </div>
        );
    }

    return (
        <div className="add-member-form add-member-form--atlas">
            <div className="add-member-form__body">
            <div className="add-member-form__header">
                <div className="add-member-form__header-top">
                    <h3>Invite Member</h3>
                    <button type="button" className="add-member-form__email-list-btn" onClick={() => { setBatchStep(1); setEmailListMode(true); }}>
                        <Icon icon="mdi:format-list-bulleted" /> Use email list
                    </button>
                </div>
                <p>Search by name or email. New users get a signup email.</p>
            </div>

            <div className="add-member-form__search-wrap" ref={searchWrapperRef}>
                <div className="add-member-form__field">
                    <div className="add-member-form__search-input-wrap">
                        <Icon icon="ic:round-search" className="add-member-form__search-icon" />
                        <input
                            type="text"
                            className="add-member-form__search-input"
                            placeholder="Search by name or email..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setShowSearchDropdown(true);
                            }}
                            onFocus={() => setShowSearchDropdown(true)}
                            disabled={addingLoading}
                        />
                        {searchLoading && <span className="add-member-form__search-loading">Searching...</span>}
                    </div>
                </div>
                {showSearchDropdown && (searchQuery.trim().length >= 2 || searchResults.length > 0) && (
                    <div className="add-member-form__search-dropdown">
                        {searchLoading && searchResults.length === 0 ? (
                            <div className="add-member-form__search-empty">Searching...</div>
                        ) : searchResults.length > 0 ? (
                            <>
                                {searchResults.map((user) => (
                                    <button
                                        key={user._id}
                                        type="button"
                                        className="add-member-form__search-result"
                                        onClick={() => handleSelectUser(user)}
                                        disabled={addingLoading}
                                    >
                                        <img src={user.picture || pfp} alt="" className="add-member-form__search-avatar" />
                                        <div className="add-member-form__search-result-info">
                                            <strong>{user.name || user.username}</strong>
                                            <span>{user.email}</span>
                                        </div>
                                    </button>
                                ))}
                                {EMAIL_REGEX.test(searchQuery.trim()) && !searchResults.some(u => (u.email || '').toLowerCase() === searchQuery.trim().toLowerCase()) && (
                                    <button
                                        type="button"
                                        className="add-member-form__search-result add-member-form__search-result--invite"
                                        onClick={() => handleSelectEmailInvite(searchQuery.trim())}
                                        disabled={addingLoading}
                                    >
                                        <Icon icon="mdi:account-plus-outline" />
                                        <span>Invite <strong>{searchQuery.trim()}</strong> (no account)</span>
                                    </button>
                                )}
                            </>
                        ) : EMAIL_REGEX.test(searchQuery.trim()) ? (
                            <button
                                type="button"
                                className="add-member-form__search-result add-member-form__search-result--invite"
                                onClick={() => handleSelectEmailInvite(searchQuery.trim())}
                                disabled={addingLoading}
                            >
                                <Icon icon="mdi:account-plus-outline" />
                                <span>Invite <strong>{searchQuery.trim()}</strong> (no account)</span>
                            </button>
                        ) : (
                            <div className="add-member-form__search-empty">Type 2+ characters to search</div>
                        )}
                    </div>
                )}
            </div>

            {selectedToInvite.length > 0 && (
                <div className="add-member-form__selected-list">
                    <div className="add-member-form__selected-header">
                        {/* <span>To invite ({selectedToInvite.length})</span> */}
                    </div>
                    <div className="add-member-form__selected-items">
                        {selectedToInvite.map((item) => (
                            <div key={item.email} className="add-member-form__selected-item">
                                <div className="add-member-form__selected-item-info">
                                    {item.user ? (
                                        <>
                                            {item.user.picture ? (
                                                <img src={item.user.picture} alt="" className="add-member-form__avatar add-member-form__avatar--sm" />
                                            ) : (
                                                <div className="add-member-form__avatar-placeholder add-member-form__avatar-placeholder--sm">
                                                    {item.user.name?.charAt(0) || item.user.username?.charAt(0) || '?'}
                                                </div>
                                            )}
                                            <div>
                                                <strong>{item.user.name || item.user.username}</strong>
                                                <span>{item.email}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <Icon icon="mdi:account-plus-outline" className="add-member-form__selected-new-icon" />
                                            <span>{item.email}</span>
                                            <span className="add-member-form__batch-new-badge">New</span>
                                        </>
                                    )}
                                </div>
                                <div className="add-member-form__selected-item-actions">
                                    <select
                                        value={item.role || 'member'}
                                        onChange={(e) => updateSelectedRole(item.email, e.target.value)}
                                        className="add-member-form__role-select"
                                    >
                                        {roleOptions.map(r => (
                                            <option key={r.name} value={r.name}>{r.displayName || r.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="add-member-form__remove-btn"
                                        onClick={() => handleRemoveFromList(item.email)}
                                        title="Remove"
                                    >
                                        <Icon icon="mdi:close" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="add-member-form__primary-btn add-member-form__primary-btn--full"
                        onClick={handleSendInvites}
                        disabled={sending}
                    >
                        {sending ? 'Sending...' : `Send ${selectedToInvite.length} invite(s)`}
                    </button>
                </div>
            )}

            </div>
            <div className="add-member-form__actions">
                <button type="button" className="add-member-form__secondary-btn" onClick={handleClose}>Cancel</button>
            </div>
        </div>
    );
}

export default AddMemberForm;
