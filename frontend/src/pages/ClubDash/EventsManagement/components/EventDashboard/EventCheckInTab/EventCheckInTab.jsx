import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import Popup from '../../../../../../components/Popup/Popup';
import QRCodeDisplay from '../../../../../../components/EventCheckIn/QRCodeDisplay';
import CheckInLink from '../../../../../../components/EventCheckIn/CheckInLink';
import CheckInList from '../../../../../../components/EventCheckIn/CheckInList';
import { useEventRoom } from '../../../../../../WebSocketContext';
import './EventCheckInTab.scss';

function EventCheckInTab({ event, orgId, onRefresh, isTabActive = false }) {
    const { addNotification } = useNotification();
    const [refreshing, setRefreshing] = useState(false);
    const [qrCodeData, setQrCodeData] = useState(null);
    const [checkInLink, setCheckInLink] = useState(null);
    const [attendees, setAttendees] = useState([]);
    const [stats, setStats] = useState(null);
    const [showManualCheckInModal, setShowManualCheckInModal] = useState(false);

    // Fetch QR code if check-in is enabled and method includes QR
    const { data: qrResponse, refetch: refetchQR } = useFetch(
        event?.checkInEnabled && 
        (event?.checkInSettings?.method === 'qr' || event?.checkInSettings?.method === 'both') &&
        event?._id && orgId
            ? `/events/${event._id}/check-in/qr`
            : null
    );

    // Fetch check-in link if check-in is enabled and method includes link
    const { data: linkResponse, refetch: refetchLink } = useFetch(
        event?.checkInEnabled && 
        (event?.checkInSettings?.method === 'link' || event?.checkInSettings?.method === 'both') &&
        event?._id && orgId
            ? `/events/${event._id}/check-in/link`
            : null
    );

    // Fetch checked-in attendees
    const { data: attendeesResponse, refetch: refetchAttendees } = useFetch(
        event?.checkInEnabled && event?._id && orgId
            ? `/events/${event._id}/check-in/attendees`
            : null
    );

    // Fetch all registrations when manual check-in modal is open (to pick someone to check in)
    const { data: allRegistrationsResponse, loading: loadingRegistrations } = useFetch(
        showManualCheckInModal && event?._id ? `/attendees/${event._id}` : null
    );

    // Live updates: only open websocket when check-in tab is active and check-in is enabled; disconnect when leaving tab
    const shouldConnect = Boolean(isTabActive && event?.checkInEnabled && event?._id);
    useEventRoom(shouldConnect ? event._id : null, () => {
        refetchAttendees?.();
        onRefresh?.();
    });

    useEffect(() => {
        if (qrResponse?.success) {
            setQrCodeData(qrResponse.qrCode);
        }
    }, [qrResponse]);

    useEffect(() => {
        if (linkResponse?.success) {
            setCheckInLink(linkResponse.checkInUrl);
        }
    }, [linkResponse]);

    useEffect(() => {
        if (attendeesResponse?.success) {
            setAttendees(attendeesResponse.attendees || []);
            setStats(attendeesResponse.stats || null);
        }
    }, [attendeesResponse]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                refetchQR(),
                refetchLink(),
                refetchAttendees()
            ]);
            if (onRefresh) {
                onRefresh();
            }
        } catch (error) {
            console.error('Error refreshing check-in data:', error);
        } finally {
            setRefreshing(false);
        }
    };

    const handleManualCheckIn = async (userId) => {
        try {
            const response = await apiRequest(
                `/events/${event._id}/check-in/${userId}`,
                {},
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'User checked in successfully',
                    type: 'success'
                });
                setShowManualCheckInModal(false);
                await refetchAttendees();
                if (onRefresh) {
                    onRefresh();
                }
            } else {
                throw new Error(response.message || 'Failed to check in user');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to check in user',
                type: 'error'
            });
        }
    };

    const getAttendeeUserId = (a) => (a.userId && (a.userId._id || a.userId.id || a.userId)) ? String(a.userId._id || a.userId.id || a.userId) : null;
    const checkedInIds = new Set((attendees || []).map(getAttendeeUserId).filter(Boolean));
    const allRegistrations = allRegistrationsResponse?.success ? (allRegistrationsResponse.attendees || []) : [];
    const notCheckedIn = allRegistrations.filter((r) => {
        const id = getAttendeeUserId(r);
        return id && !checkedInIds.has(id);
    });

    const handleRemoveCheckIn = async (userId) => {
        try {
            const response = await apiRequest(
                `/events/${event._id}/check-out/${userId}`,
                {},
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Check-in removed',
                    type: 'success'
                });
                await refetchAttendees();
                if (onRefresh) {
                    onRefresh();
                }
            } else {
                throw new Error(response.message || 'Failed to remove check-in');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to remove check-in',
                type: 'error'
            });
        }
    };

    if (!event) {
        return <div className="event-checkin-tab">Loading...</div>;
    }

    if (!event.checkInEnabled) {
        return (
            <div className="event-checkin-tab">
                <div className="checkin-disabled-message">
                    <Icon icon="mdi:qrcode-scan" />
                    <h3>Check-In Not Enabled</h3>
                    <p>Enable check-in in the Edit tab to start tracking attendance.</p>
                </div>
            </div>
        );
    }

    const method = event.checkInSettings?.method || 'both';
    const showQR = method === 'qr' || method === 'both';
    const showLink = method === 'link' || method === 'both';

    return (
        <div className="event-checkin-tab">
            <div className="checkin-header">
                <h2>
                    <Icon icon="mdi:qrcode-scan" />
                    Event Check-In
                </h2>
                <button 
                    className="refresh-button" 
                    onClick={handleRefresh}
                    disabled={refreshing}
                >
                    <Icon icon={refreshing ? 'mdi:loading' : 'mdi:refresh'} />
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {/* Statistics */}
            {stats && (
                <div className="checkin-stats">
                    <div className="stat-card">
                        <div className="stat-value">{stats.totalCheckedIn}</div>
                        <div className="stat-label">Checked In</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.totalRegistrations ?? stats.totalRSVPs ?? 0}</div>
                        <div className="stat-label">Total Registrations</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.checkInRate}%</div>
                        <div className="stat-label">Check-In Rate</div>
                    </div>
                </div>
            )}

            {/* QR Code and Link Section */}
            <div className="checkin-methods">
                {showQR && (
                    <div className="checkin-method-card">
                        <h3>
                            <Icon icon="mdi:qrcode" />
                            QR Code
                        </h3>
                        {qrCodeData ? (
                            <QRCodeDisplay qrCode={qrCodeData} eventName={event.name} />
                        ) : (
                            <div className="loading-placeholder">Loading QR code...</div>
                        )}
                    </div>
                )}

                {showLink && (
                    <div className="checkin-method-card">
                        <h3>
                            <Icon icon="mdi:link" />
                            Check-In Link
                        </h3>
                        {checkInLink ? (
                            <CheckInLink checkInUrl={checkInLink} eventName={event.name} />
                        ) : (
                            <div className="loading-placeholder">Loading link...</div>
                        )}
                    </div>
                )}
            </div>

            {/* Checked-In Attendees List */}
            <div className="checkin-attendees-section">
                <h3>
                    <Icon icon="mdi:account-check" />
                    Checked-In Attendees ({attendees.length})
                </h3>
                <CheckInList 
                    attendees={attendees}
                    onManualCheckIn={handleManualCheckIn}
                    onRemoveCheckIn={handleRemoveCheckIn}
                    onOpenManualCheckInModal={() => setShowManualCheckInModal(true)}
                />
            </div>

            {/* Manual check-in modal: pick a registrant not yet checked in */}
            <Popup
                isOpen={showManualCheckInModal}
                onClose={() => setShowManualCheckInModal(false)}
                customClassName="manual-checkin-modal"
            >
                <div className="manual-checkin-modal-content">
                    <h3>
                        <Icon icon="mdi:account-plus" />
                        Manually Check In Attendee
                    </h3>
                    <p className="manual-checkin-modal-hint">Select a registrant who has not checked in yet.</p>
                    {loadingRegistrations ? (
                        <p className="manual-checkin-modal-loading">Loading registrations...</p>
                    ) : notCheckedIn.length === 0 ? (
                        <p className="manual-checkin-modal-empty">Everyone registered has already checked in.</p>
                    ) : (
                        <ul className="manual-checkin-modal-list">
                            {notCheckedIn.map((reg) => {
                                const uid = getAttendeeUserId(reg);
                                const name = reg.userId?.name || reg.userId?.username || 'Unknown';
                                return (
                                    <li key={uid}>
                                        <button
                                            type="button"
                                            className="manual-checkin-modal-item"
                                            onClick={() => handleManualCheckIn(uid)}
                                        >
                                            {name}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <button type="button" className="manual-checkin-modal-close" onClick={() => setShowManualCheckInModal(false)}>
                        Cancel
                    </button>
                </div>
            </Popup>
        </div>
    );
}

export default EventCheckInTab;
