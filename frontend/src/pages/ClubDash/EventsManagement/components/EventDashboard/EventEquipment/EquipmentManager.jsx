import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import EquipmentList from './EquipmentList';
import EquipmentCheckout from './EquipmentCheckout';
import './EquipmentManager.scss';

function EquipmentManager({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [eventEquipment, setEventEquipment] = useState(null);
    const [availableEquipment, setAvailableEquipment] = useState([]);
    const [showCheckout, setShowCheckout] = useState(false);
    const [checkoutItem, setCheckoutItem] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch event equipment
    const { data: equipmentData, refetch } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/equipment` : null
    );

    useEffect(() => {
        if (equipmentData?.success) {
            setEventEquipment(equipmentData.data.eventEquipment);
            setAvailableEquipment(equipmentData.data.availableEquipment || []);
            setLoading(false);
        } else if (equipmentData && !equipmentData.success) {
            setLoading(false);
        }
    }, [equipmentData]);

    const handleCheckout = (equipment) => {
        setCheckoutItem(equipment);
        setShowCheckout(true);
    };

    const handleCheckin = async (equipmentId) => {
        if (!event?._id || !orgId) return;

        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/equipment/${equipmentId}/checkin`,
                {},
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Equipment checked in successfully',
                    type: 'success'
                });
                refetch();
                if (onRefresh) onRefresh();
            } else {
                throw new Error(response.message || 'Failed to check in equipment');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to check in equipment',
                type: 'error'
            });
        }
    };

    if (loading) {
        return (
            <div className="equipment-manager loading">
                <Icon icon="mdi:loading" className="spinner" />
                <p>Loading equipment...</p>
            </div>
        );
    }

    return (
        <div className="equipment-manager">
            <div className="equipment-header">
                <div className="header-left">
                    <h3>
                        <Icon icon="mdi:package-variant" />
                        Equipment Management
                    </h3>
                    <p>
                        {eventEquipment?.items?.length || 0} item{(eventEquipment?.items?.length || 0) !== 1 ? 's' : ''} checked out to this event
                    </p>
                </div>
            </div>

            <div className="equipment-sections">
                <div className="section event-equipment">
                    <h4>
                        <Icon icon="mdi:calendar-check" />
                        Event Equipment
                    </h4>
                    <EquipmentList
                        items={eventEquipment?.items || []}
                        onCheckin={handleCheckin}
                        eventId={event?._id}
                        orgId={orgId}
                    />
                </div>

                <div className="section available-equipment">
                    <h4>
                        <Icon icon="mdi:package-variant-closed" />
                        Available Equipment
                    </h4>
                    {availableEquipment.length === 0 ? (
                        <div className="empty-state">
                            <Icon icon="mdi:package-variant-closed" />
                            <p>No equipment available in inventory</p>
                        </div>
                    ) : (
                        <div className="available-list">
                            {availableEquipment.map(equipment => (
                                <div key={equipment._id} className="equipment-item available">
                                    <div className="item-info">
                                        <strong>{equipment.name}</strong>
                                        {equipment.id && <span className="item-id">ID: {equipment.id}</span>}
                                        {equipment.storageLocation && <span className="item-type">Storage: {equipment.storageLocation}</span>}
                                    </div>
                                    <button
                                        className="btn-checkout"
                                        onClick={() => handleCheckout(equipment)}
                                    >
                                        <Icon icon="mdi:arrow-right" />
                                        <span>Checkout</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showCheckout && checkoutItem && (
                <EquipmentCheckout
                    equipment={checkoutItem}
                    event={event}
                    orgId={orgId}
                    onClose={() => {
                        setShowCheckout(false);
                        setCheckoutItem(null);
                    }}
                    onSuccess={() => {
                        refetch();
                        if (onRefresh) onRefresh();
                    }}
                />
            )}
        </div>
    );
}

export default EquipmentManager;
