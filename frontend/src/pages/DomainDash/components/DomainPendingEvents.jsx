import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useFetch } from '../../../hooks/useFetch';
import { useGradient } from '../../../hooks/useGradient';
import { useNotification } from '../../../NotificationContext';
import apiRequest from '../../../utils/postRequest';
import Popup from '../../../components/Popup/Popup';
import DomainEventApprovalModal from './DomainEventApprovalModal';
import defaultAvatar from '../../../assets/defaultAvatar.svg';
import './DomainPendingEvents.scss';

/** Primary event flier URL from API (S3 etc.); optional previewImage from some list transforms. */
function eventCoverUrl(ev) {
    if (!ev) return '';
    const u = String(ev.image || ev.previewImage || '').trim();
    return u || '';
}

function formatLocationPreview(loc) {
    if (loc == null || loc === '') return null;
    if (typeof loc === 'string') {
        try {
            const parsed = JSON.parse(loc);
            if (parsed && typeof parsed === 'object') {
                return (
                    parsed.formattedAddress ||
                    parsed.name ||
                    parsed.address ||
                    parsed.label ||
                    null
                );
            }
        } catch {
            return loc.length > 80 ? `${loc.slice(0, 77)}…` : loc;
        }
        return loc.length > 80 ? `${loc.slice(0, 77)}…` : loc;
    }
    if (typeof loc === 'object') {
        const s =
            loc.formattedAddress || loc.name || loc.address || loc.label || '';
        return s || null;
    }
    return null;
}

function DomainPendingEventRow({ ev, index, onSelect, renderHostBlock }) {
    const coverUrl = eventCoverUrl(ev);
    const [thumbBroken, setThumbBroken] = useState(false);
    useEffect(() => {
        setThumbBroken(false);
    }, [coverUrl]);

    const showThumb = Boolean(coverUrl) && !thumbBroken;
    const start = ev.start_time ? new Date(ev.start_time) : null;
    const locLine = formatLocationPreview(ev.location);

    return (
        <li className="domain-pending-events__card" style={{ animationDelay: `${index * 45}ms` }}>
            {showThumb ? (
                <div className="domain-pending-events__card-thumb">
                    <img src={coverUrl} alt="" onError={() => setThumbBroken(true)} />
                    <span className="domain-pending-events__card-thumb-badge">Pending</span>
                </div>
            ) : null}
            <div className="domain-pending-events__card-body">
                <div className="domain-pending-events__card-badges">
                    {!showThumb ? (
                        <span className="domain-pending-events__badge domain-pending-events__badge--pending">
                            Pending
                        </span>
                    ) : null}
                    {ev.type && (
                        <span className="domain-pending-events__badge">{ev.type}</span>
                    )}
                    {ev.visibility && (
                        <span className="domain-pending-events__badge domain-pending-events__badge--muted">
                            {String(ev.visibility).replace(/_/g, ' ')}
                        </span>
                    )}
                </div>
                <h3 className="domain-pending-events__card-title">{ev.name}</h3>
                {renderHostBlock(ev)}
                <div className="domain-pending-events__details">
                    {start && (
                        <div className="domain-pending-events__detail-row">
                            <Icon icon="heroicons:calendar-16-solid" />
                            <span>
                                {start.toLocaleString(undefined, {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                })}
                            </span>
                        </div>
                    )}
                    {locLine && (
                        <div className="domain-pending-events__detail-row">
                            <Icon icon="fluent:location-28-filled" />
                            <span>{locLine}</span>
                        </div>
                    )}
                    <div className="domain-pending-events__detail-row domain-pending-events__detail-row--step">
                        <span className="domain-pending-events__step-dot" aria-hidden />
                        <Icon icon="mdi:shield-account" />
                        <span>
                            <strong>Current step:</strong> {ev.pendingStepRoleName}
                        </span>
                    </div>
                </div>
            </div>
            <div className="domain-pending-events__card-actions">
                <button
                    type="button"
                    className="domain-pending-events__btn domain-pending-events__btn--review"
                    onClick={() => onSelect(ev)}
                >
                    <Icon icon="mdi:clipboard-text-search-outline" />
                    Review
                </button>
                <a
                    className="domain-pending-events__btn domain-pending-events__btn--open"
                    href={`/event/${ev._id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Open
                    <Icon icon="heroicons:arrow-top-right-on-square-20-solid" />
                </a>
            </div>
        </li>
    );
}

function hostLevel(hostingType, hostingId) {
    if (hostingType === 'Org') return 'Organization';
    if (!hostingId?.roles) return 'User';
    if (hostingId.roles.includes('developer')) return 'Developer';
    if (hostingId.roles.includes('oie')) return 'Faculty';
    return 'Student';
}

function DomainPendingEvents() {
    const { domainId } = useParams();
    const { AdminGrad } = useGradient();
    const { addNotification } = useNotification();
    const { data, loading, error, refetch } = useFetch(
        domainId ? `/api/domain/${domainId}/pending-approval-events` : null
    );
    const [selected, setSelected] = useState(null);
    const [edited, setEdited] = useState(false);
    const [acting, setActing] = useState(false);

    const events = data?.events || [];

    const onPopupClose = useCallback(() => {
        setSelected(null);
        if (edited) {
            refetch();
            setEdited(false);
        }
    }, [edited, refetch]);

    const runAction = async (kind) => {
        if (!selected?._id || !domainId) return;
        setActing(true);
        try {
            const path =
                kind === 'approve'
                    ? `/api/domain/${domainId}/approval-events/${selected._id}/approve`
                    : `/api/domain/${domainId}/approval-events/${selected._id}/reject`;
            const res = await apiRequest(path, {}, { method: 'POST' });
            if (res.error) {
                addNotification({
                    title: 'Error',
                    message: typeof res.error === 'string' ? res.error : 'Request failed',
                    type: 'error'
                });
                return;
            }
            if (res.success) {
                addNotification({
                    title: kind === 'approve' ? 'Approved' : 'Rejected',
                    message: res.message || 'Updated.',
                    type: 'success'
                });
                setEdited(true);
                setSelected(null);
                refetch();
            } else {
                addNotification({
                    title: 'Action failed',
                    message: res.message || 'Could not update this event.',
                    type: 'error'
                });
            }
        } catch (e) {
            addNotification({
                title: 'Error',
                message: e?.message || 'Request failed',
                type: 'error'
            });
        } finally {
            setActing(false);
        }
    };

    const renderHostBlock = (event) => {
        if (!event.hostingType) return null;
        const level = hostLevel(event.hostingType, event.hostingId);
        const levelClass = level.toLowerCase();
        if (event.hostingType === 'User') {
            const img = event.hostingId?.image || defaultAvatar;
            const name = event.hostingId?.name || 'Host';
            return (
                <div className={`domain-pending-events__host domain-pending-events__host--${levelClass}`}>
                    <img src={img} alt="" />
                    <div className="domain-pending-events__host-text">
                        <span className="domain-pending-events__host-name">{name}</span>
                        <span className="domain-pending-events__host-level">{level}</span>
                    </div>
                </div>
            );
        }
        const img = event.hostingId?.org_profile_image || defaultAvatar;
        const name = event.hostingId?.org_name || 'Organization';
        return (
            <div className={`domain-pending-events__host domain-pending-events__host--${levelClass}`}>
                <img src={img} alt="" />
                <div className="domain-pending-events__host-text">
                    <span className="domain-pending-events__host-name">{name}</span>
                    <span className="domain-pending-events__host-level">{level}</span>
                </div>
            </div>
        );
    };

    const headerStat =
        !loading && !error ? (
            <div className="domain-pending-events-header__stat" aria-live="polite">
                <span className="domain-pending-events-header__stat-value">{events.length}</span>
                <span className="domain-pending-events-header__stat-label">
                    {events.length === 1 ? 'event' : 'events'} awaiting action
                </span>
            </div>
        ) : null;

    return (
        <div className="domain-pending-events dash">
            <header className="domain-pending-events-header header">
                <h1>Pending approvals</h1>
                <p>Review events whose current approval step maps to this domain.</p>
                {headerStat}
                <img src={AdminGrad} alt="" />
            </header>

            <div className="domain-pending-events-content">
                {loading && (
                    <div className="domain-pending-events-loading">
                        <div className="domain-pending-events-loading-inner">
                            <Icon icon="mdi:loading" className="domain-pending-events__spin" />
                            <p>Loading pending events…</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="domain-pending-events-error">
                        <Icon icon="mdi:alert-circle" />
                        <p>{error}</p>
                    </div>
                )}

                {!loading && !error && (
                    <>
                        <section className="domain-pending-events-banner">
                            <div className="domain-pending-events-banner-header">
                                <Icon icon="mdi:information-outline" />
                                <div>
                                    <h3>How this queue works</h3>
                                    <p>
                                        These events are in <strong>pending</strong> status and the current step
                                        belongs to a stakeholder role in this domain. Assigned approvers normally work
                                        from the OIE workspace; as <strong>admin / root</strong> you can open any row,
                                        review details in the full modal, and approve or reject on behalf of the
                                        domain workflow.
                                    </p>
                                </div>
                            </div>
                        </section>

                        {events.length === 0 ? (
                            <div className="domain-pending-events__empty">
                                <div className="domain-pending-events__empty-icon">
                                    <Icon icon="mdi:clipboard-check-outline" />
                                </div>
                                <h3>All clear</h3>
                                <p>Nothing is waiting on an approver role tied to this domain right now.</p>
                            </div>
                        ) : (
                            <ul className="domain-pending-events__list">
                                {events.map((ev, index) => (
                                    <DomainPendingEventRow
                                        key={ev._id}
                                        ev={ev}
                                        index={index}
                                        onSelect={setSelected}
                                        renderHostBlock={renderHostBlock}
                                    />
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>

            <Popup
                isOpen={Boolean(selected)}
                onClose={onPopupClose}
                customClassName="wider-content domain no-padding no-styling domain-pending-events-popup"
                waitForLoad={true}
                
            >
                {selected && (
                    <DomainEventApprovalModal
                        eventSummary={selected}
                        acting={acting}
                        onApprove={() => runAction('approve')}
                        onReject={() => runAction('reject')}
                        pendingStepRoleName={selected.pendingStepRoleName}
                        pendingStepRoleId={selected.pendingStepRoleId}
                    />
                )}
            </Popup>
        </div>
    );
}

export default DomainPendingEvents;
