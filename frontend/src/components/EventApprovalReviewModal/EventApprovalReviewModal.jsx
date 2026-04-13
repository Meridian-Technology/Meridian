import React, { useMemo } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useFetch } from '../../../hooks/useFetch';
import CommentsSection from '../../../components/CommentsSection.jsx/CommentsSection';
import StarGradient from '../../../assets/OIE-Gradient2.png';
import MockPoster from '../../../assets/MockPoster.png';
import defaultAvatar from '../../../assets/defaultAvatar.svg';
import './EventApprovalReviewModal.scss';

function formatLocation(loc) {
    if (loc == null || loc === '') return '—';
    if (typeof loc === 'string') {
        try {
            const parsed = JSON.parse(loc);
            if (parsed && typeof parsed === 'object') {
                return (
                    parsed.formattedAddress ||
                    parsed.name ||
                    parsed.address ||
                    parsed.label ||
                    loc
                );
            }
        } catch {
            return loc;
        }
        return loc;
    }
    if (typeof loc === 'object') {
        return (
            loc.formattedAddress ||
            loc.name ||
            loc.address ||
            loc.label ||
            JSON.stringify(loc)
        );
    }
    return String(loc);
}

function formatClassroom(room) {
    if (!room) return null;
    if (typeof room === 'string') return room;
    const parts = [room.building, room.name].filter(Boolean);
    return parts.length ? parts.join(' — ') : room.name || '—';
}

function hostLevel(hostingType, hostingId) {
    if (hostingType === 'Org') return 'Organization';
    if (!hostingId?.roles) return 'User';
    if (hostingId.roles.includes('developer')) return 'Developer';
    if (hostingId.roles.includes('oie')) return 'Faculty';
    return 'Student';
}

function ApprovalPipelineTimeline({ event }) {
    const ref = event?.approvalReference;
    const approvals = ref?.approvals || [];
    const currentIdx = ref?.currentStepIndex ?? 0;

    const steps = useMemo(() => {
        const created = new Date(event?.createdAt || Date.now());
        const rows = [
            {
                key: 'created',
                title: 'Event created',
                date: created,
                sub: `Submitted by ${
                    event?.hostingType === 'Org'
                        ? event?.hostingId?.org_name || 'organization'
                        : event?.hostingId?.name || 'host'
                }`,
                state: 'completed'
            },
            ...approvals.map((appr, i) => ({
                key: `appr-${i}`,
                title: `Stakeholder step: ${appr.role}`,
                date: appr.approvedAt ? new Date(appr.approvedAt) : null,
                sub:
                    appr.status === 'approved'
                        ? 'Approved'
                        : appr.status === 'rejected'
                          ? 'Rejected'
                          : i === currentIdx
                            ? 'Waiting — current step'
                            : 'Pending',
                state:
                    appr.status === 'pending' && i === currentIdx
                        ? 'active'
                        : appr.status === 'pending'
                          ? 'pending'
                          : appr.status
            })),
            {
                key: 'date',
                title: 'Proposed event time',
                date: event?.start_time ? new Date(event.start_time) : null,
                sub: event?.end_time
                    ? `Ends ${new Date(event.end_time).toLocaleString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                      })}`
                    : '',
                state: 'upcoming'
            }
        ];
        return rows;
    }, [event, approvals, currentIdx]);

    const dateOpts = { year: 'numeric', month: 'short', day: 'numeric' };
    const timeOpts = { hour: 'numeric', minute: '2-digit', hour12: true };

    return (
        <div className="event-approval-review-modal__timeline">
            <div className="event-approval-review-modal__timeline-head">
                <Icon icon="mdi:tag-approve" />
                <h2>Approval pipeline</h2>
            </div>
            <div className="event-approval-review-modal__timeline-body">
                {steps.map((step) => (
                    <div key={step.key} className={`event-approval-review-modal__t-step state-${step.state}`}>
                        <div className="event-approval-review-modal__t-date">
                            {step.date && !Number.isNaN(step.date.getTime()) ? (
                                <>
                                    <span className="event-approval-review-modal__t-date-d">
                                        {step.date.toLocaleDateString(undefined, dateOpts)}
                                    </span>
                                    <span className="event-approval-review-modal__t-date-t">
                                        {step.date.toLocaleTimeString(undefined, timeOpts)}
                                    </span>
                                </>
                            ) : (
                                <span className="event-approval-review-modal__t-date-placeholder">—</span>
                            )}
                        </div>
                        <div className="event-approval-review-modal__t-rail">
                            <span className="event-approval-review-modal__t-dot" />
                            <span className="event-approval-review-modal__t-line" />
                        </div>
                        <div className="event-approval-review-modal__t-content">
                            <h3>{step.title}</h3>
                            {step.sub && <p>{step.sub}</p>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function EventApprovalReviewModal({
    eventSummary,
    acting,
    onApprove,
    onReject,
    pendingStepRoleName,
    pendingStepRoleId
}) {
    const eventId = eventSummary?._id;
    const fullFetch = useFetch(eventId ? `/get-event/${eventId}?type=approval` : null);

    const ev = useMemo(() => {
        if (fullFetch.data?.success && fullFetch.data?.event) {
            return { ...eventSummary, ...fullFetch.data.event };
        }
        return eventSummary;
    }, [eventSummary, fullFetch.data]);

    const host = ev?.hostingId;
    const level = hostLevel(ev?.hostingType, host);
    const hostImage =
        ev?.hostingType === 'Org'
            ? host?.org_profile_image || defaultAvatar
            : host?.image || defaultAvatar;
    const hostTitle =
        ev?.hostingType === 'Org' ? host?.org_name || 'Organization' : host?.name || 'Individual host';

    const start = ev?.start_time ? new Date(ev.start_time) : null;
    const end = ev?.end_time ? new Date(ev.end_time) : null;
    const roomLabel = formatClassroom(ev?.classroom_id);
    const customEntries =
        ev?.customFields && typeof ev.customFields === 'object'
            ? Object.entries(ev.customFields).filter(([, v]) => v !== '' && v != null)
            : [];

    const loadError = Boolean(
        fullFetch.error || (fullFetch.data && fullFetch.data.success === false)
    );

    return (
        <div className="event-approval-review-modal">
            <div className="event-approval-review-modal__admin-strip">
                <div className="event-approval-review-modal__admin-strip-text">
                    <span className="event-approval-review-modal__admin-label">Admin action</span>
                    <span className="event-approval-review-modal__admin-current">
                        Current step: <strong>{pendingStepRoleName}</strong>
                        {pendingStepRoleId && pendingStepRoleId !== pendingStepRoleName && (
                            <span className="event-approval-review-modal__admin-id"> ({pendingStepRoleId})</span>
                        )}
                    </span>
                </div>
                <div className="event-approval-review-modal__admin-actions">
                    <button
                        type="button"
                        className="event-approval-review-modal__btn event-approval-review-modal__btn--reject"
                        disabled={acting}
                        onClick={onReject}
                    >
                        Reject
                    </button>
                    <button
                        type="button"
                        className="event-approval-review-modal__btn event-approval-review-modal__btn--approve"
                        disabled={acting}
                        onClick={onApprove}
                    >
                        {acting ? 'Working…' : 'Approve step'}
                    </button>
                </div>
            </div>

            <div className="event-approval-review-modal__scroll">
                {fullFetch.loading && (
                    <div className="event-approval-review-modal__loading">
                        <Icon icon="mdi:loading" className="event-approval-review-modal__spin" />
                        <span>Loading full event details…</span>
                    </div>
                )}

                {loadError && !fullFetch.loading && (
                    <div className="event-approval-review-modal__banner event-approval-review-modal__banner--warn">
                        <Icon icon="mdi:alert-outline" />
                        <span>
                            Could not load every detail from the server; showing what we have from the queue.
                            {fullFetch.data?.message ? ` (${fullFetch.data.message})` : ''}
                        </span>
                    </div>
                )}

                <section className="event-approval-review-modal__hero">
                    <div className="event-approval-review-modal__poster">
                        <img src={ev?.image || MockPoster} alt="" />
                    </div>
                    <div className="event-approval-review-modal__hero-main">
                        <div className="event-approval-review-modal__badges">
                            {ev?.type && (
                                <span className="event-approval-review-modal__badge">{ev.type}</span>
                            )}
                            {ev?.visibility && (
                                <span className="event-approval-review-modal__badge event-approval-review-modal__badge--muted">
                                    {ev.visibility.replace(/_/g, ' ')}
                                </span>
                            )}
                            {ev?.status && (
                                <span className="event-approval-review-modal__badge event-approval-review-modal__badge--status">
                                    {ev.status}
                                </span>
                            )}
                        </div>
                        <h1 className="event-approval-review-modal__title">{ev?.name || 'Event'}</h1>

                        <div className={`event-approval-review-modal__host-row level-${level.toLowerCase()}`}>
                            <img src={hostImage} alt="" className="event-approval-review-modal__host-avatar" />
                            <div>
                                <p className="event-approval-review-modal__host-name">{hostTitle}</p>
                                <span className="event-approval-review-modal__host-level">{level}</span>
                            </div>
                        </div>

                        <div className="event-approval-review-modal__quick-facts">
                            {start && (
                                <div className="event-approval-review-modal__fact">
                                    <Icon icon="heroicons:calendar-16-solid" />
                                    <div>
                                        <p className="event-approval-review-modal__fact-label">When</p>
                                        <p>
                                            {start.toLocaleString('default', {
                                                weekday: 'long',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </p>
                                        <p className="event-approval-review-modal__fact-sub">
                                            {start.toLocaleString('default', {
                                                hour: 'numeric',
                                                minute: '2-digit',
                                                hour12: true
                                            })}
                                            {end && !Number.isNaN(end.getTime())
                                                ? ` — ${end.toLocaleString('default', {
                                                      hour: 'numeric',
                                                      minute: '2-digit',
                                                      hour12: true
                                                  })}`
                                                : ''}
                                        </p>
                                    </div>
                                </div>
                            )}
                            <div className="event-approval-review-modal__fact">
                                <Icon icon="fluent:location-28-filled" />
                                <div>
                                    <p className="event-approval-review-modal__fact-label">Location</p>
                                    <p>{formatLocation(ev?.location)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <img src={StarGradient} alt="" className="event-approval-review-modal__gradient-deco" />
                </section>

                <section className="event-approval-review-modal__section">
                    <h2 className="event-approval-review-modal__section-title">
                        <Icon icon="mdi:account-supervisor" />
                        Host & organizer
                    </h2>
                    <div className="event-approval-review-modal__host-panel">
                        <div className="event-approval-review-modal__host-panel-grid">
                            <div className="event-approval-review-modal__dl">
                                <dt>Hosting type</dt>
                                <dd>{ev?.hostingType === 'Org' ? 'Organization' : 'Individual user'}</dd>
                            </div>
                            <div className="event-approval-review-modal__dl">
                                <dt>Display name</dt>
                                <dd>{hostTitle}</dd>
                            </div>
                            {ev?.hostingType === 'User' && host?.email && (
                                <div className="event-approval-review-modal__dl">
                                    <dt>Email</dt>
                                    <dd>{host.email}</dd>
                                </div>
                            )}
                            {ev?.hostingType === 'User' && host?.username && (
                                <div className="event-approval-review-modal__dl">
                                    <dt>Username</dt>
                                    <dd>{host.username}</dd>
                                </div>
                            )}
                            {ev?.hostingType === 'Org' && host?._id && (
                                <div className="event-approval-review-modal__dl">
                                    <dt>Organization ID</dt>
                                    <dd className="event-approval-review-modal__mono">{String(host._id)}</dd>
                                </div>
                            )}
                            {ev?.contact && (
                                <div className="event-approval-review-modal__dl event-approval-review-modal__dl--wide">
                                    <dt>Event contact</dt>
                                    <dd>{ev.contact}</dd>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <section className="event-approval-review-modal__section">
                    <h2 className="event-approval-review-modal__section-title">
                        <Icon icon="mdi:text-box-outline" />
                        Event details
                    </h2>
                    <div className="event-approval-review-modal__details-grid">
                        <div className="event-approval-review-modal__dl">
                            <dt>Expected attendance</dt>
                            <dd>{ev?.expectedAttendance ?? '—'}</dd>
                        </div>
                        {roomLabel && (
                            <div className="event-approval-review-modal__dl">
                                <dt>Room / resource</dt>
                                <dd>{roomLabel}</dd>
                            </div>
                        )}
                        <div className="event-approval-review-modal__dl">
                            <dt>Registration</dt>
                            <dd>
                                {ev?.registrationEnabled ? 'Enabled' : 'Off'}
                                {ev?.registrationRequired ? ' · required' : ''}
                                {typeof ev?.maxAttendees === 'number' ? ` · cap ${ev.maxAttendees}` : ''}
                            </dd>
                        </div>
                    </div>
                    {ev?.description ? (
                        <div className="event-approval-review-modal__description-block">
                            <h3>Description</h3>
                            <div className="event-approval-review-modal__description-body">{ev.description}</div>
                        </div>
                    ) : null}
                    {customEntries.length > 0 && (
                        <div className="event-approval-review-modal__custom-fields">
                            <h3>Custom fields</h3>
                            <div className="event-approval-review-modal__host-panel-grid">
                                {customEntries.map(([k, v]) => (
                                    <div key={k} className="event-approval-review-modal__dl">
                                        <dt>{k}</dt>
                                        <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                {ev?.collaboratorOrgs?.length > 0 && (
                    <section className="event-approval-review-modal__section">
                        <h2 className="event-approval-review-modal__section-title">
                            <Icon icon="mdi:account-group-outline" />
                            Collaborating organizations
                        </h2>
                        <ul className="event-approval-review-modal__collab-list">
                            {ev.collaboratorOrgs.map((c) => (
                                <li key={String(c.orgId?._id || c.orgId)}>
                                    <span className="event-approval-review-modal__collab-name">
                                        {c.orgId?.org_name || 'Organization'}
                                    </span>
                                    <span className="event-approval-review-modal__collab-status">{c.status}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <section className="event-approval-review-modal__section event-approval-review-modal__section--flush">
                    <ApprovalPipelineTimeline event={ev} />
                </section>

                {eventId && !fullFetch.loading && fullFetch.data?.success && (
                    <section className="event-approval-review-modal__section event-approval-review-modal__section--comments">
                        <h2 className="event-approval-review-modal__section-title">
                            <Icon icon="mdi:comment-text-outline" />
                            Approval comments
                        </h2>
                        <CommentsSection
                            comments={ev?.approvalReference?.comments || []}
                            eventId={eventId}
                        />
                    </section>
                )}

                <div className="event-approval-review-modal__footer-link">
                    <a href={`/event/${eventId}`} target="_blank" rel="noopener noreferrer">
                        Open public event page
                        <Icon icon="heroicons:arrow-top-right-on-square-20-solid" />
                    </a>
                </div>
            </div>
        </div>
    );
}

export default EventApprovalReviewModal;
