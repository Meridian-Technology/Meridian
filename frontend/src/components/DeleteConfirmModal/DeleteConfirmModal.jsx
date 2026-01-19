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
    return (
        <Popup 
            isOpen={isOpen} 
            onClose={onCancel}
            defaultStyling={false}
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
                        onClick={(e) => {
                            e.stopPropagation();
                            onCancel();
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button 
                        type="button"
                        className="btn-confirm" 
                        onClick={(e) => {
                            e.stopPropagation();
                            onConfirm();
                        }}
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
