import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import QRCodeDisplay from '../../../../../../components/EventCheckIn/QRCodeDisplay';
import CheckInLink from '../../../../../../components/EventCheckIn/CheckInLink';
import CheckInList from '../../../../../../components/EventCheckIn/CheckInList';
import EmptyState from '../../../../../../components/EmptyState/EmptyState';
import CheckInSettingsModal from './CheckInSettingsModal';
import ManualCheckInModal from './ManualCheckInModal';
import HeaderContainer from '../../../../../../components/HeaderContainer/HeaderContainer';
import KpiCard from '../../../../../../components/Analytics/Dashboard/KpiCard';
import { useEventRoom } from '../../../../../../WebSocketContext';
import './EventCheckInTab.scss';

function EventCheckInTab({ event, orgId, onRefresh, isTabActive = false, color }) {
    const { addNotification } = useNotification();
    const [refreshing, setRefreshing] = useState(false);
    const [qrCodeData, setQrCodeData] = useState(null);
    const [checkInLink, setCheckInLink] = useState(null);
    const [attendees, setAttendees] = useState([]);
    const [stats, setStats] = useState(null);
    const [showManualCheckInModal, setShowManualCheckInModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [enablingCheckIn, setEnablingCheckIn] = useState(false);
    const [disablingCheckIn, setDisablingCheckIn] = useState(false);

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

    // Live updates: only open websocket when check-in tab is active and check-in is enabled; disconnect when leaving tab
    const shouldConnect = Boolean(isTabActive && event?.checkInEnabled && event?._id);
    useEventRoom(shouldConnect ? event._id : null, () => {
        refetchAttendees?.({ silent: true });
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

    const [linkCopied, setLinkCopied] = useState(false);
    const handleCopyCheckInLink = async () => {
        if (!checkInLink) return;
        try {
            await navigator.clipboard.writeText(checkInLink);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
            addNotification({
                title: 'Copied',
                message: 'Check-in link copied to clipboard',
                type: 'success'
            });
        } catch (err) {
            addNotification({
                title: 'Error',
                message: err?.message || 'Failed to copy link',
                type: 'error'
            });
        }
    };

    const handleRemoveCheckIn = async (attendee) => {
        try {
            let response;
            if (attendee.formResponseId) {
                const id = attendee.formResponseId?._id || attendee.formResponseId;
                response = await apiRequest(
                    `/events/${event._id}/check-out/form-response/${id}`,
                    {},
                    { method: 'POST' }
                );
            } else {
                const userId = attendee.userId?._id || attendee.userId?.id || attendee.userId;
                if (!userId) return;
                response = await apiRequest(
                    `/events/${event._id}/check-out/${userId}`,
                    {},
                    { method: 'POST' }
                );
            }

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Check-in removed',
                    type: 'success'
                });
                await refetchAttendees({ silent: true });
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

    const handleEnableCheckIn = async () => {
        setEnablingCheckIn(true);
        try {
            const response = await apiRequest(
                `/events/${event._id}/check-in/enable`,
                {},
                { method: 'POST' }
            );
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Check-in is now enabled for this event.',
                    type: 'success'
                });
                if (onRefresh) {
                    onRefresh();
                }
            } else {
                throw new Error(response.message || 'Failed to enable check-in');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to enable check-in',
                type: 'error'
            });
        } finally {
            setEnablingCheckIn(false);
        }
    };

    const handleDisableCheckIn = async () => {
        if (!event?._id) return;
        setDisablingCheckIn(true);
        try {
            const response = await apiRequest(
                `/events/${event._id}/check-in/disable`,
                {},
                { method: 'POST' }
            );
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Check-in is now disabled for this event.',
                    type: 'success'
                });
                if (onRefresh) {
                    onRefresh();
                }
            } else {
                throw new Error(response.message || 'Failed to disable check-in');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to disable check-in',
                type: 'error'
            });
        } finally {
            setDisablingCheckIn(false);
        }
    };

    if (!event.checkInEnabled) {
        return (
            <div className="event-checkin-tab">
                <EmptyState
                    icon="jam:qr-code"
                    title="Check-In Not Enabled"
                    description="Enable check-in to start tracking attendance with QR code, link, or manual check-in. You can change QR/link options in the Edit tab after enabling."
                    actions={
                        <button
                            type="button"
                            className="enable-checkin-button"
                            onClick={handleEnableCheckIn}
                            disabled={enablingCheckIn}
                        >
                            <Icon icon={enablingCheckIn ? 'mdi:loading' : 'fluent:scan-qr-code-24-regular'} className={enablingCheckIn ? 'spin' : ''} />
                            {enablingCheckIn ? 'Enabling...' : 'Enable check-in'}
                        </button>
                    }
                />
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
                    <Icon icon="uil:qrcode-scan" />
                    Event Check-In
                </h2>
                <div className="checkin-header-actions">
                    <button
                        type="button"
                        className="checkin-settings-button"
                        onClick={() => setShowSettingsModal(true)}
                        title="Check-in settings"
                    >
                        <Icon icon="mdi:cog" />
                        Settings
                    </button>
                    <button
                        type="button"
                        className="disable-checkin-button"
                        onClick={handleDisableCheckIn}
                        disabled={disablingCheckIn}
                        title="Turn off check-in for this event"
                    >
                        <Icon icon={disablingCheckIn ? 'mdi:loading' : 'mdi:account-off'} className={disablingCheckIn ? 'spin' : ''} />
                        {disablingCheckIn ? 'Disabling...' : 'Disable check-in'}
                    </button>
                    <button 
                        className="refresh-button" 
                        onClick={handleRefresh}
                        disabled={refreshing}
                    >
                        <Icon icon={refreshing ? 'mdi:loading' : 'mdi:refresh'} className={refreshing ? 'spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* Statistics */}
            {stats && (
                <div className="checkin-stats">
                    <KpiCard
                        title="Checked In"
                        value={stats.totalCheckedIn}
                        icon="mdi:account-check"
                        iconVariant="approved"
                    />
                    <KpiCard
                        title="Total Registrations"
                        value={stats.totalRegistrations ?? stats.totalRSVPs ?? 0}
                        icon="mdi:account-group"
                    />
                    <KpiCard
                        title="Check-In Rate"
                        value={`${stats.checkInRate}%`}
                        icon="mdi:chart-line"
                    />
                </div>
            )}

            {/* QR Code + Checked-In Attendees side by side */}
            <div className="checkin-methods">
                {(showQR || showLink) && (
                    <HeaderContainer
                        icon={showQR ? 'fa7-solid:qrcode' : 'mdi:link'}
                        header={showQR ? 'QR Code' : 'Check-in link'}
                        classN="checkin-section checkin-section-qr"
                        right={checkInLink ? (
                            <button
                                type="button"
                                className="copy-checkin-link-btn"
                                onClick={handleCopyCheckInLink}
                                title="Copy check-in link"
                            >
                                <Icon icon={linkCopied ? 'mdi:check' : 'mdi:link-variant'} />
                                {linkCopied ? 'Copied' : 'Copy link'}
                            </button>
                        ) : showLink && !checkInLink ? (
                            <span className="checkin-link-loading">Loading link…</span>
                        ) : null}
                    >
                        <div className="checkin-section-content">
                            {showQR ? (
                                qrCodeData ? (
                                    <QRCodeDisplay qrCode={qrCodeData} eventName={event.name} />
                                ) : (
                                    <div className="loading-placeholder">Loading QR code...</div>
                                )
                            ) : (
                                checkInLink ? (
                                    <CheckInLink checkInUrl={checkInLink} eventName={event.name} />
                                ) : (
                                    <div className="loading-placeholder">Loading link...</div>
                                )
                            )}
                        </div>
                    </HeaderContainer>
                )}

                {/* Checked-In Attendees List */}
                <HeaderContainer
                    icon="mdi:account-check"
                    header="Checked-In Attendees"
                    subheader={<span>{attendees.length} attendees</span>}
                    classN="checkin-section checkin-section-attendees"
                >
                    <div className="checkin-section-content">
                        {attendees.length === 0 ? (
                            <EmptyState
                                icon="mingcute:user-follow-fill"
                                title="No attendees have checked in yet"
                                description="Checked-in attendees will appear here. You can manually check in someone from the list of registrations."
                                actions={
                                    <button
                                        type="button"
                                        className="manual-checkin-button"
                                        onClick={() => setShowManualCheckInModal(true)}
                                    >
                                        <Icon icon="mingcute:user-add-fill" />
                                        Manually check in attendee
                                    </button>
                                }
                            />
                        ) : (
                            <CheckInList 
                                attendees={attendees}
                                onManualCheckIn={() => {}}
                                onRemoveCheckIn={handleRemoveCheckIn}
                                onOpenManualCheckInModal={() => setShowManualCheckInModal(true)}
                            />
                        )}
                    </div>
                </HeaderContainer>
            </div>

            <CheckInSettingsModal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
                event={event}
                orgId={orgId}
                color={'var(--org-primary)'}
                onSaved={() => onRefresh?.()}
            />

            <ManualCheckInModal
                isOpen={showManualCheckInModal}
                onClose={() => setShowManualCheckInModal(false)}
                event={event}
                orgId={orgId}
                checkedInAttendees={attendees}
                onCheckInSuccess={async () => {
                    await refetchAttendees({ silent: true });
                }}
                onOpenSettings={() => setShowSettingsModal(true)}
            />
        </div>
    );
}

export default EventCheckInTab;
