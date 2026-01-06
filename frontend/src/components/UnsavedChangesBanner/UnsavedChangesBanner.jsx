import React from 'react';
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

    return (
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
};

export default UnsavedChangesBanner; 