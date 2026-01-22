import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import Popup from '../../../../../../components/Popup/Popup';
import './EquipmentManager.scss';

function EquipmentCheckout({ equipment, event, orgId, onClose, onSuccess }) {
    const { addNotification } = useNotification();
    const [quantity, setQuantity] = useState(1);
    const [checkingOut, setCheckingOut] = useState(false);

    const handleCheckout = async () => {
        if (!event?._id || !orgId || !equipment?._id) return;

        setCheckingOut(true);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/equipment/${equipment._id}/checkout`,
                {
                    quantity: Math.min(quantity, equipment.quantity)
                },
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Equipment checked out successfully',
                    type: 'success'
                });
                if (onSuccess) onSuccess();
                onClose();
            } else {
                throw new Error(response.message || 'Failed to checkout equipment');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to checkout equipment',
                type: 'error'
            });
        } finally {
            setCheckingOut(false);
        }
    };

    return (
        <Popup
            isOpen={true}
            onClose={onClose}
            customClassName="equipment-checkout-popup"
        >
            <div className="equipment-checkout">
                <div className="checkout-header">
                    <h3>
                        <Icon icon="mdi:arrow-right" />
                        Checkout Equipment
                    </h3>
                    <button className="close-btn" onClick={onClose}>
                        <Icon icon="mdi:close" />
                    </button>
                </div>

                <div className="checkout-content">
                    <div className="equipment-details">
                        <h4>{equipment?.name}</h4>
                        {equipment?.id && <p>ID: {equipment.id}</p>}
                        {equipment?.storageLocation && <p>Storage: {equipment.storageLocation}</p>}
                        <p>Available: {equipment?.quantity || 1}</p>
                    </div>

                    <div className="checkout-form">
                        <div className="form-group">
                            <label>
                                Quantity <span className="required">*</span>
                            </label>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                min="1"
                                max={equipment?.quantity || 1}
                                required
                            />
                        </div>

                    </div>

                    <div className="checkout-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button 
                            type="button" 
                            className="btn-checkout"
                            onClick={handleCheckout}
                            disabled={checkingOut || quantity < 1}
                        >
                            {checkingOut ? (
                                <>
                                    <Icon icon="mdi:loading" className="spinner" />
                                    <span>Checking Out...</span>
                                </>
                            ) : (
                                <>
                                    <Icon icon="mdi:arrow-right" />
                                    <span>Checkout</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </Popup>
    );
}

export default EquipmentCheckout;
