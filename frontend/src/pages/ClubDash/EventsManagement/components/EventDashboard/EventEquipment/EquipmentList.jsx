import React from 'react';
import { Icon } from '@iconify-icon/react';
import './EquipmentManager.scss';

function EquipmentList({ items, onCheckin, eventId, orgId }) {
    if (!items || items.length === 0) {
        return (
            <div className="equipment-list empty">
                <Icon icon="mdi:package-variant-closed" />
                <p>No equipment checked out to this event</p>
            </div>
        );
    }

    return (
        <div className="equipment-list">
            {items.map((item, index) => (
                <div key={item.id || index} className="equipment-item checked-out">
                    <div className="item-info">
                        <strong>{item.name}</strong>
                        {(item.equipmentId || item.identifier || item.id) && (
                            <span className="item-id">ID: {item.equipmentId || item.identifier || item.id}</span>
                        )}
                        <span className="item-quantity">Qty: {item.quantity || 1}</span>
                    </div>
                    <div className="item-actions">
                        <button
                            className="btn-checkin"
                            onClick={() => {
                                if (onCheckin) {
                                    onCheckin(item.equipmentId || item.identifier || item.id);
                                }
                            }}
                        >
                            <Icon icon="mdi:arrow-left" />
                            <span>Check In</span>
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default EquipmentList;
