import React from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../Popup/Popup';
import './DeleteConfirmModal.scss';

function DeleteConfirmModal({ 
    isOpen,
    onConfirm,
    onCancel,
    title,
    message,
    warningDetails,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel'
}) {
    const handleConfirm = async (e) => {
        e.stopPropagation();
        try {
            // Call onConfirm and wait for it if it's async
            const result = onConfirm();
            if (result && typeof result.then === 'function') {
                await result;
            }
        } catch (error) {
            // If onConfirm throws, let the parent handle it
            // The parent's error handling will still close the modal in finally block
        }
        // onCancel will set parent state to false, which triggers Popup to close via useEffect
        onCancel();
    };

    const handleCancel = (e) => {
        e.stopPropagation();
        // onCancel will set parent state to false, which triggers Popup to close via useEffect
        onCancel();
    };

    return (
        <Popup 
            isOpen={isOpen} 
            onClose={onCancel}
            defaultStyling={true}
            customClassName="delete-confirm-modal-popup"
        >
            <div className="delete-confirm-modal">
                <div className="modal-header">
                    <div className="header-content">
                        <Icon icon="mdi:alert-circle" className="warning-icon" />
                        <h3>{title || 'Confirm Deletion'}</h3>
                    </div>
                </div>

                <div className="modal-content">
                    <p className="warning-message">{message}</p>
                    {warningDetails && (
                        <div className="warning-details">
                            <Icon icon="mdi:information-outline" />
                            <span>{warningDetails}</span>
                        </div>
                    )}
                </div>

                <div className="modal-actions">
                    <button 
                        type="button"
                        className="btn-cancel" 
                        onClick={handleCancel}
                    >
                        {cancelLabel}
                    </button>
                    <button 
                        type="button"
                        className="btn-confirm" 
                        onClick={handleConfirm}
                    >
                        <Icon icon="mdi:delete" />
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </Popup>
    );
}

export default DeleteConfirmModal;
