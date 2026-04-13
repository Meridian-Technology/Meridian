import React, { useState, useEffect, useMemo } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';
import Popup from '../../../../components/Popup/Popup';
import UserSearch from '../../../../components/UserSearch/UserSearch';
import { Icon } from '@iconify-icon/react';
import { getOrgRoleColor } from '../../../../utils/orgUtils';
import TabbedContainer, { CommonTabConfigs } from '../../../../components/TabbedContainer';
import Select from '../../../../components/Select/Select';
import Switch from '../../../../components/Switch/Switch';
import './OrgManageModal.scss';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BATCH_MAX = 30;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TAB_HINTS = {
    info: 'Edit name, description, images, and Atlas lifecycle status.',
    members: 'Invite people by email, change roles, or remove members.',
    events: 'Browse all hosted events in a time window and open deep engagement for any row.',
    governance: 'Open PDFs and approve draft governance versions when ready.',
    owner: 'Pick a current member to become the new owner.'
};

const EVENT_RANGE_OPTIONS = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: '1y', label: '1 year' }
];
const EVENT_WINDOW_OPTIONS = ['Past', 'Upcoming'];

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

function formatAdminDate(value) {
    if (value == null || value === '') return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatAdminDateTime(value) {
    if (value == null || value === '') return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function summarizeGovernanceDocuments(docs) {
    let versions = 0;
    let drafts = 0;
    let approved = 0;
    for (const slot of docs || []) {
        for (const v of slot.versions || []) {
            versions += 1;
            if (v.status === 'draft') drafts += 1;
            if (v.status === 'approved') approved += 1;
        }
    }
    return { slots: docs?.length ?? 0, versions, drafts, approved };
}

function OrgManageModal({ orgId, isOpen, onClose, onSuccess }) {
    const { addNotification } = useNotification();
    const { data: orgData, loading: orgLoading, refetch: refetchOrg } = useFetch(
        orgId ? `/org-management/organizations/${orgId}` : null
    );
    const { data: membersData, loading: membersLoading, refetch: refetchMembers } = useFetch(
        orgId ? `/org-management/organizations/${orgId}/members` : null
    );
    const { data: mgmtConfigRes } = useFetch('/org-management/config');

    const org = orgData?.data;
    const members = membersData?.members || [];
    const roles = org?.positions || [];

    const [modalMode, setModalMode] = useState('overview');
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
    const [lifecycleSaving, setLifecycleSaving] = useState(false);
    const [adminLifecycleStatus, setAdminLifecycleStatus] = useState('active');
    const [governanceApproving, setGovernanceApproving] = useState(null);
    const [viewerFile, setViewerFile] = useState(null);
    const [eventRange, setEventRange] = useState('30d');
    const [eventWindow, setEventWindow] = useState('past');
    const [eventsListPage, setEventsListPage] = useState(1);
    const [eventsListSort, setEventsListSort] = useState('engagement');
    const [selectedEventInsightId, setSelectedEventInsightId] = useState(null);

    const eventSnapshotUrl = useMemo(() => {
        if (!orgId) return null;
        const p = new URLSearchParams({ range: eventRange, window: eventWindow, top: '5' });
        return `/org-management/organizations/${orgId}/events/snapshot?${p}`;
    }, [orgId, eventRange, eventWindow]);

    const eventsListUrl = useMemo(() => {
        if (!orgId || modalMode !== 'manage' || activeTab !== 'events') return null;
        const p = new URLSearchParams({
            range: eventRange,
            window: eventWindow,
            page: String(eventsListPage),
            limit: '12',
            sort: eventsListSort
        });
        return `/org-management/organizations/${orgId}/events?${p}`;
    }, [orgId, modalMode, activeTab, eventRange, eventWindow, eventsListPage, eventsListSort]);

    const eventEngagementUrl = useMemo(() => {
        if (!orgId || !selectedEventInsightId) return null;
        return `/org-management/organizations/${orgId}/events/${selectedEventInsightId}/engagement`;
    }, [orgId, selectedEventInsightId]);

    const { data: eventSnapRes, loading: eventSnapLoading } = useFetch(eventSnapshotUrl);
    const { data: eventsListRes, loading: eventsListLoading } = useFetch(eventsListUrl);
    const { data: eventEngagementRes, loading: eventEngagementLoading } = useFetch(eventEngagementUrl);

    const eventSnap = eventSnapRes?.data;
    const eventsListPayload = eventsListRes?.data;
    const eventEngagement = eventEngagementRes?.data;

    useEffect(() => {
        setEventsListPage(1);
        setSelectedEventInsightId(null);
    }, [eventRange, eventWindow]);

    useEffect(() => {
        if (activeTab !== 'events') setSelectedEventInsightId(null);
    }, [activeTab]);

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
            setAdminLifecycleStatus(org.lifecycleStatus || 'active');
        }
    }, [org]);

    useEffect(() => {
        if (!orgId) return;
        setModalMode('overview');
        setActiveTab('info');
        setInviteEmail('');
        setSelectedUser(null);
        setBatchEmailsRaw('');
        setBatchPreviewData(null);
        setBatchInviteRoles({});
        setNewOwnerId('');
        setViewerFile(null);
        setEventRange('30d');
        setEventWindow('past');
        setEventsListPage(1);
        setEventsListSort('engagement');
        setSelectedEventInsightId(null);
    }, [orgId]);

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

    const atlasStatuses = mgmtConfigRes?.data?.atlasPolicy?.lifecycle?.statuses || [
        { key: 'active', label: 'Active' },
        { key: 'sunset', label: 'Sunset' },
        { key: 'inactive', label: 'Inactive' }
    ];

    const handleSaveLifecycle = async () => {
        if (!orgId) return;
        setLifecycleSaving(true);
        try {
            const res = await apiRequest(
                `/org-management/organizations/${orgId}/lifecycle`,
                { lifecycleStatus: adminLifecycleStatus },
                { method: 'PATCH' }
            );
            if (res.success) {
                addNotification({ title: 'Saved', message: 'Lifecycle status updated', type: 'success' });
                refetchOrg();
            }
        } catch (e) {
            addNotification({ title: 'Error', message: e.message || 'Failed to update lifecycle', type: 'error' });
        } finally {
            setLifecycleSaving(false);
        }
    };

    const handleApproveGovernanceVersion = async (docKey, version) => {
        if (!orgId) return;
        const key = `${docKey}:${version}`;
        setGovernanceApproving(key);
        try {
            const encodedKey = encodeURIComponent(docKey);
            const res = await apiRequest(
                `/org-management/organizations/${orgId}/governance/${encodedKey}/versions/${version}/approve`,
                null,
                { method: 'PUT' }
            );
            if (res.success) {
                addNotification({
                    title: 'Approved',
                    message: `${docKey} v${version} is now the active version.`,
                    type: 'success'
                });
                refetchOrg();
                onSuccess?.();
            } else {
                addNotification({
                    title: 'Error',
                    message: res.message || 'Failed to approve',
                    type: 'error'
                });
            }
        } catch (e) {
            const msg = e?.response?.data?.message || e?.message || 'Failed to approve';
            addNotification({ title: 'Error', message: msg, type: 'error' });
        } finally {
            setGovernanceApproving(null);
        }
    };

    const openPdfViewer = (url, filename) => {
        if (!url) return;
        setViewerFile({ url, filename: filename || 'Governance document' });
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

    const governanceSummary = useMemo(
        () => summarizeGovernanceDocuments(org?.governanceDocuments),
        [org?.governanceDocuments]
    );

    const roleCounts = useMemo(() => {
        const acc = {};
        for (const m of members) {
            const r = m.role || '—';
            acc[r] = (acc[r] || 0) + 1;
        }
        return acc;
    }, [members]);

    const memberTotal = org?.memberCount ?? members.length;
    const events30d = org?.recentEventCount ?? 0;
    const eventsAllTime = org?.totalEventCount ?? 0;

    const overviewContent = org && (
        <div className="org-overview">


            <div className="org-overview-stats">
                <div className="org-stat-tile">
                    <Icon icon="mdi:account-multiple" />
                    <span className="org-stat-value">{membersLoading ? '…' : memberTotal}</span>
                    <span className="org-stat-label">Members</span>
                </div>
                <div className="org-stat-tile">
                    <Icon icon="mdi:calendar-month" />
                    <span className="org-stat-value">{events30d}</span>
                    <span className="org-stat-label">Events (30 days)</span>
                </div>
                <div className="org-stat-tile">
                    <Icon icon="mdi:calendar-star" />
                    <span className="org-stat-value">{eventsAllTime}</span>
                    <span className="org-stat-label">Events (all time)</span>
                </div>
                <div className="org-stat-tile">
                    <Icon icon="mdi:file-document-multiple" />
                    <span className="org-stat-value">{governanceSummary.versions}</span>
                    <span className="org-stat-label">Governance versions</span>
                    {governanceSummary.drafts > 0 && (
                        <span className="org-stat-badge">{governanceSummary.drafts} draft{governanceSummary.drafts === 1 ? '' : 's'}</span>
                    )}
                </div>
            </div>

            <div className="org-overview-pills">
                {org.verified ? (
                    <span className="org-pill org-pill--success">
                        <Icon icon="mdi:shield-check" /> Verified
                        {org.verificationType ? ` · ${org.verificationType}` : ''}
                    </span>
                ) : (
                    <span className="org-pill org-pill--muted">Not verified</span>
                )}
                {org.lifecycleStatus && (
                    <span className="org-pill">Atlas: {org.lifecycleStatus}</span>
                )}
                {org.approvalStatus && org.approvalStatus !== 'approved' && (
                    <span className="org-pill org-pill--warn">Approval: {org.approvalStatus}</span>
                )}
                {org.verificationStatus && org.verificationStatus !== 'approved' && (
                    <span className="org-pill org-pill--warn">Verification: {org.verificationStatus}</span>
                )}
            </div>

            <section className="org-overview-section">
                <h3 className="org-overview-heading">About</h3>
                <p className="org-overview-description">
                    {org.org_description?.trim() ? org.org_description : 'No description on file.'}
                </p>
            </section>

            <div className="org-overview-grid">
                <section className="org-overview-card">
                    <h3 className="org-overview-heading">Owner</h3>
                    {org.owner ? (
                        <div className="org-overview-owner">
                            <img
                                src={org.owner.picture || '/Logo.svg'}
                                alt=""
                                className="org-overview-owner-avatar"
                            />
                            <div>
                                <div className="org-overview-owner-name">{org.owner.name || '—'}</div>
                                <div className="org-overview-owner-meta">@{org.owner.username || '—'}</div>
                                {org.owner.email && (
                                    <div className="org-overview-owner-meta">{org.owner.email}</div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="org-overview-muted">No owner data.</p>
                    )}
                </section>

                <section className="org-overview-card">
                    <h3 className="org-overview-heading">Key dates</h3>
                    <dl className="org-overview-dl">
                        <div><dt>Created</dt><dd>{formatAdminDate(org.createdAt)}</dd></div>
                        {org.verified && (
                            <div><dt>Verified</dt><dd>{formatAdminDate(org.verifiedAt)}</dd></div>
                        )}
                        {org.approvedAt && (
                            <div><dt>Atlas approved</dt><dd>{formatAdminDate(org.approvedAt)}</dd></div>
                        )}
                    </dl>
                </section>

                <section className="org-overview-card">
                    <h3 className="org-overview-heading">Member roles</h3>
                    {membersLoading ? (
                        <p className="org-overview-muted">Loading…</p>
                    ) : Object.keys(roleCounts).length === 0 ? (
                        <p className="org-overview-muted">No members loaded.</p>
                    ) : (
                        <ul className="org-overview-role-list">
                            {Object.entries(roleCounts)
                                .sort((a, b) => b[1] - a[1])
                                .map(([role, count]) => (
                                    <li key={role}>
                                        <span className="org-role-name" style={{ color: getOrgRoleColor(role, 1, roles) }}>
                                            {role}
                                        </span>
                                        <span className="org-role-count">{count}</span>
                                    </li>
                                ))}
                        </ul>
                    )}
                </section>

                <section className="org-overview-card">
                    <h3 className="org-overview-heading">Governance</h3>
                    {governanceSummary.slots === 0 ? (
                        <p className="org-overview-muted">No governance documents.</p>
                    ) : (
                        <ul className="org-overview-muted org-overview-gov-summary">
                            <li>{governanceSummary.slots} document slot{governanceSummary.slots === 1 ? '' : 's'}</li>
                            <li>{governanceSummary.versions} total version{governanceSummary.versions === 1 ? '' : 's'}</li>
                            <li>{governanceSummary.approved} approved</li>
                            {governanceSummary.drafts > 0 && (
                                <li className="org-overview-gov-drafts">{governanceSummary.drafts} awaiting approval</li>
                            )}
                        </ul>
                    )}
                </section>
            </div>

            <section className="org-overview-section org-overview-events-spotlight">
                <div className="org-overview-events-head">
                    <h3 className="org-overview-heading">Standout events</h3>
                    <div className="org-event-filters">
                        <Select
                            optionItems={EVENT_RANGE_OPTIONS}
                            defaultValue={eventRange}
                            onChange={(value) => setEventRange(value)}
                            placeholder="Range"
                        />
                        <Switch
                            options={EVENT_WINDOW_OPTIONS}
                            selectedPass={eventWindow === 'past' ? 0 : 1}
                            setSelectedPass={(index) => setEventWindow(index === 0 ? 'past' : 'upcoming')}
                            onChange={(index) => setEventWindow(index === 0 ? 'past' : 'upcoming')}
                            ariaLabel="Event window"
                        />
                    </div>
                </div>
                <p className="org-overview-muted org-overview-events-caption">
                    Ranked by registrations, RSVPs, and page views in the selected window ({eventSnap?.totalInRange ?? 0} event{(eventSnap?.totalInRange ?? 0) === 1 ? '' : 's'}).
                </p>
                {eventSnapLoading ? (
                    <p className="org-overview-muted">Loading events…</p>
                ) : (eventSnap?.topEvents?.length ?? 0) === 0 ? (
                    <p className="org-overview-muted">No hosted events in this window.</p>
                ) : (
                    <ul className="org-top-events">
                        {eventSnap.topEvents.map((ev) => (
                            <li key={ev._id}>
                                <button
                                    type="button"
                                    className="org-top-event-card"
                                    onClick={() => {
                                        setModalMode('manage');
                                        setActiveTab('events');
                                        setSelectedEventInsightId(ev._id);
                                    }}
                                >
                                    {ev.image && <img src={ev.image} alt="" className="org-top-event-img" />}
                                    <div className="org-top-event-body">
                                        <span className="org-top-event-name">{ev.name}</span>
                                        <span className="org-top-event-meta">
                                            {formatAdminDateTime(ev.start_time)}
                                            {ev.type ? ` · ${ev.type}` : ''}
                                        </span>
                                        <span className="org-top-event-metrics">
                                            {ev.registrationCount} listed · {ev.analytics.uniqueViews} uniq. views · {ev.analytics.uniqueRegistrations} uniq. RSVPs
                                        </span>
                                    </div>
                                    <Icon icon="mdi:chevron-right" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="org-overview-events-footer">
                    <button
                        type="button"
                        className="org-mode-btn org-mode-btn--primary"
                        onClick={() => {
                            setModalMode('manage');
                            setActiveTab('events');
                        }}
                    >
                        <Icon icon="mdi:chart-timeline-variant" />
                        Full events list and engagement
                    </button>
                </div>
            </section>

            <p className="org-overview-hint">
                Use <strong>Manage organization</strong> to edit profile and images, change Atlas lifecycle, invite members, review governance PDFs, or transfer ownership.
            </p>
        </div>
    );

    const infoTabContent = (
        <div className="org-manage-info">
            <section className="manage-card">
                <h3 className="manage-card-title">Public profile</h3>
                <p className="manage-card-hint">Shown on the org page and in search.</p>
                <div className="form-group">
                    <label htmlFor="org-manage-name">Organization name</label>
                    <input
                        id="org-manage-name"
                        type="text"
                        name="org_name"
                        value={formData.org_name}
                        onChange={handleInputChange}
                        placeholder="Organization name"
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="org-manage-desc">Description</label>
                    <textarea
                        id="org-manage-desc"
                        name="org_description"
                        value={formData.org_description}
                        onChange={handleInputChange}
                        placeholder="Short description for members and visitors"
                        rows={4}
                    />
                </div>
            </section>

            <section className="manage-card">
                <h3 className="manage-card-title">Atlas lifecycle</h3>
                <p className="manage-card-hint">Controls how the org appears in Atlas listings and policies.</p>
                <div className="form-group">
                    <label htmlFor="org-manage-lifecycle">Status</label>
                    <div className="lifecycle-admin-row">
                        <select
                            id="org-manage-lifecycle"
                            value={adminLifecycleStatus}
                            onChange={(e) => setAdminLifecycleStatus(e.target.value)}
                        >
                            {atlasStatuses.map((s) => (
                                <option key={s.key} value={s.key}>{s.label || s.key}</option>
                            ))}
                        </select>
                        <button type="button" className="save-btn secondary" onClick={handleSaveLifecycle} disabled={lifecycleSaving}>
                            {lifecycleSaving ? 'Saving...' : 'Apply'}
                        </button>
                    </div>
                </div>
            </section>

            <section className="manage-card">
                <h3 className="manage-card-title">Images</h3>
                <p className="manage-card-hint">JPEG, PNG, or WebP. Save profile changes after choosing files.</p>
                <div className="form-group">
                    <label>Profile image</label>
                    <div className="image-upload-row">
                        {imagePreview && <img src={imagePreview} alt="" className="image-preview" />}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => handleFileSelect(e.target.files?.[0])}
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label>Banner image</label>
                    <div className="image-upload-row">
                        {bannerPreview && <img src={bannerPreview} alt="" className="image-preview banner" />}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => handleBannerFileSelect(e.target.files?.[0])}
                        />
                    </div>
                </div>
            </section>

            <div className="manage-footer-actions">
                <button type="button" className="save-btn" onClick={handleSaveInfo} disabled={saving}>
                    {saving ? 'Saving...' : 'Save profile changes'}
                </button>
            </div>
        </div>
    );

    const membersTabContent = (
        <div className="org-manage-members">
            <section className="manage-card">
                <h3 className="manage-card-title">Single invite</h3>
                <p className="manage-card-hint">Type an email or search for a user, pick a role, then send one invitation.</p>
                <div className="invite-stack">
                    <div className="invite-field">
                        <label className="field-label" htmlFor="org-invite-email">Email</label>
                        <input
                            id="org-invite-email"
                            type="email"
                            className="invite-email-input"
                            placeholder="name@school.edu"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                    <div className="invite-field">
                        <span className="field-label">Or search directory</span>
                        <div className="user-search-wrap">
                            <UserSearch
                                onUserSelect={(u) => { setSelectedUser(u); setInviteEmail(u?.email || ''); }}
                                placeholder="Search by name or username..."
                                excludeIds={existingMemberIds}
                                limit={10}
                            />
                        </div>
                    </div>
                    <div className="invite-actions-row">
                        {roles.length > 0 && (
                            <div className="invite-field invite-field--inline">
                                <label className="field-label" htmlFor="org-invite-role">Role</label>
                                <select id="org-invite-role" value={addRole} onChange={(e) => setAddRole(e.target.value)} className="role-select">
                                    {roles.map(r => (
                                        <option key={r.name} value={r.name}>{r.displayName || r.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            type="button"
                            className="invite-btn"
                            onClick={handleInviteByEmail}
                            disabled={!singleInviteEmail || inviteSending}
                        >
                            {inviteSending ? 'Sending…' : 'Send invite'}
                        </button>
                    </div>
                    {selectedUser && (
                        <div className="selected-user-hint">Selected: {selectedUser.name} ({selectedUser.email})</div>
                    )}
                </div>
            </section>

            <section className="manage-card batch-invite-card">
                <h3 className="manage-card-title">Batch invite</h3>
                <p className="manage-card-hint">Up to {BATCH_MAX} addresses at once. Preview checks who is already a member or invited.</p>
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
            </section>

            <section className="manage-card members-list-card">
                <h3 className="manage-card-title">Members ({membersLoading ? '…' : members.length})</h3>
                <p className="manage-card-hint">Owners cannot be removed here; assign a new owner in the Owner tab first.</p>
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
            </section>
        </div>
    );

    const evPagination = eventsListPayload?.pagination;
    const eventsListRows = eventsListPayload?.events || [];
    const totalEventsInWindow = evPagination?.total ?? eventsListRows.length;
    const listStart = totalEventsInWindow === 0 ? 0 : ((eventsListPage - 1) * (evPagination?.limit || 12)) + 1;
    const listEnd = totalEventsInWindow === 0
        ? 0
        : Math.min(eventsListPage * (evPagination?.limit || 12), totalEventsInWindow);

    useEffect(() => {
        if (activeTab !== 'events') return;
        if (!eventsListRows.length) {
            setSelectedEventInsightId(null);
            return;
        }
        const hasSelected = eventsListRows.some((ev) => String(ev._id) === String(selectedEventInsightId));
        if (!hasSelected) {
            setSelectedEventInsightId(eventsListRows[0]._id);
        }
    }, [activeTab, eventsListRows, selectedEventInsightId]);

    const eventsTabContent = (
        <div className="org-manage-events">
            <section className="manage-card manage-card--flush">
                <h3 className="manage-card-title">Hosted events</h3>
                <p className="manage-card-hint">
                    Filter by time window, sort the table, then select an event for registrations, views, volunteers, check-in, and agenda context.
                </p>
                <div className="org-events-toolbar">
                    <div className="org-events-control">
                        <span className="org-events-control-label">Range</span>
                        <Select
                            optionItems={EVENT_RANGE_OPTIONS}
                            defaultValue={eventRange}
                            onChange={(value) => setEventRange(value)}
                            placeholder="Range"
                        />
                    </div>
                    <div className="org-events-scope-block">
                        <span className="org-events-scope-label">Window</span>
                        <Switch
                            options={EVENT_WINDOW_OPTIONS}
                            selectedPass={eventWindow === 'past' ? 0 : 1}
                            setSelectedPass={(index) => setEventWindow(index === 0 ? 'past' : 'upcoming')}
                            onChange={(index) => setEventWindow(index === 0 ? 'past' : 'upcoming')}
                            ariaLabel="Event window"
                        />
                    </div>
                    <div className="org-events-control">
                        <span className="org-events-control-label">Sort by</span>
                        <Select
                            optionItems={[
                                { value: 'engagement', label: 'Engagement' },
                                { value: 'start_time', label: 'Start time' }
                            ]}
                            defaultValue={eventsListSort}
                            onChange={(value) => { setEventsListSort(value); setEventsListPage(1); }}
                            placeholder="Sort"
                        />
                    </div>
                </div>
            </section>

            <div className="org-events-summary-bar">
                <span>{totalEventsInWindow} event{totalEventsInWindow === 1 ? '' : 's'} in selected window</span>
                <span>Showing {listStart}-{listEnd}</span>
                <span>{selectedEventInsightId ? 'Event details auto-load on selection' : 'Pick an event to view details'}</span>
            </div>

            <div className="org-events-split">
                <div className="org-events-list-pane">
                    <h4 className="org-events-pane-title">Event list</h4>
                    {eventsListLoading ? (
                        <p className="org-overview-muted">Loading…</p>
                    ) : eventsListRows.length === 0 ? (
                        <p className="org-overview-muted">No events in this window.</p>
                    ) : (
                        <div className="org-events-table-wrap">
                            <table className="org-events-table">
                                <thead>
                                    <tr>
                                        <th>Event</th>
                                        <th>Starts</th>
                                        <th>RSVPs</th>
                                        <th>Unique views</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {eventsListRows.map((ev) => {
                                        const id = ev._id;
                                        const active = String(selectedEventInsightId) === String(id);
                                        return (
                                            <tr
                                                key={id}
                                                className={active ? 'is-selected' : ''}
                                            >
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="org-events-row-btn"
                                                        onClick={() => setSelectedEventInsightId(id)}
                                                    >
                                                        <span className="org-events-row-name">{ev.name}</span>
                                                        <span className="org-events-row-meta">
                                                            {ev.type || 'General'}
                                                            {ev.status ? ` · ${ev.status}` : ''}
                                                        </span>
                                                    </button>
                                                </td>
                                                <td>{formatAdminDateTime(ev.start_time)}</td>
                                                <td>{ev.registrationCount}</td>
                                                <td>{ev.analytics?.uniqueViews ?? 0}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {evPagination && evPagination.totalPages > 1 && (
                        <div className="org-events-pagination">
                            <button
                                type="button"
                                className="page-btn"
                                disabled={eventsListPage <= 1 || eventsListLoading}
                                onClick={() => setEventsListPage((p) => Math.max(1, p - 1))}
                            >
                                Previous
                            </button>
                            <span className="page-info">
                                Page {eventsListPage} of {evPagination.totalPages}
                            </span>
                            <button
                                type="button"
                                className="page-btn"
                                disabled={eventsListPage >= evPagination.totalPages || eventsListLoading}
                                onClick={() => setEventsListPage((p) => Math.min(evPagination.totalPages, p + 1))}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>

                <div className="org-events-detail-pane">
                    <h4 className="org-events-pane-title">Engagement detail</h4>
                    {!selectedEventInsightId ? (
                        <p className="org-overview-muted">Select an event to load engagement detail.</p>
                    ) : eventEngagementLoading ? (
                        <p className="org-overview-muted">Loading engagement…</p>
                    ) : !eventEngagement ? (
                        <p className="org-overview-muted">Could not load this event.</p>
                    ) : (
                        <div className="org-event-engagement">
                            <h4 className="org-event-engagement-title">{eventEngagement.event?.name}</h4>
                            <p className="org-event-engagement-sub">
                                {eventEngagement.stats?.operationalStatus}
                                {eventEngagement.event?.type ? ` · ${eventEngagement.event.type}` : ''}
                                {' · '}
                                {formatAdminDateTime(eventEngagement.event?.start_time)}
                            </p>
                            <div className="org-engagement-metrics">
                                <div className="org-eng-metric">
                                    <span className="org-eng-metric-label">Unique views</span>
                                    <span className="org-eng-metric-val">{eventEngagement.analytics?.uniqueViews ?? 0}</span>
                                </div>
                                <div className="org-eng-metric">
                                    <span className="org-eng-metric-label">Total views</span>
                                    <span className="org-eng-metric-val">{eventEngagement.analytics?.views ?? 0}</span>
                                </div>
                                <div className="org-eng-metric">
                                    <span className="org-eng-metric-label">Unique RSVPs</span>
                                    <span className="org-eng-metric-val">{eventEngagement.analytics?.uniqueRegistrations ?? 0}</span>
                                </div>
                                <div className="org-eng-metric">
                                    <span className="org-eng-metric-label">Listed registrations</span>
                                    <span className="org-eng-metric-val">{eventEngagement.stats?.registrationCount ?? 0}</span>
                                </div>
                                <div className="org-eng-metric">
                                    <span className="org-eng-metric-label">Volunteer roles</span>
                                    <span className="org-eng-metric-val">{eventEngagement.roles?.total ?? 0}</span>
                                </div>
                                <div className="org-eng-metric">
                                    <span className="org-eng-metric-label">Volunteer assignments</span>
                                    <span className="org-eng-metric-val">{eventEngagement.roles?.assignments ?? 0}</span>
                                </div>
                                <div className="org-eng-metric">
                                    <span className="org-eng-metric-label">Confirmed volunteers</span>
                                    <span className="org-eng-metric-val">{eventEngagement.roles?.confirmed ?? 0}</span>
                                </div>
                                <div className="org-eng-metric">
                                    <span className="org-eng-metric-label">Agenda items</span>
                                    <span className="org-eng-metric-val">{eventEngagement.agenda?.items?.length ?? 0}</span>
                                </div>
                            </div>
                            <div className="org-engagement-block">
                                <h5>View sources</h5>
                                <div className="org-engagement-sources">
                                    <span>Email: {eventEngagement.analytics?.sources?.email ?? 0}</span>
                                    <span>Org page: {eventEngagement.analytics?.sources?.org_page ?? 0}</span>
                                    <span>Explore: {eventEngagement.analytics?.sources?.explore ?? 0}</span>
                                    <span>Direct: {eventEngagement.analytics?.sources?.direct ?? 0}</span>
                                </div>
                            </div>
                            {eventEngagement.stats?.checkIn && (
                                <div className="org-engagement-block">
                                    <h5>Check-in</h5>
                                    <p>
                                        {eventEngagement.stats.checkIn.totalCheckedIn} / {eventEngagement.stats.checkIn.totalRegistrations} checked in
                                        ({eventEngagement.stats.checkIn.checkInRate}%)
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const ownerTabContent = (
        <div className="org-manage-owner">
            <section className="manage-card">
                <h3 className="manage-card-title">Transfer ownership</h3>
                <p className="manage-card-hint">The new owner must already be a member. They gain full control of billing and settings.</p>
                <div className="owner-select-row">
                    <select
                        value={newOwnerId}
                        onChange={(e) => setNewOwnerId(e.target.value)}
                        aria-label="Member to promote to owner"
                    >
                        <option value="">Choose member…</option>
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
                        type="button"
                        className="assign-btn"
                        onClick={handleAssignOwner}
                        disabled={!newOwnerId || assigningOwner}
                    >
                        {assigningOwner ? 'Assigning…' : 'Assign owner'}
                    </button>
                </div>
                {currentOwnerId && (
                    <div className="current-owner">
                        Current owner: <strong>{org?.owner?.name || org?.owner?.username || '—'}</strong>
                    </div>
                )}
            </section>
        </div>
    );

    const governanceDocs = org?.governanceDocuments || [];
    const governanceTabContent = (
        <div className="org-manage-governance">
            <section className="manage-card manage-card--flush">
                <h3 className="manage-card-title">Document versions</h3>
                <p className="governance-hint">
                    Drafts from the org show here. Approve a draft to make it active; older approved versions become superseded.
                </p>
            </section>
            {governanceDocs.length === 0 ? (
                <div className="empty-gov">No governance documents on file.</div>
            ) : (
                governanceDocs.map((slot) => (
                    <div key={slot.key} className="gov-slot">
                        <h4 className="gov-slot-title">{slot.key}</h4>
                        <ul className="gov-version-list">
                            {(slot.versions || [])
                                .slice()
                                .sort((a, b) => b.version - a.version)
                                .map((v) => {
                                    const approveKey = `${slot.key}:${v.version}`;
                                    return (
                                        <li key={v.version} className={`gov-version-row status-${v.status || 'unknown'}`}>
                                            <span className="gv-ver">v{v.version}</span>
                                            <span className="gv-status">{v.status}</span>
                                            {v.originalFilename && (
                                                <span className="gv-file" title={v.originalFilename}>
                                                    {v.originalFilename}
                                                </span>
                                            )}
                                            {v.storageUrl && (
                                                <button
                                                    type="button"
                                                    className="gv-link gv-link-button"
                                                    onClick={() => openPdfViewer(v.storageUrl, v.originalFilename || `${slot.key} v${v.version}`)}
                                                >
                                                    View
                                                </button>
                                            )}
                                            {v.status === 'draft' && (
                                                <button
                                                    type="button"
                                                    className="gv-approve"
                                                    disabled={governanceApproving === approveKey}
                                                    onClick={() => handleApproveGovernanceVersion(slot.key, v.version)}
                                                >
                                                    {governanceApproving === approveKey ? 'Approving…' : 'Approve'}
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                        </ul>
                    </div>
                ))
            )}
        </div>
    );

    const tabs = [
        CommonTabConfigs.basic('info', 'Profile & Atlas', 'mdi:card-account-details-outline', infoTabContent),
        CommonTabConfigs.basic('members', 'Members', 'mdi:account-group', membersTabContent),
        CommonTabConfigs.basic('events', 'Events', 'mdi:calendar-multiple', eventsTabContent),
        CommonTabConfigs.basic('governance', 'Governance', 'mdi:file-document-check-outline', governanceTabContent),
        CommonTabConfigs.basic('owner', 'Owner', 'mdi:crown', ownerTabContent)
    ];

    return (
        <>
            <Popup isOpen={isOpen} onClose={onClose} newStyling={true} customClassName="org-manage-modal-popup wide-content">
                <div className="org-manage-modal">
                    <div className="modal-header">
                        {/* {org?.org_banner_image && (
                            <div className="org-overview-banner">
                                <img src={org.org_banner_image} alt="" />
                            </div>
                        )} */}
                        <div className="modal-header-brand-content">
                            <div className="modal-header-brand">
                                {org?.org_profile_image && !orgLoading ? (
                                    <img src={org.org_profile_image} alt="" className="modal-org-thumb" />
                                ) : (
                                    <div className="modal-org-thumb modal-org-thumb--placeholder" aria-hidden>
                                        <Icon icon="mdi:domain" />
                                    </div>
                                )}
                                <div className="modal-header-text">
                                    <h2>{orgLoading ? 'Loading…' : org?.org_name || 'Organization'}</h2>
                                    {!orgLoading && org && (
                                        <p className="modal-header-meta">
                                            {modalMode === 'overview' ? (
                                                <>Snapshot for admins · {memberTotal} members · {events30d} events (30d)</>
                                            ) : (
                                                <>
                                                    {membersLoading ? '…' : `${members.length} member${members.length === 1 ? '' : 's'}`}
                                                    {org.verified ? ' · Verified' : ' · Not verified'}
                                                    {org.lifecycleStatus ? ` · ${org.lifecycleStatus}` : ''}
                                                </>
                                            )}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="modal-header-actions">
                                {!orgLoading && org && modalMode === 'overview' && (
                                    <button
                                        type="button"
                                        className="org-mode-btn org-mode-btn--primary"
                                        onClick={() => setModalMode('manage')}
                                    >
                                        <Icon icon="mdi:cog-outline" />
                                        Manage organization
                                    </button>
                                )}
                                {!orgLoading && org && modalMode === 'manage' && (
                                    <button
                                        type="button"
                                        className="org-mode-btn"
                                        onClick={() => setModalMode('overview')}
                                    >
                                        <Icon icon="mdi:arrow-left" />
                                        Back to overview
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="modal-body">
                        {orgLoading ? (
                            <div className="loading-state">Loading organization…</div>
                        ) : org ? (
                            modalMode === 'overview' ? (
                                overviewContent
                            ) : (
                                <>
                                    <p className="tab-context-hint">{TAB_HINTS[activeTab]}</p>
                                    <TabbedContainer
                                        key={orgId}
                                        tabs={tabs}
                                        defaultTab="info"
                                        activeTab={activeTab}
                                        onTabChange={setActiveTab}
                                        tabStyle="underline"
                                    />
                                </>
                            )
                        ) : (
                            <div className="error-state">Organization not found</div>
                        )}
                    </div>
                </div>
            </Popup>
            <Popup
                isOpen={Boolean(viewerFile)}
                onClose={() => setViewerFile(null)}
                customClassName="pdf-viewer-popup"
            >
                <div className="pdf-viewer">
                    <div className="pdf-viewer-header">
                        <h3>{viewerFile?.filename || 'PDF viewer'}</h3>
                        {viewerFile?.url && (
                            <a
                                className="gv-link"
                                href={viewerFile.url}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Open in new tab
                            </a>
                        )}
                    </div>
                    {viewerFile?.url && (
                        <iframe
                            src={viewerFile.url}
                            title={viewerFile.filename || 'Governance PDF'}
                            className="pdf-viewer-frame"
                        />
                    )}
                </div>
            </Popup>
        </>
    );
}

export default OrgManageModal;
