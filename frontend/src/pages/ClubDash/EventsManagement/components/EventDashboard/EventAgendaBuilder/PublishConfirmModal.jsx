import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import Popup from '../../../../../../components/Popup/Popup';
import './PublishConfirmModal.scss';

function PublishConfirmModal({ 
    event, 
    orgId, 
    timeDifference, 
    onConfirm, 
    onCancel, 
    onPublishWithoutAdjusting,
    isOpen = true
}) {
    const { addNotification } = useNotification();
    const [checkingAvailability, setCheckingAvailability] = useState(false);
    const [roomAvailable, setRoomAvailable] = useState(null);
    const [roomName, setRoomName] = useState(null);

    const isOver = timeDifference?.isOver || false;
    const isUnder = timeDifference?.isUnder || false;
    const diffMinutes = Math.abs(timeDifference?.difference || 0);

    // Calculate proposed end time
    const getProposedEndTime = () => {
        if (!event?.start_time || !event?.end_time) return null;
        const currentEnd = new Date(event.end_time);
        const proposedEnd = new Date(currentEnd);
        proposedEnd.setMinutes(proposedEnd.getMinutes() + timeDifference.difference);
        return proposedEnd;
    };

    const proposedEndTime = getProposedEndTime();

    // Check room availability when modal opens if time needs adjustment
    useEffect(() => {
        if ((isOver || isUnder) && event?.classroom_id && proposedEndTime) {
            checkRoomAvailability();
        } else if (!event?.classroom_id) {
            // No room reserved, mark as available
            setRoomAvailable(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkRoomAvailability = async () => {
        if (!event?._id || !orgId || !proposedEndTime) return;

        setCheckingAvailability(true);
        try {
            // First, get room name from classroom_id
            try {
                const roomResponse = await apiRequest(
                    `/rooms/${event.classroom_id}`,
                    null,
                    { method: 'GET' }
                );

                if (roomResponse.success && roomResponse.room) {
                    setRoomName(roomResponse.room.name);
                }
            } catch (roomError) {
                console.warn('Could not fetch room name:', roomError);
                // Continue without room name
            }

            // Check availability for the new time range
            const availabilityResponse = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/check-room-availability`,
                {
                    startTime: event.start_time,
                    endTime: proposedEndTime.toISOString()
                },
                { method: 'POST' }
            );

            if (availabilityResponse.success) {
                setRoomAvailable(availabilityResponse.data.isAvailable);
            } else {
                setRoomAvailable(false);
            }
        } catch (error) {
            console.error('Error checking room availability:', error);
            setRoomAvailable(false);
        } finally {
            setCheckingAvailability(false);
        }
    };

    const handleConfirm = () => {
        if (roomAvailable === false) {
            addNotification({
                title: 'Room Unavailable',
                message: 'The room is not available for the extended time. Please adjust your agenda or choose a different time.',
                type: 'error'
            });
            return;
        }

        if (proposedEndTime) {
            onConfirm(proposedEndTime.toISOString());
        }
    };

    const formatTime = (date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    return (
        <Popup 
            isOpen={isOpen} 
            onClose={onCancel}
            defaultStyling={false}
            customClassName="publish-confirm-modal-popup"
        >
            <div className="publish-confirm-modal">
                <div className="modal-header">
                    <h3>
                        <Icon icon="mdi:publish" />
                        Publish Agenda
                    </h3>
                </div>

                <div className="modal-content">
                    {isOver && (
                        <div className="time-warning-section over">
                            <Icon icon="mdi:alert-circle" />
                            <div className="warning-content">
                                <h4>Agenda exceeds event time</h4>
                                <p>
                                    Your agenda is <strong>{diffMinutes} minutes</strong> longer than the scheduled event time.
                                </p>
                            </div>
                        </div>
                    )}

                    {isUnder && (
                        <div className="time-warning-section under">
                            <Icon icon="mdi:alert-circle-outline" />
                            <div className="warning-content">
                                <h4>Agenda shorter than event time</h4>
                                <p>
                                    Your agenda is <strong>{diffMinutes} minutes</strong> shorter than the scheduled event time.
                                </p>
                            </div>
                        </div>
                    )}

                    {(isOver || isUnder) && (
                        <div className="time-comparison">
                            <div className="time-row">
                                <span className="time-label">Current end time:</span>
                                <span className="time-value">{formatTime(event?.end_time)}</span>
                            </div>
                            <div className="time-row">
                                <span className="time-label">Proposed end time:</span>
                                <span className={`time-value ${isOver ? 'over' : 'under'}`}>
                                    {formatTime(proposedEndTime)}
                                </span>
                            </div>
                        </div>
                    )}

                    {event?.classroom_id && (isOver || isUnder) && (
                        <div className="room-availability-section">
                            {checkingAvailability ? (
                                <div className="availability-checking">
                                    <Icon icon="mdi:loading" className="spinner" />
                                    <span>Checking room availability...</span>
                                </div>
                            ) : roomAvailable === true ? (
                                <div className="availability-status available">
                                    <Icon icon="mdi:check-circle" />
                                    <span>
                                        {roomName ? `Room "${roomName}" is available` : 'Room is available'} for the extended time
                                    </span>
                                </div>
                            ) : roomAvailable === false ? (
                                <div className="availability-status unavailable">
                                    <Icon icon="mdi:alert-circle" />
                                    <span>
                                        {roomName ? `Room "${roomName}" is unavailable` : 'Room is unavailable'} for the extended time
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {!event?.classroom_id && (isOver || isUnder) && (
                        <div className="no-room-notice">
                            <Icon icon="mdi:information" />
                            <span>No room reserved for this event. Time adjustment will proceed without room check.</span>
                        </div>
                    )}
                </div>

                <div className="modal-actions">
                    {(isOver || isUnder) && (
                        <button 
                            className="btn-publish-without" 
                            onClick={onPublishWithoutAdjusting}
                        >
                            Publish Without Adjusting
                        </button>
                    )}
                    <button 
                        className={`btn-confirm ${roomAvailable === false ? 'disabled' : ''}`}
                        onClick={handleConfirm}
                        disabled={roomAvailable === false || checkingAvailability}
                    >
                        {(isOver || isUnder) ? 'Adjust Time & Publish' : 'Publish'}
                    </button>
                </div>
            </div>
        </Popup>
    );
}

export default PublishConfirmModal;
