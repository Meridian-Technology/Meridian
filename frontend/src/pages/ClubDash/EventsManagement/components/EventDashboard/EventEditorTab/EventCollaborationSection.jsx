import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import defaultAvatar from '../../../../../../assets/defaultAvatar.svg';
import './EventCollaborationSection.scss';

function EventCollaborationSection({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const allOrgsData = useFetch('/get-orgs?exhaustive=true');
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [busy, setBusy] = useState(false);

    const allOrgs = allOrgsData.data?.orgs || [];

    const hostOrgId =
        event?.hostingType === 'Org' ? String(event.hostingId?._id || event.hostingId || '') : '';
    const collaboratorEntries = event?.hostingType === 'Org' ? event.collaboratorOrgs || [] : [];
    const isHostDashboard = Boolean(hostOrgId && String(orgId) === hostOrgId);
    const myCollaborationEntry = useMemo(
        () =>
            collaboratorEntries.find((e) => String(e.orgId?._id || e.orgId) === String(orgId)) ||
            null,
        [collaboratorEntries, orgId]
    );
    const isCollaboratorDashboard = Boolean(
        hostOrgId && !isHostDashboard && myCollaborationEntry
    );

    const takenIds = useMemo(() => {
        const ids = new Set(hostOrgId ? [hostOrgId] : []);
        collaboratorEntries.forEach((e) => {
            const id = e.orgId?._id || e.orgId;
            if (id) ids.add(String(id));
        });
        return ids;
    }, [hostOrgId, collaboratorEntries]);

    const availableOrgs = useMemo(
        () => allOrgs.filter((o) => o?._id && !takenIds.has(String(o._id))),
        [allOrgs, takenIds]
    );

    if (!event || event.hostingType !== 'Org') {
        return null;
    }

    const handleAdd = async () => {
        if (!selectedOrgId || busy) return;
        setBusy(true);
        try {
            const res = await apiRequest(
                `/events/${event._id}/collaborators`,
                { collaboratorOrgIds: [selectedOrgId] },
                { method: 'POST' }
            );
            if (res.success) {
                addNotification({
                    title: 'Invites sent',
                    message: res.message || 'Collaboration invites were sent to organization managers.',
                    type: 'success'
                });
                setSelectedOrgId('');
                if (onRefresh) onRefresh();
            } else {
                throw new Error(res.message || 'Failed to add collaborator');
            }
        } catch (err) {
            addNotification({
                title: 'Error',
                message: err.message || 'Failed to add collaborator',
                type: 'error'
            });
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (collaboratorOrgId, options = {}) => {
        const { skipConfirm = false, successMessage } = options;
        if (!collaboratorOrgId || busy) return;
        if (!skipConfirm) {
            const ok = window.confirm(
                'Remove this organization from the event? Pending invitations for that organization will be cancelled.'
            );
            if (!ok) return;
        }
        setBusy(true);
        try {
            const res = await apiRequest(
                `/events/${event._id}/collaborators/${collaboratorOrgId}`,
                null,
                { method: 'DELETE' }
            );
            if (res.success) {
                addNotification({
                    title: 'Updated',
                    message: successMessage || res.message || 'Collaborator removed.',
                    type: 'success'
                });
                if (onRefresh) onRefresh();
            } else {
                throw new Error(res.message || 'Failed to remove collaborator');
            }
        } catch (err) {
            addNotification({
                title: 'Error',
                message: err.message || 'Failed to remove collaborator',
                type: 'error'
            });
        } finally {
            setBusy(false);
        }
    };

    const handleLeaveCollaboration = async () => {
        if (!orgId || busy) return;
        const isPending = myCollaborationEntry?.status === 'pending';
        const ok = window.confirm(
            isPending
                ? 'Withdraw your organization’s collaboration invitation for this event? You can be invited again later.'
                : 'End your organization’s collaboration on this event? You will lose access to manage it until invited again.'
        );
        if (!ok) return;
        await handleRemove(orgId, {
            skipConfirm: true,
            successMessage: 'Your organization is no longer collaborating on this event.'
        });
    };

    if (isCollaboratorDashboard) {
        const status = myCollaborationEntry?.status || 'pending';
        const hostName = event.hostingId?.org_name || 'the host organization';
        return (
            <div className="event-collaboration-section event-collaboration-section--collaborator">
                <div className="editor-header">
                    <h2>Collaboration</h2>
                </div>
                <p className="event-collaboration-section__hint">
                    {status === 'pending'
                        ? `Invitation pending — ${hostName} invited your organization to collaborate on this event.`
                        : `Your organization is collaborating with ${hostName} on this event.`}
                </p>
                <div className="event-collaboration-section__leave-row">
                    <button
                        type="button"
                        className="event-collaboration-section__leave-btn"
                        disabled={busy}
                        onClick={handleLeaveCollaboration}
                    >
                        <Icon icon="mdi:exit-run" />
                        {status === 'pending' ? 'Withdraw invitation' : 'Leave collaboration'}
                    </button>
                </div>
            </div>
        );
    }

    if (!isHostDashboard) {
        return null;
    }

    return (
        <div className="event-collaboration-section">
            <div className="editor-header">
                <h2>Collaborating organizations</h2>
            </div>
            <p className="event-collaboration-section__hint">
                Organizations you add receive an invite; their event managers can accept or decline from the events
                dashboard. Collaborators can end their own participation at any time from their event workspace.
            </p>

            <ul className="event-collaboration-section__list">
                {collaboratorEntries.length === 0 && (
                    <li className="event-collaboration-section__empty">No collaborating organizations yet.</li>
                )}
                {collaboratorEntries.map((entry) => {
                    const oid = entry.orgId?._id || entry.orgId;
                    const name = entry.orgId?.org_name || 'Organization';
                    const image = entry.orgId?.org_profile_image || defaultAvatar;
                    const status = entry.status || 'pending';
                    return (
                        <li key={String(oid)} className="event-collaboration-section__row">
                            <img src={image} alt="" className="event-collaboration-section__avatar" />
                            <div className="event-collaboration-section__meta">
                                <span className="event-collaboration-section__name">{name}</span>
                                <span
                                    className={`event-collaboration-section__status event-collaboration-section__status--${status}`}
                                >
                                    {status === 'active' ? 'Active' : status === 'pending' ? 'Pending' : status}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="event-collaboration-section__remove"
                                disabled={busy}
                                onClick={() => handleRemove(oid)}
                                aria-label={`Remove ${name}`}
                            >
                                <Icon icon="mdi:close" />
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div className="event-collaboration-section__add">
                <label className="section-label" htmlFor="collab-org-select">
                    Add organization
                </label>
                <div className="event-collaboration-section__add-row">
                    <select
                        id="collab-org-select"
                        value={selectedOrgId}
                        onChange={(e) => setSelectedOrgId(e.target.value)}
                        disabled={busy || allOrgsData.loading}
                    >
                        <option value="">
                            {allOrgsData.loading ? 'Loading organizations…' : 'Select an organization…'}
                        </option>
                        {availableOrgs.map((o) => (
                            <option key={o._id} value={o._id}>
                                {o.org_name || o.name || o._id}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="event-collaboration-section__add-btn"
                        disabled={busy || !selectedOrgId}
                        onClick={handleAdd}
                    >
                        <Icon icon="mdi:account-plus" />
                        Invite
                    </button>
                </div>
            </div>
        </div>
    );
}

export default EventCollaborationSection;
