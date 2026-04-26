import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function MinutesTab() {
    return (
        <div className="minutes-content">
            <div className="empty-state">
                <Icon icon="mdi:file-document-outline" width={48} />
                <h3>Meeting Minutes</h3>
                <p>No minutes have been recorded yet.</p>
            </div>
        </div>
    );
}

export default MinutesTab;