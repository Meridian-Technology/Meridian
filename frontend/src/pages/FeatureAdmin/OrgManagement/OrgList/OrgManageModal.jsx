import React, { useState, useEffect } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';
import Popup from '../../../../components/Popup/Popup';
import UserSearch from '../../../../components/UserSearch/UserSearch';
import { Icon } from '@iconify-icon/react';
import { getOrgRoleColor } from '../../../../utils/orgUtils';
import TabbedContainer, { CommonTabConfigs } from '../../../../components/TabbedContainer';
import './OrgManageModal.scss';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BATCH_MAX = 30;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function OrgManageModal({ orgId, isOpen, onClose, onSuccess }) {
    const { addNotification } = useNotification();
    const { data: orgData, loading: orgLoading, refetch: refetchOrg } = useFetch(
        orgId ? `/org-management/organizations/${orgId}` : null
    );
    const { data: membersData, loading: membersLoading, refetch: refetchMembers } = useFetch(
        orgId ? `/org-management/organizations/${orgId}/members` : null
    );

    const org = orgData?.data;
    const members = membersData?.members || [];
    const roles = org?.positions || [];

    const [activeTab, setActiveTab] = useState('info');
    const [formData, setFormData] = useState({
        org_name: '',
        org_description: '',
        org_profile_image: '',
        org_banner_image: ''
    });
    const [selectedFile, setSelectedFile] = useState(null);
    const [selectedBannerFile, setSelectedBannerFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    const [bannerPreview, setBannerPreview] = useState('');
    const [saving, setSaving] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [addRole, setAddRole] = useState('member');
    const [inviteSending, setInviteSending] = useState(false);
    const [batchEmailsRaw, setBatchEmailsRaw] = useState('');
    const [batchPreviewData, setBatchPreviewData] = useState(null);
    const [batchPreviewLoading, setBatchPreviewLoading] = useState(false);
    const [batchSending, setBatchSending] = useState(false);
    const [batchInviteRoles, setBatchInviteRoles] = useState({});
    const [newOwnerId, setNewOwnerId] = useState('');
    const [assigningOwner, setAssigningOwner] = useState(false);

    useEffect(() => {
        if (org) {
            setFormData({
                org_name: org.org_name || '',
                org_description: org.org_description || '',
                org_profile_image: org.org_profile_image || '',
                org_banner_image: org.org_banner_image || ''
            });
            setImagePreview(org.org_profile_image || '');
            setBannerPreview(org.org_banner_image || '');
        }
    }, [org]);

    const validateImageType = (file) => ALLOWED_IMAGE_TYPES.includes(file.type);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileSelect = (file) => {
        if (!file) return;
        if (!validateImageType(file)) {
            addNotification({ title: 'Error', message: 'Invalid image type. Use JPEG, PNG, or WebP.', type: 'error' });
            return;
        }
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = () => setImagePreview(reader.result);
        reader.readAsDataURL(file);
    };

    const handleBannerFileSelect = (file) => {
        if (!file) return;
        if (!validateImageType(file)) {
            addNotification({ title: 'Error', message: 'Invalid image type. Use JPEG, PNG, or WebP.', type: 'error' });
            return;
        }
        setSelectedBannerFile(file);
        const reader = new FileReader();
        reader.onload = () => setBannerPreview(reader.result);
        reader.readAsDataURL(file);
    };

    const handleSaveInfo = async () => {
        if (!orgId) return;
        setSaving(true);
        try {
            const formDataToSend = new FormData();
            formDataToSend.append('org_name', formData.org_name);
            formDataToSend.append('org_description', formData.org_description);
            if (formData.org_profile_image) formDataToSend.append('org_profile_image', formData.org_profile_image);
            if (formData.org_banner_image !== undefined) formDataToSend.append('org_banner_image', formData.org_banner_image);
            if (selectedFile) formDataToSend.append('image', selectedFile);
            if (selectedBannerFile) formDataToSend.append('bannerImage', selectedBannerFile);

            const response = await apiRequest(`/org-management/organizations/${orgId}/edit`, formDataToSend, {
                method: 'POST',
                headers: {}
            });

            if (response.success) {
                addNotification({ title: 'Success', message: 'Organization updated successfully', type: 'success' });
                refetchOrg({ silent: true });
                onSuccess?.();
            } else {
                addNotification({ title: 'Error', message: response.message || 'Failed to update', type: 'error' });
            }
        } catch (error) {
            addNotification({ title: 'Error', message: error.message || 'Failed to update organization', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleInviteByEmail = async () => {
        const email = (inviteEmail || selectedUser?.email || '').trim().toLowerCase();
        if (!email || !orgId) return;
        if (!EMAIL_REGEX.test(email)) {
            addNotification({ title: 'Error', message: 'Please enter a valid email address', type: 'error' });
            return;
        }
        setInviteSending(true);
        try {
            const response = await apiRequest(`/org-invites/${orgId}/invite`, { email, role: addRole }, { method: 'POST' });
            if (response.success) {
                const msg = response.data?.userExists
                    ? 'Invitation sent. The user will receive an email and in-app notification.'
                    : "Invitation sent. The user doesn't have an account yet—they'll receive an email to sign up and join.";
                addNotification({ title: 'Success', message: msg, type: 'success' });
                refetchMembers({ silent: true });
                refetchOrg({ silent: true });
                setInviteEmail('');
                setSelectedUser(null);
                onSuccess?.();
            } else {
                addNotification({ title: 'Error', message: response?.message || response?.error || 'Failed to send invitation', type: 'error' });
            }
        } catch (error) {
            addNotification({ title: 'Error', message: error?.message || error?.error || 'Failed to send invitation', type: 'error' });
        } finally {
            setInviteSending(false);
        }
    };

    const handleBatchPreview = async () => {
        const emails = parseEmails(batchEmailsRaw);
        if (emails.length === 0) {
            addNotification({ title: 'Error', message: 'Enter at least one email', type: 'error' });
            return;
        }
        if (emails.length > BATCH_MAX) {
            addNotification({ title: 'Error', message: `Maximum ${BATCH_MAX} emails per batch`, type: 'error' });
            return;
        }
        const { valid, invalid } = validateEmails(emails);
        if (invalid.length > 0) {
            addNotification({ title: 'Error', message: `Invalid emails: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '...' : ''}`, type: 'error' });
            return;
        }
        setBatchPreviewLoading(true);
        setBatchPreviewData(null);
        try {
            const response = await apiRequest(`/org-invites/${orgId}/batch-preview`, { emails: valid }, { method: 'POST' });
            if (response.success) {
                setBatchPreviewData(response.data);
                const defaults = {};
                (response.data.toInvite || []).forEach((item, i) => {
                    defaults[item.email] = item.role || 'member';
                });
                setBatchInviteRoles(defaults);
            } else {
                addNotification({ title: 'Error', message: response.message || 'Failed to preview', type: 'error' });
            }
        } catch (error) {
            addNotification({ title: 'Error', message: error.message || 'Failed to preview batch', type: 'error' });
        } finally {
            setBatchPreviewLoading(false);
        }
    };

    const handleBatchSend = async () => {
        if (!batchPreviewData?.toInvite?.length || !orgId) return;
        const invites = batchPreviewData.toInvite.map(item => ({
            email: item.email,
            role: batchInviteRoles[item.email] || item.role || 'member'
        }));
        setBatchSending(true);
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
                refetchMembers({ silent: true });
                refetchOrg({ silent: true });
                onSuccess?.();
            } else {
                addNotification({ title: 'Error', message: response.message || 'Failed to send invitations', type: 'error' });
            }
        } catch (error) {
            addNotification({ title: 'Error', message: error.message || 'Failed to send invitations', type: 'error' });
        } finally {
            setBatchSending(false);
        }
    };

    const handleRemoveMember = async (userId) => {
        if (!orgId) return;
        if (!window.confirm('Are you sure you want to remove this member?')) return;
        try {
            const response = await apiRequest(`/org-management/organizations/${orgId}/members/${userId}`, {}, {
                method: 'DELETE'
            });

            if (response.success) {
                addNotification({ title: 'Success', message: 'Member removed successfully', type: 'success' });
                refetchMembers({ silent: true });
                refetchOrg({ silent: true });
                onSuccess?.();
            } else {
                addNotification({ title: 'Error', message: response.message || 'Failed to remove member', type: 'error' });
            }
        } catch (error) {
            addNotification({ title: 'Error', message: error.message || 'Failed to remove member', type: 'error' });
        }
    };

    const handleChangeRole = async (userId, newRole) => {
        if (!orgId) return;
        try {
            const response = await apiRequest(`/org-management/organizations/${orgId}/members/${userId}/role`, {
                role: newRole
            }, { method: 'PUT' });

            if (response.success) {
                addNotification({ title: 'Success', message: 'Role updated successfully', type: 'success' });
                refetchMembers({ silent: true });
                refetchOrg({ silent: true });
                onSuccess?.();
            } else {
                addNotification({ title: 'Error', message: response.message || 'Failed to update role', type: 'error' });
            }
        } catch (error) {
            addNotification({ title: 'Error', message: error.message || 'Failed to update role', type: 'error' });
        }
    };

    const handleAssignOwner = async () => {
        if (!newOwnerId || !orgId) return;
        setAssigningOwner(true);
        try {
            const response = await apiRequest(`/org-management/organizations/${orgId}/owner`, {
                newOwnerId
            }, { method: 'PUT' });

            if (response.success) {
                addNotification({ title: 'Success', message: 'Owner assigned successfully', type: 'success' });
                refetchOrg({ silent: true });
                refetchMembers({ silent: true });
                setNewOwnerId('');
                onSuccess?.();
            } else {
                addNotification({ title: 'Error', message: response.message || 'Failed to assign owner', type: 'error' });
            }
        } catch (error) {
            addNotification({ title: 'Error', message: error.message || 'Failed to assign owner', type: 'error' });
        } finally {
            setAssigningOwner(false);
        }
    };

    const existingMemberIds = members.map(m => m.user_id?._id || m.user_id).filter(Boolean);
    const currentOwnerId = org?.owner?._id || org?.owner;
    const singleInviteEmail = (inviteEmail || selectedUser?.email || '').trim();

    const infoTabContent = (
        <div className="org-manage-info">
            <div className="form-group">
                <label>Organization Name</label>
                <input
                    type="text"
                    name="org_name"
                    value={formData.org_name}
                    onChange={handleInputChange}
                    placeholder="Organization name"
                />
            </div>
            <div className="form-group">
                <label>Description</label>
                <textarea
                    name="org_description"
                    value={formData.org_description}
                    onChange={handleInputChange}
                    placeholder="Organization description"
                    rows={4}
                />
            </div>
            <div className="form-group">
                <label>Profile Image</label>
                <div className="image-upload-row">
                    {imagePreview && <img src={imagePreview} alt="Preview" className="image-preview" />}
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => handleFileSelect(e.target.files?.[0])}
                    />
                </div>
            </div>
            <div className="form-group">
                <label>Banner Image</label>
                <div className="image-upload-row">
                    {bannerPreview && <img src={bannerPreview} alt="Banner" className="image-preview banner" />}
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => handleBannerFileSelect(e.target.files?.[0])}
                    />
                </div>
            </div>
            <button className="save-btn" onClick={handleSaveInfo} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
    );

    const membersTabContent = (
        <div className="org-manage-members">
            <div className="invite-section single-invite">
                <h4>Invite by email</h4>
                <div className="invite-row">
                    <div className="invite-input-wrap">
                        <input
                            type="email"
                            className="invite-email-input"
                            placeholder="Enter email address"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                        />
                        <div className="user-search-wrap">
                            <UserSearch
                                onUserSelect={(u) => { setSelectedUser(u); setInviteEmail(u?.email || ''); }}
                                placeholder="Or search user..."
                                excludeIds={existingMemberIds}
                                limit={10}
                            />
                        </div>
                    </div>
                    {roles.length > 0 && (
                        <select value={addRole} onChange={(e) => setAddRole(e.target.value)} className="role-select">
                            {roles.map(r => (
                                <option key={r.name} value={r.name}>{r.displayName || r.name}</option>
                            ))}
                        </select>
                    )}
                    <button
                        className="invite-btn"
                        onClick={handleInviteByEmail}
                        disabled={!singleInviteEmail || inviteSending}
                    >
                        {inviteSending ? 'Sending...' : 'Send Invite'}
                    </button>
                </div>
                {selectedUser && (
                    <div className="selected-user-hint">{selectedUser.name} ({selectedUser.email})</div>
                )}
            </div>

            <div className="invite-section batch-invite">
                <h4>Batch invite (max {BATCH_MAX})</h4>
                <textarea
                    className="batch-emails-input"
                    placeholder="Paste emails separated by commas or newlines"
                    value={batchEmailsRaw}
                    onChange={(e) => setBatchEmailsRaw(e.target.value)}
                    rows={3}
                />
                <div className="batch-actions">
                    <button className="preview-btn" onClick={handleBatchPreview} disabled={batchPreviewLoading}>
                        {batchPreviewLoading ? 'Loading...' : 'Preview'}
                    </button>
                </div>
                {batchPreviewData && (
                    <div className="batch-preview">
                        {(batchPreviewData.members?.length > 0 || batchPreviewData.invited?.length > 0) && (
                            <div className="batch-skipped">
                                {batchPreviewData.members?.length > 0 && (
                                    <span>{batchPreviewData.members.length} already member(s)</span>
                                )}
                                {batchPreviewData.invited?.length > 0 && (
                                    <span>{batchPreviewData.invited.length} already invited</span>
                                )}
                            </div>
                        )}
                        {batchPreviewData.toInvite?.length > 0 ? (
                            <>
                                <div className="batch-to-invite-list">
                                    {batchPreviewData.toInvite.map((item) => (
                                        <div key={item.email} className="batch-invite-row">
                                            <div className="batch-invite-info">
                                                {item.user ? (
                                                    <>
                                                        <img src={item.user.picture || '/Logo.svg'} alt="" className="batch-avatar" />
                                                        <span>{item.user.name || item.user.username}</span>
                                                        <span className="batch-email">{item.email}</span>
                                                    </>
                                                ) : (
                                                    <span className="batch-email-only">{item.email}</span>
                                                )}
                                            </div>
                                            <select
                                                value={batchInviteRoles[item.email] || 'member'}
                                                onChange={(e) => setBatchInviteRoles(prev => ({ ...prev, [item.email]: e.target.value }))}
                                                className="batch-role-select"
                                            >
                                                {roles.map(r => (
                                                    <option key={r.name} value={r.name}>{r.displayName || r.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                                <button className="send-batch-btn" onClick={handleBatchSend} disabled={batchSending}>
                                    {batchSending ? 'Sending...' : `Send ${batchPreviewData.toInvite.length} invite(s)`}
                                </button>
                            </>
                        ) : (
                            <p className="batch-empty">No new invites to send (all are members or already invited).</p>
                        )}
                    </div>
                )}
            </div>

            <div className="members-list">
                <h4>Members ({members.length})</h4>
                {membersLoading ? (
                    <p className="loading-text">Loading...</p>
                ) : (
                    <div className="member-rows">
                        {members.map((m) => {
                            const user = m.user_id;
                            const userId = user?._id || user;
                            const isOwner = userId === currentOwnerId;
                            return (
                                <div key={m._id} className="member-row">
                                    <div className="member-info">
                                        <img
                                            src={user?.picture || '/Logo.svg'}
                                            alt=""
                                            className="member-avatar"
                                        />
                                        <div className="member-details">
                                            <span className="member-name">{user?.name || 'Unknown'}</span>
                                            <span className="member-role" style={{ color: getOrgRoleColor(m.role, 1, roles) }}>
                                                {m.role}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="member-actions">
                                        {!isOwner && (
                                            <>
                                                <select
                                                    value={m.role}
                                                    onChange={(e) => handleChangeRole(userId, e.target.value)}
                                                    disabled={isOwner}
                                                >
                                                    {roles.map(r => (
                                                        <option key={r.name} value={r.name}>{r.displayName || r.name}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    className="remove-btn"
                                                    onClick={() => handleRemoveMember(userId)}
                                                    title="Remove member"
                                                >
                                                    <Icon icon="mdi:account-minus" />
                                                </button>
                                            </>
                                        )}
                                        {isOwner && <span className="owner-badge">Owner</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    const ownerTabContent = (
        <div className="org-manage-owner">
            <p className="owner-hint">Select an existing member to assign as the new organization owner.</p>
            <div className="owner-select-row">
                <select
                    value={newOwnerId}
                    onChange={(e) => setNewOwnerId(e.target.value)}
                >
                    <option value="">Select new owner...</option>
                    {members
                        .filter(m => (m.user_id?._id || m.user_id) !== currentOwnerId)
                        .map((m) => {
                            const user = m.user_id;
                            const uid = user?._id || user;
                            return (
                                <option key={uid} value={uid}>
                                    {user?.name || 'Unknown'} (@{user?.username})
                                </option>
                            );
                        })}
                </select>
                <button
                    className="assign-btn"
                    onClick={handleAssignOwner}
                    disabled={!newOwnerId || assigningOwner}
                >
                    {assigningOwner ? 'Assigning...' : 'Assign Owner'}
                </button>
            </div>
            {currentOwnerId && (
                <div className="current-owner">
                    Current owner: {org?.owner?.name || org?.owner?.username || '—'}
                </div>
            )}
        </div>
    );

    const tabs = [
        CommonTabConfigs.basic('info', 'Info', 'mdi:information', infoTabContent),
        CommonTabConfigs.basic('members', 'Members', 'mdi:account-group', membersTabContent),
        CommonTabConfigs.basic('owner', 'Owner', 'mdi:crown', ownerTabContent)
    ];

    return (
        <Popup isOpen={isOpen} onClose={onClose} customClassName="org-manage-modal-popup wide-content">
            <div className="org-manage-modal">
                <div className="modal-header">
                    <h2>
                        {orgLoading ? 'Loading...' : org?.org_name || 'Manage Organization'}
                    </h2>
                </div>
                <div className="modal-body">
                    {orgLoading ? (
                        <div className="loading-state">Loading organization...</div>
                    ) : org ? (
                        <TabbedContainer
                            tabs={tabs}
                            defaultTab="info"
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            tabStyle="underline"
                        />
                    ) : (
                        <div className="error-state">Organization not found</div>
                    )}
                </div>
            </div>
        </Popup>
    );
}

export default OrgManageModal;
