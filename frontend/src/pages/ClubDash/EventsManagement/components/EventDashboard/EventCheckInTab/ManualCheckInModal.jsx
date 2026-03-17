import React, { useState, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import './ManualCheckInModal.scss';

function getCheckedInDisplayName(attendee) {
    if (attendee.formResponseId && (attendee.guestName || attendee.guestEmail)) {
        return attendee.guestName && String(attendee.guestName).trim()
            ? String(attendee.guestName).trim()
            : attendee.guestEmail || 'Guest';
    }
    const user = attendee.userId;
    return user?.name || user?.username || 'Unknown User';
}

/** Wraps all matching substrings in <mark> for search highlight */
function HighlightMatch({ text, query }) {
    if (!query || !text) return text;
    const q = query.trim().toLowerCase();
    if (!q) return text;
    const str = String(text);
    const lower = str.toLowerCase();
    const parts = [];
    let lastEnd = 0;
    let idx = lower.indexOf(q);
    while (idx !== -1) {
        parts.push(str.slice(lastEnd, idx));
        parts.push(<mark key={idx} className="manual-checkin-modal__highlight">{str.slice(idx, idx + q.length)}</mark>);
        lastEnd = idx + q.length;
        idx = lower.indexOf(q, lastEnd);
    }
    parts.push(str.slice(lastEnd));
    return <>{parts}</>;
}

function ManualCheckInModalContent({
    isOpen,
    onClose,
    event,
    orgId,
    checkedInAttendees: checkedInAttendeesProp,
    onCheckInSuccess,
    onOpenSettings,
}) {
    const { addNotification } = useNotification();
    const [searchQuery, setSearchQuery] = useState('');
    const [checkingInId, setCheckingInId] = useState(null);

    const useRegistrationsEndpoint = Boolean(isOpen && event?._id && orgId);
    const { data: registrationsResponse, loading: loadingRegistrations, refetch: refetchRegistrations } = useFetch(
        useRegistrationsEndpoint
            ? `/org-event-management/${orgId}/events/${event._id}/check-in/registrations`
            : null
    );

    const fetchOwnAttendees = checkedInAttendeesProp == null;
    const { data: attendeesResponse, loading: loadingAttendees, refetch: refetchAttendees } = useFetch(
        fetchOwnAttendees && isOpen && event?._id && orgId
            ? `/events/${event._id}/check-in/attendees`
            : null
    );

    const registrations = registrationsResponse?.success ? (registrationsResponse.data?.registrations || []) : [];
    const checkedInAttendees = checkedInAttendeesProp ?? (attendeesResponse?.success ? (attendeesResponse.attendees || []) : []);
    const allowAnonymous = event?.checkInSettings?.allowAnonymousCheckIn === true;
    const hasRegistrationForm = Boolean(event?.registrationFormId);
    const anonymousNotConfigured = hasRegistrationForm && !allowAnonymous;

    const { data: registrationResponsesData } = useFetch(
        isOpen && event?._id && orgId && !allowAnonymous
            ? `/org-event-management/${orgId}/events/${event._id}/registration-responses`
            : null
    );
    const formResponses = registrationResponsesData?.data?.formResponses || [];
    const anonymousCountWhenDisabled = allowAnonymous ? 0 : formResponses.filter((r) => !r.submittedBy).length;

    const filteredRegistrations = useMemo(() => {
        if (!searchQuery.trim()) return registrations;
        const q = searchQuery.trim().toLowerCase();
        return registrations.filter((reg) => {
            const name = (reg.displayName || reg.guestName || '').toLowerCase();
            const email = (reg.email || '').toLowerCase();
            return name.includes(q) || email.includes(q);
        });
    }, [registrations, searchQuery]);

    const handleCheckIn = async (reg) => {
        const id = reg.formResponseId ? `anon-${reg.formResponseId}` : `user-${reg.userId}`;
        setCheckingInId(id);
        try {
            let response;
            if (reg.type === 'anonymous' && reg.formResponseId) {
                response = await apiRequest(
                    `/events/${event._id}/check-in/by-form-response/${reg.formResponseId}`,
                    {},
                    { method: 'POST' }
                );
            } else if (reg.userId) {
                response = await apiRequest(
                    `/events/${event._id}/check-in/${reg.userId}`,
                    {},
                    { method: 'POST' }
                );
            } else {
                throw new Error('Invalid registration');
            }

            if (response.success) {
                addNotification({
                    title: 'Checked in',
                    message: `${reg.displayName || reg.guestName || 'Attendee'} checked in`,
                    type: 'success',
                });
                await Promise.all([
                    refetchRegistrations({ silent: true }),
                    ...(fetchOwnAttendees ? [refetchAttendees({ silent: true })] : [])
                ]);
                onCheckInSuccess?.();
            } else {
                throw new Error(response.message || 'Failed to check in attendee');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to check in attendee',
                type: 'error',
            });
        } finally {
            setCheckingInId(null);
        }
    };

    const handleOpenSettings = () => {
        onClose();
        onOpenSettings?.();
    };

    const loading = loadingRegistrations || (fetchOwnAttendees && loadingAttendees);

    return (
        <div className="manual-checkin-modal__root">
                <div className="manual-checkin-modal__header">
                    <h3 className="manual-checkin-modal__title">
                        <Icon icon="mdi:account-plus" />
                        Manual Check-In
                    </h3>
                    <button type="button" className="manual-checkin-modal__close-btn" onClick={onClose} aria-label="Close">
                        <Icon icon="mdi:close" />
                    </button>
                </div>

                <div className="manual-checkin-modal__body">
                    {/* Left: Checked-in list */}
                    <div className="manual-checkin-modal__column manual-checkin-modal__checked-in">
                        <h4 className="manual-checkin-modal__column-title">
                            <Icon icon="mdi:account-check" />
                            Checked in ({checkedInAttendees.length})
                        </h4>
                        {loading ? (
                            <p className="manual-checkin-modal__loading">Loading...</p>
                        ) : checkedInAttendees.length === 0 ? (
                            <p className="manual-checkin-modal__empty-msg">No one checked in yet</p>
                        ) : (
                            <ul className="manual-checkin-modal__attendees-list">
                                {checkedInAttendees.map((a, i) => (
                                    <li key={a.formResponseId ? `anon-${a.formResponseId}` : (a.userId?._id || a.userId?.id || i)}>
                                        {getCheckedInDisplayName(a)}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Right: Search + to check in */}
                    <div className="manual-checkin-modal__column manual-checkin-modal__to-check-in">
                        <h4 className="manual-checkin-modal__column-title">
                            <Icon icon="mdi:account-search" />
                            Check in
                        </h4>

                        {anonymousNotConfigured && (
                            <div className="manual-checkin-modal__anonymous-notice">
                                <Icon icon="mdi:account-off-outline" />
                                <div>
                                    {anonymousCountWhenDisabled > 0 ? (
                                        <>
                                            <strong>{anonymousCountWhenDisabled} attendee{anonymousCountWhenDisabled !== 1 ? 's' : ''} registered without an account</strong> and cannot be checked in.
                                        </>
                                    ) : (
                                        <>Anonymous check-in is not configured.</>
                                    )}{' '}
                                    <button type="button" className="manual-checkin-modal__anonymous-action" onClick={handleOpenSettings}>
                                        Open Settings
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="manual-checkin-modal__search-wrap">
                            <Icon icon="mdi:magnify" className="manual-checkin-modal__search-icon" />
                            <input
                                type="text"
                                className="manual-checkin-modal__search"
                                placeholder="Search by name or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {loading ? (
                            <p className="manual-checkin-modal__loading">Loading...</p>
                        ) : filteredRegistrations.length === 0 ? (
                            <p className="manual-checkin-modal__empty-msg">
                                {registrations.length === 0
                                    ? (anonymousCountWhenDisabled > 0 ? 'Everyone with an account has checked in.' : 'Everyone has checked in.')
                                    : 'No matches for your search.'}
                            </p>
                        ) : (
                            <ul className="manual-checkin-modal__to-check-in-list">
                                {filteredRegistrations.map((reg) => {
                                    const key = reg.formResponseId ? `anon-${reg.formResponseId}` : `user-${reg.userId}`;
                                    const displayName = reg.displayName || reg.guestName || 'Unknown';
                                    const email = reg.email && String(reg.email).trim().toLowerCase() !== String(displayName).trim().toLowerCase()
                                        ? reg.email
                                        : null;
                                    const isCheckingIn = checkingInId === key;
                                    return (
                                        <li key={key}>
                                            <span className="manual-checkin-modal__reg-name">
                                                <HighlightMatch text={displayName} query={searchQuery} />
                                                {email && (
                                                    <>
                                                        {' ('}
                                                        <HighlightMatch text={email} query={searchQuery} />
                                                        {')'}
                                                    </>
                                                )}
                                            </span>
                                            <button
                                                type="button"
                                                className="manual-checkin-modal__check-in-btn"
                                                onClick={() => handleCheckIn(reg)}
                                                disabled={isCheckingIn}
                                                title="Check in"
                                            >
                                                {isCheckingIn ? (
                                                    <Icon icon="mdi:loading" className="spin" />
                                                ) : (
                                                    <Icon icon="mdi:plus-circle" />
                                                )}
                                                {isCheckingIn ? 'Checking in...' : 'Check in'}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
    );
}

function ManualCheckInModal(props) {
    const { onClose, ...rest } = props;
    return <ManualCheckInModalContent {...rest} onClose={onClose} isOpen={true} />;
}

export default ManualCheckInModal;
