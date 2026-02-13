import React from 'react';
import { createPortal } from 'react-dom';
import './UnsavedChangesBanner.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const UnsavedChangesBanner = ({ 
    hasChanges, 
    onSave, 
    onDiscard, 
    saving = false,
    saveText = "Save Changes",
    discardText = "Reset"
}) => {
    if (!hasChanges) {
        return null;
    }

    const banner = (
        <div className="unsaved-changes-banner">
            <div className="banner-content">
                <div className="banner-text">
                    <Icon icon="mingcute:alert-fill" className="banner-icon"/>
                    <span>You have unsaved changes</span>
                </div>
                <div className="banner-actions">
                    <button 
                        className="btn btn-secondary" 
                        onClick={onDiscard}
                        disabled={saving}
                    >
                        {discardText}
                    </button>
                    <button 
                        className="btn btn-primary" 
                        onClick={onSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : saveText}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(banner, document.body);
};

export default UnsavedChangesBanner; 