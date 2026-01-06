import React from 'react';
import Popup from '../Popup/Popup';
import './Modal.scss';

const Modal = ({ 
    isOpen, 
    onClose, 
    title, 
    children, 
    size = 'medium', // 'small', 'medium', 'large', 'full'
    showCloseButton = true,
    customClassName = "",
    ...popupProps 
}) => {
    const sizeClasses = {
        small: 'modal-small',
        medium: 'modal-medium',
        large: 'modal-large',
        full: 'modal-full'
    };

    return (
        <Popup 
            isOpen={isOpen} 
            onClose={onClose}
            customClassName={`modal ${sizeClasses[size]} ${customClassName}`}
            {...popupProps}
        >
            <div className="modal-container">
                {title && (
                    <div className="modal-header">
                        <h2>{title}</h2>
                    </div>
                )}
                
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </Popup>
    );
};

export default Modal;
